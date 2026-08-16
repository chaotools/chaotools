# Chaotools 生产部署

线上唯一源码根目录是 `/var/www/html`，运行时通过发布目录切换：

```text
/var/www/releases/<version>/
/var/www/current -> /var/www/releases/<version>/
```

Gateway 使用 `chaotools-gateway.service`，只监听 `127.0.0.1:3001`；Nginx 负责 HTTPS、静态文件和 `/gateway/` 代理。

## 发布

```bash
export SERVER_HOST=152.136.48.140
export SERVER_USER=ubuntu
export GIT_REF=main
./scripts/deploy-gateway.sh
```

发布脚本会建立新版本、安装锁定依赖、构建 Gateway 和 Hub、复制 Hub 静态产物、原子切换 `current`，然后检查 `/health` 和 `/ready`。

## 环境文件

生产环境文件固定为 `/etc/chaotools/gateway.env`，权限必须是 `600`。至少包含：

```dotenv
PORT=3001
DATABASE_PATH=/home/ubuntu/chaotools-data/chaotools.db
JWT_SECRET=<strong-random-secret>
CORS_ORIGIN=https://chaotools.tech
WEBHOOK_SECRET=<payment-webhook-secret>
```

数据库、日志、备份和密钥不得放在 Nginx 网站根目录。

## 验收

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm --filter @chaotools/gateway build
pnpm --filter @chaotools/hub build
sudo nginx -t
systemctl is-active chaotools-gateway.service
curl -fsS https://chaotools.tech/health
curl -fsS https://chaotools.tech/gateway/ready
```

## 回滚

```bash
export SERVER_HOST=152.136.48.140
export SERVER_USER=ubuntu
export VERSION=<previous-release>
./scripts/rollback-production.sh
```

回滚只切换符号链接，不删除旧发布目录。数据库迁移前必须先完成备份和完整性检查。
