export type Role = 'owner' | 'technician';

export type PtaStatus = 'PTA Approved' | 'Non-PTA' | 'JV / Carrier Locked';

export type DeviceStatus = 'Purchased' | 'In repair' | 'Ready for sale' | 'Sold';

export type Profile = {
  id: string;
  fullName: string | null;
  role: Role;
  avatarUrl: string | null;
};

export type DeviceHistoryEntry = {
  id: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
};

export type DiagnosticResult = {
  item: string;
  passed: boolean;
  checkedAt: string;
};

export type ActiveWarranty = {
  deviceId: string;
  deviceCode: string;
  model: string;
  saleDate: string;
  warrantyDays: number;
  expiresAt: string;
  daysRemaining: number;
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

export type SaleRecord = {
  saleDate: string;
  salePrice: number;
  profit: number;
};

export type QueuedActionType = 'addDevice' | 'logRepair' | 'addExpense' | 'recordSale' | 'markReadyForSale';

export type VerificationStatus = 'verified' | 'inconclusive' | 'unavailable' | 'error';

export type VerificationCheck = {
  id: string;
  imeiSlot: 1 | 2;
  provider: string;
  status: VerificationStatus;
  result: any;
  checkedAt: string;
};

export type TradeInResult = {
  saleId: string;
  incomingDeviceId: string;
  incomingDeviceCode: string;
  cashDifference: number;
};

export type QueuedAction = {
  id: string;
  type: QueuedActionType;
  payload: any;
  createdAt: number;
  label: string;
};
