-- Keep the original helper write-safe: all writes require an active classroom.
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
    join tongji_v3.profiles p
      on p.user_id = (select auth.uid())
     and p.tenant_id = c.tenant_id
    where c.id = target_classroom
      and p.status = 'active'::tongji_v3.account_status
      and c.status = 'active'::tongji_v3.record_status
      and (
        p.role = 'researcher'::tongji_v3.app_role
        or exists (
          select 1
          from tongji_v3.classroom_teachers ct
          where ct.classroom_id = c.id
            and ct.tenant_id = c.tenant_id
            and ct.user_id = p.user_id
        )
      )
  )
$$;

revoke all on function tongji_v3_private.has_class_access(uuid) from public, anon;
grant execute on function tongji_v3_private.has_class_access(uuid) to authenticated, service_role;

-- Researchers retain same-tenant read access to archived history. Teachers
-- remain limited to assigned active classrooms.
create or replace function tongji_v3_private.has_class_read_access(target_classroom uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from tongji_v3.classrooms c
    join tongji_v3.profiles p
      on p.user_id = (select auth.uid())
     and p.tenant_id = c.tenant_id
    where c.id = target_classroom
      and p.status = 'active'::tongji_v3.account_status
      and (
        p.role = 'researcher'::tongji_v3.app_role
        or (
          c.status = 'active'::tongji_v3.record_status
          and exists (
            select 1
            from tongji_v3.classroom_teachers ct
            where ct.classroom_id = c.id
              and ct.tenant_id = c.tenant_id
              and ct.user_id = p.user_id
          )
        )
      )
  )
$$;

revoke all on function tongji_v3_private.has_class_read_access(uuid) from public, anon;
grant execute on function tongji_v3_private.has_class_read_access(uuid) to authenticated, service_role;

create or replace function tongji_v3_private.has_observation_read_access(target_observation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from tongji_v3.observations o
    where o.id = target_observation
      and tongji_v3_private.has_class_read_access(o.classroom_id)
  )
$$;

revoke all on function tongji_v3_private.has_observation_read_access(uuid) from public, anon;
grant execute on function tongji_v3_private.has_observation_read_access(uuid) to authenticated, service_role;

-- This row-based helper is used by classroom SELECT/RETURNING. It must not
-- query the target classroom again, otherwise INSERT/UPDATE RETURNING can be
-- rejected even after the mutation succeeds.
create or replace function tongji_v3_private.can_read_classroom_row(
  target_classroom uuid,
  target_tenant uuid,
  target_status tongji_v3.record_status
)
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
      and p.status = 'active'::tongji_v3.account_status
      and (
        p.role = 'researcher'::tongji_v3.app_role
        or (
          target_status = 'active'::tongji_v3.record_status
          and exists (
            select 1
            from tongji_v3.classroom_teachers ct
            where ct.classroom_id = target_classroom
              and ct.tenant_id = target_tenant
              and ct.user_id = p.user_id
          )
        )
      )
  )
$$;

revoke all on function tongji_v3_private.can_read_classroom_row(
  uuid,
  uuid,
  tongji_v3.record_status
) from public, anon;
grant execute on function tongji_v3_private.can_read_classroom_row(
  uuid,
  uuid,
  tongji_v3.record_status
) to authenticated, service_role;

create or replace function tongji_v3_private.can_read_storage_object(object_name text)
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
    and tongji_v3_private.has_class_read_access(class_uuid);
end;
$$;

revoke all on function tongji_v3_private.can_read_storage_object(text) from public, anon;
grant execute on function tongji_v3_private.can_read_storage_object(text) to authenticated, service_role;

drop policy if exists children_read_class on tongji_v3.children;
create policy children_read_class on tongji_v3.children for select to authenticated
using (tongji_v3_private.has_class_read_access(classroom_id));

drop policy if exists observations_read_class on tongji_v3.observations;
create policy observations_read_class on tongji_v3.observations for select to authenticated
using (tongji_v3_private.has_class_read_access(classroom_id));

drop policy if exists evidence_read_class on tongji_v3.evidence_assets;
create policy evidence_read_class on tongji_v3.evidence_assets for select to authenticated
using (tongji_v3_private.has_observation_read_access(observation_id));

drop policy if exists analysis_read_class on tongji_v3.analysis_runs;
create policy analysis_read_class on tongji_v3.analysis_runs for select to authenticated
using (tongji_v3_private.has_observation_read_access(observation_id));

drop policy if exists support_read_class on tongji_v3.support_actions;
create policy support_read_class on tongji_v3.support_actions for select to authenticated
using (tongji_v3_private.has_class_read_access(classroom_id));

drop policy if exists reports_read_class on tongji_v3.period_reports;
create policy reports_read_class on tongji_v3.period_reports for select to authenticated
using (tongji_v3_private.has_class_read_access(classroom_id));

drop policy if exists curriculum_read_class on tongji_v3.curriculum_clues;
create policy curriculum_read_class on tongji_v3.curriculum_clues for select to authenticated
using (tongji_v3_private.has_class_read_access(classroom_id));

drop policy if exists tongji_v3_storage_read on storage.objects;
create policy tongji_v3_storage_read on storage.objects for select to authenticated
using (
  bucket_id = 'tongji-v3-evidence'
  and tongji_v3_private.can_read_storage_object(name)
);
