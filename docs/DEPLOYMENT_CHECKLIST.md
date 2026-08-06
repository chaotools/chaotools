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
SERVER_SSH_KEY=<your-private-key>