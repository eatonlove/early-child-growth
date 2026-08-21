do $migration$
begin
  if to_regprocedure('private.handle_new_auth_user()') is not null
    and exists (
      select 1
      from pg_trigger
      where tgrelid = 'auth.users'::regclass
        and tgname = 'auth_user_profile_created'
        and not tgisinternal
    )
  then
    execute 'drop trigger auth_user_profile_created on auth.users';
    execute $trigger$
      create trigger auth_user_profile_created
      after insert on auth.users
      for each row
      when (coalesce(new.raw_app_meta_data ->> 'application', '') <> 'tongji_v3')
      execute function private.handle_new_auth_user()
    $trigger$;
  end if;
end
$migration$;

comment on schema tongji_v3 is
  '童迹3.0业务schema；共享Auth触发器按raw_app_meta_data.application隔离其他应用资料写入。';
