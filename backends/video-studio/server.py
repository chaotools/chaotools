"""
视频自动化生产线 — 后端服务
端口 8765
"""
import os, json, re, time, uuid, subprocess, tempfile, shutil, asyncio
import ipaddress
import socket
from collections import defaultdict
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse
import aiofiles
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI(title="Video Studio API")
ALLOWED_ORIGINS = ["https://chaotools.tech", "https://www.chaotools.tech"]
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["*"], allow_headers=["*"])

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")

_RATE: dict[str, list[float]] = defaultdict(list)


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _check_rate(key: str, limit: int, window: float = 60.0) -> None:
    now = time.monotonic()
    bucket = _RATE[key]
    bucket[:] = [t for t in bucket if t > now - window]
    if len(bucket) >= limit:
        raise HTTPException(429, "Too many requests, please try again later")
    bucket.append(now)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    ip = _client_ip(request)
    path = request.url.path
    if path.startswith("/api/bg/upload") or path.startswith("/api/compose") or path.startswith("/api/tts"):
        _check_rate(f"{ip}:heavy", 8, 60)
    elif path.startswith("/api/srt/translate"):
        _check_rate(f"{ip}:srt", 4, 60)
    elif path.startswith("/api/pixabay"):
        _check_rate(f"{ip}:pixabay", 30, 60)
    else:
        _check_rate(f"{ip}:all", 120, 60)
    return await call_next(request)


def require_admin(request: Request):
    if not ADMIN_TOKEN:
        raise HTTPException(503, "Admin token not configured")
    token = request.headers.get("x-admin-token", "")
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:].strip()
    if token != ADMIN_TOKEN:
        raise HTTPException(401, "Admin token required")


def _is_safe_pixabay_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme != "https":
            return False
        host = (parsed.hostname or "").lower()
        if host != "pixabay.com" and not host.endswith(".pixabay.com"):
            return False
        for info in socket.getaddrinfo(host, parsed.port or 443, proto=socket.IPPROTO_TCP):
            ip = ipaddress.ip_address(info[4][0])
            if not ip.is_global:
                return False
        return True
    except Exception:
        return False

BASE = Path("/home/ubuntu/video-studio")
UPLOADS = BASE / "uploads"
OUTPUTS = BASE / "outputs"
ASSETS = BASE / "assets"
BGBASE = BASE / "backgrounds"
for d in [UPLOADS, OUTPUTS, ASSETS, BGBASE]:
    d.mkdir(parents=True, exist_ok=True)

# 背景素材库状态文件
BG_STATE = BGBASE / "state.json"
def _load_bg_state():
    if BG_STATE.exists():
        return json.loads(BG_STATE.read_text(encoding="utf-8"))
    return {}
def _save_bg_state(state):
    BG_STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

# ============================================================
# 1. TTS — 可插拔
# ============================================================

async def tts_edge(text: str, out_path: Path, voice: str = "zh-CN-YunxiNeural") -> float:
    """微软 Edge TTS（免费）"""
    cmd = ["python3", "-m", "edge_tts", "--text", text, "--voice", voice, "--write-media", str(out_path)]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        raise RuntimeError(f"edge-tts failed: {proc.stderr}")
    dur = float(subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(out_path)],
        capture_output=True, text=True).stdout.strip() or 0)
    return dur

# ── CosyVoice 配置 ──
COSYVOICE_HOST = os.getenv("COSYVOICE_HOST", "")

async def tts_indextts(text: str, out_path: Path, voice: str = "v1") -> float:
    """IndexTTS 声音克隆 TTS（调用 GPU 服务器）
    voice: v1=纯克隆, v2=随机种子
    """
    import httpx
    use_random = "true" if voice == "v2" else "false"
    async with httpx.AsyncClient(timeout=600.0, verify=False) as client:
        # Step 1: 调用 GPU TTS API（返回 JSON）
        resp = await client.post(
            f"{FORCED_ALIGNER_HOST}/api/tts",
            data={"text": text, "provider": "indextts", "voice": voice}
        )
        if resp.status_code != 200:
            raise RuntimeError(f"IndexTTS failed: {resp.text}")
        data = resp.json()
        # Step 2: 从 GPU 下载生成的音频文件
        audio_url = data["url"]  # /outputs/tts_xxx.wav
        fetch_resp = await client.get(f"{FORCED_ALIGNER_HOST}{audio_url}")
        if fetch_resp.status_code != 200:
            raise RuntimeError(f"无法从 GPU 下载音频: {fetch_resp.status_code}")
        with open(out_path, "wb") as f:
            f.write(fetch_resp.content)
    return float(subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(out_path)],
        capture_output=True, text=True).stdout.strip() or 0)

