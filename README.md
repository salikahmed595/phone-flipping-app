# Flipwise — phone flipping app

A white and purple, mobile-first Expo/React Native app based on the Phone Flipping App PRD, backed by a real Supabase project (Postgres + Auth + Row Level Security).

## Run

```bash
npm install
cp .env.example .env   # then fill in your Supabase project URL + anon key
npm start
```

Open with Expo Go on a phone, an Android/iOS simulator, or press `w` for a browser preview. `npm run typecheck` checks the TypeScript source.

## Backend setup (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run the three files under `supabase/migrations/` **in order**:
   - `0001_core_schema.sql` — tables (profiles, devices, parts, repairs, diagnostics, expenses, sales, device history)
   - `0002_functions_triggers.sql` — device-code assignment, audit trail, `log_repair()`, `record_sale()`, `get_dashboard_stats()` RPCs
   - `0003_rls_policies.sql` — row-level security, the real owner/technician enforcement
3. Optionally run `supabase/seed.sql` for sample inventory once you've signed up your first user.
4. Copy your project's **URL** and **anon public key** (Project Settings → API) into `.env`.
5. Sign up inside the app — the **first account created becomes the owner** automatically; every account after that is a technician until an owner promotes them (update their `role` in the `profiles` table).

### How the roles are enforced

Role checks live in Postgres, not just in the UI, per the PRD's requirement:

- `devices`, `repairs`, `parts`, `device_diagnostics` — any signed-in staff member can read/log; only the owner can delete.
- `expenses` — any staff member can insert (e.g. a courier fee), but only the owner can list them back or edit/delete.
- `sales` — owner-only end to end; also re-checked inside the `record_sale()` function.
- `get_dashboard_stats()` — returns device counts to everyone, but only folds in net profit / revenue / unsold capital when the caller is the owner.
- A `prevent_role_selfchange` trigger blocks a technician from promoting themselves, even via a direct API call.

### Business logic as database functions

- `log_repair(device_id, description, cost, part_id?)` — inserts the repair, rolls the cost into the device, deducts one unit from the part's stock — atomically.
- `record_sale(device_id, sale_price, warranty_days?, buyer_name?, buyer_contact?)` — owner-only; marks the device sold and starts the 3- or 7-day warranty countdown.
- Per-device profit: `sale_price - (purchase_price + repair_cost + pta_tax)`, computed live in `get_dashboard_stats()`.
- A `device_code` (e.g. `FW-1024`) is assigned automatically on insert.

## Included in this build

- Real email/password auth (Supabase Auth) gating the whole app.
- Owner dashboard with live net profit, sales revenue, unsold capital, inventory status, and quick actions — sourced from the database, not local state.
- Technician view that hides overall financial metrics and sale controls (enforced server-side, not just hidden in the UI).
- Inventory search, status filters, device detail and cost breakdown.
- Add phone with two IMEI inputs, PTA selection and purchase price; log repair and general expense; mark ready and record sale — all persisted to Supabase.
- Realtime sync: device and sale changes made on one device (owner or technician) refresh every other connected session.
- Activity list, responsive desktop sidebar and mobile bottom navigation.

## Scope and limitations

This build covers the PRD's core workflow: auth + roles, device CRUD with IMEI/PTA fields, repairs with a parts ledger, general expenses, sales with profit calculation, and owner analytics. Not yet built: verification-provider integrations (PTA/Apple/Google), camera OCR, QR labels, PDF receipts/WhatsApp sharing, trade-in workflow, aged-inventory flags, CSV export, and true offline queuing (Supabase's client caches reads but writes still require connectivity). The manual diagnostic checklist on the device screen is a UI-only preview and is not yet saved to `device_diagnostics`.
