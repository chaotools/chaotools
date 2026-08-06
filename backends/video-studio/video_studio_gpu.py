"""
视频工作室 — GPU 集成版（TTS + Whisper + 合成全在本地）
监听端口 6008
"""
import os, sys, json, re, time, uuid, subprocess, tempfile, shutil, asyncio, threading, logging
from pathlib import Path
from datetime import timedelta

import torch
torch.backends.cudnn.benchmark = True
torch.backends.cuda.matmul.allow_tf32 = True
torch.backends.cudnn.allow_tf32 = True

import uvicorn
import httpx
import aiofiles
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("video_studio_gpu")
app = FastAPI(title="Video Studio GPU")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ===== 路径 =====
BASE = Path("/root/video-studio")
UPLOADS = BASE / "uploads"
OUTPUTS = BASE / "outputs"
BGBASE = BASE / "backgrounds"
for d in [UPLOADS, OUTPUTS, BGBASE / "inbox"]:
    d.mkdir(parents=True, exist_ok=True)

# 背景素材库状态
BG_STATE = BGBASE / "state.json"
def _load_bg_state():
    if BG_STATE.exists():
        return json.loads(BG_STATE.read_text("utf-8"))
    return {}
def _save_bg_state(state):
    BG_STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), "utf-8")

# ===== TTS + Whisper 全局状态 =====
whisper_model = None
tts_model = None
REF_AUDIO = "/tmp/user_ref.wav"

# ===== Whisper 加载 =====
def load_whisper():
    global whisper_model
    os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
    from faster_whisper import WhisperModel
    logger.info("Loading Whisper large-v3...")
    whisper_model = WhisperModel("large-v3", device="cuda", compute_type="float16")
    logger.info("Whisper loaded on GPU!")

# ===== SRT 工具函数 =====
def segs_to_srt(segments, words_per_sub=8):
    all_words = []
    for seg in segments:
        if seg.words:
            for w in seg.words:
                all_words.append({"word": w.word.strip(), "start": w.start, "end": w.end})
    if not all_words:
        for seg in segments:
            all_words.append({"word": seg.text.strip(), "start": seg.start, "end": seg.end})
    srt_lines = []
    for i in range(0, len(all_words), words_per_sub):
        chunk = all_words[i:i+words_per_sub]
        idx = i // words_per_sub + 1
        def fmt(t):
            h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
            return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")
        srt_lines.append(f"{idx}\n{fmt(chunk[0]['start'])} --> {fmt(chunk[-1]['end'])}\n{''.join(w['word'] for w in chunk)}\n")
    return "\n".join(srt_lines)

