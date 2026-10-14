alter table tongji_v3.analysis_jobs add column subject_results jsonb not null default '[]'::jsonb
  check (jsonb_typeof(subject_results) = 'array' and jsonb_array_length(subject_results) <= 30);
alter table tongji_v3.observation_subjects add column additional_observation text not null default ''
  check (char_length(additional_observation) <= 6000);

create function tongji_v3.create_subject_analysis_job(
  target_tenant_id uuid, target_observation_id uuid, actor_user_id uuid, target_child_ids uuid[] default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  actor_profile tongji_v3.profiles%rowtype;
  selected_observation tongji_v3.observations%rowtype;
  selected_job tongji_v3.analysis_jobs%rowtype;
  targets jsonb;
begin
  select * into actor_profile from tongji_v3.profiles where tenant_id = target_tenant_id and user_id = actor_user_id and status = 'active';
  if not found then raise exception 'ANALYSIS_FORBIDDEN' using errcode = '42501'; end if;
  select * into selected_observation from tongji_v3.observations where tenant_id = target_tenant_id and id = target_observation_id for update;
  if not found then raise exception 'OBSERVATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if actor_profile.role <> 'researcher' and not exists (
    select 1 from tongji_v3.classroom_teachers ct join tongji_v3.classrooms c on c.id = ct.classroom_id
    where ct.tenant_id = target_tenant_id and ct.user_id = actor_user_id and ct.classroom_id = selected_observation.classroom_id and c.status = 'active'
  ) then raise exception 'ANALYSIS_FORBIDDEN' using errcode = '42501'; end if;
  if selected_observation.status = 'draft' then raise exception 'OBSERVATION_NOT_SUBMITTED' using errcode = 'P0001'; end if;
  select * into selected_job from tongji_v3.analysis_jobs where tenant_id = target_tenant_id and observation_id = target_observation_id and status in ('queued','processing') order by created_at desc limit 1;
  if found then return jsonb_build_object('item',to_jsonb(selected_job),'created',false); end if;
  if target_child_ids is not null and (
    cardinality(target_child_ids) not between 1 and 30 or array_position(target_child_ids,null::uuid) is not null or
    cardinality(target_child_ids) <> (select count(distinct id) from unnest(target_child_ids) id) or
    exists (select 1 from unnest(target_child_ids) as selected(child_id) where not exists (
      select 1 from tongji_v3.observation_subjects s where s.tenant_id = target_tenant_id and s.observation_id = target_observation_id and s.child_id = selected.child_id
    ))
  ) then raise exception 'ANALYSIS_SUBJECT_INVALID' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object('childId',child_id,'status','queued','explanation','','missingInformation','[]'::jsonb,'analysisRunId',null) order by role,child_id)
    into targets from tongji_v3.observation_subjects where tenant_id = target_tenant_id and observation_id = target_observation_id
    and (target_child_ids is null or child_id = any(target_child_ids));
  if targets is null then raise exception 'ANALYSIS_SUBJECT_INVALID' using errcode = '22023'; end if;
  insert into tongji_v3.analysis_jobs(tenant_id,classroom_id,observation_id,requested_by,subject_results)
    values(target_tenant_id,selected_observation.classroom_id,target_observation_id,actor_user_id,targets) returning * into selected_job;
  insert into tongji_v3.audit_events(tenant_id,actor_id,actor_role,action,resource_type,resource_id,detail)
    values(target_tenant_id,actor_user_id,actor_profile.role,'analysis.queued','analysis_job',selected_job.id::text,
      jsonb_build_object('observationId',target_observation_id,'childIds',target_child_ids));
  return jsonb_build_object('item',to_jsonb(selected_job),'created',true);
end;
$$;

