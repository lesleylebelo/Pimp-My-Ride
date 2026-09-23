-- Run only as part of a separately authorized environment setup/release.
-- The app has no public/client storage policies; uploads and signed viewing
-- links are issued by the authenticated backend using its server-only secret.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-photos', 'marketplace-photos', false, 5242880,
        array['image/jpeg','image/png'])
on conflict (id) do update set public=false, file_size_limit=5242880,
allowed_mime_types=array['image/jpeg','image/png'];

-- Read separately when auditing existing policies; inspect policies that match
-- other/all buckets too. A private flag alone does not prove policy safety.
select policyname, roles, cmd, qual, with_check from pg_policies
where schemaname='storage' and tablename='objects';
