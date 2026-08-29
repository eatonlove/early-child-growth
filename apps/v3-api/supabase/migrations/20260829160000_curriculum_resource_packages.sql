-- 同迹：园本游戏课程资源包。仅资源包需要教研审核，不恢复观察或导出审批。

create table tongji_v3.curriculum_resource_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  summary text not null check (char_length(summary) between 2 and 3000),
  applicable_grades text[] not null default '{}',
  themes text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'active', 'rejected', 'disabled')),
  review_comment text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tongji_v3.curriculum_resource_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete cascade,
  package_id uuid not null references tongji_v3.curriculum_resource_packages(id) on delete cascade,
  asset_type text not null check (asset_type in ('plan', 'materials', 'booklet', 'supplement')),
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 31457280),
  storage_path text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index curriculum_resource_required_asset_unique
  on tongji_v3.curriculum_resource_assets (package_id, asset_type)
  where asset_type in ('plan', 'materials', 'booklet');
create index curriculum_resource_packages_status_idx
  on tongji_v3.curriculum_resource_packages (tenant_id, status, created_at desc);
create index curriculum_resource_assets_package_idx
  on tongji_v3.curriculum_resource_assets (package_id, created_at);

create trigger curriculum_resource_packages_touch before update on tongji_v3.curriculum_resource_packages
for each row execute function tongji_v3_private.touch_updated_at();

alter table tongji_v3.curriculum_resource_packages enable row level security;
alter table tongji_v3.curriculum_resource_assets enable row level security;

create policy curriculum_resource_packages_read on tongji_v3.curriculum_resource_packages for select to authenticated
using (
  tenant_id = tongji_v3_private.current_tenant_id()
  and (status = 'active' or created_by = (select auth.uid()) or tongji_v3_private.is_researcher(tenant_id))
);
create policy curriculum_resource_packages_insert on tongji_v3.curriculum_resource_packages for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and created_by = (select auth.uid()));
create policy curriculum_resource_packages_update on tongji_v3.curriculum_resource_packages for update to authenticated
using (
  tenant_id = tongji_v3_private.current_tenant_id()
  and ((created_by = (select auth.uid()) and status in ('draft', 'rejected')) or tongji_v3_private.is_researcher(tenant_id))
)
with check (tenant_id = tongji_v3_private.current_tenant_id());

create policy curriculum_resource_assets_read on tongji_v3.curriculum_resource_assets for select to authenticated
using (
  tenant_id = tongji_v3_private.current_tenant_id()
  and exists (
    select 1 from tongji_v3.curriculum_resource_packages package
    where package.id = package_id
      and package.tenant_id = tenant_id
      and (package.status = 'active' or package.created_by = (select auth.uid()) or tongji_v3_private.is_researcher(package.tenant_id))
  )
);
create policy curriculum_resource_assets_insert on tongji_v3.curriculum_resource_assets for insert to authenticated
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and created_by = (select auth.uid())
  and exists (
    select 1 from tongji_v3.curriculum_resource_packages package
    where package.id = package_id and package.tenant_id = tenant_id
      and package.created_by = (select auth.uid()) and package.status in ('draft', 'rejected')
  )
);
create policy curriculum_resource_assets_delete on tongji_v3.curriculum_resource_assets for delete to authenticated
using (
  tenant_id = tongji_v3_private.current_tenant_id()
  and exists (
    select 1 from tongji_v3.curriculum_resource_packages package
    where package.id = package_id and package.tenant_id = tenant_id
      and package.created_by = (select auth.uid()) and package.status in ('draft', 'rejected')
  )
);

grant select, insert, update on tongji_v3.curriculum_resource_packages to authenticated;
grant select, insert, delete on tongji_v3.curriculum_resource_assets to authenticated;
grant all privileges on tongji_v3.curriculum_resource_packages, tongji_v3.curriculum_resource_assets to service_role;

comment on table tongji_v3.curriculum_resource_packages is '教师提交、教研员审核的园本游戏课程资源包；通过后可进入AI园本参考。';
comment on table tongji_v3.curriculum_resource_assets is '资源包文件目录：课程计划、课程材料、课程手册和补充资料。';

-- Supabase/PostgREST may remain running while migrations are applied.
notify pgrst, 'reload schema';