def force_align_srt(script, segments):
    import re
    all_words = []
    for seg in segments:
        if seg.words:
            for w in seg.words:
                all_words.append({'word': w.word.strip(), 'start': w.start, 'end': w.end})
        else:
            all_words.append({'word': seg.text.strip(), 'start': seg.start, 'end': seg.end})
    if not all_words:
        return ''
    parts = re.split(r'([。！？!?.；;，,、\n])', script)
    merged = []
    for s in parts:
        s = s.strip()
        if not s: continue
        if merged and s in '。！？!?.；;，,、\n':
            merged[-1] += s
        else:
            merged.append(s)
    total_chars = sum(len(w['word'].replace(' ', '')) for w in all_words)
    if total_chars == 0: total_chars = 1
    t0 = all_words[0]['start']
    dur = all_words[-1]['end'] - t0
    srt_lines = []
    cpos = 0
    for idx, sent in enumerate(merged):
        clen = len(sent.replace(' ', '').replace('，', '').replace('。', '').replace('！', '').replace('？', '').replace('、', ''))
        rs = cpos / total_chars
        re_ = (cpos + clen) / total_chars
        st = t0 + rs * dur
        et = t0 + min(re_, 1.0) * dur
        cpos += clen
        h1 = int(st // 3600); m1 = int(st % 3600 // 60); s1 = st % 60
        h2 = int(et // 3600); m2 = int(et % 3600 // 60); s2 = et % 60
        srt_lines.append(f"{idx+1}\n{h1:02d}:{m1:02d}:{s1:06.3f} --> {h2:02d}:{m2:02d}:{s2:06.3f}\n{sent}")
    return '\n'.join(srt_lines)

# ===== IndexTTS 加载 =====
def load_tts():
    global tts_model
    os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
    sys.path.insert(0, "/root/autodl-tmp/index-tts")
    os.chdir("/root/autodl-tmp/index-tts")
    from indextts.infer_v2 import IndexTTS2
    logger.info("Loading IndexTTS2...")
    t0 = time.time()
    tts_model = IndexTTS2(cfg_path="checkpoints/config.yaml", model_dir="checkpoints", use_fp16=True)
    logger.info(f"IndexTTS2 loaded in {time.time()-t0:.1f}s")
    try:
        logger.info("Compiling model with torch.compile...")
        t_compile = time.time()
        tts_model.model = torch.compile(tts_model.model, mode="reduce-overhead", fullgraph=True)
        logger.info(f"Model compiled in {time.time()-t_compile:.1f}s")
    except Exception as e:
        logger.warning(f"torch.compile failed (non-fatal): {e}")

# ============================================================
# API: 健康检查
# ============================================================
@app.get("/health")
@app.get("/api/health")
async def api_health():
    return {"status": "ok", "whisper_loaded": whisper_model is not None, "tts_loaded": tts_model is not None, "ffmpeg": True}

# ============================================================
# API: TTS
# ============================================================
def edge_tts_sync(text: str, out_path: Path, voice: str = "zh-CN-YunxiNeural") -> float:
    cmd = ["python3", "-m", "edge_tts", "--text", text, "--voice", voice, "--write-media", str(out_path)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"edge-tts failed: {r.stderr}")
    dur = float(subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(out_path)], capture_output=True, text=True).stdout.strip() or 0)
    return dur

def indextts_sync(text: str, out_path: Path, voice: str = "v1") -> float:
    global tts_model
    if tts_model is None:
        load_tts()
    ref = REF_AUDIO
    if not os.path.exists(ref):
        raise RuntimeError(f"Reference audio not found: {ref}")
    try:
        result = tts_model.infer(spk_audio_prompt=ref, text=text, output_path=str(out_path),
                                  use_emo_text=False, use_random=(voice == "v2"))
        return float(subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(out_path)], capture_output=True, text=True).stdout.strip() or 0)
    except Exception as e:
        raise RuntimeError(f"IndexTTS failed: {e}")

@app.post("/api/tts")
async def api_tts(text: str = Form(...), provider: str = Form("edge-tts"), voice: str = Form("zh-CN-YunxiNeural")):
    job_id = str(uuid.uuid4())[:8]
    out_path = OUTPUTS / f"tts_{job_id}.wav"
    try:
        if provider == "edge-tts":
            dur = edge_tts_sync(text, out_path, voice)
        elif provider == "indextts":
            dur = indextts_sync(text, out_path, voice)
        else:
            raise HTTPException(400, f"Unknown provider: {provider}")
        return {"job_id": job_id, "duration": dur, "url": f"/outputs/tts_{job_id}.wav"}
    except Exception as e:
        raise HTTPException(500, str(e))

