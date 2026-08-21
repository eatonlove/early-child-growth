-- A classroom SELECT policy must not query the classrooms table again. During
-- INSERT ... RETURNING, a stable helper that re-queries the table cannot see
-- the row being returned and incorrectly rejects it.
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
  select target_status = 'active'::tongji_v3.record_status
    and exists (
      select 1
      from tongji_v3.profiles p
      where p.user_id = (select auth.uid())
        and p.tenant_id = target_tenant
        and p.status = 'active'::tongji_v3.account_status
        and (
          p.role = 'researcher'::tongji_v3.app_role
          or exists (
            select 1
            from tongji_v3.classroom_teachers ct
            where ct.classroom_id = target_classroom
              and ct.tenant_id = target_tenant
              and ct.user_id = p.user_id
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

drop policy if exists classrooms_read_assigned on tongji_v3.classrooms;
create policy classrooms_read_assigned
on tongji_v3.classrooms
for select
to authenticated
using (
  (select tongji_v3_private.can_read_classroom_row(id, tenant_id, status))
);
