# Chaotools 项目概览

Chaotools 是一个由 Hub、独立工具页和 Gateway 组成的在线工具工作台。

## 当前生产架构

```text
浏览器
  │
  └── Nginx / HTTPS / chaotools.tech
       ├── 静态 Hub 与工具：/var/www/current
       ├── Gateway：127.0.0.1:3001 → /gateway/
       ├── 独立媒体、分析和内容服务
       └── SQLite：/home/ubuntu/chaotools-data/chaotools.db
```

`/var/www/html` 是线上源码和构建根目录；`/var/www/chaotools` 不再作为部署源。

## 代码结构

```text
hub/                 React + Vite 主站
gateway/             Hono API、认证、权限、账单和分析
packages/types/      共享类型
packages/sdk/        工具开发 SDK
tools/               迁移后的独立工具
shared/              工具页主题和公共运行时
scripts/             校验、发布和回滚脚本
ops/                 systemd 等运行配置模板
docs/                架构、部署和权限文档
```

## 质量门禁

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm --filter @chaotools/gateway build
pnpm --filter @chaotools/hub build
```

## 运行原则

- Gateway 只监听回环地址，公网入口统一经过 Nginx。
- 生产密钥只放在 `/etc/chaotools/gateway.env`。
- 数据库、备份、日志和媒体输出不放入网站根目录。
- 发布使用版本目录和 `current` 符号链接，旧版本保留用于回滚。
- 外部 AI 和其他第三方服务只作为入口，不嵌入或修改第三方页面。