# ============================================================
# API: 字幕生成（直接调用本地 Whisper）
# ============================================================
@app.post("/api/align")
@app.post("/transcribe")
async def api_align(audio: UploadFile = File(...), language: str = Form("Chinese"), script: str = Form(""), response_format: str = Form("srt")):
    global whisper_model
    if whisper_model is None:
        load_whisper()
    
    suffix = Path(audio.filename).suffix if audio.filename else ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        raw_path = tmp.name
    
    audio_path = raw_path + '.wav'
    r = subprocess.run(['ffmpeg', '-y', '-i', raw_path, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', audio_path], capture_output=True, text=True)
    if r.returncode != 0:
        logger.warning(f"ffmpeg convert failed: {r.stderr[-200:]}")
        audio_path = raw_path
    else:
        os.unlink(raw_path)
    
    try:
        segs, info = whisper_model.transcribe(audio_path, beam_size=5, word_timestamps=True,
                                              language="zh" if "Chinese" in language else None)
        seg_list = list(segs)
        if script.strip():
            srt_text = force_align_srt(script.strip(), seg_list)
            full_text = script.strip()
            mode = "强制对齐"
        else:
            full_text = "".join(s.text.strip() for s in seg_list)
            srt_text = segs_to_srt(seg_list)
            mode = "语音识别"
        # 也保存到 outputs
        job_id = str(uuid.uuid4())[:8]
        out_path = OUTPUTS / f"aligned_{job_id}.srt"
        out_path.write_text(srt_text, encoding="utf-8")
        blocks = len(srt_text.strip().split("\n\n")) if srt_text.strip() else 0
        return JSONResponse({"srt": srt_text, "text": full_text, "language": language, "mode": mode,
                            "blocks": blocks, "url": f"/outputs/aligned_{job_id}.srt"})
    finally:
        try: os.unlink(audio_path)
        except: pass

# ============================================================
# API: 音频裁剪
# ============================================================
@app.post("/api/trim")
async def api_trim(audio_url: str = Form(...), threshold: float = Form(-30), min_dur: float = Form(0.5), start_threshold: float = Form(-50), start_dur: float = Form(0.3)):
    input_path = OUTPUTS / Path(audio_url).name
    job_id = str(uuid.uuid4())[:8]
    out_path = OUTPUTS / f"trimmed_{job_id}.mp3"
    if not input_path.exists():
        raise HTTPException(404, "音频文件不存在")
    af = f"silenceremove=start_periods=1:start_duration={start_dur}:start_threshold={start_threshold}dB, silenceremove=stop_periods=-1:stop_duration={min_dur}:stop_threshold={threshold}dB"
    subprocess.run(["ffmpeg", "-y", "-i", str(input_path), "-af", af, "-q:a", "2", str(out_path)], capture_output=True, timeout=60)
    dur = float(subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(out_path)], capture_output=True, text=True).stdout.strip() or 0)
    removed = float(subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(input_path)], capture_output=True, text=True).stdout.strip() or 0) - dur
    return {"job_id": job_id, "duration": dur, "removed": removed, "url": f"/outputs/trimmed_{job_id}.mp3"}

# ============================================================
# SRT 工具
# ============================================================
def parse_srt(content: str) -> list:
    blocks = []
    lines = content.strip().split("\n")
    i = 0
    while i < len(lines):
        if not lines[i].strip() or not lines[i].strip().isdigit():
            i += 1; continue
        idx = int(lines[i].strip()); i += 1
        if i >= len(lines): break
        m = re.match(r"(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})", lines[i].strip())
        if not m: i += 1; continue
        start, end = m.group(1).replace(",", "."), m.group(2).replace(",", "."); i += 1
        text_lines = []
        while i < len(lines) and lines[i].strip():
            text_lines.append(lines[i].strip()); i += 1
        while i < len(lines) and not lines[i].strip(): i += 1
        blocks.append({"index": idx, "start": start, "end": end, "text": "\n".join(text_lines)})
    return blocks

def build_srt(blocks: list) -> str:
    srt = ""
    for b in blocks:
        srt += f"{b['index']}\n{b['start'].replace('.', ',')} --> {b['end'].replace('.', ',')}\n{b['text']}\n\n"
    return srt.rstrip() + "\n"

def _esc_regex(s: str) -> str:
    return re.sub(r"([.*+?^${}()|[\]\\])", r"\\\1", s)

# ============================================================
# API: SRT 翻译 & 替换
# ============================================================
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")

