# Video Studio

视频自动化生产线 — TTS 配音 → 静音裁剪 → 文稿对齐字幕 → 视频合成

## 架构

```
前端 (chaotools.tech/video-studio/)
  ↓ /api-studio/*
本地后端 (server.py, :8765)
  ↓ /api/align → GPU 服务器 (video_studio_gpu.py, :6008)
GPU (NVIDIA RTX 3090)
  ├── Faster-Whisper large-v3 (文稿对齐)
  └── IndexTTS2 (声音克隆 TTS)
```

## 功能

- **TTS 配音** — Edge TTS / IndexTTS 声音克隆
- **静音裁剪** — ffmpeg silenceremove 自动去静音
- **文稿对齐字幕** — 基于 Whisper 强制对齐，100% 文字准确
- **标点断句** — 按 `。！？!?；;` 自动分段
- **视频合成** — 背景图 + 素材视频 + 文本框 + 字幕
- **素材库** — 上传一次，按需裁剪，"用多少剪多少"
- **画布预览** — 拖拽定位，居中吸附辅助线

## 目录

```
video-studio/
├── server.py              # 本地 FastAPI 后端 (:8765)
├── video_studio_gpu.py    # GPU FastAPI 服务 (:6008)
├── index_new.html         # 前端单页 (部署到 /var/www/html/video-studio/)
├── html_renderer.py       # HTML 画布渲染器
├── html_templates/        # 视频合成 HTML 模板
│   ├── 1080x1920/         # 竖屏 1080×1920
│   └── 1440x2560/         # 竖屏 2K 1440×2560
├── demucs_separate.sh     # Demucs 音频分离脚本
└── rules_store.json       # SRT 替换规则
```

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/tts` | POST | 文字转语音 (edge-tts / indextts) |
| `/api/trim` | POST | 音频静音裁剪 |
| `/api/align` | POST | 文稿对齐生成字幕 |
| `/api/compose` | POST | 合成视频 |
| `/api/bg/upload` | POST | 上传背景/素材 |
| `/api/bg/clip` | POST | 从素材库裁剪 |
| `/api/srt/translate` | POST | SRT 翻译 |
| `/api/srt/replace` | POST | SRT 替换 |

## 部署

### 前端
```bash
sudo cp index_new.html /var/www/html/video-studio/index.html
```

### 后端
```bash
sudo fuser -k 8765/tcp
cd /home/ubuntu/video-studio && nohup uvicorn server:app --host 0.0.0.0 --port 8765 &
```

### GPU 服务
```bash
ssh root@<gpu-host> -p 45125
cd /root && nohup python3 video_studio_gpu.py &
```
