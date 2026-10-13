create function tongji_v3.set_teacher_classrooms(
  target_tenant_id uuid,
  target_user_id uuid,
  actor_user_id uuid,
  target_classroom_ids uuid[]
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_profile tongji_v3.profiles%rowtype;
  previous_ids uuid[];
  selected_ids uuid[] := coalesce(target_classroom_ids,'{}'::uuid[]);
  valid_count integer;
begin
  if not exists (
    select 1 from tongji_v3.profiles
    where user_id = actor_user_id and tenant_id = target_tenant_id
      and role = 'researcher' and status = 'active'
  ) then
    raise exception 'ACCOUNT_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;

  select * into target_profile from tongji_v3.profiles
  where user_id = target_user_id and tenant_id = target_tenant_id for update;
  if not found or target_profile.role <> 'teacher' then
    raise exception 'TEACHER_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  if cardinality(selected_ids) > 20
     or array_position(selected_ids,null::uuid) is not null
     or cardinality(selected_ids) <> (select count(distinct id) from unnest(selected_ids) id) then
    raise exception 'INVALID_CLASSROOM_ASSIGNMENT' using errcode = '22023';
  end if;

  select coalesce(array_agg(classroom_id order by classroom_id),'{}'::uuid[]) into previous_ids
  from tongji_v3.classroom_teachers where tenant_id = target_tenant_id and user_id = target_user_id;

  perform 1 from tongji_v3.classrooms
  where tenant_id = target_tenant_id and id = any(selected_ids) order by id for share;
  select count(*) into valid_count from tongji_v3.classrooms
  where tenant_id = target_tenant_id and id = any(selected_ids)
    and (status = 'active' or id = any(previous_ids));
  if valid_count <> cardinality(selected_ids) then
    raise exception 'INVALID_CLASSROOM_ASSIGNMENT' using errcode = '22023';
  end if;

  delete from tongji_v3.classroom_teachers
  where tenant_id = target_tenant_id and user_id = target_user_id;
  insert into tongji_v3.classroom_teachers (classroom_id,user_id,tenant_id,assigned_by)
  select id,target_user_id,target_tenant_id,actor_user_id from unnest(selected_ids) id;
  insert into tongji_v3.audit_events (tenant_id,actor_id,actor_role,action,resource_type,resource_id,detail)
  values (target_tenant_id,actor_user_id,'researcher','account.classrooms_updated','account',target_user_id::text,
    jsonb_build_object('previousClassroomIds',previous_ids,'classroomIds',selected_ids));
  return jsonb_build_object('classroomIds',selected_ids);
end;
$$;

revoke all on function tongji_v3.set_teacher_classrooms(uuid,uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function tongji_v3.set_teacher_classrooms(uuid,uuid,uuid,uuid[]) to service_role;
comment on function tongji_v3.set_teacher_classrooms(uuid,uuid,uuid,uuid[]) is
  '后端鉴权后原子替换本园教师班级范围与审计记录；教研员全园权限不变，不删除历史业务数据。';
notify pgrst,'reload schema';
