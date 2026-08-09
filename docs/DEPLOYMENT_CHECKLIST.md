# 生产环境部署检查清单

## 1. 代码准备

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/chaotools.git
cd chaotools

# 安装依赖
pnpm install

# 本地验证构建
pnpm build
```

## 2. GitHub Secrets 配置

在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加:

### Vercel (Hub 主站)
```bash
VERCEL_TOKEN=xxxxx
VERCEL_ORG_ID=team_xxxxx
VERCEL_HUB_PROJECT_ID=prj_xxxxx
```

### Cloudflare (工具)
```bash
CLOUDFLARE_API_TOKEN=xxxxx
CLOUDFLARE_ACCOUNT_ID=xxxxx
```

### 服务器 (Gateway)
```bash
SERVER_HOST=your-server.com
SERVER_USER=root
SERVER_SSH_KEY=-----BEGIN OPENSSH PRIVATE KEY-----\n...
```

## 3. Vercel 部署 Hub

### 方式 A: GitHub 集成 (推荐)
1. 登录 [vercel.com](https://vercel.com)
2. Import Project → 选择 chaotools 仓库
3. Framework: Vite
4. Root Directory: `./hub`
5. Environment Variables: 添加 `VITE_API_URL=https://api.chaotools.tech`
6. Deploy

### 方式 B: CLI
```bash
cd hub
npm i -g vercel
vercel login
vercel --prod
```

### 获取 Vercel IDs
```bash
vercel tokens list
# 或
vercel projects ls
```

## 4. Cloudflare Pages 部署 Tools

### 方式 A: Dashboard
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Workers & Pages → Create application → Pages → Upload direct
3. Project name: `chaotools-tools`
4. Upload `tools/` 目录

### 方式 B: Wrangler CLI
```bash
npm install -g wrangler
wrangler pages deploy tools/ --project-name=chaotools-tools
```

## 5. 服务器部署 Gateway

### 方式 A: 手动部署
```bash
# 连接服务器
ssh user@your-server.com

# 安装依赖
curl -fsSL https://bun.sh/install | bash
npm install -g pm2

# 创建目录
sudo mkdir -p /var/www/chaotools
sudo chown $USER:$USER /var/www/chaotools

# 克隆/拉取代码
cd /var/www/chaotools
git pull

# 安装并构建
pnpm install --frozen-lockfile
pnpm -r --filter @chaotools/gateway build

# 初始化数据库
cd gateway
bun run scripts/init-db.ts

# 启动
pm2 start dist/index.js --name gateway
pm2 save
pm2 startup
```

### 方式 B: 使用脚本
```bash
chmod +x scripts/setup-server.sh
./scripts/setup-server.sh
```

## 6. 域名配置

### DNS 记录

| 域名 | 类型 | 值 |
|------|------|-----|
| chaotools.tech | A | Vercel IP |
| api.chaotools.tech | A | 服务器 IP |
| tools.chaotools.tech | CNAME | Cloudflare Pages |

### Vercel Domain
1. Dashboard → Domains → Add
2. 添加 `chaotools.tech`
3. 配置 DNS

## 7. 环境变量

### Gateway (.env)
```bash
PORT=3001
DATABASE_PATH=./data/chaotools.db
JWT_SECRET=your-super-secret-key
CORS_ORIGIN=https://chaotools.tech
ADMIN_PASSWORD=your-admin-password
```

### Hub (.env.production)
```bash
VITE_API_URL=https://api.chaotools.tech
```

## 8. 验证部署

```bash
# 检查 Hub
curl https://chaotools.tech/health

# 检查 API
curl https://api.chaotools.tech/health

# 检查工具
curl https://chaotools.tech/tools/json-formatter/index.html
```

## 9. 监控设置

### PM2 监控
```bash
pm2 monit
pm2 list
pm2 logs gateway
```

### 日志
```bash
pm2 logs gateway --lines 100
```

## 10. 回滚方案

### Hub (Vercel)
```bash
vercel rollback
```

### Tools (Cloudflare)
Dashboard → Pages → 手动选择旧版本

### Gateway
```bash
pm2 stop gateway
git checkout <previous-commit>
pnpm -r --filter @chaotools/gateway build
pm2 start dist/index.js --name gateway
```

## 部署完成 ✅

部署成功后，你的平台将是:

- 🌐 **Hub**: https://chaotools.tech
- 🔌 **API**: https://api.chaotools.tech
- 🧰 **Tools**: https://tools.chaotools.tech/json-formatter
