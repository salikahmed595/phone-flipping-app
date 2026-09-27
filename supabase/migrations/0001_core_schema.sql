-- Flipwise core schema
-- Profiles, devices, repairs, parts, expenses, sales, device history.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles (one row per auth.users, carries the app role)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  role        text not null default 'technician' check (role in ('owner', 'technician')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- devices
-- ---------------------------------------------------------------------------
create table if not exists public.devices (
  id                uuid primary key default gen_random_uuid(),
  device_code       text unique, -- e.g. FW-1024, assigned by trigger if left null
  make              text,
  model             text not null,
  storage           text,
  color             text,
  imei              text not null unique check (imei ~ '^\d{15}$'),
  imei2             text unique check (imei2 is null or imei2 ~ '^\d{15}$'),
  pta_status        text not null default 'PTA Approved' check (pta_status in ('PTA Approved', 'Non-PTA', 'JV / Carrier Locked')),
  software_status   text check (software_status in ('OEM Unlocked', 'Bootloader Locked', 'Factory Image Flashed')),
  condition_notes   text,
  status            text not null default 'Purchased' check (status in ('Purchased', 'In repair', 'Ready for sale', 'Sold')),
  purchase_price    numeric(12, 2) not null check (purchase_price >= 0),
  repair_cost       numeric(12, 2) not null default 0 check (repair_cost >= 0),
  pta_tax           numeric(12, 2) not null default 0 check (pta_tax >= 0),
  sale_price        numeric(12, 2),
  acquisition_date  date not null default current_date,
  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists devices_status_idx on public.devices (status);
create index if not exists devices_imei_idx on public.devices (imei);

-- ---------------------------------------------------------------------------
-- spare parts ledger (bulk-purchased items such as screens and batteries)
-- ---------------------------------------------------------------------------
create table if not exists public.parts (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  sku                text unique,
  unit_cost          numeric(12, 2) not null default 0,
  quantity_in_stock  integer not null default 0 check (quantity_in_stock >= 0),
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- repairs (itemized repair / refurbishment actions against a device)
-- ---------------------------------------------------------------------------
create table if not exists public.repairs (
  id             uuid primary key default gen_random_uuid(),
  device_id      uuid not null references public.devices (id) on delete cascade,
  description    text not null,
  cost           numeric(12, 2) not null check (cost >= 0),
  part_id        uuid references public.parts (id),
  technician_id  uuid references public.profiles (id),
  repair_date    date not null default current_date,
  created_at     timestamptz not null default now()
);

create index if not exists repairs_device_idx on public.repairs (device_id);

-- ---------------------------------------------------------------------------
-- diagnostics (Pixel/iPhone manual diagnostic checklist results)
-- ---------------------------------------------------------------------------
create table if not exists public.device_diagnostics (
  id             uuid primary key default gen_random_uuid(),
  device_id      uuid not null references public.devices (id) on delete cascade,
  item           text not null,
  passed         boolean not null default false,
  technician_id  uuid references public.profiles (id),
  checked_at     timestamptz not null default now(),
  unique (device_id, item)
);

-- ---------------------------------------------------------------------------
-- general operating expenses (not tied to a specific device)
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category      text not null default 'General',
  amount        numeric(12, 2) not null check (amount >= 0),
  expense_date  date not null default current_date,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- sales (owner-recorded; one sale per device)
-- ---------------------------------------------------------------------------
create table if not exists public.sales (
  id                  uuid primary key default gen_random_uuid(),
  device_id           uuid not null unique references public.devices (id) on delete cascade,
  sale_price          numeric(12, 2) not null check (sale_price >= 0),
  warranty_days       integer not null default 7 check (warranty_days in (3, 7)),
  warranty_expires_at date,
  buyer_name          text,
  buyer_contact       text,
  sold_by             uuid references public.profiles (id),
  sale_date           date not null default current_date,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- device history (lightweight audit trail of status / cost changes)
-- ---------------------------------------------------------------------------
create table if not exists public.device_history (
  id           uuid primary key default gen_random_uuid(),
  device_id    uuid not null references public.devices (id) on delete cascade,
  field_name   text not null,
  old_value    text,
  new_value    text,
  changed_by   uuid references public.profiles (id),
  changed_at   timestamptz not null default now()
);

create index if not exists device_history_device_idx on public.device_history (device_id);
