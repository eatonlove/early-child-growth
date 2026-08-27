-- 同迹 3.2：多幼儿观察、文档导入、分组审核、组合应答、园本课程循环和可控记忆。
-- 迁移采用新增与回填策略，保留旧字段供现有报告和历史结果兼容读取。

alter table tongji_v3.observations
  add column if not exists source_type text not null default 'web'
    check (source_type in ('web', 'document_import')),
  add column if not exists observer_ids uuid[] not null default '{}',
  add column if not exists group_context text,
  add column if not exists unlisted_participant_count integer not null default 0
    check (unlisted_participant_count between 0 and 99);

update tongji_v3.observations
set observer_ids = array[created_by]
where cardinality(observer_ids) = 0;

create table tongji_v3.observation_subjects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  observation_id uuid not null references tongji_v3.observations(id) on delete cascade,
  child_id uuid not null references tongji_v3.children(id) on delete restrict,
  role text not null default 'participant'
    check (role in ('primary', 'participant', 'incidental')),
  contextual_feature text,
  evidence_anchors text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (observation_id, child_id)
);

create unique index observation_subjects_primary_idx
  on tongji_v3.observation_subjects (observation_id)
  where role = 'primary';
create index observation_subjects_child_time_idx
  on tongji_v3.observation_subjects (child_id, created_at desc);

insert into tongji_v3.observation_subjects (
  tenant_id, classroom_id, observation_id, child_id, role, created_by, created_at, updated_at
)
select tenant_id, classroom_id, id, child_id, 'primary', created_by, created_at, updated_at
from tongji_v3.observations
on conflict (observation_id, child_id) do nothing;

create table tongji_v3.observation_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  observation_id uuid references tongji_v3.observations(id) on delete set null,
  source_file_name text not null,
  source_mime_type text not null,
  source_size_bytes bigint not null check (source_size_bytes between 1 and 10485760),
  storage_path text,
  extraction_provider text,
  extraction_model text,
  extraction_version text,
  extracted_fields jsonb not null default '{}'::jsonb,
  field_confidence jsonb not null default '{}'::jsonb,
  teacher_confirmed_fields jsonb,
  matched_child_ids uuid[] not null default '{}',
  status text not null default 'pending_upload'
    check (status in ('pending_upload', 'extracting', 'needs_review', 'confirmed', 'failed')),
  failure_reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index observation_imports_class_time_idx
  on tongji_v3.observation_imports (classroom_id, created_at desc);

alter table tongji_v3.observations
  add column if not exists source_import_id uuid
    references tongji_v3.observation_imports(id) on delete set null;

alter table tongji_v3.analysis_claim_reviews
  drop constraint if exists analysis_claim_reviews_claim_type_check;
alter table tongji_v3.analysis_claim_reviews
  add constraint analysis_claim_reviews_claim_type_check check (claim_type in (
    'objective_summary', 'fact', 'interpretation', 'hypothesis',
    'current_experience', 'interest_strength', 'evidence_gap',
    'development_reference', 'response_suggestion', 'next_observation',
    'historical_change', 'game_experience', 'domain_experience',
    'learning_disposition', 'learning_possibility', 'game_possibility',
    'response_plan', 'observation_cut', 'observation_focus'
  ));

create table tongji_v3.analysis_feedback_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  child_id uuid not null references tongji_v3.children(id) on delete restrict,
  observation_id uuid not null references tongji_v3.observations(id) on delete cascade,
  analysis_run_id uuid not null references tongji_v3.analysis_runs(id) on delete cascade,
  version integer not null check (version > 0),
  teacher_feedback jsonb not null,
  revised_result jsonb not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (analysis_run_id, version)
);

