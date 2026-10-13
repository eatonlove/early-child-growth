alter table tongji_v3.curriculum_resource_packages
  add column category text check (category in ('life','creation','growth')),
  add column activity_origin text not null default '';

update tongji_v3.curriculum_resource_packages
set activity_origin = summary,
    category = case when title like '懂生活%' then 'life'
                    when title like '慧创生%' then 'creation'
                    when title like '悦生长%' then 'growth' else null end;

alter table tongji_v3.curriculum_resource_assets
  drop constraint curriculum_resource_assets_size_bytes_check,
  add constraint curriculum_resource_assets_size_bytes_check check (size_bytes between 1 and 524288000),
  add column extracted_text text,
  add column extraction_note text;

-- Only this application's private bucket changes; other applications keep their limits.
update storage.buckets set file_size_limit = 524288000 where id = 'tongji-v3-evidence';

create table tongji_v3.resource_category_analyses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete cascade,
  category text not null check (category in ('life','creation','growth')),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  result jsonb,
  source_package_ids uuid[] not null default '{}',
  source_fingerprint text not null,
  provider text,
  model text,
  prompt_version text,
  error_message text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index resource_category_analysis_running_unique
on tongji_v3.resource_category_analyses (tenant_id,category) where status in ('queued','processing');
alter table tongji_v3.resource_category_analyses enable row level security;
create policy resource_category_analyses_read on tongji_v3.resource_category_analyses
for select to authenticated using (tenant_id = tongji_v3_private.current_tenant_id());
grant select on tongji_v3.resource_category_analyses to authenticated;
grant all on tongji_v3.resource_category_analyses to service_role;
notify pgrst, 'reload schema';
