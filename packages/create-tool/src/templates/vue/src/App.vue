<script setup lang="ts">
import { ref } from 'vue';

const input = ref('');
const output = ref('');

const handleProcess = () => {
  // TODO: 实现工具逻辑
  output.value = `输入: ${input.value}`;
};
</script>

<template>
  <div style="max-width: 800px; margin: 0 auto;">
    <h1 style="color: #00ff9d; margin-bottom: 20px;">
      {{TOOL_NAME}}
    </h1>

    <div style="
      background: #0d1526;
      border: 1px solid rgba(0, 255, 157, 0.12);
      border-radius: 10px;
      padding: 20px;
    ">
      <textarea
        v-model="input"
        placeholder="输入内容..."
        style="
          width: 100%;
          min-height: 150px;
          padding: 12px;
          background: #070b12;
          border: 1px solid rgba(0, 255, 157, 0.12);
          border-radius: 6px;
          color: #c8d6e5;
          font-size: 14px;
          font-family: 'JetBrains Mono', monospace;
          resize: vertical;
          margin-bottom: 12px;
        "
      />

      <button
        @click="handleProcess"
        style="
          width: 100%;
          padding: 12px;
          background: #00ff9d;
          color: #070b12;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          margin-bottom: 12px;
        "
      >
        处理
      </button>

      <div style="
        background: #070b12;
        padding: 12px;
        border-radius: 6px;
        font-family: 'JetBrains Mono', monospace;
        white-space: pre-wrap;
        min-height: 100px;
      ">
        {{ output || '结果将显示在这里' }}
      </div>
    </div>
  </div>
</template>
