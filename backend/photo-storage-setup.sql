insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
 ('vehicle-images', 'vehicle-images', false, 5242880,
  array['image/jpeg','image/png','image/webp']),
 ('showcase-images', 'showcase-images', false, 5242880,
  array['image/jpeg','image/png','image/webp']),
 ('request-images', 'request-images', false, 5242880,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

select id, public, file_size_limit, allowed_mime_types from storage.buckets
where id in ('vehicle-images','showcase-images','request-images');

select policyname, roles, cmd, qual, with_check from pg_policies
where schemaname='storage' and tablename='objects';