@app.post("/api/srt/translate")
async def api_srt_translate(file: UploadFile = File(...), source: str = Form("auto"), target: str = Form("zh"), api_key: str = Form("")):
    content = (await file.read()).decode("utf-8")
    blocks = parse_srt(content)
    if not blocks:
        raise HTTPException(400, "无法解析 SRT")
    texts = [b["text"] for b in blocks]
    CHUNK = 15
    translated = []
    async with httpx.AsyncClient(timeout=120) as cli:
        for i in range(0, len(texts), CHUNK):
            chunk = texts[i:i+CHUNK]
            numbered = "\n".join(f"[{j+1}] {t}" for j, t in enumerate(chunk, i))
            resp = await cli.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key or DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
                json={"model": "deepseek-chat", "messages": [{"role": "system", "content": f"将以下{source}翻译为{target}，保持序号[1]格式，每行一条。"}, {"role": "user", "content": numbered}], "temperature": 0.3}
            )
            result = resp.json()
            lines = result["choices"][0]["message"]["content"].strip().split("\n")
            for line in lines:
                m = re.match(r"\[(\d+)\]\s*(.*)", line)
                if m:
                    idx = int(m.group(1)) - 1
                    if idx < len(blocks):
                        blocks[idx]["text"] = blocks[idx]["text"] + "\n" + m.group(2).strip()
    job_id = str(uuid.uuid4())[:8]
    out_path = OUTPUTS / f"bilingual_{job_id}.srt"
    out_path.write_text(build_srt(blocks), "utf-8")
    return {"job_id": job_id, "blocks": len(blocks), "url": f"/outputs/bilingual_{job_id}.srt"}

@app.post("/api/srt/replace")
async def api_srt_replace(file: UploadFile = File(...), rules: str = Form(...)):
    content = (await file.read()).decode("utf-8")
    replaces = json.loads(rules)
    total_changes = 0
    for r in replaces:
        pattern = _esc_regex(r["from"])
        to_text = r.get("to", "")
        matches = len(re.findall(pattern, content))
        content = re.sub(pattern, to_text, content)
        total_changes += matches
    job_id = str(uuid.uuid4())[:8]
    out_path = OUTPUTS / f"replaced_{job_id}.srt"
    out_path.write_text(content, "utf-8")
    return {"job_id": job_id, "changes": total_changes, "url": f"/outputs/replaced_{job_id}.srt"}

# ============================================================
# API: 背景素材库
# ============================================================
@app.post("/api/bg/upload")
async def api_bg_upload(file: UploadFile = File(...)):
    bg_id = str(uuid.uuid4())[:8]
    ext = Path(file.filename).suffix or ".mp4"
    bg_path = BGBASE / f"bg_{bg_id}{ext}"
    async with aiofiles.open(bg_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            await f.write(chunk)
    probe = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(bg_path)], capture_output=True, text=True)
    info = json.loads(probe.stdout) if probe.returncode == 0 else {}
    dur = float(info.get("format", {}).get("duration", 0))
    thumb = BGBASE / f"bg_{bg_id}.png"
    subprocess.run(["ffmpeg", "-y", "-i", str(bg_path), "-ss", "1", "-vframes", "1", "-vf", "scale=320:-1", str(thumb)], capture_output=True, timeout=30)
    state = _load_bg_state()
    state[bg_id] = {"file": bg_path.name, "original_name": file.filename, "duration": round(dur, 2), "clip_pos": 0, "created": time.time()}
    _save_bg_state(state)
    # 复制缩略图到 outputs
    out_thumb = OUTPUTS / f"bglib_{bg_id}.png"
    shutil.copy2(thumb, out_thumb)
    return {"bg_id": bg_id, "original_name": file.filename, "duration": round(dur, 2), "remaining": round(dur, 2), "thumbnail": f"/outputs/bglib_{bg_id}.png"}