@app.post("/api/tts")
async def api_tts(text: str = Form(...), provider: str = Form("edge-tts"), voice: str = Form("zh-CN-YunxiNeural")):
    """生成配音"""
    job_id = str(uuid.uuid4())[:8]
    out_path = OUTPUTS / f"tts_{job_id}.wav"
    try:
        if provider == "edge-tts":
            dur = await tts_edge(text, out_path, voice)
        elif provider == "indextts":
            dur = await tts_indextts(text, out_path, voice)
        else:
            raise HTTPException(400, f"Unknown provider: {provider}")
        return {"job_id": job_id, "duration": dur, "url": f"/outputs/tts_{job_id}.wav"}
    except Exception as e:
        raise HTTPException(500, str(e))

# ============================================================
# 1.5 ForcedAligner 字幕生成
# ============================================================

# ── ForcedAligner 配置 ──
FORCED_ALIGNER_HOST = os.getenv("FORCED_ALIGNER_HOST", "http://localhost:6008")

@app.post("/api/align")
async def api_align(audio_url: str = Form(...), language: str = Form("Chinese"), script: str = Form("")):
    """用 ForcedAligner 生成带时间戳的 SRT 字幕
    如果提供 script（文稿），则用强制对齐模式（文字100%准确）；
    否则用语音识别模式（可能有错别字）。
    """
    audio_path = OUTPUTS / Path(audio_url).name
    if not audio_path.exists():
        raise HTTPException(404, "音频文件不存在")
    job_id = str(uuid.uuid4())[:8]
    out_path = OUTPUTS / f"aligned_{job_id}.srt"
    try:
        async with httpx.AsyncClient(timeout=300) as cli:
            with open(audio_path, "rb") as f:
                # 统一调 /transcribe，有文稿时传 text 参数做强制对齐
                post_data = {"language": language}
                if script.strip():
                    post_data["script"] = script
                resp = await cli.post(
                    f"{FORCED_ALIGNER_HOST}/transcribe",
                    files={"audio": (audio_path.name, f, "audio/mpeg")},
                    data=post_data
                )
            if resp.status_code != 200:
                raise RuntimeError(f"ForcedAligner error: {resp.text}")
            data = resp.json()
        # GPU 服务器返回已格式化的 SRT
        srt_text = data.get("srt", "")
        if not srt_text:
            raise RuntimeError("ForcedAligner 未返回 SRT 数据")
        # 标点断句后处理
        srt_text = _resegment_srt(srt_text)
        out_path.write_text(srt_text, encoding="utf-8")
        blocks = parse_srt(srt_text)
        mode = "强制对齐" if script.strip() else "语音识别"
        return {"job_id": job_id, "blocks": len(blocks), "mode": mode, "language": data.get("language", language), "full_text": data.get("text", ""), "url": f"/outputs/aligned_{job_id}.srt"}
    except Exception as e:
        raise HTTPException(500, str(e))

def _merge_ts_to_sentences(ts_list: list, max_chars: int = 20, max_gap: float = 0.5) -> list:
    """把逐字时间戳合并成句子（按标点或长度切分）"""
    sentences = []
    cur_text = ""
    cur_start = None
    cur_end = 0
    for ts in ts_list:
        text = ts.get("text", ts.get("word", ""))
        start = ts.get("start", 0)
        end = ts.get("end", 0)
        if cur_start is None:
            cur_start = start
        cur_text += text
        cur_end = end
        # 遇到标点或超长就断句
        is_punct = text in "。！？!?.；;，,、\n"
        is_long = len(cur_text) >= max_chars
        is_gap = len(sentences) > 0 and start - cur_end > max_gap
        if is_punct or is_long:
            sentences.append({"start": cur_start, "end": cur_end, "text": cur_text.strip()})
            cur_text = ""
            cur_start = None
    if cur_text.strip():
        sentences.append({"start": cur_start or 0, "end": cur_end, "text": cur_text.strip()})
    return sentences

def _sec_to_srt_time(sec: float) -> str:
    """秒数转 SRT 时间格式 00:00:01.500"""
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int((sec % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"

# ============================================================
# 2. FFmpeg 音频裁剪
# ============================================================

@app.post("/api/trim")
async def api_trim(audio_url: str = Form(...), threshold: float = Form(-30), min_dur: float = Form(0.5), start_threshold: float = Form(-50), start_dur: float = Form(0.3)):
    """去掉音频静音段"""
    input_path = OUTPUTS / Path(audio_url).name
    job_id = str(uuid.uuid4())[:8]
    out_path = OUTPUTS / f"trimmed_{job_id}.mp3"
    if not input_path.exists():
        raise HTTPException(404, "音频文件不存在")
    # silenceremove: start + middle
    af = f"silenceremove=start_periods=1:start_duration={start_dur}:start_threshold={start_threshold}dB, silenceremove=stop_periods=-1:stop_duration={min_dur}:stop_threshold={threshold}dB"
    subprocess.run(["ffmpeg", "-y", "-i", str(input_path), "-af", af, "-q:a", "2", str(out_path)], capture_output=True, timeout=60)
    dur = float(subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(out_path)],
        capture_output=True, text=True).stdout.strip() or 0)
    removed = float(subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(input_path)],
        capture_output=True, text=True).stdout.strip() or 0) - dur
    return {"job_id": job_id, "duration": dur, "removed": removed, "url": f"/outputs/trimmed_{job_id}.mp3"}

