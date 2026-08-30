-- One tenant-wide Qwen model selection shared by every AI scene.
create table tongji_v3.ai_model_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tongji_v3.tenants(id) on delete restrict,
  model_key text not null check (char_length(model_key) between 3 and 160),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_model_configs_tenant_updated_idx
  on tongji_v3.ai_model_configs (tenant_id, updated_at desc);

create trigger ai_model_configs_touch
before update on tongji_v3.ai_model_configs
for each row execute function tongji_v3_private.touch_updated_at();

alter table tongji_v3.ai_model_configs enable row level security;

revoke all on table tongji_v3.ai_model_configs from anon, authenticated;
grant select, insert, update on table tongji_v3.ai_model_configs to authenticated;
grant select, insert, update, delete on table tongji_v3.ai_model_configs to service_role;

create policy ai_model_configs_researcher_select
on tongji_v3.ai_model_configs for select to authenticated
using (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.is_researcher(tenant_id)
);

create policy ai_model_configs_researcher_insert
on tongji_v3.ai_model_configs for insert to authenticated
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.is_researcher(tenant_id)
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

create policy ai_model_configs_researcher_update
on tongji_v3.ai_model_configs for update to authenticated
using (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.is_researcher(tenant_id)
)
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.is_researcher(tenant_id)
  and updated_by = (select auth.uid())
);

comment on table tongji_v3.ai_model_configs is
  '园所级统一AI模型配置；所有AI场景共用，未配置时使用服务端环境默认模型。';

notify pgrst, 'reload schema';