create table tongji_v3.response_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  child_id uuid not null references tongji_v3.children(id) on delete restrict,
  observation_id uuid not null references tongji_v3.observations(id) on delete cascade,
  analysis_run_id uuid references tongji_v3.analysis_runs(id) on delete set null,
  title text not null,
  rationale text not null,
  target_experience jsonb not null default '[]'::jsonb,
  activity_support jsonb not null,
  material_support jsonb not null,
  experience_support jsonb not null,
  observation_cut text not null,
  observation_focus jsonb not null default '[]'::jsonb,
  adjustment_condition text not null,
  source_plan_keys text[] not null default '{}',
  status text not null default 'suggested'
    check (status in ('suggested', 'selected', 'planned', 'implemented', 'follow_up', 'verified', 'closed', 'rejected')),
  selected_by uuid references auth.users(id) on delete set null,
  selected_at timestamptz,
  planned_for date,
  implemented_at timestamptz,
  child_response text,
  effectiveness text check (effectiveness in ('supported', 'insufficient', 'continue')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index response_plans_child_status_idx
  on tongji_v3.response_plans (child_id, status, created_at desc);

alter table tongji_v3.support_actions
  add column if not exists response_plan_id uuid
    references tongji_v3.response_plans(id) on delete set null,
  add column if not exists details jsonb not null default '{}'::jsonb;

create table tongji_v3.curriculum_template_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  version integer not null check (version > 0),
  description text not null,
  structure jsonb not null,
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code, version)
);

create unique index curriculum_template_default_idx
  on tongji_v3.curriculum_template_versions (tenant_id)
  where is_default and status = 'active';

create table tongji_v3.analysis_framework_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete cascade,
  framework_type text not null check (framework_type in ('game_experience', 'learning_disposition')),
  code text not null,
  name text not null,
  version integer not null check (version > 0),
  description text not null,
  dimensions jsonb not null check (jsonb_typeof(dimensions) = 'array'),
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code, version)
);

create unique index analysis_framework_default_idx
  on tongji_v3.analysis_framework_versions (tenant_id, framework_type)
  where is_default and status = 'active';

create table tongji_v3.curriculum_activity_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  curriculum_clue_id uuid not null references tongji_v3.curriculum_clues(id) on delete cascade,
  title text not null,
  value_point text not null,
  evidence_observation_ids uuid[] not null default '{}',
  core_question text not null,
  social_nature_self jsonb not null,
  development_links jsonb not null default '[]'::jsonb,
  main_activities jsonb not null default '[]'::jsonb,
  materials jsonb not null default '[]'::jsonb,
  teacher_support jsonb not null default '[]'::jsonb,
  observation_focus jsonb not null default '[]'::jsonb,
  risk_note text not null,
  status text not null default 'suggested'
    check (status in ('suggested', 'selected', 'rejected')),
  selected_by uuid references auth.users(id) on delete set null,
  selected_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index curriculum_options_clue_idx
  on tongji_v3.curriculum_activity_options (curriculum_clue_id, status, created_at);

create table tongji_v3.curriculum_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  curriculum_clue_id uuid not null references tongji_v3.curriculum_clues(id) on delete cascade,
  template_version_id uuid not null references tongji_v3.curriculum_template_versions(id) on delete restrict,
  title text not null,
  implementation_period text not null,
  core_inquiry_clue text not null,
  content jsonb not null,
  evidence_observation_ids uuid[] not null default '{}',
  selected_option_ids uuid[] not null default '{}',
  version integer not null default 1 check (version > 0),
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'active', 'reflected', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (curriculum_clue_id, version)
);

create table tongji_v3.curriculum_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  curriculum_plan_id uuid not null references tongji_v3.curriculum_plans(id) on delete cascade,
  cycle_number integer not null check (cycle_number > 0),
  zone text not null check (zone in ('starting', 'focusing', 'inquiring', 'resolving')),
  seven_steps jsonb not null,
  teacher_support jsonb not null default '[]'::jsonb,
  child_activities jsonb not null default '[]'::jsonb,
  environment_materials jsonb not null default '[]'::jsonb,
  generated_experience jsonb not null default '[]'::jsonb,
  new_questions jsonb not null default '[]'::jsonb,
  evidence_observation_ids uuid[] not null default '{}',
  reflection text,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (curriculum_plan_id, cycle_number)
);

create table tongji_v3.professional_memories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete cascade,
  memory_type text not null
    check (memory_type in ('teacher_feedback', 'response_effect', 'approved_case', 'curriculum_reflection', 'school_knowledge')),
  source_resource_type text not null,
  source_resource_id text not null,
  title text not null,
  summary text not null,
  retrieval_text text not null,
  applicability jsonb not null default '{}'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  quality_score numeric(4,3) not null default 0.5 check (quality_score between 0 and 1),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, memory_type, source_resource_type, source_resource_id)
);