# ============================================================
# 3. SRT 处理
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
        if not m:
            i += 1; continue
        start, end = m.group(1).replace(",", "."), m.group(2).replace(",", "."); i += 1
        text_lines = []
        while i < len(lines):
            line = lines[i].strip()
            if not line:
                i += 1
                break
            if line.isdigit() or re.match(r"\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->", line):
                break
            text_lines.append(line)
            i += 1
        while i < len(lines) and not lines[i].strip():
            i += 1
        blocks.append({"index": idx, "start": start, "end": end, "text": "\n".join(text_lines)})
    return blocks
def build_srt(blocks: list) -> str:
    srt = ""
    for b in blocks:
        srt += f"{b['index']}\n{b['start'].replace('.', ',')} --> {b['end'].replace('.', ',')}\n{b['text']}\n\n"
    return srt.rstrip() + "\n"


def _resegment_srt(content: str) -> str:
    """标点断句：把 GPU 返回的 SRT 按标点重新分段，让字幕在句号/感叹号/问号处断开"""
    blocks = parse_srt(content)
    if not blocks:
        return content

    # Join all text from all blocks
    all_text = "".join(b["text"] for b in blocks)
    if not all_text.strip():
        return content

    # Collect timestamps: first start and all potential split points
    total_dur = _srt_time_to_sec(blocks[-1]["end"]) - _srt_time_to_sec(blocks[0]["start"])
    if total_dur <= 0:
        total_dur = len(all_text) * 0.15  # fallback: ~150ms per char

    # Split text by punctuation, keep the punctuation with its sentence
    sentences = re.split(r"(?<=[。！？!?；;])(?=\S)", all_text)
    # Merge back if split too aggressively (e.g. after ； ; keep with next if next is too short)
    merged = []
    buf = ""
    for s in sentences:
        buf += s
        if len(buf) >= 4 or re.search(r"[。！？!?]$", buf):
            merged.append(buf)
            buf = ""
    if buf.strip():
        if merged:
            merged[-1] += buf
        else:
            merged.append(buf)

    if len(merged) <= 1:
        return content  # nothing to resegment

    # Assign timestamps proportionally
    start_sec = _srt_time_to_sec(blocks[0]["start"])
    char_counts = [len(s) for s in merged]
    total_chars = sum(char_counts)
    new_blocks = []
    t = start_sec
    for i, sent in enumerate(merged):
        dur = (char_counts[i] / total_chars) * total_dur if total_chars > 0 else 2
        end_t = min(t + dur, start_sec + total_dur)
        new_blocks.append({
            "index": i + 1,
            "start": _sec_to_srt_time(t),
            "end": _sec_to_srt_time(end_t),
            "text": sent
        })
        t = end_t
        # Small gap between sentences
        t += 0.05

    return build_srt(new_blocks)


def _srt_time_to_sec(ts: str) -> float:
    """SRT 时间 00:00:01.500 → 秒数"""
    parts = ts.replace(",", ".").split(":")
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])

@app.post("/api/srt/translate")
async def api_srt_translate(file: UploadFile = File(...), source: str = Form("auto"), target: str = Form("zh"), api_key: str = Form("")):
    """SRT 双语翻译"""
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
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": f"将以下{source}翻译为{target}，保持序号[1]格式，每行一条。"},
                        {"role": "user", "content": numbered}
                    ],
                    "temperature": 0.3
                }
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
    out_path.write_text(build_srt(blocks), encoding="utf-8")
    return {"job_id": job_id, "blocks": len(blocks), "url": f"/outputs/bilingual_{job_id}.srt"}

def _esc_regex(s: str) -> str:
    """转义正则特殊字符，对齐原版 escRegex"""
    return re.sub(r"([.*+?^${}()|[\]\\])", r"\\\1", s)

@app.post("/api/srt/replace")
async def api_srt_replace(file: UploadFile = File(...), rules: str = Form(...)):
    """SRT 批量替换，rules 是 JSON 数组 [{"from":"xx","to":"yy"}]"""
    content = (await file.read()).decode("utf-8")
    replaces = json.loads(rules)
    total_changes = 0
    for r in replaces:
        # 对齐原版：用正则匹配（先转义特殊字符）
        pattern = _esc_regex(r["from"])
        to_text = r.get("to", "")
        matches = len(re.findall(pattern, content))
        content = re.sub(pattern, to_text, content)
        total_changes += matches
    job_id = str(uuid.uuid4())[:8]
    out_path = OUTPUTS / f"replaced_{job_id}.srt"
    out_path.write_text(content, encoding="utf-8")
    return {"job_id": job_id, "changes": total_changes, "url": f"/outputs/replaced_{job_id}.srt"}

