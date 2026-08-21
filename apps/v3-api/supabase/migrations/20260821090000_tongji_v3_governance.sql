create table tongji_v3.observation_quality_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  observation_id uuid not null references tongji_v3.observations(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  factuality smallint not null check (factuality between 1 and 5),
  specificity smallint not null check (specificity between 1 and 5),
  chronology smallint not null check (chronology between 1 and 5),
  evidence_alignment smallint not null check (evidence_alignment between 1 and 5),
  subjective_phrases jsonb not null default '[]'::jsonb,
  comment text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'passed', 'revision_requested')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (observation_id)
);

create table tongji_v3.export_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid references tongji_v3.classrooms(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  export_type text not null
    check (export_type in ('individual_report', 'classroom_report', 'curriculum_case', 'anonymized_research')),
  resource_type text not null check (char_length(resource_type) between 1 and 80),
  resource_id text not null check (char_length(resource_id) between 1 and 160),
  purpose text not null check (char_length(purpose) between 2 and 1000),
  recipient text not null check (char_length(recipient) between 2 and 300),
  anonymized boolean not null default true,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decision_note text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index export_requests_tenant_status_idx
  on tongji_v3.export_requests (tenant_id, status, created_at desc);

create table tongji_v3.research_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid references tongji_v3.classrooms(id) on delete restrict,
  observation_id uuid references tongji_v3.observations(id) on delete set null,
  title text not null check (char_length(title) between 2 and 160),
  scheduled_at timestamptz not null,
  facilitator_id uuid not null references auth.users(id) on delete restrict,
  shared_evidence_title text not null default '',
  focus_options jsonb not null default '[]'::jsonb,
  comparison_summary text not null default '',
  follow_up_questions jsonb not null default '[]'::jsonb,
  status text not null default 'preparing'
    check (status in ('preparing', 'in_progress', 'completed', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tongji_v3.research_activity_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  activity_id uuid not null references tongji_v3.research_activities(id) on delete cascade,
  group_name text not null check (char_length(group_name) between 1 and 60),
  objective_observation text not null check (char_length(objective_observation) between 10 and 6000),
  identification text not null check (char_length(identification) between 5 and 3000),
  response_strategy text not null check (char_length(response_strategy) between 5 and 3000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, created_by)
);

create or replace function tongji_v3_private.has_research_activity_access(target_activity uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from tongji_v3.research_activities a
    join tongji_v3.profiles p
      on p.user_id = (select auth.uid())
      and p.tenant_id = a.tenant_id
      and p.status = 'active'::tongji_v3.account_status
    where a.id = target_activity
      and (
        p.role = 'researcher'::tongji_v3.app_role
        or a.classroom_id is null
        or tongji_v3_private.has_class_access(a.classroom_id)
      )
  )
$$;

create or replace function tongji_v3_private.is_research_activity_open(target_activity uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from tongji_v3.research_activities a
    where a.id = target_activity
      and a.status = 'in_progress'
      and tongji_v3_private.has_research_activity_access(a.id)
  )
$$;

revoke all on function tongji_v3_private.has_research_activity_access(uuid) from public, anon;
revoke all on function tongji_v3_private.is_research_activity_open(uuid) from public, anon;
grant execute on function tongji_v3_private.has_research_activity_access(uuid) to authenticated, service_role;
grant execute on function tongji_v3_private.is_research_activity_open(uuid) to authenticated, service_role;

create trigger quality_reviews_touch before update on tongji_v3.observation_quality_reviews
for each row execute function tongji_v3_private.touch_updated_at();
create trigger export_requests_touch before update on tongji_v3.export_requests
for each row execute function tongji_v3_private.touch_updated_at();
create trigger research_activities_touch before update on tongji_v3.research_activities
for each row execute function tongji_v3_private.touch_updated_at();
create trigger research_entries_touch before update on tongji_v3.research_activity_entries
for each row execute function tongji_v3_private.touch_updated_at();

alter table tongji_v3.observation_quality_reviews enable row level security;
alter table tongji_v3.export_requests enable row level security;
alter table tongji_v3.research_activities enable row level security;
alter table tongji_v3.research_activity_entries enable row level security;

create policy quality_researcher_read on tongji_v3.observation_quality_reviews for select to authenticated
using (tongji_v3_private.is_researcher(tenant_id));
create policy quality_researcher_insert on tongji_v3.observation_quality_reviews for insert to authenticated
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and reviewer_id = (select auth.uid())
  and tongji_v3_private.is_researcher(tenant_id)
  and tongji_v3_private.has_observation_access(observation_id)
);
create policy quality_researcher_update on tongji_v3.observation_quality_reviews for update to authenticated
using (tongji_v3_private.is_researcher(tenant_id))
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and reviewer_id = (select auth.uid())
  and tongji_v3_private.is_researcher(tenant_id)
  and tongji_v3_private.has_observation_access(observation_id)
);

