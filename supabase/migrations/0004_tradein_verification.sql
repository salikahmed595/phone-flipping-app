-- Trade-in support and IMEI/PTA verification audit trail.

-- ---------------------------------------------------------------------------
-- trade-in linkage on sales: the incoming device (if any) and cash difference
-- ---------------------------------------------------------------------------
alter table public.sales
  add column if not exists trade_in_device_id uuid references public.devices (id),
  add column if not exists cash_difference numeric(12, 2);

-- ---------------------------------------------------------------------------
-- verification_checks: an honest audit trail of IMEI/PTA verification
-- attempts. A row here never claims a device is verified unless a real
-- provider actually returned that result — status stays 'unavailable' when
-- no provider is configured, per the PRD's explicit requirement.
-- ---------------------------------------------------------------------------
create table if not exists public.verification_checks (
  id          uuid primary key default gen_random_uuid(),
  device_id   uuid not null references public.devices (id) on delete cascade,
  imei_slot   smallint not null default 1 check (imei_slot in (1, 2)),
  provider    text not null default 'none',
  status      text not null check (status in ('verified', 'inconclusive', 'unavailable', 'error')),
  result      jsonb,
  checked_by  uuid references public.profiles (id),
  checked_at  timestamptz not null default now()
);

create index if not exists verification_checks_device_idx on public.verification_checks (device_id);

alter table public.verification_checks enable row level security;

drop policy if exists verification_checks_select on public.verification_checks;
create policy verification_checks_select on public.verification_checks
  for select using (auth.role() = 'authenticated');

drop policy if exists verification_checks_insert on public.verification_checks;
create policy verification_checks_insert on public.verification_checks
  for insert with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- record_trade_in: owner-only, atomic — sells the outgoing device, creates
-- the incoming device as new inventory at its agreed value, and records the
-- cash difference actually received.
-- ---------------------------------------------------------------------------
create or replace function public.record_trade_in(
  p_outgoing_device_id  uuid,
  p_outgoing_sale_price numeric,
  p_incoming_model      text,
  p_incoming_storage    text,
  p_incoming_imei       text,
  p_incoming_value      numeric,
  p_warranty_days       integer default 7,
  p_buyer_name          text default null,
  p_buyer_contact       text default null
)
returns table (sale_id uuid, incoming_device_id uuid, incoming_device_code text, cash_difference numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_incoming_id uuid;
  v_incoming_code text;
  v_cash_diff numeric;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can record a trade-in';
  end if;

  if p_warranty_days not in (3, 7) then
    raise exception 'Warranty must be 3 or 7 days';
  end if;

  insert into public.devices (model, storage, imei, pta_status, status, purchase_price)
  values (p_incoming_model, p_incoming_storage, p_incoming_imei, 'Non-PTA', 'Purchased', p_incoming_value)
  returning id, device_code into v_incoming_id, v_incoming_code;

  v_cash_diff := p_outgoing_sale_price - p_incoming_value;

  insert into public.sales (device_id, sale_price, warranty_days, warranty_expires_at, buyer_name, buyer_contact, sold_by, trade_in_device_id, cash_difference)
  values (p_outgoing_device_id, p_outgoing_sale_price, p_warranty_days, current_date + p_warranty_days, p_buyer_name, p_buyer_contact, auth.uid(), v_incoming_id, v_cash_diff)
  returning id into v_sale_id;

  update public.devices
    set status = 'Sold', sale_price = p_outgoing_sale_price
  where id = p_outgoing_device_id;

  return query select v_sale_id, v_incoming_id, v_incoming_code, v_cash_diff;
end;
$$;

grant execute on function public.record_trade_in(uuid, numeric, text, text, text, numeric, integer, text, text) to authenticated;
