insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification', 'verification', false, 5242880,
        array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false, file_size_limit=5242880,
allowed_mime_types=array['application/pdf','image/jpeg','image/png'];
select policyname, roles, cmd, qual, with_check from pg_policies
where schemaname='storage' and tablename='objects';
