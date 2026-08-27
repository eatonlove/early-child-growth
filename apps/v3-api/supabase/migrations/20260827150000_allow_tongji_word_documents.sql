-- 同迹观察表导入、观察记录导出和课程计划导出都使用同迹专属私有桶。
-- 保留已有媒体白名单，只补充系统实际支持的两种 Word 文档类型。
update storage.buckets
set allowed_mime_types = array(
  select distinct mime_type
  from unnest(
    coalesce(allowed_mime_types, array[]::text[])
    || array[
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ]::text[]
  ) as mime_type
)
where id = 'tongji-v3-evidence';

do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'tongji-v3-evidence'
      and 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' = any(allowed_mime_types)
      and 'application/msword' = any(allowed_mime_types)
  ) then
    raise exception 'tongji-v3-evidence bucket is missing required Word MIME types';
  end if;
end
$$;
