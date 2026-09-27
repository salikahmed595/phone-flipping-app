-- Flipwise business logic: triggers, helper functions, and RPCs.

-- ---------------------------------------------------------------------------
-- updated_at bookkeeping
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_devices_updated_at on public.devices;
create trigger trg_devices_updated_at
  before update on public.devices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- created_by defaults (server-set, so a client can't spoof authorship)
-- ---------------------------------------------------------------------------
create or replace function public.set_created_by()
returns trigger
language plpgsql
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_devices_created_by on public.devices;
create trigger trg_devices_created_by
  before insert on public.devices
  for each row execute function public.set_created_by();

drop trigger if exists trg_expenses_created_by on public.expenses;
create trigger trg_expenses_created_by
  before insert on public.expenses
  for each row execute function public.set_created_by();

-- ---------------------------------------------------------------------------
-- device_code assignment (FW-1000, FW-1001, ...)
-- ---------------------------------------------------------------------------
create sequence if not exists public.device_code_seq start 1000;

create or replace function public.set_device_code()
returns trigger
language plpgsql
as $$
begin
  if new.device_code is null then
    new.device_code := 'FW-' || nextval('public.device_code_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_device_code on public.devices;
create trigger trg_set_device_code
  before insert on public.devices
  for each row execute function public.set_device_code();

-- ---------------------------------------------------------------------------
-- device history logging (status / repair_cost / sale_price changes)
-- ---------------------------------------------------------------------------
create or replace function public.log_device_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.device_history (device_id, field_name, old_value, new_value, changed_by)
    values (new.id, 'status', old.status, new.status, auth.uid());
  end if;
  if new.repair_cost is distinct from old.repair_cost then
    insert into public.device_history (device_id, field_name, old_value, new_value, changed_by)
    values (new.id, 'repair_cost', old.repair_cost::text, new.repair_cost::text, auth.uid());
  end if;
  if new.sale_price is distinct from old.sale_price then
    insert into public.device_history (device_id, field_name, old_value, new_value, changed_by)
    values (new.id, 'sale_price', old.sale_price::text, new.sale_price::text, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_device_history on public.devices;
create trigger trg_log_device_history
  after update on public.devices
  for each row execute function public.log_device_history();

-- ---------------------------------------------------------------------------
-- role helper (security definer avoids RLS recursion on profiles)
-- ---------------------------------------------------------------------------
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'
  );
$$;

grant execute on function public.is_owner() to authenticated;

-- ---------------------------------------------------------------------------
-- new auth user -> profile row (first user in the workspace becomes owner)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_role  text;
begin
  select count(*) into v_count from public.profiles;
  v_role := case when v_count = 0 then 'owner' else 'technician' end;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    v_role
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- prevent a non-owner from changing their own (or anyone's) role
-- ---------------------------------------------------------------------------
create or replace function public.prevent_role_selfchange()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_owner() then
    raise exception 'Only an owner can change roles';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_selfchange on public.profiles;
create trigger trg_prevent_role_selfchange
  before update on public.profiles
  for each row execute function public.prevent_role_selfchange();

-- ---------------------------------------------------------------------------
-- log_repair: insert a repair, roll its cost into the device, deduct part stock
-- ---------------------------------------------------------------------------
create or replace function public.log_repair(
  p_device_id  uuid,
  p_description text,
  p_cost       numeric,
  p_part_id    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repair_id uuid;
begin
  insert into public.repairs (device_id, description, cost, part_id, technician_id)
  values (p_device_id, p_description, p_cost, p_part_id, auth.uid())
  returning id into v_repair_id;

  update public.devices
    set repair_cost = repair_cost + p_cost,
        status = case when status = 'Sold' then status else 'In repair' end
  where id = p_device_id;

  if p_part_id is not null then
    update public.parts
      set quantity_in_stock = greatest(quantity_in_stock - 1, 0)
    where id = p_part_id;
  end if;

  return v_repair_id;
end;
$$;

grant execute on function public.log_repair(uuid, text, numeric, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- record_sale: owner-only, atomic sale + warranty countdown
-- ---------------------------------------------------------------------------
create or replace function public.record_sale(
  p_device_id     uuid,
  p_sale_price    numeric,
  p_warranty_days integer default 7,
  p_buyer_name    text default null,
  p_buyer_contact text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can record a sale';
  end if;

  if p_warranty_days not in (3, 7) then
    raise exception 'Warranty must be 3 or 7 days';
  end if;

  insert into public.sales (device_id, sale_price, warranty_days, warranty_expires_at, buyer_name, buyer_contact, sold_by)
  values (p_device_id, p_sale_price, p_warranty_days, current_date + p_warranty_days, p_buyer_name, p_buyer_contact, auth.uid())
  returning id into v_sale_id;

  update public.devices
    set status = 'Sold', sale_price = p_sale_price
  where id = p_device_id;

  return v_sale_id;
end;
$$;

grant execute on function public.record_sale(uuid, numeric, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- dashboard stats: counts for everyone, financials for the owner only
-- ---------------------------------------------------------------------------
create or replace function public.get_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total      int;
  v_ready      int;
  v_repair     int;
  v_purchased  int;
  v_sold       int;
  v_capital    numeric;
  v_revenue    numeric;
  v_device_pl  numeric;
  v_expenses   numeric;
  v_net_profit numeric;
  v_net_last_month numeric;
  result       jsonb;
begin
  select
    count(*) filter (where status <> 'Sold'),
    count(*) filter (where status = 'Ready for sale'),
    count(*) filter (where status = 'In repair'),
    count(*) filter (where status = 'Purchased'),
    count(*) filter (where status = 'Sold')
  into v_total, v_ready, v_repair, v_purchased, v_sold
  from public.devices;

  result := jsonb_build_object(
    'total_devices', v_total,
    'ready_for_sale', v_ready,
    'in_repair', v_repair,
    'purchased', v_purchased,
    'sold', v_sold
  );

  if public.is_owner() then
    select coalesce(sum(purchase_price + repair_cost + pta_tax), 0)
      into v_capital
    from public.devices
    where status <> 'Sold';

    select coalesce(sum(sale_price), 0) into v_revenue from public.sales;

    select coalesce(sum(s.sale_price - d.purchase_price - d.repair_cost - d.pta_tax), 0)
      into v_device_pl
    from public.sales s
    join public.devices d on d.id = s.device_id;

    select coalesce(sum(amount), 0) into v_expenses from public.expenses;

    v_net_profit := v_device_pl - v_expenses;

    select coalesce(sum(s.sale_price - d.purchase_price - d.repair_cost - d.pta_tax), 0)
         - coalesce((select sum(amount) from public.expenses
                     where date_trunc('month', expense_date) = date_trunc('month', current_date) - interval '1 month'), 0)
      into v_net_last_month
    from public.sales s
    join public.devices d on d.id = s.device_id
    where date_trunc('month', s.sale_date) = date_trunc('month', current_date) - interval '1 month';

    result := result || jsonb_build_object(
      'unsold_capital', v_capital,
      'sales_revenue', v_revenue,
      'net_profit', v_net_profit,
      'net_profit_last_month', v_net_last_month
    );
  end if;

  return result;
end;
$$;

grant execute on function public.get_dashboard_stats() to authenticated;