create function tongji_v3.supplement_observation_subject(
  target_tenant_id uuid, target_observation_id uuid, target_child_id uuid, actor_user_id uuid,
  target_additional_observation text, target_contextual_feature text, target_evidence_anchors text[]
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  actor_profile tongji_v3.profiles%rowtype;
  selected_observation tongji_v3.observations%rowtype;
  selected_subject tongji_v3.observation_subjects%rowtype;
  chosen_observation text := btrim(coalesce(target_additional_observation,''));
  chosen_feature text := btrim(coalesce(target_contextual_feature,''));
  chosen_anchors text[] := coalesce(target_evidence_anchors,'{}'::text[]);
begin
  select * into actor_profile from tongji_v3.profiles where tenant_id = target_tenant_id and user_id = actor_user_id and status = 'active';
  if not found then raise exception 'SUPPLEMENT_FORBIDDEN' using errcode = '42501'; end if;
  select * into selected_observation from tongji_v3.observations where tenant_id = target_tenant_id and id = target_observation_id for update;
  if not found then raise exception 'OBSERVATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if actor_profile.role <> 'researcher' and (selected_observation.created_by <> actor_user_id or not exists (
    select 1 from tongji_v3.classroom_teachers ct join tongji_v3.classrooms c on c.id = ct.classroom_id
    where ct.tenant_id = target_tenant_id and ct.user_id = actor_user_id and ct.classroom_id = selected_observation.classroom_id and c.status = 'active'
  )) then raise exception 'SUPPLEMENT_FORBIDDEN' using errcode = '42501'; end if;
  if exists(select 1 from tongji_v3.analysis_jobs where tenant_id = target_tenant_id and observation_id = target_observation_id and status in ('queued','processing')) then
    raise exception 'OBSERVATION_ANALYSIS_ACTIVE' using errcode = 'P0001';
  end if;
  if char_length(chosen_observation) > 6000 or char_length(chosen_feature) > 500 or cardinality(chosen_anchors) > 20 or
    exists(select 1 from unnest(chosen_anchors) anchor where anchor is null or char_length(btrim(anchor)) not between 1 and 160) or
    (chosen_observation = '' and chosen_feature = '' and cardinality(chosen_anchors) = 0) then
    raise exception 'SUPPLEMENT_INVALID' using errcode = '22023';
  end if;
  select * into selected_subject from tongji_v3.observation_subjects where tenant_id = target_tenant_id and observation_id = target_observation_id and child_id = target_child_id for update;
  if not found then raise exception 'SUBJECT_NOT_FOUND' using errcode = 'P0002'; end if;
  update tongji_v3.observation_subjects set additional_observation = chosen_observation,
    contextual_feature = chosen_feature, evidence_anchors = chosen_anchors
    where id = selected_subject.id and tenant_id = target_tenant_id returning * into selected_subject;
  insert into tongji_v3.audit_events(tenant_id,actor_id,actor_role,action,resource_type,resource_id,detail)
    values(target_tenant_id,actor_user_id,actor_profile.role,'observation.subject_supplemented','observation_subject',selected_subject.id::text,
      jsonb_build_object('observationId',target_observation_id,'childId',target_child_id,'additionalTextLength',char_length(chosen_observation),'anchorCount',cardinality(chosen_anchors)));
  return to_jsonb(selected_subject);
end;
$$;

revoke all on function tongji_v3.create_subject_analysis_job(uuid,uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function tongji_v3.create_subject_analysis_job(uuid,uuid,uuid,uuid[]) to service_role;
revoke all on function tongji_v3.supplement_observation_subject(uuid,uuid,uuid,uuid,text,text,text[]) from public,anon,authenticated;
grant execute on function tongji_v3.supplement_observation_subject(uuid,uuid,uuid,uuid,text,text,text[]) to service_role;
comment on column tongji_v3.analysis_jobs.subject_results is '逐幼儿分析状态及可操作的证据补充清单，不把资料不足计为模型故障。';
comment on column tongji_v3.observation_subjects.additional_observation is '教师对本次目标幼儿事实的补充；原始观察保持不变，分析快照保留各版本。';
notify pgrst,'reload schema';
