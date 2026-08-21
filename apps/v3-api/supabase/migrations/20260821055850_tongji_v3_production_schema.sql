create extension if not exists pgcrypto;

create schema tongji_v3;
create schema tongji_v3_private;

revoke all on schema tongji_v3 from public, anon;
revoke all on schema tongji_v3_private from public, anon, authenticated;
grant usage on schema tongji_v3 to authenticated, service_role;
grant usage on schema tongji_v3_private to authenticated, service_role;

create type tongji_v3.app_role as enum ('teacher', 'researcher');
create type tongji_v3.account_status as enum ('active', 'disabled');
create type tongji_v3.grade_band as enum ('small', 'middle', 'large');
create type tongji_v3.record_status as enum ('active', 'archived');
create type tongji_v3.observation_status as enum ('draft', 'submitted', 'ai_ready', 'adopted', 'abandoned', 'archived');
create type tongji_v3.ai_decision as enum ('pending', 'adopted', 'abandoned');

create table tongji_v3.tenants (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  status tongji_v3.record_status not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code)
);

create table tongji_v3.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  username text not null check (username ~ '^[a-zA-Z0-9._-]{3,40}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  role tongji_v3.app_role not null,
  status tongji_v3.account_status not null default 'active',
  disabled_at timestamptz,
  disabled_reason text,
  last_login_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_username_unique on tongji_v3.profiles (lower(username));
create index profiles_tenant_role_idx on tongji_v3.profiles (tenant_id, role, status);

create table tongji_v3.classrooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 60),
  grade tongji_v3.grade_band not null,
  academic_year text not null,
  semester text not null,
  status tongji_v3.record_status not null default 'active',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name, academic_year, semester)
);

create table tongji_v3.classroom_teachers (
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete cascade,
  user_id uuid not null references tongji_v3.profiles(user_id) on delete cascade,
  tenant_id uuid not null references tongji_v3.tenants(id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (classroom_id, user_id)
);

create index classroom_teachers_user_idx on tongji_v3.classroom_teachers (user_id, tenant_id);

create table tongji_v3.children (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  internal_code text not null,
  display_name text not null check (char_length(display_name) between 1 and 40),
  birth_month date not null,
  enrolled_on date,
  guardian_consent_status text not null default 'pending'
    check (guardian_consent_status in ('granted', 'partial', 'pending', 'withdrawn')),
  interests text[] not null default '{}',
  status tongji_v3.record_status not null default 'active',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, internal_code)
);

create index children_classroom_status_idx on tongji_v3.children (classroom_id, status);

create table tongji_v3.observation_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tongji_v3.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  grade tongji_v3.grade_band,
  scenes text[] not null default '{}',
  focus_options jsonb not null default '[]'::jsonb,
  fields jsonb not null default '[]'::jsonb,
  version integer not null default 1 check (version > 0),
  status tongji_v3.record_status not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, code, version)
);

create table tongji_v3.knowledge_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tongji_v3.tenants(id) on delete cascade,
  code text not null,
  source text not null,
  source_version text not null,
  domain text not null,
  subdomain text not null,
  goal_number integer not null,
  grade tongji_v3.grade_band,
  age_band text not null,
  title text not null,
  official_expectations jsonb not null default '[]'::jsonb,
  observable_behaviors jsonb not null default '[]'::jsonb,
  evidence_requirements jsonb not null default '[]'::jsonb,
  assessment_guidance jsonb not null default '[]'::jsonb,
  misunderstanding_warning text not null default '',
  response_strategies jsonb not null default '{}'::jsonb,
  next_observation_prompts jsonb not null default '[]'::jsonb,
  keywords text[] not null default '{}',
  version integer not null default 1 check (version > 0),
  status tongji_v3.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, code, version)
);

create index knowledge_retrieval_idx on tongji_v3.knowledge_cards (grade, domain, status);
create index knowledge_keywords_idx on tongji_v3.knowledge_cards using gin (keywords);

