# 部署指南

## 环境配置

### 1. Vercel (Hub 主站)

**需要的 Secrets:**

```bash
VERCEL_TOKEN        # Vercel API Token
VERCEL_ORG_ID      # Vercel Organization ID
VERCEL_HUB_PROJECT_ID  # Hub 项目 ID
```

**获取方式:**
1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. Settings → Tokens → Create Token
3. Settings → Organizations → Copy Org ID
4. Import Project → Copy Project ID

### 2. Cloudflare Pages (工具)

**需要的 Secrets:**

```bash
CLOUDFLARE_API_TOKEN   # Cloudflare API Token
CLOUDFLARE_ACCOUNT_ID  # Cloudflare Account ID
```

**获取方式:**
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Profile → API Tokens → Create Token
3. Account ID 在页面右侧获取

### 3. 服务器部署 (Gateway)

**需要的 Secrets:**

```bash
SERVER_HOST    # 服务器 IP 或域名
SERVER_USER    # SSH 用户名
SERVER_SSH_KEY  # SSH 私钥
```

## 设置 Secrets

在 GitHub 仓库中:
1. Settings → Secrets and variables → Actions
2. New repository secret

或者使用 GitHub CLI:

```bash
gh secret set VERCEL_TOKEN --body "your-token"
gh secret set VERCEL_ORG_ID --body "your-org-id"
# ... 其他 secrets
```

## 本地测试部署

### Hub (Vercel)

```bash
cd hub
vercel login
vercel
```

### Tools (Cloudflare Pages)

```bash
wrangler pages deploy tools/
```

### Gateway

```bash
cd gateway
bun run build
bun run start
```

## 生产环境检查清单

- [ ] 所有 secrets 已配置
- [ ] 域名已解析
- [ ] SSL 证书已生效
- [ ] 数据库已初始化 (`bun run db:init`)
- [ ] PM2 已配置开机自启
- [ ] 监控已设置

## 架构

```
                    ┌─────────────────┐
                    │   Vercel       │
                    │   (Hub 主站)   │
                    └────────┬────────┘
                             │
┌─────────────┐     ┌────────▼────────┐     ┌─────────────────┐
│ Cloudflare  │     │   Gateway API   │     │   你的服务器    │
│ (Tools CDN) │     │  (Hono+Bun)   │     │   (Gateway)    │
└─────────────┘     └─────────────────┘     └─────────────────┘
```

## 回滚

### Vercel
```bash
vercel rollback --token=$VERCEL_TOKEN
```

### Cloudflare Pages
在 Cloudflare Dashboard 中手动回滚

### Gateway
```bash
pm2 stop gateway
git checkout <previous-commit>
bun run build
pm2 start dist/index.js --name gateway
```
