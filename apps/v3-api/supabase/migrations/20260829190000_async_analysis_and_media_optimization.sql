alter table tongji_v3.evidence_assets
  add column original_size_bytes bigint,
  add column optimized_size_bytes bigint,
  add column optimization_status text not null default 'pending'
    check (optimization_status in ('pending', 'optimized', 'not_applicable', 'failed', 'legacy')),
  add column optimization_mode text,
  add column optimization_tool text,
  add column optimization_error text,
  add column optimized_at timestamptz;

update tongji_v3.evidence_assets
set original_size_bytes = size_bytes,
    optimized_size_bytes = size_bytes,
    optimization_status = case when upload_status = 'ready' then 'legacy' else 'pending' end,
    optimization_mode = case when upload_status = 'ready' then 'none' else null end
where original_size_bytes is null;

alter table tongji_v3.evidence_assets
  add constraint evidence_original_size_nonnegative check (original_size_bytes is null or original_size_bytes >= 0),
  add constraint evidence_optimized_size_nonnegative check (optimized_size_bytes is null or optimized_size_bytes >= 0);

create table tongji_v3.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  observation_id uuid not null references tongji_v3.observations(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  stage text not null default 'queued',
  progress smallint not null default 0 check (progress between 0 and 100),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  error_code text,
  error_message text,
  analysis_run_ids uuid[] not null default '{}',
  ai_notice text,
  requested_by uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz,
  completed_at timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index analysis_jobs_one_active_per_observation
  on tongji_v3.analysis_jobs (observation_id)
  where status in ('queued', 'processing');
create index analysis_jobs_queue_idx on tongji_v3.analysis_jobs (status, created_at);
create index analysis_jobs_observation_idx on tongji_v3.analysis_jobs (observation_id, created_at desc);

alter table tongji_v3.analysis_runs
  add column analysis_job_id uuid references tongji_v3.analysis_jobs(id) on delete set null;
create index analysis_runs_job_idx on tongji_v3.analysis_runs (analysis_job_id);

create trigger analysis_jobs_touch before update on tongji_v3.analysis_jobs
for each row execute function tongji_v3_private.touch_updated_at();

alter table tongji_v3.analysis_jobs enable row level security;
create policy analysis_jobs_read_class on tongji_v3.analysis_jobs for select to authenticated
using (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.has_class_read_access(classroom_id)
);

grant select on tongji_v3.analysis_jobs to authenticated;
grant all privileges on tongji_v3.analysis_jobs to service_role;

create or replace function tongji_v3.claim_next_analysis_job()
returns setof tongji_v3.analysis_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidate as (
    select job.id
    from tongji_v3.analysis_jobs job
    where job.status = 'queued'
    order by job.created_at
    for update skip locked
    limit 1
  )
  update tongji_v3.analysis_jobs job
  set status = 'processing',
      stage = 'preparing',
      progress = greatest(job.progress, 3),
      attempt_count = job.attempt_count + 1,
      started_at = coalesce(job.started_at, now()),
      heartbeat_at = now(),
      error_code = null,
      error_message = null
  from candidate
  where job.id = candidate.id
  returning job.*;
end;
$$;

revoke all on function tongji_v3.claim_next_analysis_job() from public, anon, authenticated;
grant execute on function tongji_v3.claim_next_analysis_job() to service_role;

comment on table tongji_v3.analysis_jobs is '浏览器可离开后继续执行的观察AI后台任务，记录真实进度和失败原因。';
comment on column tongji_v3.evidence_assets.optimization_mode is 'lossless表示图片无损重排或视频流复制重封装，不做有损重编码。';

notify pgrst, 'reload schema';
