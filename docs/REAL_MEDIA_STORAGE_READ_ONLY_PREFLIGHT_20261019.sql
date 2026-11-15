begin transaction read only;
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('vehicle-images', 'showcase-images', 'request-images')
order by id;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
rollback;
