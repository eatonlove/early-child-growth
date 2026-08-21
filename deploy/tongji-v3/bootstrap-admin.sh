#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "缺少 .env，请先完成部署配置。" >&2
  exit 1
fi

printf "请输入首个教研员密码（至少10位，包含大小写字母和数字）: "
stty -echo
IFS= read -r bootstrap_password
stty echo
printf "\n"
trap 'unset bootstrap_password; stty echo 2>/dev/null || true' EXIT INT TERM

docker compose --env-file .env run --rm \
  -e BOOTSTRAP_ADMIN_PASSWORD="$bootstrap_password" \
  api node dist/scripts/bootstrap-admin.js
