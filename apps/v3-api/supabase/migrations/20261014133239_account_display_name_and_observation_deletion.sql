create or replace function tongji_v3.set_account_display_name(
  target_tenant_id uuid, target_user_id uuid, actor_user_id uuid, target_display_name text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  target_profile tongji_v3.profiles%rowtype;
  previous_name text;
  classroom_ids uuid[];
  selected_name text := btrim(target_display_name);
begin
  if not exists (select 1 from tongji_v3.profiles where user_id = actor_user_id
    and tenant_id = target_tenant_id and role = 'researcher' and status = 'active') then
    raise exception 'ACCOUNT_NAME_FORBIDDEN' using errcode = '42501';
  end if;
  if selected_name is null or char_length(selected_name) not between 1 and 40 then
    raise exception 'INVALID_DISPLAY_NAME' using errcode = '22023';
  end if;
  select * into target_profile from tongji_v3.profiles
    where user_id = target_user_id and tenant_id = target_tenant_id for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002'; end if;
  previous_name := target_profile.display_name;
  update tongji_v3.profiles set display_name = selected_name
    where user_id = target_user_id and tenant_id = target_tenant_id returning * into target_profile;
  select coalesce(array_agg(classroom_id order by classroom_id),'{}'::uuid[]) into classroom_ids
    from tongji_v3.classroom_teachers where user_id = target_user_id and tenant_id = target_tenant_id;
  insert into tongji_v3.audit_events (tenant_id,actor_id,actor_role,action,resource_type,resource_id,detail)
    values (target_tenant_id,actor_user_id,'researcher','account.display_name_updated','account',target_user_id::text,
      jsonb_build_object('previousDisplayName',previous_name,'displayName',selected_name));
  return (to_jsonb(target_profile) - 'tenant_id' - 'created_by') || jsonb_build_object('classroom_ids',classroom_ids);
end;
$$;

create or replace function tongji_v3.delete_observation(
  target_tenant_id uuid, target_observation_id uuid, actor_user_id uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  actor_profile tongji_v3.profiles%rowtype;
  selected_observation tongji_v3.observations%rowtype;
  storage_paths jsonb;
  storage_prefixes jsonb;
  audit_id bigint;
begin
  select * into actor_profile from tongji_v3.profiles where user_id = actor_user_id
    and tenant_id = target_tenant_id and status = 'active';
  if not found then raise exception 'OBSERVATION_DELETE_FORBIDDEN' using errcode = '42501'; end if;
  select * into selected_observation from tongji_v3.observations
    where id = target_observation_id and tenant_id = target_tenant_id for update;
  if not found then raise exception 'OBSERVATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if actor_profile.role <> 'researcher' and (
    selected_observation.created_by <> actor_user_id or not exists (
      select 1 from tongji_v3.classroom_teachers ct join tongji_v3.classrooms c on c.id = ct.classroom_id
      where ct.tenant_id = target_tenant_id and ct.user_id = actor_user_id
        and ct.classroom_id = selected_observation.classroom_id and c.status = 'active'
    )
  ) then raise exception 'OBSERVATION_DELETE_FORBIDDEN' using errcode = '42501'; end if;
  if exists (select 1 from tongji_v3.analysis_jobs where observation_id = target_observation_id
    and tenant_id = target_tenant_id and status in ('queued','processing')) then
    raise exception 'OBSERVATION_ANALYSIS_ACTIVE' using errcode = 'P0001';
  end if;
  if exists (select 1 from tongji_v3.period_reports where tenant_id = target_tenant_id
    and evidence_observation_ids @> array[target_observation_id]) then
    raise exception 'OBSERVATION_USED_IN_REPORT' using errcode = 'P0001';
  end if;
  if exists (select 1 from tongji_v3.research_activities where tenant_id = target_tenant_id and observation_id = target_observation_id) then
    raise exception 'OBSERVATION_USED_IN_RESEARCH' using errcode = 'P0001';
  end if;
  if exists (select 1 from tongji_v3.curriculum_clues where tenant_id = target_tenant_id and evidence_observation_ids @> array[target_observation_id])
    or exists (select 1 from tongji_v3.curriculum_activity_options where tenant_id = target_tenant_id and evidence_observation_ids @> array[target_observation_id])
    or exists (select 1 from tongji_v3.curriculum_plans where tenant_id = target_tenant_id and evidence_observation_ids @> array[target_observation_id])
    or exists (select 1 from tongji_v3.curriculum_cycles where tenant_id = target_tenant_id and evidence_observation_ids @> array[target_observation_id]) then
    raise exception 'OBSERVATION_USED_IN_CURRICULUM' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(distinct storage_path),'[]'::jsonb) into storage_paths from (
    select storage_path from tongji_v3.evidence_assets where observation_id = target_observation_id and tenant_id = target_tenant_id
    union select storage_path from tongji_v3.document_exports where tenant_id = target_tenant_id
      and resource_type = 'observation' and resource_id = target_observation_id::text
  ) files where storage_path is not null;
  select coalesce(jsonb_object_agg(storage_path,prefix),'{}'::jsonb) into storage_prefixes from (
    select storage_path,target_tenant_id::text || '/' || selected_observation.classroom_id::text || '/' || child_id::text || '/' || target_observation_id::text || '/' as prefix
      from tongji_v3.evidence_assets where observation_id = target_observation_id and tenant_id = target_tenant_id
    union select storage_path,target_tenant_id::text || '/' || selected_observation.classroom_id::text || '/exports/' || id::text || '/'
      from tongji_v3.document_exports where tenant_id = target_tenant_id and resource_type = 'observation' and resource_id = target_observation_id::text
  ) files where storage_path is not null;
  delete from tongji_v3.document_exports where tenant_id = target_tenant_id
    and resource_type = 'observation' and resource_id = target_observation_id::text;
  delete from tongji_v3.professional_memories where tenant_id = target_tenant_id and (
    applicability ->> 'observationId' = target_observation_id::text
    or evidence_refs @> jsonb_build_array(jsonb_build_object('observationId',target_observation_id))
    or (source_resource_type = 'analysis_run' and source_resource_id in (
      select id::text from tongji_v3.analysis_runs where observation_id = target_observation_id and tenant_id = target_tenant_id))
    or (source_resource_type = 'support_action' and source_resource_id in (
      select id::text from tongji_v3.support_actions where observation_id = target_observation_id and tenant_id = target_tenant_id))
  );
  update tongji_v3.observation_imports set observation_id = null, status = 'needs_review',
    teacher_confirmed_fields = null, confirmed_by = null, confirmed_at = null
    where tenant_id = target_tenant_id and observation_id = target_observation_id;
  delete from tongji_v3.observations where id = target_observation_id and tenant_id = target_tenant_id;
  insert into tongji_v3.audit_events (tenant_id,actor_id,actor_role,action,resource_type,resource_id,detail)
    values (target_tenant_id,actor_user_id,actor_profile.role,'observation.deleted','observation',target_observation_id::text,
      jsonb_build_object('classroomId',selected_observation.classroom_id,'pendingStoragePaths',storage_paths))
    returning id into audit_id;
  return jsonb_build_object('storagePaths',storage_paths,'storagePrefixes',storage_prefixes,'auditId',audit_id);
end;
$$;

revoke all on function tongji_v3.set_account_display_name(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function tongji_v3.delete_observation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function tongji_v3.set_account_display_name(uuid,uuid,uuid,text) to service_role;
grant execute on function tongji_v3.delete_observation(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
