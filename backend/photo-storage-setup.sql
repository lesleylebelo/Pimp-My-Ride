-- PROPOSAL ONLY. Do not execute until the exact remote changes are approved.
-- Existing project: nymiyrzdpjctyembixbe. No verification/legacy bucket updates.
-- Create missing buckets only; an existing bucket is preserved, never altered.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
 ('vehicle-images', 'vehicle-images', false, 5242880,
  array['image/jpeg','image/png','image/webp']),
 ('showcase-images', 'showcase-images', false, 5242880,
  array['image/jpeg','image/png','image/webp']),
 ('request-images', 'request-images', false, 5242880,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Read-only checks: require all three to be private, 5 MiB, JPEG/PNG/WebP.
-- A mismatch stops setup and needs a separate, exact approval; no UPDATE here.
select id, public, file_size_limit, allowed_mime_types from storage.buckets
where id in ('vehicle-images','showcase-images','request-images');

-- Review ALL bucket/global policies. Firebase users upload/view only through
-- the authenticated Express server using its server-only privileged key.
-- No new anon/authenticated INSERT, SELECT, UPDATE or DELETE policy is needed.
select policyname, roles, cmd, qual, with_check from pg_policies
where schemaname='storage' and tablename='objects';
