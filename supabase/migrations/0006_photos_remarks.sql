-- Device photos (front/back/side/other), remarks for easier identification
-- and search, and a denormalized thumbnail for fast inventory list renders.

alter table public.devices
  add column if not exists remarks text,
  add column if not exists thumbnail_url text;

create table if not exists public.device_photos (
  id           uuid primary key default gen_random_uuid(),
  device_id    uuid not null references public.devices (id) on delete cascade,
  angle        text not null check (angle in ('front', 'back', 'side', 'other')),
  url          text not null,
  uploaded_by  uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

create index if not exists device_photos_device_idx on public.device_photos (device_id);

alter table public.device_photos enable row level security;

drop policy if exists device_photos_select on public.device_photos;
create policy device_photos_select on public.device_photos
  for select using (auth.role() = 'authenticated');

drop policy if exists device_photos_insert on public.device_photos;
create policy device_photos_insert on public.device_photos
  for insert with check (auth.role() = 'authenticated');

drop policy if exists device_photos_delete on public.device_photos;
create policy device_photos_delete on public.device_photos
  for delete using (public.is_owner());

insert into storage.buckets (id, name, public)
values ('device-photos', 'device-photos', true)
on conflict (id) do nothing;

drop policy if exists "Device photos are publicly accessible" on storage.objects;
create policy "Device photos are publicly accessible" on storage.objects
  for select using (bucket_id = 'device-photos');

drop policy if exists "Staff can upload device photos" on storage.objects;
create policy "Staff can upload device photos" on storage.objects
  for insert with check (bucket_id = 'device-photos' and auth.role() = 'authenticated');

drop policy if exists "Owner can remove device photos" on storage.objects;
create policy "Owner can remove device photos" on storage.objects
  for delete using (bucket_id = 'device-photos' and public.is_owner());
