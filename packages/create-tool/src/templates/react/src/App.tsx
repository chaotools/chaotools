import { useState } from 'react';

/**
 * {{TOOL_NAME}} - Chaotools Tool
 *
 * 在 Chaotools 主站中运行时，可以访问 window.__TOOL_CONTEXT__
 * 来获取工具上下文和 SDK 功能
 */

export default function App() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');

  const handleProcess = () => {
    // TODO: 实现工具逻辑
    setOutput(`输入: ${input}`);
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ color: '#00ff9d', marginBottom: 20 }}>
        {{TOOL_NAME}}
      </h1>

      <div style={{
        background: '#0d1526',
        border: '1px solid rgba(0, 255, 157, 0.12)',
        borderRadius: 10,
        padding: 20
      }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入内容..."
          style={{
            width: '100%',
            minHeight: 150,
            padding: 12,
            background: '#070b12',
            border: '1px solid rgba(0, 255, 157, 0.12)',
            borderRadius: 6,
            color: '#c8d6e5',
            fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            resize: 'vertical',
            marginBottom: 12
          }}
        />

        <button
          onClick={handleProcess}
          style={{
            width: '100%',
            padding: 12,
            background: '#00ff9d',
            color: '#070b12',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600,
            marginBottom: 12
          }}
        >
          处理
        </button>

        <div style={{
          background: '#070b12',
          padding: 12,
          borderRadius: 6,
          fontFamily: "'JetBrains Mono', monospace",
          whiteSpace: 'pre-wrap',
          minHeight: 100
        }}>
          {output || '结果将显示在这里'}
        </div>
      </div>
    </div>
  );
}
