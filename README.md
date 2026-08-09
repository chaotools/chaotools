# Chaotools

> 你的工具，你做主

个人工具箱网站，提供 40+ 个在线工具和 AI 大模型导航。基于 **manifest.json** 驱动的工具市场架构，动态加载，无需重新构建。

🌐 [chaotools.tech](https://chaotools.tech)

---

## ✨ 功能

| 模块 | 说明 |
|------|------|
| 🧰 **工具市场** | 40+ 个工具（开发 / AI 导航 / 趣味），manifest 驱动动态增减 |
| 🤖 **AI 大模型导航** | ChatGPT、Claude、DeepSeek、Gemini、Kimi、通义千问、Grok、Perplexity — 品牌图标 + 一键直达 |
| 💬 **留言板 / 工具 API** | 留言、SRT 翻译与替换规则同步、访问计数（Node.js + Express） |
| 🔐 **登录与收藏同步** | 可选登录（短令牌 + httpOnly 刷新 Cookie），收藏跨设备同步 |
| 🔍 **搜索 + 分类** | 客户端即时搜索 + 分类筛选（开发 / AI / 趣味） |
| 🎨 **工具柜主题** | 暖灰工作台 + 深棕铭牌 + 抽屉卡片，支持暗色/亮色切换 |
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
│  │  /tools/* 与各独立目录        │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  后端 API（systemd 托管）     │    │
│  │  ┌────────────────────────┐  │    │
│  │  │ /api/message-board/*   │  │    │
│  │  │ /api-studio/*          │  │    │
│  │  │ /lhb-analyzer/         │  │    │
│  │  │ /audio-trimmer/        │  │    │
│  │  │ api.chaotools.tech     │  │    │
│  │  │ /gateway/* 认证/收藏    │  │    │
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
| 样式 | CSS3 自定义变量 | 工具柜主题（暗色/亮色） |
| 搜索 | 客户端即时搜索 | 名称/描述/标签子串匹配 |
| 后端 API | Node.js + Express / Python FastAPI | 留言板、视频工作室、证件照、龙虎榜分析等 |
| 网关 | Hono 4 + SQLite + JWT | 登录注册 / 刷新令牌 / 收藏同步 / 权限管理 |
| 类型系统 | `@chaotools/types` | 统一类型定义（Hub + Gateway 共用） |
| 部署 | Nginx + systemd | 静态文件服务 + 反向代理 + 服务托管 |
| 存储 | JSON 文件 | 轻量留言数据持久化 |
| 依赖管理 | pnpm | monorepo workspace |
| 版本控制 | GitHub | 私有仓库托管 |

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
│   │   ├── context/
│   │   │   └── AuthContext.tsx       # 登录态（内存短令牌 + 刷新 Cookie）
│   │   ├── api/
│   │   │   └── client.ts             # Gateway API 客户端（自动刷新令牌）
│   │   ├── pages/
│   │   │   ├── HomePage.tsx          # 首页（工具网格 + 搜索）
│   │   │   ├── ExplorePage.tsx       # 探索页面
│   │   │   ├── MyToolsPage.tsx       # 收藏页面
│   │   │   ├── ToolDetailPage.tsx    # 工具详情页
│   │   │   ├── LoginPage.tsx         # 登录页
│   │   │   └── RegisterPage.tsx      # 注册页（含验证码）
│   │   ├── hooks/
│   │   │   ├── useTools.ts           # manifest 数据加载 + Fuse.js 搜索
│   │   │   ├── useTheme.ts           # 主题切换
│   │   │   ├── useFavorites.ts       # 收藏（本地 + 服务端同步）
│   │   │   └── useDebounce.ts        # 防抖
│   │   ├── App.tsx                   # 路由配置
│   │   └── main.tsx                  # 入口
│   ├── public/
│   │   └── manifest.json             # 工具注册表
│   └── dist/                         # 构建产物（不提交）
├── packages/                         # 共享包
│   ├── types/                        # 统一类型定义（Tool/Manifest/Category…）
│   ├── sdk/                          # 工具开发 SDK
│   └── create-tool/                  # CLI 脚手架
├── gateway/                          # API 网关（Hono + SQLite + JWT）
│   └── src/
│       ├── routes/                   # auth / users / tools / registry / billing…
│       └── services/                 # db / auth / permission / user…
├── tools/                            # 独立工具页
├── api/message-board/                # 留言板 / SRT / 计数 API（Node.js）
├── backends/                         # 独立后端服务源码（视频/证件照/龙虎榜）
├── scripts/                          # 部署脚本
└── docs/                             # 文档
```

## 🚀 快速开始

```bash
# 克隆
git clone https://github.com/chaotools/chaotools.git
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

生产环境为腾讯云轻量应用服务器（Ubuntu + Nginx + Let's Encrypt + systemd），站点根目录 `/var/www/html`：

```bash
# 构建
cd hub && pnpm build

# 部署（以 hub 为例）
cp dist/index.html /var/www/html/
cp dist/assets/* /var/www/html/assets/

# 后端服务（systemd）
systemctl restart message-board video-studio miniapp-backend lhb-analyzer audio-trimmer chaotools-gateway
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
  "tech": { "entry": "/tools/my-tool/", "version": "1.0.0" },
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

- **服务器**：腾讯云轻量应用服务器（北京），Ubuntu + Nginx + systemd
- **域名**：chaotools.tech（SSL via Let's Encrypt / Certbot）
- **API 服务**：systemd 托管
  - `message-board`（3456）：留言 / SRT / 同步规则 / 计数
  - `video-studio`（8765）：视频合成 / TTS / 模板渲染
  - `miniapp-backend`（8899）：证件照换底色 / 内容安全 / 汇率
  - `lhb-analyzer`（8000）：龙虎榜游资分析
  - `audio-trimmer`（8081）：音频静音裁剪
  - `chaotools-gateway`（3001，经 Nginx `/gateway/` 代理）：登录 / 注册 / 刷新令牌 / 收藏同步
- **CDN 策略**：Nginx 缓存控制（30d 不可变缓存 for hashed assets）
- **源码托管**：[github.com/chaotools/chaotools](https://github.com/chaotools/chaotools)

## 📄 License

MIT

---

## 仓库说明

本仓库为 Chaotools 网站的源码仓库（私有，已做脱敏处理）。以下内容不包含在仓库中：

- 所有 `.env`、真实 API Key、密钥与令牌；
- 生产数据（留言、统计、规则、数据库、题库数据等）；
- 构建产物、node_modules、虚拟环境与大文件；
- 个人/付费内容（如证券题库 `绝密押题合集.json`、`jining-map.html` 等）；
- 独立服务器服务（证件照/视频/龙虎榜后端）已放入 `backends/`，但仅含代码与依赖清单，不含运行数据。

部署与配置请参考各目录 README 与 `docs/DEPLOYMENT_CHECKLIST.md`。