@app.get("/api/bg/list")
async def api_bg_list():
    state = _load_bg_state()
    items = []
    for bg_id, info in state.items():
        thumb = BGBASE / f"bg_{bg_id}.png"
        if thumb.exists():
            out_thumb = OUTPUTS / f"bglib_{bg_id}.png"
            if not out_thumb.exists():
                shutil.copy2(thumb, out_thumb)
        dur = info.get("duration", 0)
        pos = info.get("clip_pos", 0)
        items.append({"bg_id": bg_id, "original_name": info.get("original_name", ""), "duration": round(dur, 2), "clip_pos": round(pos, 2), "remaining": round(max(0, dur - pos), 2), "thumbnail": f"/outputs/bglib_{bg_id}.png" if thumb.exists() else None, "created": info.get("created", 0)})
    items.sort(key=lambda x: x["created"], reverse=True)
    return {"items": items}

@app.post("/api/bg/clip")
async def api_bg_clip(bg_id: str = Form(...), duration: float = Form(...)):
    state = _load_bg_state()
    if bg_id not in state:
        raise HTTPException(404, "背景素材不存在")
    info = state[bg_id]
    src = BGBASE / info["file"]
    if not src.exists():
        raise HTTPException(404, "源视频文件丢失")
    remaining = max(0, info["duration"] - info["clip_pos"])
    clip_pos = info["clip_pos"] if remaining >= 0.5 else 0
    clip_dur = min(duration + 0.5, info["duration"] - clip_pos) if info["duration"] - clip_pos >= 0.5 else min(duration + 0.5, info["duration"])
    job_id = str(uuid.uuid4())[:8]
    out_path = OUTPUTS / f"bgclip_{job_id}.mp4"
    result = subprocess.run(["ffmpeg", "-y", "-ss", str(clip_pos), "-i", str(src), "-t", str(clip_dur), "-c", "copy", "-avoid_negative_ts", "make_zero", str(out_path)], capture_output=True, timeout=600)
    if result.returncode != 0:
        raise HTTPException(500, f"FFmpeg 裁切失败: {result.stderr.decode(errors='ignore')[-300:]}")
    info["clip_pos"] = clip_pos + clip_dur
    _save_bg_state(state)
    return {"job_id": job_id, "url": f"/outputs/bgclip_{job_id}.mp4", "clip_start": round(clip_pos, 2), "clip_duration": round(clip_dur, 2), "remaining": round(max(0, info["duration"] - info["clip_pos"]), 2)}

@app.post("/api/bg/scan")
async def api_bg_scan():
    inbox = BGBASE / "inbox"
    inbox.mkdir(parents=True, exist_ok=True)
    state = _load_bg_state()
    existing_files = {info["file"] for info in state.values()}
    imported = []
    video_exts = {".mp4", ".mov", ".avi", ".mkv", ".flv", ".wmv", ".webm", ".ts", ".mts"}
    for f in sorted(inbox.iterdir()):
        if f.is_dir() or f.suffix.lower() not in video_exts or f.name in existing_files:
            continue
        bg_id = str(uuid.uuid4())[:8]
        dest = BGBASE / f"bg_{bg_id}{f.suffix}"
        shutil.move(str(f), str(dest))
        probe = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(dest)], capture_output=True, text=True)
        info = json.loads(probe.stdout) if probe.returncode == 0 else {}
        dur = float(info.get("format", {}).get("duration", 0))
        thumb = BGBASE / f"bg_{bg_id}.png"
        subprocess.run(["ffmpeg", "-y", "-i", str(dest), "-ss", "1", "-vframes", "1", "-vf", "scale=320:-1", str(thumb)], capture_output=True, timeout=30)
        state[bg_id] = {"file": dest.name, "original_name": f.name, "duration": round(dur, 2), "clip_pos": 0, "created": time.time()}
        imported.append({"bg_id": bg_id, "name": f.name, "duration": round(dur, 2)})
    _save_bg_state(state)
    return {"imported": imported, "total": len(state)}