create index professional_memories_retrieval_idx
  on tongji_v3.professional_memories (tenant_id, memory_type, status, quality_score desc);

create unique index support_actions_response_plan_category_unique
  on tongji_v3.support_actions (response_plan_id, category)
  where response_plan_id is not null;

create table tongji_v3.document_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  export_request_id uuid references tongji_v3.export_requests(id) on delete set null,
  document_type text not null
    check (document_type in ('observation_teacher', 'observation_professional', 'curriculum_plan')),
  resource_type text not null,
  resource_id text not null,
  template_version text not null,
  content_snapshot jsonb not null,
  storage_path text,
  file_name text,
  mime_type text not null default 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  status text not null default 'preview' check (status in ('preview', 'pending_approval', 'ready', 'expired', 'failed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tongji_v3.export_requests
  drop constraint if exists export_requests_export_type_check;
alter table tongji_v3.export_requests
  add constraint export_requests_export_type_check check (export_type in (
    'individual_report', 'classroom_report', 'curriculum_case', 'anonymized_research',
    'observation_record', 'curriculum_plan'
  ));

-- 3.2终审只确认专业结论。应答任务在教师选定一套完整response_plan后创建，
-- 不再沿用旧版“采用一条建议即自动生成行动”的行为。
-- 群体观察的总状态按每名幼儿最新分析版本计算，避免一名幼儿完成终审后
-- 其他幼儿的待审核分析被误当成正式证据。
create or replace function tongji_v3_private.finalize_analysis_review(
  target_analysis_id uuid,
  target_note text default null
)
returns tongji_v3.analysis_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_run tongji_v3.analysis_runs;
  accepted_count integer;
  pending_claim_count integer;
  latest_pending_count integer;
  latest_adopted_count integer;
begin
  select * into selected_run
  from tongji_v3.analysis_runs
  where id = target_analysis_id
  for update;

  if selected_run.id is null then
    raise exception 'analysis not found' using errcode = 'P0002';
  end if;
  if selected_run.tenant_id <> tongji_v3_private.current_tenant_id()
    or not tongji_v3_private.has_observation_access(selected_run.observation_id) then
    raise exception 'analysis access denied' using errcode = '42501';
  end if;
  if selected_run.decision <> 'pending'::tongji_v3.ai_decision then
    raise exception 'analysis has already been decided' using errcode = '23505';
  end if;

  select
    count(*) filter (where decision = 'pending'),
    count(*) filter (where decision in ('adopted', 'modified'))
  into pending_claim_count, accepted_count
  from tongji_v3.analysis_claim_reviews
  where analysis_run_id = target_analysis_id;

  if pending_claim_count > 0 or not exists (
    select 1 from tongji_v3.analysis_claim_reviews where analysis_run_id = target_analysis_id
  ) then
    raise exception 'all claims must be reviewed' using errcode = '23514';
  end if;

  update tongji_v3.analysis_runs
  set decision = case when accepted_count > 0
        then 'adopted'::tongji_v3.ai_decision
        else 'abandoned'::tongji_v3.ai_decision end,
      decision_note = nullif(trim(target_note), ''),
      decided_by = (select auth.uid()),
      decided_at = now()
  where id = target_analysis_id
  returning * into selected_run;

  select
    count(*) filter (where decision = 'pending'::tongji_v3.ai_decision),
    count(*) filter (where decision = 'adopted'::tongji_v3.ai_decision)
  into latest_pending_count, latest_adopted_count
  from (
    select distinct on (child_id) child_id, decision
    from tongji_v3.analysis_runs
    where observation_id = selected_run.observation_id
    order by child_id, generated_at desc, id desc
  ) latest_runs;

  update tongji_v3.observations
  set status = case
    when latest_pending_count > 0 then 'ai_ready'::tongji_v3.observation_status
    when latest_adopted_count > 0 then 'adopted'::tongji_v3.observation_status
    else 'abandoned'::tongji_v3.observation_status
  end
  where id = selected_run.observation_id;

  return selected_run;
end;
$$;

create or replace function tongji_v3_private.select_response_plan(target_plan_id uuid)
returns tongji_v3.response_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_plan tongji_v3.response_plans;
  analysis_decision tongji_v3.ai_decision;
begin
  select * into selected_plan
  from tongji_v3.response_plans
  where id = target_plan_id
  for update;

  if selected_plan.id is null then
    raise exception 'response plan not found' using errcode = 'P0002';
  end if;
  if selected_plan.tenant_id <> tongji_v3_private.current_tenant_id()
    or not tongji_v3_private.has_observation_access(selected_plan.observation_id) then
    raise exception 'response plan access denied' using errcode = '42501';
  end if;

  perform 1
  from tongji_v3.response_plans
  where analysis_run_id = selected_plan.analysis_run_id
    and child_id = selected_plan.child_id
  for update;

  select decision into analysis_decision
  from tongji_v3.analysis_runs
  where id = selected_plan.analysis_run_id;

  if analysis_decision <> 'adopted'::tongji_v3.ai_decision then
    raise exception 'analysis review required' using errcode = '23514';
  end if;
  if selected_plan.status <> 'suggested' then
    raise exception 'response plan already decided' using errcode = '23505';
  end if;

  insert into tongji_v3.support_actions (
    tenant_id, classroom_id, child_id, observation_id, analysis_run_id,
    response_plan_id, category, rationale, strategy, details,
    next_observation_focus, created_by
  ) values
  (
    selected_plan.tenant_id, selected_plan.classroom_id, selected_plan.child_id,
    selected_plan.observation_id, selected_plan.analysis_run_id, selected_plan.id,
    'activity', selected_plan.rationale,
    coalesce(selected_plan.activity_support ->> 'activityName', selected_plan.title),
    selected_plan.activity_support, selected_plan.observation_cut, (select auth.uid())
  ),
  (
    selected_plan.tenant_id, selected_plan.classroom_id, selected_plan.child_id,
    selected_plan.observation_id, selected_plan.analysis_run_id, selected_plan.id,
    'material', selected_plan.rationale,
    coalesce(selected_plan.material_support ->> 'purpose', selected_plan.title),
    selected_plan.material_support, selected_plan.observation_cut, (select auth.uid())
  ),
  (
    selected_plan.tenant_id, selected_plan.classroom_id, selected_plan.child_id,
    selected_plan.observation_id, selected_plan.analysis_run_id, selected_plan.id,
    'experience', selected_plan.rationale,
    coalesce(selected_plan.experience_support ->> 'participationMode', selected_plan.title),
    selected_plan.experience_support, selected_plan.observation_cut, (select auth.uid())
  );

  update tongji_v3.response_plans
  set status = 'rejected'
  where analysis_run_id = selected_plan.analysis_run_id
    and child_id = selected_plan.child_id
    and id <> selected_plan.id
    and status = 'suggested';

  update tongji_v3.response_plans
  set status = 'planned', selected_by = (select auth.uid()), selected_at = now()
  where id = selected_plan.id
  returning * into selected_plan;

  return selected_plan;
end;
$$;

create or replace function tongji_v3.select_response_plan(target_plan_id uuid)
returns tongji_v3.response_plans
language sql
security invoker
set search_path = ''
as $$
  select tongji_v3_private.select_response_plan(target_plan_id)
$$;

insert into tongji_v3.curriculum_template_versions (
  tenant_id, code, name, version, description, structure, is_default, status
)
select
  id,
  'TONGSHENG_1N',
  '“同生”课程·四区七步N循环',
  1,
  '基于真实游戏证据生成课程地图，并在四区七步中持续记录N次探究循环。',
  jsonb_build_object(
    'metadata', jsonb_build_array('主题名称', '实施班级', '实施周期', '核心探究线索'),
    'originAndCompetencies', jsonb_build_object(
      'coreEmergence', '一个核心生发点及来源描述',
      'dimensions', jsonb_build_array('与自然同生', '与生活同生', '与自我同生'),
      'qualities', jsonb_build_object(
        '慧创生', jsonb_build_array('探究', '细致'),
        '懂生活', jsonb_build_array('独立', '自律'),
        '悦生长', jsonb_build_array('愉悦', '自豪')
      ),
      'possibilities', jsonb_build_array('预设方向', '思维导图', '留白与生成')
    ),
    'implementation', jsonb_build_object(
      'zones', jsonb_build_array('起始区', '聚焦区', '探究区', '解决区/新起始区'),
      'steps', jsonb_build_array('发现真问题', '详细描述问题表现', '明确问题关键', '确定解决方向', '探索解决方法', '实施方案与过程', '解决当下问题并发现新问题'),
      'cycleFields', jsonb_build_array('教师支持策略与关键提问', '幼儿活动与表现', '环境与材料支持', '经验生成及新问题走向')
    ),
    'activityMap', jsonb_build_array('核心生发点', '社会', '自然', '自我', '预设活动线索', '生成活动线索'),
    'resources', jsonb_build_array('环境创设', '材料投放', '家园共育策略', '过程活动板块', '成果共建')
  ),
  true,
  'active'
from tongji_v3.tenants
on conflict (tenant_id, code, version) do nothing;

insert into tongji_v3.analysis_framework_versions (
  tenant_id, framework_type, code, name, version, description, dimensions, is_default, status
)
select id, 'game_experience', 'GAME_EXPERIENCE_7', '游戏经验七维框架', 1,
  '只描述有证据支持的游戏经验及其边界，不生成总分或综合等级。',
  '[{"label":"计划与意图","evidenceReminder":"关注幼儿如何提出、调整或回顾游戏计划"},{"label":"材料使用","evidenceReminder":"关注材料选择、组合、替代和功能变化"},{"label":"角色与情节","evidenceReminder":"关注角色分配、情节推进和象征转换"},{"label":"问题解决","evidenceReminder":"关注问题发现、尝试、比较和调整"},{"label":"合作协商","evidenceReminder":"关注同伴表达、倾听、协调与共同决定"},{"label":"规则与自我调节","evidenceReminder":"关注规则形成、等待、情绪和行动调节"},{"label":"表达与回顾","evidenceReminder":"关注语言、动作、图画、作品和分享回顾"}]'::jsonb,
  true, 'active'
from tongji_v3.tenants
on conflict (tenant_id, code, version) do nothing;

insert into tongji_v3.analysis_framework_versions (
  tenant_id, framework_type, code, name, version, description, dimensions, is_default, status
)
select id, 'learning_disposition', 'LEARNING_DISPOSITION_6', '学习品质六维框架', 1,
  '依据真实游戏中的行为线索描述学习品质，避免把情境表现固化为人格标签。',
  '[{"label":"好奇与探究","evidenceReminder":"关注提问、试探和持续寻找原因"},{"label":"主动性","evidenceReminder":"关注自主发起、选择和推进"},{"label":"专注与坚持","evidenceReminder":"关注持续投入及受挫后的再次尝试"},{"label":"想象与创造","evidenceReminder":"关注新用途、新情节和多样表达"},{"label":"合作","evidenceReminder":"关注共同目标、分工、协商和互助"},{"label":"反思与调整","evidenceReminder":"关注比较结果、解释原因和改变策略"}]'::jsonb,
  true, 'active'
from tongji_v3.tenants
on conflict (tenant_id, code, version) do nothing;

create trigger observation_subjects_touch before update on tongji_v3.observation_subjects
for each row execute function tongji_v3_private.touch_updated_at();
create trigger observation_imports_touch before update on tongji_v3.observation_imports
for each row execute function tongji_v3_private.touch_updated_at();
create trigger response_plans_touch before update on tongji_v3.response_plans
for each row execute function tongji_v3_private.touch_updated_at();
create trigger curriculum_templates_touch before update on tongji_v3.curriculum_template_versions
for each row execute function tongji_v3_private.touch_updated_at();
create trigger analysis_frameworks_touch before update on tongji_v3.analysis_framework_versions
for each row execute function tongji_v3_private.touch_updated_at();
create trigger curriculum_options_touch before update on tongji_v3.curriculum_activity_options
for each row execute function tongji_v3_private.touch_updated_at();
create trigger curriculum_plans_touch before update on tongji_v3.curriculum_plans
for each row execute function tongji_v3_private.touch_updated_at();
create trigger curriculum_cycles_touch before update on tongji_v3.curriculum_cycles
for each row execute function tongji_v3_private.touch_updated_at();
create trigger professional_memories_touch before update on tongji_v3.professional_memories
for each row execute function tongji_v3_private.touch_updated_at();
create trigger document_exports_touch before update on tongji_v3.document_exports
for each row execute function tongji_v3_private.touch_updated_at();

alter table tongji_v3.observation_subjects enable row level security;
alter table tongji_v3.observation_imports enable row level security;
alter table tongji_v3.analysis_feedback_versions enable row level security;
alter table tongji_v3.response_plans enable row level security;
alter table tongji_v3.curriculum_template_versions enable row level security;
alter table tongji_v3.analysis_framework_versions enable row level security;
alter table tongji_v3.curriculum_activity_options enable row level security;
alter table tongji_v3.curriculum_plans enable row level security;
alter table tongji_v3.curriculum_cycles enable row level security;
alter table tongji_v3.professional_memories enable row level security;
alter table tongji_v3.document_exports enable row level security;

create policy observation_subjects_read on tongji_v3.observation_subjects for select to authenticated
using (tongji_v3_private.has_observation_read_access(observation_id));
create policy observation_subjects_insert on tongji_v3.observation_subjects for insert to authenticated
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.has_observation_access(observation_id)
  and tongji_v3_private.has_class_access(classroom_id)
);
create policy observation_subjects_update on tongji_v3.observation_subjects for update to authenticated
using (tongji_v3_private.has_observation_access(observation_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_observation_access(observation_id));

create policy observation_imports_read on tongji_v3.observation_imports for select to authenticated
using (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_class_access(classroom_id));
create policy observation_imports_insert on tongji_v3.observation_imports for insert to authenticated
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and created_by = (select auth.uid())
  and tongji_v3_private.has_class_access(classroom_id)
);
create policy observation_imports_update on tongji_v3.observation_imports for update to authenticated
using (created_by = (select auth.uid()) or tongji_v3_private.is_researcher(tenant_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_class_access(classroom_id));

create policy analysis_feedback_read on tongji_v3.analysis_feedback_versions for select to authenticated
using (tongji_v3_private.has_observation_read_access(observation_id));
create policy analysis_feedback_insert on tongji_v3.analysis_feedback_versions for insert to authenticated
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and created_by = (select auth.uid())
  and tongji_v3_private.has_observation_access(observation_id)
);

create policy response_plans_read on tongji_v3.response_plans for select to authenticated
using (tongji_v3_private.has_observation_read_access(observation_id));
create policy response_plans_insert on tongji_v3.response_plans for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_observation_access(observation_id));
create policy response_plans_update on tongji_v3.response_plans for update to authenticated
using (tongji_v3_private.has_observation_access(observation_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_observation_access(observation_id));

create policy curriculum_templates_read on tongji_v3.curriculum_template_versions for select to authenticated
using (tenant_id = tongji_v3_private.current_tenant_id() and status = 'active');
create policy curriculum_templates_researcher_insert on tongji_v3.curriculum_template_versions for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.is_researcher(tenant_id));
create policy curriculum_templates_researcher_update on tongji_v3.curriculum_template_versions for update to authenticated
using (tongji_v3_private.is_researcher(tenant_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.is_researcher(tenant_id));

create policy analysis_frameworks_read on tongji_v3.analysis_framework_versions for select to authenticated
using (tenant_id = tongji_v3_private.current_tenant_id() and status = 'active');
create policy analysis_frameworks_researcher_insert on tongji_v3.analysis_framework_versions for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.is_researcher(tenant_id));
create policy analysis_frameworks_researcher_update on tongji_v3.analysis_framework_versions for update to authenticated
using (tongji_v3_private.is_researcher(tenant_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.is_researcher(tenant_id));

create policy curriculum_options_read on tongji_v3.curriculum_activity_options for select to authenticated
using (tongji_v3_private.has_class_access(classroom_id));
create policy curriculum_options_insert on tongji_v3.curriculum_activity_options for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_class_access(classroom_id));
create policy curriculum_options_update on tongji_v3.curriculum_activity_options for update to authenticated
using (tongji_v3_private.has_class_access(classroom_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_class_access(classroom_id));

create policy curriculum_plans_read on tongji_v3.curriculum_plans for select to authenticated
using (tongji_v3_private.has_class_access(classroom_id));
create policy curriculum_plans_insert on tongji_v3.curriculum_plans for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and created_by = (select auth.uid()) and tongji_v3_private.has_class_access(classroom_id));
create policy curriculum_plans_update on tongji_v3.curriculum_plans for update to authenticated
using (tongji_v3_private.has_class_access(classroom_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_class_access(classroom_id));

create policy curriculum_cycles_read on tongji_v3.curriculum_cycles for select to authenticated
using (tongji_v3_private.has_class_access(classroom_id));
create policy curriculum_cycles_insert on tongji_v3.curriculum_cycles for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and created_by = (select auth.uid()) and tongji_v3_private.has_class_access(classroom_id));
create policy curriculum_cycles_update on tongji_v3.curriculum_cycles for update to authenticated
using (tongji_v3_private.has_class_access(classroom_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_class_access(classroom_id));

create policy professional_memories_read on tongji_v3.professional_memories for select to authenticated
using (tenant_id = tongji_v3_private.current_tenant_id() and status = 'active');
create policy professional_memories_researcher_insert on tongji_v3.professional_memories for insert to authenticated
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.is_researcher(tenant_id));
create policy professional_memories_researcher_update on tongji_v3.professional_memories for update to authenticated
using (tongji_v3_private.is_researcher(tenant_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.is_researcher(tenant_id));

create policy document_exports_read on tongji_v3.document_exports for select to authenticated
using (
  tenant_id = tongji_v3_private.current_tenant_id()
  and (created_by = (select auth.uid()) or tongji_v3_private.is_researcher(tenant_id))
  and tongji_v3_private.has_class_access(classroom_id)
);
create policy document_exports_insert on tongji_v3.document_exports for insert to authenticated
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and created_by = (select auth.uid())
  and tongji_v3_private.has_class_access(classroom_id)
);
create policy document_exports_update on tongji_v3.document_exports for update to authenticated
using (created_by = (select auth.uid()) or tongji_v3_private.is_researcher(tenant_id))
with check (tenant_id = tongji_v3_private.current_tenant_id() and tongji_v3_private.has_class_access(classroom_id));

