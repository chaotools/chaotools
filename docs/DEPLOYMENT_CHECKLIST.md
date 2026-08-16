# 生产发布检查清单

- [ ] 当前提交已推送到 GitHub，并记录提交号
- [ ] `/home/ubuntu/chaotools-data` 有可读数据库备份
- [ ] `/etc/chaotools/gateway.env` 权限为 `600`
- [ ] `pnpm install --frozen-lockfile` 通过
- [ ] `pnpm lint` 通过
- [ ] `pnpm test` 通过
- [ ] Gateway、Hub 构建通过
- [ ] Nginx 配置通过 `nginx -t`
- [ ] Gateway `active`，且只监听 `127.0.0.1:3001`
- [ ] `/health` 返回 200
- [ ] `/ready` 返回 200
- [ ] 登录、刷新、退出和收藏冒烟通过
- [ ] 至少一个本地工具和一个代理服务返回 200
- [ ] 当前发布目录和上一版本均可回滚
- [ ] 8321、18789 的公网策略已确认
