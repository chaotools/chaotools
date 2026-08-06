# 贡献指南

欢迎贡献！以下是参与 Chaotools 开发的方式。

## 贡献方式

### 1. 提交工具

你可以为 Chaotools 提交新的工具:

1. Fork 仓库
2. 在 `tools/` 目录下创建新工具
3. 确保工具符合以下规范:
   - 每个工具一个目录
   - 包含 `manifest.json` 元信息
   - 包含 `index.html` 入口文件
4. 提交 PR

### 2. 工具规范

```json
// tools/your-tool/manifest.json
{
  "id": "your-tool",
  "name": "你的工具",
  "description": "工具描述",
  "version": "0.1.0",
  "entry": "index.html",
  "author": "你的名字",
  "categories": ["dev"],
  "tags": ["标签1", "标签2"],
  "features": ["功能1", "功能2"]
}
```

### 3. 提交 PR

```bash
# 1. Fork 仓库
# 2. 克隆你的 fork
git clone https://github.com/YOUR_USERNAME/chaotools.git

# 3. 创建分支
git checkout -b feature/your-tool

# 4. 开发你的工具
# ... 添加代码 ...

# 5. 提交
git add .
git commit -m "feat: 添加新工具"

# 6. 推送
git push origin feature/your-tool

# 7. 在 GitHub 上创建 PR
```

## 代码规范

### 工具 HTML

- 使用 Chaotools 设计系统 (黑暗主题)
- 响应式布局
- 无外部依赖或使用可靠的 CDN
- 包含适当的 ARIA 属性

### 提交信息格式

```
<type>(<scope>): <subject>

feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式
refactor: 重构
test: 测试
chore: 构建/工具
```

## 审核流程

1. 提交 PR
2. CI 检查 (lint, typecheck, build)
3. 维护者审核
4. 合并到 main

## 所有权

- 贡献的工具所有权归 Chaotools 平台所有者
- 贡献者会被记录在工具的 contributors 中
- 署名权归贡献者

## 问题

- Bug 报告: GitHub Issues
- 功能请求: GitHub Discussions