# ============================================================
# 3.5 背景素材库 — 上传长视频，按顺序裁切
# ============================================================

@app.post("/api/bg/upload")
async def api_bg_upload(file: UploadFile = File(...)):
    """上传一个长视频到背景素材库"""
    bg_id = str(uuid.uuid4())[:8]
    ext = (Path(file.filename).suffix or ".mp4").lower()
    if ext not in (".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"):
        raise HTTPException(400, "不支持的视频格式")
    MAX_BG_UPLOAD = 1024 * 1024 * 1024  # 1GB
    bg_path = BGBASE / f"bg_{bg_id}{ext}"
    total = 0
    try:
        # 流式写入，避免大文件内存爆
        async with aiofiles.open(bg_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_BG_UPLOAD:
                    raise HTTPException(413, "文件过大（上限 1GB）")
                await f.write(chunk)
    except Exception:
        bg_path.unlink(missing_ok=True)
        raise
    # 获取视频信息
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(bg_path)],
        capture_output=True, text=True
    )
    info = json.loads(probe.stdout) if probe.returncode == 0 else {}
    dur = float(info.get("format", {}).get("duration", 0))
    # 提取封面帧
    thumb = BGBASE / f"bg_{bg_id}.png"
    subprocess.run(["ffmpeg", "-y", "-i", str(bg_path), "-ss", "1", "-vframes", "1", "-vf", "scale=320:-1", str(thumb)], capture_output=True, timeout=30)
    # 更新状态
    state = _load_bg_state()
    state[bg_id] = {
        "file": bg_path.name,
        "original_name": file.filename,
        "duration": round(dur, 2),
        "clip_pos": 0,
        "created": time.time()
    }
    _save_bg_state(state)
    return {
        "bg_id": bg_id,
        "original_name": file.filename,
        "duration": round(dur, 2),
        "remaining": round(dur, 2),
        "thumbnail": f"/outputs/bglib_{bg_id}.png"
    }

@app.get("/api/bg/list")
async def api_bg_list():
    """列出背景素材库"""
    state = _load_bg_state()
    items = []
    for bg_id, info in state.items():
        thumb = BGBASE / f"bg_{bg_id}.png"
        if thumb.exists():
            # 复制到 outputs 供前端访问
            out_thumb = OUTPUTS / f"bglib_{bg_id}.png"
            if not out_thumb.exists():
                shutil.copy2(thumb, out_thumb)
        dur = info.get("duration", 0)
        pos = info.get("clip_pos", 0)
        remaining = max(0, dur - pos)
        items.append({
            "bg_id": bg_id,
            "original_name": info.get("original_name", ""),
            "duration": round(dur, 2),
            "clip_pos": round(pos, 2),
            "remaining": round(remaining, 2),
            "thumbnail": f"/outputs/bglib_{bg_id}.png" if thumb.exists() else None,
            "created": info.get("created", 0)
        })
    items.sort(key=lambda x: x["created"], reverse=True)
    return {"items": items}

@app.post("/api/bg/clip")
async def api_bg_clip(bg_id: str = Form(...), duration: float = Form(...)):
    """从背景素材中按顺序裁切指定时长的片段"""
    state = _load_bg_state()
    if bg_id not in state:
        raise HTTPException(404, "背景素材不存在")
    info = state[bg_id]
    src = BGBASE / info["file"]
    if not src.exists():
        raise HTTPException(404, "源视频文件丢失")
    total_dur = info["duration"]
    clip_pos = info["clip_pos"]
    remaining = total_dur - clip_pos
    if remaining < 0.5:
        # 素材用完了，重头开始
        clip_pos = 0
        remaining = total_dur
    clip_dur = min(duration + 0.5, remaining)  # 多裁 0.5s 余量
    job_id = str(uuid.uuid4())[:8]
    out_path = OUTPUTS / f"bgclip_{job_id}.mp4"
    # FFmpeg trim — 流复制，不重新编码，速度极快
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(clip_pos),
        "-i", str(src),
        "-t", str(clip_dur),
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        str(out_path)
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=600)
    if result.returncode != 0:
        raise HTTPException(500, f"FFmpeg 裁切失败: {result.stderr.decode(errors='ignore')[-300:]}")
    # 更新 clip_pos
    info["clip_pos"] = clip_pos + clip_dur
    _save_bg_state(state)
    return {
        "job_id": job_id,
        "url": f"/outputs/bgclip_{job_id}.mp4",
        "clip_start": round(clip_pos, 2),
        "clip_duration": round(clip_dur, 2),
        "remaining": round(max(0, total_dur - info["clip_pos"]), 2),
    }