@app.post("/api/bg/reset")
async def api_bg_reset(bg_id: str = Form(...)):
    state = _load_bg_state()
    if bg_id not in state:
        raise HTTPException(404, "背景素材不存在")
    state[bg_id]["clip_pos"] = 0
    _save_bg_state(state)
    return {"success": True, "remaining": state[bg_id]["duration"]}

@app.delete("/api/bg/{bg_id}")
async def api_bg_delete(bg_id: str):
    state = _load_bg_state()
    if bg_id not in state:
        raise HTTPException(404, "背景素材不存在")
    info = state.pop(bg_id)
    _save_bg_state(state)
    src = BGBASE / info["file"]
    if src.exists(): src.unlink()
    for p in [BGBASE / f"bg_{bg_id}.png", OUTPUTS / f"bglib_{bg_id}.png"]:
        if p.exists(): p.unlink()
    return {"success": True}

# ============================================================
# API: 规则同步
# ============================================================
SYNC_API_BASE = "http://127.0.0.1:3456/sync-rules"

@app.post("/api/rules/save")
async def api_rules_save(data: dict):
    async with httpx.AsyncClient(timeout=10) as cli:
        resp = await cli.post(f"{SYNC_API_BASE}/save", json=data)
        return resp.json()

@app.get("/api/rules/load")
async def api_rules_load(code: str = ""):
    if len(code.strip()) < 3:
        return {"success": False, "error": "同步码至少3位"}
    async with httpx.AsyncClient(timeout=10) as cli:
        resp = await cli.get(f"{SYNC_API_BASE}/load?code={code.strip()}")
        return resp.json()

# ============================================================
# API: Pixabay
# ============================================================
PIXABAY_API_KEY = os.getenv("PIXABAY_API_KEY", "")

@app.get("/api/pixabay/search")
async def api_pixabay(q: str, api_key: str = ""):
    key = api_key or PIXABAY_API_KEY
    if not key:
        return {"results": []}
    async with httpx.AsyncClient() as cli:
        resp = await cli.get("https://pixabay.com/api/videos/", params={"key": key, "q": q, "per_page": 20})
        data = resp.json()
    results = []
    for v in data.get("hits", []):
        best = v["videos"].get("large") or v["videos"].get("medium") or list(v["videos"].values())[0]
        results.append({"id": v["id"], "url": best["url"], "duration": v["duration"], "thumbnail": best.get("thumbnail", v.get("userImageURL", "")), "width": best["width"], "height": best["height"]})
    return {"results": results}

@app.post("/api/pixabay/download")
async def api_pixabay_download(url: str = Form(...)):
    job_id = str(uuid.uuid4())[:8]
    out_path = OUTPUTS / f"bg_{job_id}.mp4"
    async with httpx.AsyncClient(timeout=120) as cli:
        resp = await cli.get(url)
        out_path.write_bytes(resp.content)
    return {"job_id": job_id, "url": f"/outputs/bg_{job_id}.mp4"}

