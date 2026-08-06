# Chaotools

> 你的工具，你做主

个人工具箱网站，提供 32 个在线工具和 AI 大模型导航。基于 **manifest.json** 驱动的工具市场架构，动态加载，无需重新构建。

🌐 [chaotools.tech](https://chaotools.tech)

---

## ✨ 功能

| 模块 | 说明 |
|------|------|
| 🧰 **工具市场** | 17 个开发工具（JSON、Base64、JWT、正则、渐变生成…）+ 7 个趣味工具（彩虹屁、毒鸡汤、一言…）|
| 🤖 **AI 大模型导航** | ChatGPT、Claude、DeepSeek、Gemini、Kimi、通义千问、Grok、Perplexity — 品牌图标 + 一键直达 |
| 💬 **留言板** | 访客可提交工具建议和反馈（Node.js + Express + JSON 存储） |
| 🔍 **搜索 + 分类** | Fuse.js 模糊搜索 + 分类筛选（开发 / 趣味 / AI） |
| 🎨 **暗色/亮色主题** | CSS 变量驱动，一键切换 |
| 🖼 **品牌图标** | 品牌色圆形 PNG 图标，manifest 驱动，热更新无需构建 |
| 📱 **响应式设计** | 适配桌面端和移动端 |

## 🏗 架构

```
┌──────────────────────────────────────┐
│           chaotools.tech             │
│         Nginx (反向代理 + SSL)        │
├──────────────────────────────────────┤
│                                      │
│  ┌──────────────────────────────┐    │
│  │   React SPA (Vite 5)         │    │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ │    │
│  │  │ 首页 │ │ 探索 │ │ 收藏 │ │    │
│  │  │ 工具详情                   │    │
│  │  └──────┘ └──────┘ └──────┘ │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  独立工具页 (纯 HTML)         │    │
│  │  /order-distributor/        │    │
│  │  /qrcode-generator/          │    │
│  │  /timestamp-converter/ 等 13 │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  API 服务 (Node.js/Express)  │    │
│  │  ┌────────────────────────┐  │    │
│  │  │ /api/message-board/*   │  │    │
│  │  └────────────────────────┘  │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  静态资源                     │    │
│  │  /manifest.json — 工具注册表  │    │
│  │  /assets/ — 构建产物          │    │
│  │  /assets/brands/ — 品牌图标   │    │
│  └──────────────────────────────┘    │
│                                      │
└──────────────────────────────────────┘
```

## 🛠 技术栈

| 部分 | 技术 | 说明 |
|------|------|------|
| 前端框架 | React 18 + TypeScript | SPA 单页应用 |
| 构建工具 | Vite 5 | 快速 HMR + 构建 |
| 路由 | React Router v6 | 首页 / 探索 / 收藏 / 工具详情 |
| 样式 | CSS3 自定义变量 | 暗色/亮色双主题 |
| 搜索 | Fuse.js | 客户端模糊搜索 |
| 后端 API | Node.js + Express | 留言板接口 |
| 网关 (开发中) | Hono 4 + SQLite | 工具注册 / 用户认证 / 权限管理 |
| 类型系统 | `@chaotools/types` | 统一类型定义（Hub + Gateway 共用） |
| 部署 | Nginx | 静态文件服务 + 反向代理 |
| 存储 | JSON 文件 | 轻量留言数据持久化 |
| 依赖管理 | pnpm | monorepo workspace |
| 版本控制 | cnb.cool Git | 源码托管 |

## 📁 项目结构

```
chaotools/
├── hub/                              # 前端 SPA 源码 (React + Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx            # 导航栏（支持外部链接）
│   │   │   ├── ToolCard.tsx          # 工具卡片（PNG/emoji 图标）
│   │   │   ├── ToolGrid.tsx          # 工具卡片网格
│   │   │   ├── SearchBar.tsx         # 搜索框
│   │   │   ├── CategoryFilter.tsx    # 分类筛选
│   │   │   ├── Footer.tsx            # 页脚
│   │   │   ├── BackToTop.tsx         # 回到顶部
│   │   │   ├── LoadingSpinner.tsx    # 加载动画
│   │   │   └── ErrorBoundary.tsx     # 错误边界
│   │   ├── pages/
│   │   │   ├── HomePage.tsx          # 首页（工具网格 + 搜索）
│   │   │   ├── ExplorePage.tsx       # 探索页面
│   │   │   ├── MyToolsPage.tsx       # 收藏页面
│   │   │   └── ToolDetailPage.tsx    # 工具详情页
│   │   ├── hooks/
│   │   │   ├── useTools.ts           # manifest 数据加载 + Fuse.js 搜索
│   │   │   ├── useTheme.ts           # 主题切换
│   │   │   ├── useLocalStorage.ts    # 本地收藏
│   │   │   └── useDebounce.ts        # 防抖
│   │   ├── App.tsx                   # 路由配置
│   │   └── main.tsx                  # 入口
│   ├── public/
│   │   └── manifest.json             # 工具注册表
│   └── dist/                         # 构建产物
├── packages/                         # 共享包
│   ├── types/                        # 统一类型定义（Tool/Manifest/Category…）
│   ├── sdk/                          # 工具开发 SDK
│   └── create-tool/                  # CLI 脚手架
├── gateway/                          # API 网关（Hono + SQLite + JWT）
│   └── src/
│       ├── routes/                   # tools / auth / registry / teams…
│       └── services/                 # db / auth / permission…
├── tools/                            # 独立工具页
├── scripts/                          # 部署脚本
└── docs/                             # 文档
```

## 🚀 快速开始

```bash
# 克隆
git clone https://cnb.cool/chaotools/chaotools.git
cd chaotools

# 安装依赖
pnpm install

# 构建 types（首次需要）
cd packages/types && pnpm build && cd ../..

# 开发
cd hub && pnpm dev

# 构建
cd hub && pnpm build
```

## 📦 部署

构建产物部署到 `/var/www/html/`，Nginx 直接托管：

```bash
# 构建
cd hub && pnpm build

# 部署
cp dist/index.html /var/www/html/
cp dist/assets/* /var/www/html/assets/
```

## 🔄 添加新工具

只需编辑 `public/manifest.json`，无需重新构建 SPA：

```json
{
  "id": "my-tool",
  "name": "我的工具",
  "slug": "my-tool",
  "description": "工具描述",
  "categories": ["dev"],
  "tags": ["标签"],
  "icon": "/assets/brands/my-tool.png",
  "tech": { "entry": "/my-tool/", "version": "1.0.0" },
  "pricing": { "type": "free" },
  "visibility": "public",
  "status": "published",
  "owner": { "id": "chaotools", "name": "Chaotools", "type": "owner" }
}
```

`icon` 字段支持：
- **Emoji**：`"icon": "🔧"` — 轻量分类标识
- **PNG 路径**：`"icon": "/assets/brands/chatgpt.png"` — 品牌图标，自动渲染

## 🌐 部署信息

- **服务器**：Ubuntu + Nginx 1.24
- **域名**：chaotools.tech（SSL via Let's Encrypt / Certbot）
- **API 服务**：systemd 守护进程 (`chaotools-message-board`)，端口 3456
- **CDN 策略**：Nginx 缓存控制（30d 不可变缓存 for hashed assets）
- **源码托管**：[cnb.cool/chaotools/chaotools](https://cnb.cool/chaotools/chaotools)

## 📄 License

MIT

---

## 公开仓库说明

本仓库为 Chaotools 网站的公开源码（已做脱敏处理）。以下内容不包含在公开仓库中：

- 所有 `.env`、真实 API Key、密钥与令牌；
- 生产数据（留言、统计、规则、数据库、题库数据等）；
- 构建产物、node_modules、虚拟环境与大文件；
- 个人/付费内容（如证券题库 `绝密押题合集.json`、`jining-map.html` 等）；
- 独立服务器服务（证件照/视频/龙虎榜后端）已放入 `backends/`，但仅含代码与依赖清单，不含运行数据。

部署与配置请参考各目录 README 与 `docs/DEPLOYMENT_CHECKLIST.md`。