@app.post("/api/bg/scan")
async def api_bg_scan():
    """扫描 inbox 目录，自动导入视频文件到素材库"""
    inbox = BGBASE / "inbox"
    inbox.mkdir(parents=True, exist_ok=True)
    state = _load_bg_state()
    # 已导入的文件集合
    existing_files = {info["file"] for info in state.values()}
    imported = []
    video_exts = {".mp4", ".mov", ".avi", ".mkv", ".flv", ".wmv", ".webm", ".ts", ".mts"}
    for f in sorted(inbox.iterdir()):
        if f.is_dir(): continue
        if f.suffix.lower() not in video_exts: continue
        # 跳过已导入的
        if f.name in existing_files: continue
        bg_id = str(uuid.uuid4())[:8]
        # 移动到素材库
        dest = BGBASE / f"bg_{bg_id}{f.suffix}"
        shutil.move(str(f), str(dest))
        # 获取视频信息
        probe = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(dest)],
            capture_output=True, text=True
        )
        info = json.loads(probe.stdout) if probe.returncode == 0 else {}
        dur = float(info.get("format", {}).get("duration", 0))
        # 提取封面
        thumb = BGBASE / f"bg_{bg_id}.png"
        subprocess.run(["ffmpeg", "-y", "-i", str(dest), "-ss", "1", "-vframes", "1", "-vf", "scale=320:-1", str(thumb)], capture_output=True, timeout=30)
        state[bg_id] = {
            "file": dest.name,
            "original_name": f.name,
            "duration": round(dur, 2),
            "clip_pos": 0,
            "created": time.time()
        }
        imported.append({"bg_id": bg_id, "name": f.name, "duration": round(dur, 2)})
    _save_bg_state(state)
    return {"imported": imported, "total": len(state)}

@app.post("/api/bg/reset")
async def api_bg_reset(bg_id: str = Form(...)):
    """重置裁切位置到开头"""
    state = _load_bg_state()
    if bg_id not in state:
        raise HTTPException(404, "背景素材不存在")
    state[bg_id]["clip_pos"] = 0
    _save_bg_state(state)
    return {"success": True, "remaining": state[bg_id]["duration"]}

@app.delete("/api/bg/{bg_id}")
async def api_bg_delete(bg_id: str):
    """删除背景素材"""
    state = _load_bg_state()
    if bg_id not in state:
        raise HTTPException(404, "背景素材不存在")
    info = state.pop(bg_id)
    _save_bg_state(state)
    # 删除文件
    src = BGBASE / info["file"]
    if src.exists(): src.unlink()
    thumb = BGBASE / f"bg_{bg_id}.png"
    if thumb.exists(): thumb.unlink()
    out_thumb = OUTPUTS / f"bglib_{bg_id}.png"
    if out_thumb.exists(): out_thumb.unlink()
    return {"success": True}

# ============================================================
# 6. 规则同步（推送/拉取）—— 复用原有 message-board 存储
# ============================================================

# ── DeepSeek 配置 ──
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
PIXABAY_API_KEY = os.getenv("PIXABAY_API_KEY", "")

SYNC_API_BASE = "http://127.0.0.1:3456/sync-rules"

@app.post("/api/rules/save")
async def api_rules_save(data: dict):
    """推送替换规则（复用原有存储）"""
    async with httpx.AsyncClient(timeout=10) as cli:
        resp = await cli.post(f"{SYNC_API_BASE}/save", json=data)
        return resp.json()

@app.get("/api/rules/load")
async def api_rules_load(code: str = ""):
    """拉取替换规则（复用原有存储）"""
    if len(code.strip()) < 3:
        return {"success": False, "error": "同步码至少3位"}
    async with httpx.AsyncClient(timeout=10) as cli:
        resp = await cli.get(f"{SYNC_API_BASE}/load?code={code.strip()}")
        return resp.json()

# ============================================================
# 4. Pixtabay 搜索
# ============================================================