create table tongji_v3.observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  child_id uuid not null references tongji_v3.children(id) on delete restrict,
  template_id uuid references tongji_v3.observation_templates(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  occurred_at timestamptz not null,
  duration_minutes integer check (duration_minutes between 1 and 240),
  scene text not null,
  theme text not null,
  organization_stage text not null
    check (organization_stage in ('plan', 'introduction', 'process', 'sharing', 'evaluation')),
  observation_focus text[] not null default '{}',
  teacher_observation text not null,
  child_quote text,
  teacher_identification text not null,
  teacher_response jsonb not null,
  status tongji_v3.observation_status not null default 'draft',
  submitted_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index observations_class_time_idx on tongji_v3.observations (classroom_id, occurred_at desc);
create index observations_child_time_idx on tongji_v3.observations (child_id, occurred_at desc);
create index observations_status_idx on tongji_v3.observations (tenant_id, status, updated_at desc);

create table tongji_v3.evidence_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  child_id uuid not null references tongji_v3.children(id) on delete restrict,
  observation_id uuid not null references tongji_v3.observations(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('photo', 'video', 'work', 'document', 'quote')),
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  transcript text,
  event_segments jsonb not null default '[]'::jsonb,
  upload_status text not null default 'pending' check (upload_status in ('pending', 'ready', 'failed')),
  retention_until date,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index evidence_observation_idx on tongji_v3.evidence_assets (observation_id, created_at);

create table tongji_v3.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  child_id uuid not null references tongji_v3.children(id) on delete restrict,
  observation_id uuid not null references tongji_v3.observations(id) on delete cascade,
  provider text not null,
  model text not null,
  prompt_version text not null,
  knowledge_version text not null,
  input_snapshot jsonb not null,
  knowledge_card_ids uuid[] not null default '{}',
  structured_result jsonb not null,
  risk_flags text[] not null default '{}',
  decision tongji_v3.ai_decision not null default 'pending',
  decision_note text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index analysis_observation_idx on tongji_v3.analysis_runs (observation_id, generated_at desc);

create table tongji_v3.support_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  child_id uuid not null references tongji_v3.children(id) on delete restrict,
  observation_id uuid not null references tongji_v3.observations(id) on delete cascade,
  analysis_run_id uuid references tongji_v3.analysis_runs(id) on delete set null,
  category text not null check (category in ('experience', 'material', 'activity')),
  rationale text not null,
  strategy text not null,
  next_observation_focus text not null,
  planned_for date,
  implemented_at timestamptz,
  child_response text,
  effectiveness text check (effectiveness in ('supported', 'insufficient', 'continue')),
  status text not null default 'planned'
    check (status in ('planned', 'implemented', 'follow_up', 'verified', 'closed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tongji_v3.period_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  child_id uuid references tongji_v3.children(id) on delete restrict,
  report_type text not null check (report_type in ('teacher', 'guardian', 'classroom')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  content jsonb not null,
  evidence_observation_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'published', 'withdrawn')),
  created_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tongji_v3.curriculum_clues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  title text not null,
  theme text not null,
  origin text not null,
  inquiry_questions jsonb not null default '[]'::jsonb,
  plan jsonb not null default '{}'::jsonb,
  child_ids uuid[] not null default '{}',
  evidence_observation_ids uuid[] not null default '{}',
  time_point_count integer not null default 0,
  threshold_met boolean not null default false,
  status text not null default 'clue' check (status in ('clue', 'draft', 'reviewed', 'active', 'reflected', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tongji_v3.audit_events (
  id bigint generated always as identity primary key,
  tenant_id uuid references tongji_v3.tenants(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role tongji_v3.app_role,
  action text not null,
  resource_type text not null,
  resource_id text,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_tenant_time_idx on tongji_v3.audit_events (tenant_id, occurred_at desc);

create or replace function tongji_v3_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function tongji_v3_private.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.tenant_id
  from tongji_v3.profiles p
  where p.user_id = (select auth.uid())
    and p.status = 'active'::tongji_v3.account_status
  limit 1
$$;

create or replace function tongji_v3_private.is_researcher(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from tongji_v3.profiles p
    where p.user_id = (select auth.uid())
      and p.tenant_id = target_tenant
      and p.role = 'researcher'::tongji_v3.app_role
      and p.status = 'active'::tongji_v3.account_status
  )
$$;

create or replace function tongji_v3_private.has_class_access(target_classroom uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from tongji_v3.classrooms c
    join tongji_v3.profiles p on p.user_id = (select auth.uid()) and p.tenant_id = c.tenant_id
    where c.id = target_classroom
      and c.status = 'active'::tongji_v3.record_status
      and p.status = 'active'::tongji_v3.account_status
      and (
        p.role = 'researcher'::tongji_v3.app_role
        or exists (
          select 1 from tongji_v3.classroom_teachers ct
          where ct.classroom_id = c.id and ct.user_id = p.user_id
        )
      )
  )
$$;

create or replace function tongji_v3_private.has_observation_access(target_observation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from tongji_v3.observations o
    where o.id = target_observation
      and tongji_v3_private.has_class_access(o.classroom_id)
  )
$$;

create or replace function tongji_v3_private.can_access_storage_object(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folders text[];
  class_uuid uuid;
  tenant_uuid uuid;
begin
  folders := storage.foldername(object_name);
  if cardinality(folders) < 2 then return false; end if;
  begin
    tenant_uuid := folders[1]::uuid;
    class_uuid := folders[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return tenant_uuid = tongji_v3_private.current_tenant_id()
    and tongji_v3_private.has_class_access(class_uuid);
end;
$$;

revoke all on all functions in schema tongji_v3_private from public, anon;
grant execute on all functions in schema tongji_v3_private to authenticated, service_role;

create trigger tenants_touch before update on tongji_v3.tenants for each row execute function tongji_v3_private.touch_updated_at();
create trigger profiles_touch before update on tongji_v3.profiles for each row execute function tongji_v3_private.touch_updated_at();
create trigger classrooms_touch before update on tongji_v3.classrooms for each row execute function tongji_v3_private.touch_updated_at();
create trigger children_touch before update on tongji_v3.children for each row execute function tongji_v3_private.touch_updated_at();
create trigger templates_touch before update on tongji_v3.observation_templates for each row execute function tongji_v3_private.touch_updated_at();
create trigger knowledge_touch before update on tongji_v3.knowledge_cards for each row execute function tongji_v3_private.touch_updated_at();
create trigger observations_touch before update on tongji_v3.observations for each row execute function tongji_v3_private.touch_updated_at();
create trigger evidence_touch before update on tongji_v3.evidence_assets for each row execute function tongji_v3_private.touch_updated_at();
create trigger analysis_touch before update on tongji_v3.analysis_runs for each row execute function tongji_v3_private.touch_updated_at();
create trigger support_touch before update on tongji_v3.support_actions for each row execute function tongji_v3_private.touch_updated_at();
create trigger reports_touch before update on tongji_v3.period_reports for each row execute function tongji_v3_private.touch_updated_at();
create trigger curriculum_touch before update on tongji_v3.curriculum_clues for each row execute function tongji_v3_private.touch_updated_at();

alter table tongji_v3.tenants enable row level security;
alter table tongji_v3.profiles enable row level security;
alter table tongji_v3.classrooms enable row level security;
alter table tongji_v3.classroom_teachers enable row level security;
alter table tongji_v3.children enable row level security;
alter table tongji_v3.observation_templates enable row level security;
alter table tongji_v3.knowledge_cards enable row level security;
alter table tongji_v3.observations enable row level security;
alter table tongji_v3.evidence_assets enable row level security;
alter table tongji_v3.analysis_runs enable row level security;
alter table tongji_v3.support_actions enable row level security;
alter table tongji_v3.period_reports enable row level security;
alter table tongji_v3.curriculum_clues enable row level security;
alter table tongji_v3.audit_events enable row level security;

create policy tenants_read_own on tongji_v3.tenants for select to authenticated
using (id = tongji_v3_private.current_tenant_id());

create policy profiles_read_self on tongji_v3.profiles for select to authenticated
using (user_id = (select auth.uid()) and status = 'active');

create policy classrooms_read_assigned on tongji_v3.classrooms for select to authenticated
using (tongji_v3_private.has_class_access(id));
create policy classrooms_researcher_insert on tongji_v3.classrooms for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.is_researcher(tenant_id));
create policy classrooms_researcher_update on tongji_v3.classrooms for update to authenticated
using (tongji_v3_private.is_researcher(tenant_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.is_researcher(tenant_id));

create policy classroom_teachers_read on tongji_v3.classroom_teachers for select to authenticated
using (user_id = (select auth.uid()) or tongji_v3_private.is_researcher(tenant_id));
create policy classroom_teachers_researcher_insert on tongji_v3.classroom_teachers for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.is_researcher(tenant_id));
create policy classroom_teachers_researcher_delete on tongji_v3.classroom_teachers for delete to authenticated
using (tongji_v3_private.is_researcher(tenant_id));

create policy children_read_class on tongji_v3.children for select to authenticated
using (tongji_v3_private.has_class_access(classroom_id));
create policy children_create_class on tongji_v3.children for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_class_access(classroom_id));
create policy children_update_class on tongji_v3.children for update to authenticated
using (tongji_v3_private.has_class_access(classroom_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_class_access(classroom_id));

create policy templates_read on tongji_v3.observation_templates for select to authenticated
using (tenant_id is null or tenant_id = tongji_v3_private.current_tenant_id());
create policy templates_researcher_insert on tongji_v3.observation_templates for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.is_researcher(tenant_id));
create policy templates_researcher_update on tongji_v3.observation_templates for update to authenticated
using (tenant_id is not null and tongji_v3_private.is_researcher(tenant_id))
with check (tenant_id = tongji_v3_private.current_tenant_id());

create policy knowledge_read on tongji_v3.knowledge_cards for select to authenticated
using (tenant_id is null or tenant_id = tongji_v3_private.current_tenant_id());
create policy knowledge_researcher_insert on tongji_v3.knowledge_cards for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.is_researcher(tenant_id));
create policy knowledge_researcher_update on tongji_v3.knowledge_cards for update to authenticated
using (tenant_id is not null and tongji_v3_private.is_researcher(tenant_id))
with check (tenant_id = tongji_v3_private.current_tenant_id());

create policy observations_read_class on tongji_v3.observations for select to authenticated
using (tongji_v3_private.has_class_access(classroom_id));
create policy observations_create_class on tongji_v3.observations for insert to authenticated
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and created_by = (select auth.uid())
  and tongji_v3_private.has_class_access(classroom_id)
  and exists (
    select 1 from tongji_v3.children c
    where c.id = child_id and c.classroom_id = observations.classroom_id and c.tenant_id = observations.tenant_id
  )
);
create policy observations_update_class on tongji_v3.observations for update to authenticated
using (tongji_v3_private.has_class_access(classroom_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_class_access(classroom_id));

create policy evidence_read_class on tongji_v3.evidence_assets for select to authenticated
using (tongji_v3_private.has_observation_access(observation_id));
create policy evidence_create_class on tongji_v3.evidence_assets for insert to authenticated
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and created_by = (select auth.uid())
  and tongji_v3_private.has_observation_access(observation_id)
);
create policy evidence_update_class on tongji_v3.evidence_assets for update to authenticated
using (tongji_v3_private.has_observation_access(observation_id))
with check (tenant_id = tongji_v3_private.current_tenant_id());
create policy evidence_delete_class on tongji_v3.evidence_assets for delete to authenticated
using (tongji_v3_private.has_observation_access(observation_id));

create policy analysis_read_class on tongji_v3.analysis_runs for select to authenticated
using (tongji_v3_private.has_observation_access(observation_id));
create policy analysis_decide_class on tongji_v3.analysis_runs for update to authenticated
using (tongji_v3_private.has_observation_access(observation_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_observation_access(observation_id));

create policy support_read_class on tongji_v3.support_actions for select to authenticated
using (tongji_v3_private.has_class_access(classroom_id));
create policy support_create_class on tongji_v3.support_actions for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and created_by = (select auth.uid()) and tongji_v3_private.has_class_access(classroom_id));
create policy support_update_class on tongji_v3.support_actions for update to authenticated
using (tongji_v3_private.has_class_access(classroom_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_class_access(classroom_id));

create policy reports_read_class on tongji_v3.period_reports for select to authenticated
using (tongji_v3_private.has_class_access(classroom_id));
create policy reports_create_class on tongji_v3.period_reports for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and created_by = (select auth.uid()) and tongji_v3_private.has_class_access(classroom_id));
create policy reports_update_class on tongji_v3.period_reports for update to authenticated
using (tongji_v3_private.has_class_access(classroom_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_class_access(classroom_id));

create policy curriculum_read_class on tongji_v3.curriculum_clues for select to authenticated
using (tongji_v3_private.has_class_access(classroom_id));
create policy curriculum_create_class on tongji_v3.curriculum_clues for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and created_by = (select auth.uid()) and tongji_v3_private.has_class_access(classroom_id));
create policy curriculum_update_class on tongji_v3.curriculum_clues for update to authenticated
using (tongji_v3_private.has_class_access(classroom_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_class_access(classroom_id));

create policy audits_researcher_read on tongji_v3.audit_events for select to authenticated
using (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.is_researcher(tenant_id));

create or replace function tongji_v3.decide_analysis(
  target_analysis_id uuid,
  target_decision tongji_v3.ai_decision,
  target_note text default null
)
returns tongji_v3.analysis_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_run tongji_v3.analysis_runs;
  source_observation tongji_v3.observations;
  suggested_strategy text;
begin
  if target_decision not in ('adopted'::tongji_v3.ai_decision, 'abandoned'::tongji_v3.ai_decision) then
    raise exception 'decision must be adopted or abandoned' using errcode = '22023';
  end if;

  select * into selected_run
  from tongji_v3.analysis_runs
  where id = target_analysis_id
  for update;

  if selected_run.id is null then raise exception 'analysis not found' using errcode = 'P0002'; end if;
  if selected_run.tenant_id <> tongji_v3_private.current_tenant_id()
    or not tongji_v3_private.has_observation_access(selected_run.observation_id) then
    raise exception 'analysis access denied' using errcode = '42501';
  end if;
  if selected_run.decision <> 'pending'::tongji_v3.ai_decision then
    raise exception 'analysis has already been decided' using errcode = '23505';
  end if;

  update tongji_v3.analysis_runs
  set decision = target_decision,
      decision_note = nullif(trim(target_note), ''),
      decided_by = (select auth.uid()),
      decided_at = now()
  where id = target_analysis_id
  returning * into selected_run;

  update tongji_v3.observations
  set status = case when target_decision = 'adopted'::tongji_v3.ai_decision
    then 'adopted'::tongji_v3.observation_status
    else 'abandoned'::tongji_v3.observation_status end
  where id = selected_run.observation_id
  returning * into source_observation;

  if target_decision = 'adopted'::tongji_v3.ai_decision then
    suggested_strategy := selected_run.structured_result #>> '{responseSuggestions,experience,0}';
    if suggested_strategy is not null then
      insert into tongji_v3.support_actions (
        tenant_id, classroom_id, child_id, observation_id, analysis_run_id,
        category, rationale, strategy, next_observation_focus, created_by
      ) values (
        selected_run.tenant_id,
        selected_run.classroom_id,
        selected_run.child_id,
        selected_run.observation_id,
        selected_run.id,
        'experience',
        '教师已明确采用本次AI建议稿；该行动仍需实施与复察验证。',
        suggested_strategy,
        coalesce(selected_run.structured_result #>> '{nextObservation,0}', source_observation.teacher_response ->> 'nextObservationFocus', '继续观察支持后的行为变化'),
        (select auth.uid())
      );
    end if;
  end if;

  return selected_run;
end;
$$;

grant select on tongji_v3.tenants, tongji_v3.profiles to authenticated;
grant select, insert, update on tongji_v3.classrooms, tongji_v3.children to authenticated;
grant select, insert, delete on tongji_v3.classroom_teachers to authenticated;
grant select, insert, update on tongji_v3.observation_templates, tongji_v3.knowledge_cards to authenticated;
grant select, insert on tongji_v3.observations to authenticated;
grant select, insert on tongji_v3.evidence_assets to authenticated;
grant select on tongji_v3.analysis_runs to authenticated;
grant select, insert, update on tongji_v3.support_actions, tongji_v3.period_reports, tongji_v3.curriculum_clues to authenticated;
grant select on tongji_v3.audit_events to authenticated;
revoke all on function tongji_v3.decide_analysis(uuid, tongji_v3.ai_decision, text) from public, anon;
grant execute on function tongji_v3.decide_analysis(uuid, tongji_v3.ai_decision, text) to authenticated;
grant all privileges on all tables in schema tongji_v3 to service_role;
grant usage, select on all sequences in schema tongji_v3 to service_role;

alter default privileges for role postgres in schema tongji_v3 revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema tongji_v3 grant all on tables to service_role;
alter default privileges for role postgres in schema tongji_v3 grant usage, select on sequences to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tongji-v3-evidence',
  'tongji-v3-evidence',
  false,
  104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy tongji_v3_storage_read on storage.objects for select to authenticated
using (bucket_id = 'tongji-v3-evidence' and tongji_v3_private.can_access_storage_object(name));
create policy tongji_v3_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'tongji-v3-evidence' and tongji_v3_private.can_access_storage_object(name));
create policy tongji_v3_storage_update on storage.objects for update to authenticated
using (bucket_id = 'tongji-v3-evidence' and tongji_v3_private.can_access_storage_object(name))
with check (bucket_id = 'tongji-v3-evidence' and tongji_v3_private.can_access_storage_object(name));
create policy tongji_v3_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'tongji-v3-evidence' and tongji_v3_private.can_access_storage_object(name));

comment on schema tongji_v3 is '童迹3.0独立业务schema；不得存放其他应用对象。';
comment on table tongji_v3.analysis_runs is 'AI结构化建议稿；只有教师明确采用后才可进入后续成长与应答流程。';
comment on column tongji_v3.observations.teacher_observation is '教师客观白描，作为AI不可覆盖的事实输入。';
comment on column tongji_v3.observations.teacher_identification is '教师基于证据形成的初步专业识别。';
comment on column tongji_v3.observations.teacher_response is '教师拟定的经验、材料或活动支持及下一次观察重点。';
