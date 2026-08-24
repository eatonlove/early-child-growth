#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase-db}"

if ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  echo "未找到共享 Supabase 数据库容器：$DB_CONTAINER" >&2
  exit 1
fi

schema_exists="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -Atc \
  "select exists(select 1 from information_schema.schemata where schema_name = 'tongji_v3');")"

if [ "$schema_exists" != "t" ]; then
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 --single-transaction \
    < "$ROOT_DIR/apps/v3-api/supabase/migrations/20260821055850_tongji_v3_production_schema.sql"
else
  echo "tongji_v3 基础 schema 已存在，跳过基础迁移。"
fi

governance_exists="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -Atc \
  "select to_regclass('tongji_v3.research_activities') is not null;")"

if [ "$governance_exists" != "t" ]; then
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 --single-transaction \
    < "$ROOT_DIR/apps/v3-api/supabase/migrations/20260821090000_tongji_v3_governance.sql"
else
  echo "童迹治理模块表已存在，跳过治理迁移。"
fi

auth_trigger_compatible="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -Atc \
  "select coalesce((select position('tongji-v3.local' in pg_get_triggerdef(oid)) > 0 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'auth_user_profile_created' and not tgisinternal), true);")"

if [ "$auth_trigger_compatible" != "t" ]; then
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 --single-transaction \
    < "$ROOT_DIR/apps/v3-api/supabase/migrations/20260821104500_tongji_v3_auth_domain_isolation.sql"
else
  echo "共享 Auth 触发器已兼容童迹应用隔离，跳过兼容迁移。"
fi

classroom_returning_rls_fixed="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -Atc \
  "select to_regprocedure('tongji_v3_private.can_read_classroom_row(uuid,uuid,tongji_v3.record_status)') is not null;")"

if [ "$classroom_returning_rls_fixed" != "t" ]; then
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 --single-transaction \
    < "$ROOT_DIR/apps/v3-api/supabase/migrations/20260821121751_fix_classroom_returning_rls.sql"
else
  echo "班级创建回读 RLS 已修复，跳过修复迁移。"
fi

research_activity_returning_rls_fixed="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -Atc \
  "select to_regprocedure('tongji_v3_private.can_read_research_activity_row(uuid,uuid)') is not null;")"

if [ "$research_activity_returning_rls_fixed" != "t" ]; then
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 --single-transaction \
    < "$ROOT_DIR/apps/v3-api/supabase/migrations/20260821122655_fix_research_activity_returning_rls.sql"
else
  echo "教研活动创建回读 RLS 已修复，跳过修复迁移。"
fi

archived_history_read_fixed="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -Atc \
  "select to_regprocedure('tongji_v3_private.has_class_read_access(uuid)') is not null;")"

if [ "$archived_history_read_fixed" != "t" ]; then
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 --single-transaction \
    < "$ROOT_DIR/apps/v3-api/supabase/migrations/20260824064422_preserve_archived_classroom_history.sql"
else
  echo "归档班级历史只读权限已修复，跳过修复迁移。"
fi

claim_reviews_ready="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -Atc \
  "select to_regclass('tongji_v3.analysis_claim_reviews') is not null and to_regprocedure('tongji_v3.finalize_analysis_review(uuid,text)') is not null;")"

if [ "$claim_reviews_ready" != "t" ]; then
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 --single-transaction \
    < "$ROOT_DIR/apps/v3-api/supabase/migrations/20260824072542_add_claim_reviews_and_semantic_evidence.sql"
else
  echo "逐条AI审核与终审数据结构已就绪，跳过升级迁移。"
fi

docker exec "$DB_CONTAINER" psql -U postgres -d postgres -Atc \
  "select table_schema || '.' || table_name from information_schema.tables where table_schema = 'tongji_v3' order by table_name;"