@app.get("/api/pixabay/search")
async def api_pixabay(q: str, api_key: str = ""):
    """搜索 Pixabay 视频"""
    key = api_key or PIXABAY_API_KEY
    if not key:
        return {"error": "需要 Pixabay API Key", "results": []}
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
    """下载 Pixabay 视频到本地"""
    if not _is_safe_pixabay_url(url):
        raise HTTPException(400, "仅允许下载 pixabay.com 的 HTTPS 视频")
    job_id = str(uuid.uuid4())[:8]
    out_path = OUTPUTS / f"bg_{job_id}.mp4"
    try:
        async with httpx.AsyncClient(timeout=120, follow_redirects=False) as cli:
            async with cli.stream("GET", url) as resp:
                if resp.status_code != 200:
                    raise HTTPException(502, f"下载失败: HTTP {resp.status_code}")
                content_type = resp.headers.get("content-type", "")
                if not content_type.startswith("video/"):
                    raise HTTPException(400, "URL 不是视频文件")
                total = 0
                with open(out_path, "wb") as f:
                    async for chunk in resp.aiter_bytes(1024 * 1024):
                        total += len(chunk)
                        if total > 500 * 1024 * 1024:
                            raise HTTPException(413, "视频过大（上限 500MB）")
                        f.write(chunk)
    except HTTPException:
        out_path.unlink(missing_ok=True)
        raise
    except Exception:
        out_path.unlink(missing_ok=True)
        raise
    return {"job_id": job_id, "url": f"/outputs/bg_{job_id}.mp4"}

# ============================================================
# 5. 视频合成
# ============================================================

