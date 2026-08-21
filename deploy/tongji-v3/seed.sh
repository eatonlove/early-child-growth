#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"
docker compose --env-file .env run --rm api node dist/scripts/seed-knowledge.js
