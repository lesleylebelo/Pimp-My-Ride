-- Read-only preflight for nymiyrzdpjctyembixbe. Prepared, not executed here.
-- No object enumeration, policy mutation, schema change or bucket creation.
begin transaction read only;
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('vehicle-images', 'showcase-images', 'request-images')
order by id;

-- Inspect all Storage-object policies to include global/cross-bucket grants.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
rollback;
