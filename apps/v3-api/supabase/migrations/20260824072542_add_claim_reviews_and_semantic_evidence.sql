create table tongji_v3.analysis_claim_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tongji_v3.tenants(id) on delete restrict,
  classroom_id uuid not null references tongji_v3.classrooms(id) on delete restrict,
  child_id uuid not null references tongji_v3.children(id) on delete restrict,
  observation_id uuid not null references tongji_v3.observations(id) on delete cascade,
  analysis_run_id uuid not null references tongji_v3.analysis_runs(id) on delete cascade,
  claim_key text not null,
  claim_type text not null check (claim_type in (
    'objective_summary', 'fact', 'interpretation', 'hypothesis',
    'current_experience', 'interest_strength', 'evidence_gap',
    'development_reference', 'response_suggestion', 'next_observation',
    'historical_change'
  )),
  original_content jsonb not null,
  reviewed_content jsonb,
  decision text not null default 'pending'
    check (decision in ('pending', 'adopted', 'modified', 'rejected', 'to_verify')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_run_id, claim_key)
);

create index analysis_claim_reviews_run_idx
  on tongji_v3.analysis_claim_reviews (analysis_run_id, claim_key);
create index analysis_claim_reviews_child_idx
  on tongji_v3.analysis_claim_reviews (child_id, reviewed_at desc)
  where decision in ('adopted', 'modified');

create trigger analysis_claim_reviews_touch
before update on tongji_v3.analysis_claim_reviews
for each row execute function tongji_v3_private.touch_updated_at();

alter table tongji_v3.analysis_claim_reviews enable row level security;

create policy analysis_claim_reviews_read_class
on tongji_v3.analysis_claim_reviews for select to authenticated
using (tongji_v3_private.has_observation_read_access(observation_id));

create policy analysis_claim_reviews_create_class
on tongji_v3.analysis_claim_reviews for insert to authenticated
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.has_observation_access(observation_id)
  and exists (
    select 1
    from tongji_v3.analysis_runs ar
    where ar.id = analysis_run_id
      and ar.observation_id = analysis_claim_reviews.observation_id
      and ar.tenant_id = analysis_claim_reviews.tenant_id
  )
);

create policy analysis_claim_reviews_update_class
on tongji_v3.analysis_claim_reviews for update to authenticated
using (tongji_v3_private.has_observation_access(observation_id))
with check (
  tenant_id = tongji_v3_private.current_tenant_id()
  and tongji_v3_private.has_observation_access(observation_id)
);

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
  source_observation tongji_v3.observations;
  accepted_count integer;
  pending_count integer;
  suggestion record;
  next_focus text;
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
  into pending_count, accepted_count
  from tongji_v3.analysis_claim_reviews
  where analysis_run_id = target_analysis_id;

  if pending_count > 0 then
    raise exception 'all claims must be reviewed' using errcode = '23514';
  end if;
  if not exists (
    select 1 from tongji_v3.analysis_claim_reviews
    where analysis_run_id = target_analysis_id
  ) then
    raise exception 'analysis claims not initialized' using errcode = '23514';
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

  update tongji_v3.observations
  set status = case when accepted_count > 0
        then 'adopted'::tongji_v3.observation_status
        else 'abandoned'::tongji_v3.observation_status end
  where id = selected_run.observation_id
  returning * into source_observation;

  if accepted_count > 0 then
    select coalesce(reviewed_content ->> 'content', original_content ->> 'content')
    into next_focus
    from tongji_v3.analysis_claim_reviews
    where analysis_run_id = target_analysis_id
      and claim_type = 'next_observation'
      and decision in ('adopted', 'modified')
    order by claim_key
    limit 1;

    for suggestion in
      select
        coalesce(reviewed_content ->> 'category', original_content ->> 'category', 'experience') as category,
        coalesce(reviewed_content ->> 'content', original_content ->> 'content') as strategy
      from tongji_v3.analysis_claim_reviews
      where analysis_run_id = target_analysis_id
        and claim_type = 'response_suggestion'
        and decision in ('adopted', 'modified')
      order by claim_key
    loop
      insert into tongji_v3.support_actions (
        tenant_id, classroom_id, child_id, observation_id, analysis_run_id,
        category, rationale, strategy, next_observation_focus, created_by
      ) values (
        selected_run.tenant_id,
        selected_run.classroom_id,
        selected_run.child_id,
        selected_run.observation_id,
        selected_run.id,
        case when suggestion.category in ('experience', 'material', 'activity')
          then suggestion.category else 'experience' end,
        '教师逐条审核后采用或修改的AI应答建议；实施效果仍需复察验证。',
        suggestion.strategy,
        coalesce(next_focus, source_observation.teacher_response ->> 'nextObservationFocus', '继续观察支持后的行为变化'),
        (select auth.uid())
      );
    end loop;
  end if;

  return selected_run;
end;
$$;

create or replace function tongji_v3.finalize_analysis_review(
  target_analysis_id uuid,
  target_note text default null
)
returns tongji_v3.analysis_runs
language sql
security invoker
set search_path = ''
as $$
  select tongji_v3_private.finalize_analysis_review(target_analysis_id, target_note)
$$;

grant select on tongji_v3.analysis_claim_reviews to authenticated;
revoke insert, update, delete on tongji_v3.analysis_claim_reviews from authenticated, anon;
grant all privileges on tongji_v3.analysis_claim_reviews to service_role;

revoke execute on function tongji_v3.decide_analysis(uuid, tongji_v3.ai_decision, text) from authenticated;
revoke all on function tongji_v3_private.finalize_analysis_review(uuid, text) from public, anon;
grant execute on function tongji_v3_private.finalize_analysis_review(uuid, text) to authenticated, service_role;
revoke all on function tongji_v3.finalize_analysis_review(uuid, text) from public, anon;
grant execute on function tongji_v3.finalize_analysis_review(uuid, text) to authenticated;