# ============================================================
# API: 视频合成
# ============================================================
@app.post("/api/compose")
async def api_compose(
    audio_url: str = Form(...),
    subtitle_url: str = Form(...),
    bg_video_urls: str = Form(""),
    overlay_image_url: str = Form(""),
    overlay_time: float = Form(0),
    title_text: str = Form(""),
    text_overlays: str = Form(""),
    subtitle_y: int = Form(50),
    width: int = Form(1440),
    height: int = Form(2560),
    font_size: int = Form(48),
    font_color: str = Form("white"),
    font_name: str = Form("WenQuanYi Zen Hei"),
):
    job_id = str(uuid.uuid4())[:8]
    audio_path = OUTPUTS / Path(audio_url).name
    srt_path = OUTPUTS / Path(subtitle_url).name
    if not audio_path.exists():
        raise HTTPException(404, "音频文件不存在")

    bg_urls = [u.strip() for u in bg_video_urls.split(",") if u.strip()]
    if bg_urls:
        bg_paths = [OUTPUTS / Path(u).name for u in bg_urls]
        if len(bg_paths) == 1:
            bg_input = ["-stream_loop", "-1", "-i", str(bg_paths[0])]
        else:
            concat_list = OUTPUTS / f"concat_{job_id}.txt"
            with open(concat_list, "w") as f:
                for p in bg_paths:
                    f.write(f"file '{p.absolute()}'\n")
            bg_input = ["-f", "concat", "-safe", "0", "-stream_loop", "1", "-i", str(concat_list)]
    else:
        bg_input = []

    audio_dur = float(subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)], capture_output=True, text=True).stdout.strip() or 30)

    cmd = ["ffmpeg", "-y"]
    if bg_input:
        cmd.extend(bg_input)
    else:
        cmd.extend(["-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:d={audio_dur+2}:r=30"])
    cmd.extend(["-i", str(audio_path)])

    filters = []
    video_in = "0:v" if bg_input else "0:v"
    if bg_input:
        filters.append(f"[{video_in}]scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},trim=duration={audio_dur+2},setpts=PTS-STARTPTS[v0]")
    else:
        filters.append(f"[{video_in}]trim=duration={audio_dur+2},setpts=PTS-STARTPTS[v0]")
    current_v = "[v0]"

    # Title
    if title_text:
        title_file = OUTPUTS / f"title_{job_id}.txt"
        title_file.write_text(title_text, "utf-8")
        filters.append(f"{current_v}drawtext=textfile='{title_file}':fontsize=48:fontcolor={font_color}:font=WenQuanYi:x=(w-text_w)/2:y=h*0.1:enable='between(t,0,{audio_dur})'[v2]")
        current_v = "[v2]"

    # Custom overlays
    if text_overlays:
        overlays = json.loads(text_overlays)
        for i, ov in enumerate(overlays):
            txt = ov.get("text", "")
            if not txt: continue
            txt_file = OUTPUTS / f"ovl_{job_id}_{i}.txt"
            txt_file.write_text(txt, "utf-8")
            label = f"[vov{i}]"
            filters.append(f"{current_v}drawtext=textfile='{txt_file}':fontsize={ov.get('size', 28)}:fontcolor={ov.get('color', 'white')}@{ov.get('alpha', 1.0)}:font={ov.get('font', 'WenQuanYi')}:x={ov.get('x', '(w-text_w)/2')}:y={ov.get('y', '(h-text_h)/2')}{label}")
            current_v = label

    # ASS subtitle
    ass_path = OUTPUTS / f"sub_{job_id}.ass"
    has_sub = _srt_to_ass(srt_path, ass_path, font_name, font_size, font_color, width, height, subtitle_y)
    if has_sub:
        filters.append(f"{current_v}ass={ass_path}[vout]")
    else:
        filters.append(f"{current_v}null[vout]")

    filter_str = ";".join(filters)
    cmd.extend(["-filter_complex", filter_str, "-map", "[vout]", "-map", "1:a"])

    # 用 NVENC 编码（GPU 服务器！）
    import subprocess as sp
    nvenc_test = sp.run(["ffmpeg", "-encoders", "2>/dev/null", "|", "grep", "h264_nvenc"], shell=True, capture_output=True, text=True)
    if nvenc_test.stdout.strip():
        cmd.extend(["-c:v", "h264_nvenc", "-preset", "p7", "-cq", "18", "-b:v", "0", "-rc", "vbr"])
        logger.info("Using NVENC hardware encoding")
    else:
        cmd.extend(["-c:v", "libx264", "-preset", "fast", "-crf", "18"])
        logger.info("Using software encoding (libx264)")

    cmd.extend(["-c:a", "aac", "-b:a", "128k", "-shortest"])

    out_path = OUTPUTS / f"composed_{job_id}.mp4"
    cmd.append(str(out_path))

    logger.info(f"Compose: {' '.join(str(c) for c in cmd[:6])}...")
    result = subprocess.run(cmd, capture_output=True, timeout=3600)
    if result.returncode != 0:
        err_msg = result.stderr.decode(errors="ignore")[-500:]
        raise HTTPException(500, f"FFmpeg exit {result.returncode}: {err_msg}")

    cover_path = OUTPUTS / f"cover_{job_id}.png"
    subprocess.run(["ffmpeg", "-y", "-i", str(out_path), "-ss", "2", "-vframes", "1", str(cover_path)], capture_output=True, timeout=30)

    return {"job_id": job_id, "video_url": f"/outputs/composed_{job_id}.mp4", "cover_url": f"/outputs/cover_{job_id}.png", "duration": audio_dur}

