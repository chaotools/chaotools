# 工具提交指南

## 提交流程

```
贡献者                    平台
   │                       │
   │  Fork 仓库            │
   │──────────────────────►│
   │                       │
   │  创建工具目录          │
   │  编写 manifest.json   │
   │  编写 index.html      │
   │──────────────────────►│
   │                       │
   │  提交 PR              │
   │──────────────────────►│
   │                       │
   │              自动检查 ──┼─── CI 检查 manifest.json
   │                       │    CI 检查 index.html
   │              人工审核 ──┼─── 代码审查
   │                       │    功能测试
   │              合并 ────┼─────────────────►│
   │                       │                       │
   │                       │    自动部署 ─────────│
   │                       │                       ▼
   │                       │                  公开上线
```

## 快速开始

### 1. Fork 仓库

```bash
# 在 GitHub 上点击 Fork 按钮
# 或命令行:
gh repo fork chaotools/chaotools
```

### 2. 克隆你的 Fork

```bash
git clone https://github.com/YOUR_USERNAME/chaotools.git
cd chaotools
```

### 3. 创建工具目录

```bash
mkdir -p tools/your-tool-name
```

### 4. 创建 manifest.json

```json
{
  "id": "your-tool-name",
  "name": "你的工具名称",
  "description": "简短描述工具功能",
  "version": "0.1.0",
  "entry": "index.html",
  "author": "你的名字",
  "categories": ["dev"],
  "tags": ["标签1", "标签2"],
  "features": ["功能1", "功能2"]
}
```

### 5. 创建 index.html

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>你的工具 - Chaotools</title>
  <style>
    /* 使用 Chaotools 设计系统 */
    :root {
      --bg: #070b12;
      --surface: #0d1526;
      --border: rgba(0, 255, 157, 0.12);
      --cyan: #00ff9d;
      --text: #c8d6e5;
      --text-dim: #6b7d99;
    }

    body {
      font-family: 'Space Grotesk', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      /* ... */
    }
  </style>
</head>
<body>
  <!-- 你的工具 UI -->
  <script>
    // 工具逻辑
  </script>
</body>
</html>
```

### 6. 本地测试

直接用浏览器打开 `index.html` 测试。

### 7. 提交并推送

```bash
git checkout -b feature/your-tool-name
git add tools/your-tool-name/
git commit -m "feat(tools): 添加 your-tool-name"
git push origin feature/your-tool-name
```

### 8. 创建 Pull Request

在 GitHub 上创建 PR，填写 PR 模板。

## manifest.json 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✅ | 唯一 ID，英文小写字母、数字、连字符 |
| `name` | ✅ | 显示名称 |
| `description` | ✅ | 简短描述，50 字以内 |
| `version` | ✅ | 版本号，语义化版本 |
| `entry` | ✅ | 入口文件，通常是 `index.html` |
| `author` | ❌ | 作者名字 |
| `categories` | ❌ | 分类数组：`dev`, `fun`, `convert`, `text` |
| `tags` | ❌ | 标签数组，用于搜索 |
| `features` | ❌ | 功能特性列表 |

## 设计规范

### 颜色

```css
:root {
  --bg: #070b12;           /* 背景 */
  --surface: #0d1526;       /* 卡片/容器 */
  --surface2: #111d33;     /* 次级表面 */
  --border: rgba(0, 255, 157, 0.12);  /* 边框 */
  --cyan: #00ff9d;          /* 主色调/成功 */
  --text: #c8d6e5;         /* 主文字 */
  --text-dim: #6b7d99;     /* 次级文字 */
}
```

### 字体

- 主字体: `Space Grotesk`, -apple-system, sans-serif
- 代码字体: `JetBrains Mono`, monospace

### 圆角

- 按钮/输入框: `6px`
- 卡片: `10px`
- Modal: `14px`

### 间距

- 容器最大宽度: `1200px`
- 内边距: `20px - 24px`
- 卡片间距: `20px`

## 审核标准

### 必须满足

- [ ] manifest.json 格式正确，包含必填字段
- [ ] index.html 存在且可独立运行
- [ ] 使用 HTTPS 加载外部资源
- [ ] 无恶意代码或追踪器
- [ ] 不侵犯他人知识产权

### 建议满足

- [ ] 响应式设计，支持移动端
- [ ] 键盘可访问
- [ ] 有适当的 ARIA 属性
- [ ] 加载性能良好

## 常见问题

### Q: 工具可以使用外部库吗？

A: 可以，但必须使用可靠的 CDN（如 unpkg, jsdelivr, cdnjs）。不推荐大体积库。

### Q: 工具可以有后端 API 吗？

A: 目前不建议。所有逻辑应在前端完成。

### Q: 如何测试工具？

A: 直接用浏览器打开 `index.html` 即可测试。

### Q: 提交后多久能审核？

A: 维护者会尽快审核，通常 1-3 天。

## 所有权说明

提交工具即表示你同意：
- 工具所有权归 Chaotools 平台所有者
- 你的名字会被记录在工具的贡献者中
- 平台有权对工具进行修改和部署
