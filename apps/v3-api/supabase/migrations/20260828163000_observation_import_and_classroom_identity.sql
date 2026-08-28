-- 8.28需求迭代：班内编号按班级唯一；观察教师姓名与上传账号解耦。

alter table tongji_v3.children
  drop constraint if exists children_tenant_id_internal_code_key;

create unique index if not exists children_classroom_internal_code_unique
  on tongji_v3.children (classroom_id, lower(internal_code));

alter table tongji_v3.observations
  add column if not exists observer_name_snapshot text;

update tongji_v3.observations o
set observer_name_snapshot = coalesce(
  (
    select string_agg(p.display_name, '、' order by p.display_name)
    from tongji_v3.profiles p
    where p.user_id = any(
      case
        when cardinality(o.observer_ids) > 0 then o.observer_ids
        else array[o.created_by]
      end
    )
  ),
  '未填写观察教师'
)
where observer_name_snapshot is null or trim(observer_name_snapshot) = '';

alter table tongji_v3.observations
  alter column observer_name_snapshot set default '未填写观察教师',
  alter column observer_name_snapshot set not null;

comment on column tongji_v3.observations.observer_name_snapshot is
  '教师确认后的观察者署名快照，与上传账号及系统账号映射解耦';