@app.post("/api/compose")
async def api_compose(
    audio_url: str = Form(...),
    subtitle_url: str = Form(...),
    bg_image_url: str = Form(""),        # 背景图 (静态2K, 铺满画布)
    material_video_url: str = Form(""),   # 素材视频 (16:9, 中心原点XY可调)
    material_bg_id: str = Form(""),       # 素材库 bg_id, 提供则自动裁剪所需时长
    material_x: str = Form("0"),          # 素材X (中心原点, 0=居中)
    material_y: str = Form("0"),          # 素材Y (中心原点, 0=居中)
    material_w: int = Form(0),            # 素材宽 (0=自适应)
    material_h: int = Form(0),            # 素材高
    text_boxes: str = Form("[]"),         # JSON: [{text,x,y,size,color}]
    subtitle_x: str = Form("(w-text_w)/2"),  # 字幕X
    subtitle_y: int = Form(120),          # 字幕距底
    width: int = Form(1440),
    height: int = Form(2560),
):
    """合成 — 背景图 + 素材视频 + 文本框 + 字幕"""
    job_id = str(uuid.uuid4())[:8]
    audio_path = OUTPUTS / Path(audio_url).name
    srt_path = OUTPUTS / Path(subtitle_url).name
    audio_dur = float(subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
        capture_output=True, text=True).stdout.strip() or 5)

    cmd = ["ffmpeg", "-y"]

    # ── Inputs ──
    # 0: black canvas
    cmd.extend(["-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:d={audio_dur+2}:r=30"])

    # 1: background image (loop as video)
    bg_path = None
    if bg_image_url.strip():
        bg_path = OUTPUTS / Path(bg_image_url.strip()).name
    if bg_path and bg_path.exists():
        cmd.extend(["-loop", "1", "-i", str(bg_path)])
        has_bg = True
    else:
        has_bg = False

    # 2: material video
    mat_path = None
    mat_clip_path = None  # temp clipped file
    if material_bg_id.strip():
        # 从素材库按需裁剪 audio_dur+2 秒
        state = _load_bg_state()
        info = state.get(material_bg_id.strip())
        if info:
            src = BGBASE / info["file"]
            if src.exists():
                total_dur = info["duration"]
                clip_pos = info.get("clip_pos", 0)
                remaining = total_dur - clip_pos
                if remaining < 0.5:
                    clip_pos = 0; remaining = total_dur
                clip_dur = min(audio_dur + 2, remaining)
                mat_clip_path = OUTPUTS / f"matclip_{job_id}.mp4"
                subprocess.run([
                    "ffmpeg", "-y",
                    "-ss", str(clip_pos), "-i", str(src),
                    "-t", str(clip_dur), "-c", "copy",
                    "-avoid_negative_ts", "make_zero",
                    str(mat_clip_path)
                ], capture_output=True, timeout=600)
                if mat_clip_path.exists():
                    mat_path = mat_clip_path
                    info["clip_pos"] = clip_pos + clip_dur
                    _save_bg_state(state)
    elif material_video_url.strip():
        mat_path = OUTPUTS / Path(material_video_url.strip()).name
    has_mat = mat_path and mat_path.exists()
    if has_mat:
        cmd.extend(["-stream_loop", "-1", "-i", str(mat_path)])

    # 3: audio
    cmd.extend(["-i", str(audio_path)])

    # ── Filter chain ──
    filters = []
    filters.append(f"[0:v]trim=duration={audio_dur+2},setpts=PTS-STARTPTS[canvas]")

    # Layer 1: background image
    if has_bg:
        filters.append(f"[1:v]scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},loop=-1:1,trim=duration={audio_dur+2},setpts=PTS-STARTPTS[bg];"
                       f"[canvas][bg]overlay=0:0[v1]")
    else:
        filters.append(f"[canvas]null[v1]")

    current_v = "[v1]"

    # Layer 2: material video (default 16:9 centered)
    if has_mat:
        mat_in = "2:v" if has_bg else "1:v"
        mw = material_w if material_w > 0 else width
        mh = material_h if material_h > 0 else int(width * 9 / 16)
        # center-origin → top-left overlay: (W-w)/2 + mx, (H-h)/2 + my
        filters.append(f"[{mat_in}]scale={mw}:{mh}:force_original_aspect_ratio=decrease,trim=duration={audio_dur+2},setpts=PTS-STARTPTS[mat];"
                       f"[{current_v}][mat]overlay=(W-w)/2+{material_x}:(H-h)/2+{material_y}[v2]")
        current_v = "[v2]"

    # Layer 3: text boxes
    try:
        boxes = json.loads(text_boxes)
    except:
        boxes = []
    font_file = "/usr/share/fonts/truetype/wqy-zenhei-regular.ttf"
    for i, tb in enumerate(boxes):
        txt = tb.get("text", "").strip()
        if not txt:
            continue
        txt_file = OUTPUTS / f"box_{job_id}_{i}.txt"
        txt_file.write_text(txt, "utf-8")
        x_raw = str(tb.get("x", "0"))
        y_raw = str(tb.get("y", "0"))
        # center-origin XY → FFmpeg drawtext (top-left baseline)
        # frontend y=0 means text vertical-center at canvas center
        x = f"(w-text_w)/2+{x_raw}"
        y = f"h/2-{sz}/2+{y_raw}"
        sz = tb.get("size", 48)
        clr = tb.get("color", "white")
        label = f"[vt{i}]"
        # drawtext: x/y support expressions like (w-text_w)/2
        filters.append(f"{current_v}drawtext=textfile='{txt_file}':fontsize={sz}:fontcolor={clr}:fontfile={font_file}:x={x}:y={y}:enable='between(t,0,{audio_dur})'{label}")
        current_v = label

    # Layer 4: subtitles (ASS)
    ass_path = OUTPUTS / f"sub_{job_id}.ass"
    font_size = 48
    font_color = "white"
    font_name = "WenQuanYi Zen Hei"
    has_sub = _srt_to_ass(srt_path, ass_path, font_name, font_size, font_color, width, height, subtitle_y)
    if has_sub:
        filters.append(f"{current_v}ass={ass_path}[vout]")
    else:
        filters.append(f"{current_v}null[vout]")

    filter_str = ";".join(filters)
    # Audio input number: count all video inputs
    audio_idx = 1 + (1 if has_bg else 0) + (1 if has_mat else 0)
    cmd.extend(["-filter_complex", filter_str, "-map", "[vout]", "-map", f"{audio_idx}:a"])
    cmd.extend(["-c:v", "libx264", "-preset", "fast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-shortest"])

    out_path = OUTPUTS / f"composed_{job_id}.mp4"
    cmd.append(str(out_path))

    result = subprocess.run(cmd, capture_output=True, timeout=1800)
    if result.returncode != 0:
        err_msg = result.stderr.decode(errors="ignore")[-500:]
        raise HTTPException(500, f"FFmpeg exit {result.returncode}: {err_msg}")

    cover_path = OUTPUTS / f"cover_{job_id}.png"
    subprocess.run(["ffmpeg", "-y", "-i", str(out_path), "-ss", "2", "-vframes", "1", str(cover_path)], capture_output=True, timeout=30)

    # 清理临时裁剪文件
    if mat_clip_path and mat_clip_path.exists():
        mat_clip_path.unlink(missing_ok=True)

    return {
        "job_id": job_id,
        "video_url": f"/outputs/composed_{job_id}.mp4",
        "cover_url": f"/outputs/cover_{job_id}.png",
        "duration": audio_dur,
    }

def _srt_to_ass(srt_path: Path, ass_path: Path, font_name: str, font_size: int, font_color: str, width: int, height: int, margin_v: int = 50) -> bool:
    """Convert SRT to ASS subtitle format. Returns True if subtitles were added."""
    if not srt_path.exists():
        ass_path.write_text("", encoding="utf-8")
        return False
    content = srt_path.read_text(encoding="utf-8")
    blocks = parse_srt(content)

    if not blocks:
        ass_path.write_text("", encoding="utf-8")
        return False

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

    ass_path.write_text(ass, encoding="utf-8")
    return True

def _time_to_ass(t: str) -> str:
    """0:00:01.500 -> 0:00:01.50"""
    parts = t.replace(",", ".").split(":")
    return f"{int(parts[0])}:{int(parts[1])}:{float(parts[2]):05.2f}"

def _rgb_to_bgr(color: str) -> str:
    if color == "white":
        return "FFFFFF"
    if color.startswith("#"):
        c = color[1:]
        return c[4:6] + c[2:4] + c[0:2]
    return "FFFFFF"