grant select, insert, update on
  tongji_v3.observation_subjects,
  tongji_v3.observation_imports,
  tongji_v3.analysis_feedback_versions,
  tongji_v3.response_plans,
  tongji_v3.curriculum_template_versions,
  tongji_v3.analysis_framework_versions,
  tongji_v3.curriculum_activity_options,
  tongji_v3.curriculum_plans,
  tongji_v3.curriculum_cycles,
  tongji_v3.professional_memories,
  tongji_v3.document_exports
to authenticated;

grant all privileges on
  tongji_v3.observation_subjects,
  tongji_v3.observation_imports,
  tongji_v3.analysis_feedback_versions,
  tongji_v3.response_plans,
  tongji_v3.curriculum_template_versions,
  tongji_v3.analysis_framework_versions,
  tongji_v3.curriculum_activity_options,
  tongji_v3.curriculum_plans,
  tongji_v3.curriculum_cycles,
  tongji_v3.professional_memories,
  tongji_v3.document_exports
to service_role;

revoke all on function tongji_v3_private.select_response_plan(uuid) from public, anon;
grant execute on function tongji_v3_private.select_response_plan(uuid) to authenticated, service_role;
revoke all on function tongji_v3.select_response_plan(uuid) from public, anon;
grant execute on function tongji_v3.select_response_plan(uuid) to authenticated;

comment on table tongji_v3.observation_subjects is '一份群体观察关联多名幼儿；个体特征仅描述本次情境，不作为固定人格标签。';
comment on table tongji_v3.observation_imports is '观察记录表解析、低置信度字段和教师确认版本的完整链路。';
comment on table tongji_v3.response_plans is '每个候选应答方案同时包含活动、材料、经验支持及后续观察切口。';
comment on table tongji_v3.analysis_framework_versions is '园本版本化游戏经验与学习品质框架；正式输出仍禁止总分、排名和人格标签。';
comment on table tongji_v3.curriculum_cycles is '园本课程在四区七步框架中的第N轮真实推进记录。';
comment on table tongji_v3.professional_memories is '仅保存已审核、可追溯、可停用的园所专业记忆，不用于训练通用模型。';
