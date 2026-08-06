#!/bin/bash
# 启动证件照换底色 API 服务
cd /home/ubuntu/miniapp-toolbox/backend && \
  /home/ubuntu/hivision-idphotos/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8899 --reload &
echo "API 已启动（热更新模式），改代码自动生效"
echo "API 监听 8899 端口，测试: curl http://localhost:8899/api/health"
