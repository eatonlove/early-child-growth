-- Only aliases are persisted. Actual credentials remain in backend environment variables.
create table tongji_v3.ai_credential_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tongji_v3.tenants(id) on delete restrict,
  profile text not null check (profile in ('YT', 'YQY')),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_credential_configs_touch
before update on tongji_v3.ai_credential_configs
for each row execute function tongji_v3_private.touch_updated_at();

alter table tongji_v3.ai_credential_configs enable row level security;
revoke all on table tongji_v3.ai_credential_configs from public, anon, authenticated;
grant select, insert, update, delete on table tongji_v3.ai_credential_configs to service_role;

comment on table tongji_v3.ai_credential_configs is
  '园所统一AI密钥名称；仅后端教研员接口可读写，不存储密钥或授权头。';

notify pgrst, 'reload schema';