create policy export_read_allowed on tongji_v3.export_requests for select to authenticated
using (
  tenant_id = tongji_v3_private.current_tenant_id()
  and (requested_by = (select auth.uid()) or tongji_v3_private.is_researcher(tenant_id))
);
create policy export_create_allowed on tongji_v3.export_requests for insert to authenticated
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and requested_by = (select auth.uid())
  and (
    (classroom_id is not null and tongji_v3_private.has_class_access(classroom_id))
    or (classroom_id is null and tongji_v3_private.is_researcher(tenant_id))
  )
);
create policy export_researcher_update on tongji_v3.export_requests for update to authenticated
using (tongji_v3_private.is_researcher(tenant_id))
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.is_researcher(tenant_id)
  and status in ('approved', 'rejected')
  and decided_by = (select auth.uid())
  and decided_at is not null
  and (classroom_id is null or tongji_v3_private.has_class_access(classroom_id))
);

create policy research_activity_read_allowed on tongji_v3.research_activities for select to authenticated
using (tongji_v3_private.has_research_activity_access(id));
create policy research_activity_researcher_insert on tongji_v3.research_activities for insert to authenticated
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and facilitator_id = (select auth.uid())
  and created_by = (select auth.uid())
  and tongji_v3_private.is_researcher(tenant_id)
  and (classroom_id is null or tongji_v3_private.has_class_access(classroom_id))
);
create policy research_activity_researcher_update on tongji_v3.research_activities for update to authenticated
using (tongji_v3_private.is_researcher(tenant_id))
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.is_researcher(tenant_id)
  and (classroom_id is null or tongji_v3_private.has_class_access(classroom_id))
);

create policy research_entry_read_allowed on tongji_v3.research_activity_entries for select to authenticated
using (tongji_v3_private.has_research_activity_access(activity_id));
create policy research_entry_create_allowed on tongji_v3.research_activity_entries for insert to authenticated
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and created_by = (select auth.uid())
  and tongji_v3_private.is_research_activity_open(activity_id)
);
create policy research_entry_update_own on tongji_v3.research_activity_entries for update to authenticated
using (created_by = (select auth.uid()) and tongji_v3_private.is_research_activity_open(activity_id))
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and created_by = (select auth.uid())
  and tongji_v3_private.is_research_activity_open(activity_id)
);

grant select, insert, update on tongji_v3.observation_quality_reviews to authenticated;
grant select, insert, update on tongji_v3.export_requests to authenticated;
grant select, insert, update on tongji_v3.research_activities to authenticated;
grant select, insert, update on tongji_v3.research_activity_entries to authenticated;

grant all privileges on
  tongji_v3.observation_quality_reviews,
  tongji_v3.export_requests,
  tongji_v3.research_activities,
  tongji_v3.research_activity_entries
to service_role;

comment on table tongji_v3.observation_quality_reviews is '只审核教师白描的事实性、具体性、时序和证据匹配，不评价幼儿能力。';
comment on table tongji_v3.export_requests is '报告、课程案例和匿名研究数据离开系统前的用途与去标识审批。';
comment on table tongji_v3.research_activities is '围绕同一证据开展观察、识别、应答对照的教研活动。';
