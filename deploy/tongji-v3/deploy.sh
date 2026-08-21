#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "缺少 deploy/tongji-v3/.env，请从 .env.example 创建并填写真实密钥。" >&2
  exit 1
fi

docker compose --env-file .env config --quiet
if ! docker network inspect "${SUPABASE_NETWORK:-supabase_default}" >/dev/null 2>&1; then
  echo "未找到共享 Supabase 网络：${SUPABASE_NETWORK:-supabase_default}" >&2
  exit 1
fi

COMPOSE_PARALLEL_LIMIT=1 docker compose --env-file .env build --pull
docker compose --env-file .env up -d --remove-orphans
docker compose --env-file .env ps

echo "童迹3.0已更新到 127.0.0.1:${TONGJI_V3_PORT:-8300}，未操作其他Compose项目。"
