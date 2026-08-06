#!/bin/bash
# 用法: bash demucs_separate.sh <音频文件>
# 在 GPU 服务器上运行 Demucs 分离人声和背景音乐

set -e
INPUT="$1"
if [ -z "$INPUT" ]; then
    echo "用法: bash demucs_separate.sh <音频文件>"
    exit 1
fi

BASENAME=$(basename "$INPUT" | sed 's/\.[^.]*$//')
OUTPUT_DIR="/root/demucs_output/$BASENAME"

echo "=== Demucs 音源分离 ==="
echo "输入: $INPUT"
echo "输出目录: $OUTPUT_DIR"

# 用 htdemucs 模型（高质量，支持 GPU）
demucs --two-stems=vocals -n htdemucs --out "$OUTPUT_DIR" "$INPUT"

echo "=== 完成 ==="
echo "人声: $OUTPUT_DIR/htdemucs/vocals.wav"
echo "伴奏: $OUTPUT_DIR/htdemucs/no_vocals.wav"
ls -lh "$OUTPUT_DIR/htdemucs/"
