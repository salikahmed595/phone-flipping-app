-- Flipwise row-level security.
-- These policies are the real enforcement point for the owner / technician
-- split described in the PRD: role checks live here, not just in the UI.

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.parts enable row level security;
alter table public.repairs enable row level security;
alter table public.device_diagnostics enable row level security;
alter table public.expenses enable row level security;
alter table public.sales enable row level security;
alter table public.device_history enable row level security;

-- profiles: everyone can read their own row; owners can read/manage everyone's.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (auth.uid() = id or public.is_owner());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (auth.uid() = id or public.is_owner());
  -- role changes beyond this are blocked by the trg_prevent_role_selfchange trigger

-- devices: any signed-in staff member can view/log/update devices;
-- only the owner can delete a device record outright.
drop policy if exists devices_select on public.devices;
create policy devices_select on public.devices
  for select using (auth.role() = 'authenticated');

drop policy if exists devices_insert on public.devices;
create policy devices_insert on public.devices
  for insert with check (auth.role() = 'authenticated');

drop policy if exists devices_update on public.devices;
create policy devices_update on public.devices
  for update using (auth.role() = 'authenticated');

drop policy if exists devices_delete on public.devices;
create policy devices_delete on public.devices
  for delete using (public.is_owner());

-- parts: staff can see stock; only the owner manages the ledger directly
-- (log_repair() deducts stock through a security-definer function, so
-- technicians can still consume a part during a repair).
drop policy if exists parts_select on public.parts;
create policy parts_select on public.parts
  for select using (auth.role() = 'authenticated');

drop policy if exists parts_write on public.parts;
create policy parts_write on public.parts
  for all using (public.is_owner()) with check (public.is_owner());

-- repairs: staff can log and view repairs; only the owner edits/removes one.
drop policy if exists repairs_select on public.repairs;
create policy repairs_select on public.repairs
  for select using (auth.role() = 'authenticated');

drop policy if exists repairs_insert on public.repairs;
create policy repairs_insert on public.repairs
  for insert with check (auth.role() = 'authenticated');

drop policy if exists repairs_modify on public.repairs;
create policy repairs_modify on public.repairs
  for update using (public.is_owner());

drop policy if exists repairs_delete on public.repairs;
create policy repairs_delete on public.repairs
  for delete using (public.is_owner());

-- device_diagnostics: staff can record and view diagnostic checklist results.
drop policy if exists diagnostics_select on public.device_diagnostics;
create policy diagnostics_select on public.device_diagnostics
  for select using (auth.role() = 'authenticated');

drop policy if exists diagnostics_write on public.device_diagnostics;
create policy diagnostics_write on public.device_diagnostics
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- expenses: this is business-wide P&L data, so only the owner can read it back.
-- Technicians may still record an expense (e.g. a courier fee) but cannot list them.
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select using (public.is_owner());

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert with check (auth.role() = 'authenticated');

drop policy if exists expenses_modify on public.expenses;
create policy expenses_modify on public.expenses
  for update using (public.is_owner());

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
  for delete using (public.is_owner());

-- sales: owner-only end to end, per the PRD ("owner can record sales and
-- review business-wide financial data"; record_sale() also re-checks this).
drop policy if exists sales_all on public.sales;
create policy sales_all on public.sales
  for all using (public.is_owner()) with check (public.is_owner());

-- device_history: read-only audit trail, visible to any signed-in staff member.
drop policy if exists device_history_select on public.device_history;
create policy device_history_select on public.device_history
  for select using (auth.role() = 'authenticated');
