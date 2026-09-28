import { supabase } from './supabase';
import type { DashboardStats, Device, Expense, Part, Profile, SaleRecord, TradeInResult, VerificationCheck } from './types';

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUp(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return { id: data.id, fullName: data.full_name, role: data.role };
}

// ---------------------------------------------------------------------------
// mappers
// ---------------------------------------------------------------------------
function mapDevice(row: any): Device {
  return {
    uuid: row.id,
    id: row.device_code,
    model: row.model,
    storage: row.storage ?? '',
    imei: row.imei,
    imei2: row.imei2 ?? undefined,
    pta: row.pta_status,
    status: row.status,
    cost: Number(row.purchase_price),
    repair: Number(row.repair_cost),
    tax: Number(row.pta_tax),
    sale: row.sale_price != null ? Number(row.sale_price) : undefined,
    date: row.acquisition_date,
  };
}

function mapExpense(row: any): Expense {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    amount: Number(row.amount),
    date: row.expense_date,
  };
}

function mapPart(row: any): Part {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    unitCost: Number(row.unit_cost),
    quantityInStock: row.quantity_in_stock,
  };
}

// ---------------------------------------------------------------------------
// devices
// ---------------------------------------------------------------------------
export async function fetchDevices(): Promise<Device[]> {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapDevice);
}

export async function addDevice(input: {
  model: string;
  storage?: string;
  imei: string;
  imei2?: string;
  pta: string;
  purchasePrice: number;
}): Promise<Device> {
  const { data, error } = await supabase
    .from('devices')
    .insert({
      model: input.model,
      storage: input.storage || null,
      imei: input.imei,
      imei2: input.imei2 || null,
      pta_status: input.pta,
      purchase_price: input.purchasePrice,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapDevice(data);
}

export async function markReadyForSale(deviceUuid: string): Promise<void> {
  const { error } = await supabase
    .from('devices')
    .update({ status: 'Ready for sale' })
    .eq('id', deviceUuid);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// repairs (goes through the log_repair() RPC so cost + part stock stay atomic)
// ---------------------------------------------------------------------------
export async function logRepair(input: { deviceUuid: string; description: string; cost: number; partId?: string }) {
  const { error } = await supabase.rpc('log_repair', {
    p_device_id: input.deviceUuid,
    p_description: input.description,
    p_cost: input.cost,
    p_part_id: input.partId ?? null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// sales (owner-only; goes through record_sale() RPC)
// ---------------------------------------------------------------------------
export async function recordSale(input: {
  deviceUuid: string;
  salePrice: number;
  warrantyDays?: 3 | 7;
  buyerName?: string;
  buyerContact?: string;
}) {
  const { error } = await supabase.rpc('record_sale', {
    p_device_id: input.deviceUuid,
    p_sale_price: input.salePrice,
    p_warranty_days: input.warrantyDays ?? 7,
    p_buyer_name: input.buyerName ?? null,
    p_buyer_contact: input.buyerContact ?? null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// expenses (owner can read them back; technicians can log but not list)
// ---------------------------------------------------------------------------
export async function fetchExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapExpense);
}

export async function addExpense(input: { title: string; amount: number; category?: string }): Promise<void> {
  const { error } = await supabase.from('expenses').insert({
    title: input.title,
    amount: input.amount,
    category: input.category || 'General',
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// trade-ins (owner-only; atomic via the record_trade_in() RPC)
// ---------------------------------------------------------------------------
export async function recordTradeIn(input: {
  outgoingDeviceUuid: string;
  outgoingSalePrice: number;
  incomingModel: string;
  incomingStorage?: string;
  incomingImei: string;
  incomingValue: number;
  warrantyDays?: 3 | 7;
  buyerName?: string;
  buyerContact?: string;
}): Promise<TradeInResult> {
  const { data, error } = await supabase.rpc('record_trade_in', {
    p_outgoing_device_id: input.outgoingDeviceUuid,
    p_outgoing_sale_price: input.outgoingSalePrice,
    p_incoming_model: input.incomingModel,
    p_incoming_storage: input.incomingStorage ?? null,
    p_incoming_imei: input.incomingImei,
    p_incoming_value: input.incomingValue,
    p_warranty_days: input.warrantyDays ?? 7,
    p_buyer_name: input.buyerName ?? null,
    p_buyer_contact: input.buyerContact ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    saleId: row.sale_id,
    incomingDeviceId: row.incoming_device_id,
    incomingDeviceCode: row.incoming_device_code,
    cashDifference: Number(row.cash_difference),
  };
}

// ---------------------------------------------------------------------------
// IMEI/PTA verification — an honest audit trail. No verification provider
// (PTA DVS, Apple GSX, IMEI.info/Sickw, etc.) is connected yet, so every
// check logs 'unavailable' rather than claiming a result that was never
// actually returned by a real provider, per the PRD's requirement.
// ---------------------------------------------------------------------------
export async function fetchVerificationChecks(deviceUuid: string): Promise<VerificationCheck[]> {
  const { data, error } = await supabase
    .from('verification_checks')
    .select('*')
    .eq('device_id', deviceUuid)
    .order('checked_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    imeiSlot: row.imei_slot,
    provider: row.provider,
    status: row.status,
    result: row.result,
    checkedAt: row.checked_at,
  }));
}

export async function requestVerification(deviceUuid: string, imeiSlot: 1 | 2 = 1): Promise<VerificationCheck> {
  const { data, error } = await supabase
    .from('verification_checks')
    .insert({
      device_id: deviceUuid,
      imei_slot: imeiSlot,
      provider: 'none',
      status: 'unavailable',
      result: { message: 'No verification provider is connected for this workspace yet.' },
    })
    .select('*')
    .single();
  if (error) throw error;
  return { id: data.id, imeiSlot: data.imei_slot, provider: data.provider, status: data.status, result: data.result, checkedAt: data.checked_at };
}

// ---------------------------------------------------------------------------
// sales history (owner-only, via the sales table's RLS) — for reports/trends
// ---------------------------------------------------------------------------
export async function fetchSalesHistory(): Promise<SaleRecord[]> {
  const { data, error } = await supabase
    .from('sales')
    .select('sale_date, sale_price, devices!inner(purchase_price, repair_cost, pta_tax)')
    .order('sale_date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const d = Array.isArray(row.devices) ? row.devices[0] : row.devices;
    const salePrice = Number(row.sale_price);
    const cost = Number(d.purchase_price) + Number(d.repair_cost) + Number(d.pta_tax);
    return { saleDate: row.sale_date, salePrice, profit: salePrice - cost };
  });
}

// ---------------------------------------------------------------------------
// parts
// ---------------------------------------------------------------------------
export async function fetchParts(): Promise<Part[]> {
  const { data, error } = await supabase.from('parts').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map(mapPart);
}

// ---------------------------------------------------------------------------
// dashboard (counts for everyone, financials folded in only for the owner)
// ---------------------------------------------------------------------------
export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('get_dashboard_stats');
  if (error) throw error;
  return data as DashboardStats;
}

// ---------------------------------------------------------------------------
// realtime: keep the device list in sync across owner + technician devices
// ---------------------------------------------------------------------------
export function subscribeToDevices(onChange: () => void) {
  const channel = supabase
    .channel('devices-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