# ============================================================
# 6. 历史记录
# ============================================================

@app.get("/api/history", dependencies=[Depends(require_admin)])
async def api_history():
    """返回已合成的视频列表"""
    videos = []
    for f in sorted(OUTPUTS.glob("composed_*.mp4"), key=lambda x: x.stat().st_mtime, reverse=True):
        job_id = f.stem.replace("composed_", "")
        cover = OUTPUTS / f"cover_{job_id}.png"
        stat = f.stat()
        # 读取时长
        dur = float(subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(f)],
            capture_output=True, text=True).stdout.strip() or 0)
        videos.append({
            "job_id": job_id,
            "video_url": f"/outputs/{f.name}",
            "cover_url": f"/outputs/{cover.name}" if cover.exists() else None,
            "duration": round(dur, 1),
            "size_mb": round(stat.st_size / 1024 / 1024, 1),
            "created": stat.st_mtime,
        })
    return {"videos": videos}

@app.delete("/api/history/{job_id}", dependencies=[Depends(require_admin)])
async def api_history_delete(job_id: str):
    """删除某个合成视频"""
    for f in OUTPUTS.glob(f"*_{job_id}.*"):
        f.unlink()
    return {"success": True}

# ============================================================
# 7. 静态文件
# ============================================================

OUTPUTS.mkdir(parents=True, exist_ok=True)

# 自动清理：只保留最近 20 个合成视频
composed = sorted(OUTPUTS.glob("composed_*.mp4"), key=lambda x: x.stat().st_mtime, reverse=True)
for old in composed[20:]:
    job_id = old.stem.replace("composed_", "")
    for f in OUTPUTS.glob(f"*_{job_id}.*"):
        f.unlink()

from html_renderer import TemplateRenderService
_tpl_svc = TemplateRenderService()

@app.on_event("shutdown")
async def _close_tpl():
    await _tpl_svc.close()

# ── HTML 模板渲染 ──

@app.get("/api/templates", dependencies=[Depends(require_admin)])
async def list_templates():
    """列出所有 HTML 模板"""
    return {"templates": _tpl_svc.list_templates()}

@app.get("/api/templates/{template_id}/source", dependencies=[Depends(require_admin)])
async def get_template_source(template_id: str):
    """获取模板 HTML 源码"""
    src = _tpl_svc.get_template_source(template_id)
    if not src:
        raise HTTPException(404, "模板不存在")
    return src

@app.post("/api/templates/save", dependencies=[Depends(require_admin)])
async def save_template(
    template_id: str = Form(...),
    html: str = Form(...),
    width: int = Form(1440),
    height: int = Form(2560),
    is_new: bool = Form(False),
):
    """保存/新建模板"""
    try:
        return _tpl_svc.save_template(template_id, html, width, height, is_new)
    except (FileExistsError, FileNotFoundError) as e:
        raise HTTPException(400, str(e))

@app.post("/api/templates/render_raw", dependencies=[Depends(require_admin)])
async def render_raw_template(data: dict):
    """渲染原始 HTML（预览用，不保存）"""
    try:
        html = data.get("html", "")
        title = data.get("title", "")
        text = data.get("text", "")
        image = data.get("image", "")
        ext = data.get("ext", None)
        width = int(data.get("width", 1440))
        height = int(data.get("height", 2560))
        rendered = _tpl_svc._render_template_html(html, title, text, image, ext)
        out_dir = OUTPUTS
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = str(out_dir / f"raw_preview_{uuid.uuid4().hex[:12]}.png")
        await _tpl_svc._render_with_playwright(rendered, width, height, out_path)
        return {"url": f"/outputs/{Path(out_path).name}"}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.delete("/api/templates/{template_id}", dependencies=[Depends(require_admin)])
async def delete_template(template_id: str):
    """删除模板"""
    if _tpl_svc.delete_template(template_id):
        return {"deleted": True}
    raise HTTPException(404, "模板不存在")

@app.post("/api/templates/render", dependencies=[Depends(require_admin)])
async def render_template(
    template_id: str = Form(...),
    title: str = Form(""),
    text: str = Form(""),
    image: str = Form(""),
):
    """渲染 HTML 模板为 PNG"""
    try:
        out = await _tpl_svc.render_frame(template_id, title, text, image)
        return {"url": f"/outputs/{Path(out).name}"}
    except Exception as e:
        raise HTTPException(500, str(e))

app.mount("/outputs", StaticFiles(directory=str(OUTPUTS)), name="outputs")

# 健康检查
@app.get("/api/health")
async def health():
    return {"status": "ok", "ffmpeg": subprocess.run(["ffmpeg", "-version"], capture_output=True).returncode == 0}