def _srt_to_ass(srt_path: Path, ass_path: Path, font_name: str, font_size: int, font_color: str, width: int, height: int, margin_v: int = 50) -> bool:
    if not srt_path.exists():
        ass_path.write_text("", "utf-8")
        return False
    content = srt_path.read_text("utf-8")
    blocks = parse_srt(content)
    if not blocks:
        ass_path.write_text("", "utf-8")
        return False
    def _rgb_to_bgr(color: str) -> str:
        if color == "white": return "FFFFFF"
        if color.startswith("#"):
            c = color[1:]
            return c[4:6] + c[2:4] + c[0:2]
        return "FFFFFF"
    def _time_to_ass(t: str) -> str:
        parts = t.replace(",", ".").split(":")
        return f"{int(parts[0])}:{int(parts[1])}:{float(parts[2]):05.2f}"
    ass = f"""[Script Info]
Title: Video Studio Subtitle
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},&H00{_rgb_to_bgr(font_color)},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    for b in blocks:
        start = _time_to_ass(b["start"])
        end = _time_to_ass(b["end"])
        text = b["text"].replace("\n", "\\N")
        ass += f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}\n"
    ass_path.write_text(ass, "utf-8")
    return True

# ============================================================
# API: 历史记录
# ============================================================
@app.get("/api/history")
async def api_history():
    videos = []
    for f in sorted(OUTPUTS.glob("composed_*.mp4"), key=lambda x: x.stat().st_mtime, reverse=True):
        job_id = f.stem.replace("composed_", "")
        cover = OUTPUTS / f"cover_{job_id}.png"
        stat = f.stat()
        dur = float(subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(f)], capture_output=True, text=True).stdout.strip() or 0)
        videos.append({"job_id": job_id, "video_url": f"/outputs/{f.name}", "cover_url": f"/outputs/cover_{job_id}.png" if cover.exists() else None, "duration": round(dur, 1), "size_mb": round(stat.st_size / 1024 / 1024, 1), "created": stat.st_mtime})
    return {"videos": videos}

@app.delete("/api/history/{job_id}")
async def api_history_delete(job_id: str):
    for f in OUTPUTS.glob(f"*_{job_id}.*"):
        f.unlink()
    return {"success": True}

# ============================================================
# 静态文件
# ============================================================
OUTPUTS.mkdir(parents=True, exist_ok=True)
# 清理旧文件
composed = sorted(OUTPUTS.glob("composed_*.mp4"), key=lambda x: x.stat().st_mtime, reverse=True)
for old in composed[20:]:
    job_id = old.stem.replace("composed_", "")
    for f in OUTPUTS.glob(f"*_{job_id}.*"): f.unlink()

app.mount("/outputs", StaticFiles(directory=str(OUTPUTS)), name="outputs")

# ============================================================
# 启动
# ============================================================
if __name__ == "__main__":
    logger.info("Pre-loading Whisper...")
    load_whisper()
    # TTS 在第一次请求时加载，节省启动时间
    uvicorn.run(app, host="0.0.0.0", port=6008)
