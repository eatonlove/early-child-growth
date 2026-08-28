-- 园所级AI提示词覆盖。系统默认提示词保留在代码注册表中，表内只保存教研员自定义版本。
create table tongji_v3.ai_prompt_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  prompt_key text not null check (char_length(prompt_key) between 3 and 100),
  custom_prompt text not null check (char_length(custom_prompt) between 100 and 30000),
  base_prompt_version text not null check (char_length(base_prompt_version) between 3 and 160),
  revision integer not null default 1 check (revision > 0),
  change_note text not null default '' check (char_length(change_note) <= 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, prompt_key)
);

create index ai_prompt_configs_tenant_updated_idx
  on tongji_v3.ai_prompt_configs (tenant_id, updated_at desc);

create trigger ai_prompt_configs_touch
before update on tongji_v3.ai_prompt_configs
for each row execute function tongji_v3_private.touch_updated_at();

alter table tongji_v3.ai_prompt_configs enable row level security;

revoke all on table tongji_v3.ai_prompt_configs from anon, authenticated;
grant select, insert, update, delete on table tongji_v3.ai_prompt_configs to authenticated;
grant select, insert, update, delete on table tongji_v3.ai_prompt_configs to service_role;

create policy ai_prompt_configs_researcher_select
on tongji_v3.ai_prompt_configs for select to authenticated
using (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.is_researcher(tenant_id)
);

create policy ai_prompt_configs_researcher_insert
on tongji_v3.ai_prompt_configs for insert to authenticated
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.is_researcher(tenant_id)
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

create policy ai_prompt_configs_researcher_update
on tongji_v3.ai_prompt_configs for update to authenticated
using (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.is_researcher(tenant_id)
)
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.is_researcher(tenant_id)
  and updated_by = (select auth.uid())
);

create policy ai_prompt_configs_researcher_delete
on tongji_v3.ai_prompt_configs for delete to authenticated
using (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.is_researcher(tenant_id)
);

comment on table tongji_v3.ai_prompt_configs is
  '园所教研员维护的AI场景提示词覆盖；未配置时使用代码内系统默认提示词。';
comment on column tongji_v3.ai_prompt_configs.base_prompt_version is
  '创建该自定义版本时所基于的系统默认提示词版本，用于提示默认版本升级差异。';
