-- The former SELECT policy called has_research_activity_access(id), which
-- re-queried research_activities. During INSERT ... RETURNING that stable
-- lookup cannot see the row being returned, so an otherwise valid insert was
-- rejected by RLS.
create or replace function tongji_v3_private.can_read_research_activity_row(
  target_tenant uuid,
  target_classroom uuid
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
        or target_classroom is null
        or tongji_v3_private.has_class_access(target_classroom)
      )
  )
$$;

revoke all on function tongji_v3_private.can_read_research_activity_row(
  uuid,
  uuid
) from public, anon;
grant execute on function tongji_v3_private.can_read_research_activity_row(
  uuid,
  uuid
) to authenticated, service_role;

drop policy if exists research_activity_read_allowed
on tongji_v3.research_activities;
create policy research_activity_read_allowed
on tongji_v3.research_activities
for select
to authenticated
using (
  (select tongji_v3_private.can_read_research_activity_row(tenant_id, classroom_id))
);
