# Chaotools 项目概览

> 你的平台 | 你的规则 | 你的所有权

## 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         chaotools.tech                           │
│                       (用户访问入口)                             │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│   Hub (主站)  │      │  Tools (工具)  │      │ Gateway (API) │
│   Vercel     │      │ Cloudflare    │      │   你的服务器   │
│   React+Vite │      │   静态文件    │      │   Hono+Bun   │
└───────────────┘      └───────────────┘      └───────────────┘
```

## 项目结构

```
chaotools/
├── .github/workflows/     # CI/CD 配置
├── packages/
│   ├── types/           # 共享类型定义
│   ├── sdk/             # 工具开发 SDK
│   └── create-tool/      # CLI 脚手架
├── hub/                  # 主站 (React + Vite)
├── gateway/              # API 服务 (Hono + Bun)
├── tools/                # 工具目录 (10 个已迁移)
├── scripts/              # 部署脚本
└── docs/                 # 文档
```

## 快速开始

### 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 或单独开发某个包
cd hub && pnpm dev
cd gateway && bun run dev
```

### 构建

```bash
pnpm build
```

### 部署

详见 [部署指南](DEPLOYMENT_CHECKLIST.md)

## 技术栈

| 部分 | 技术 | 说明 |
|------|------|------|
| 主站 | React + Vite | 工具目录、搜索、用户界面 |
| API | Hono + Bun | 高性能 API 服务 |
| 数据库 | SQLite | 轻量级数据库 |
| 部署 | Vercel + Cloudflare | 静态托管 + CDN |
| 样式 | CSS Variables | 黑暗主题 |

## 核心功能

- [x] 三层架构 (私有/团队/社区)
- [x] 工具所有权始终在 owner
- [x] JWT 认证
- [x] 工具注册审核
- [x] CI/CD 自动部署
- [x] 10 个工具已迁移
- [ ] 社区贡献流程
- [ ] 用户系统
- [ ] 数据分析
- [ ] 商业化功能

## 费用估算

| 服务 | 费用 | 说明 |
|------|------|------|
| 域名 | ~$10/年 | .tech 域名 |
| Vercel | 免费 | Hobby 计划足够 |
| Cloudflare | 免费 | Pages 免费额度 |
| 服务器 | $5-20/月 | 1核1G 即可 |
| **总计** | **~$70-250/年** | 非常便宜 |

## 下一步

1. 配置 GitHub Secrets
2. 部署到 Vercel/Cloudflare
3. 初始化数据库
4. 迁移自定义域名
5. 开始使用！

## 文档

- [部署检查清单](DEPLOYMENT_CHECKLIST.md)
- [权限模型](PERMISSION_MODEL.md)
- [贡献指南](../CONTRIBUTING.md)
