export type Role = 'owner' | 'technician';

export type PtaStatus = 'PTA Approved' | 'Non-PTA' | 'JV / Carrier Locked';

export type DeviceStatus = 'Purchased' | 'In repair' | 'Ready for sale' | 'Sold';

export type Profile = {
  id: string;
  fullName: string | null;
  role: Role;
};

export type Device = {
  uuid: string;
  id: string; // device_code, e.g. FW-1024 (kept as `id` so the existing UI keeps working)
  model: string;
  storage: string;
  imei: string;
  imei2?: string;
  pta: PtaStatus;
  status: DeviceStatus;
  cost: number; // purchase_price
  repair: number; // repair_cost
  tax: number; // pta_tax
  sale?: number; // sale_price
  date: string; // acquisition_date
};

export type Expense = {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
};

export type Part = {
  id: string;
  name: string;
  sku: string | null;
  unitCost: number;
  quantityInStock: number;
};

export type DashboardStats = {
  total_devices: number;
  ready_for_sale: number;
  in_repair: number;
  purchased: number;
  sold: number;
  unsold_capital?: number;
  sales_revenue?: number;
  net_profit?: number;
  net_profit_last_month?: number;
};
