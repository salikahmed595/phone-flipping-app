-- Optional sample data, mirroring the placeholder devices/expenses that used
-- to live in App.tsx's local state. Run this after you've signed up your
-- first user (who becomes the workspace owner automatically).

insert into public.parts (name, sku, unit_cost, quantity_in_stock) values
  ('OLED screen assembly', 'PRT-SCR-01', 12000, 6),
  ('Battery pack', 'PRT-BAT-01', 4500, 10),
  ('Fingerprint sensor module', 'PRT-FPS-01', 3200, 4)
on conflict (sku) do nothing;

insert into public.devices (device_code, make, model, storage, color, imei, imei2, pta_status, status, purchase_price, repair_cost, pta_tax, sale_price, acquisition_date) values
  ('FW-1024', 'Apple',  'iPhone 14 Pro',    '256 GB', 'Deep Purple', '358240112345678', null, 'PTA Approved',        'Ready for sale', 145000, 8500, 0,    null,   '2026-09-24'),
  ('FW-1023', 'Google', 'Pixel 8',          '128 GB', 'Obsidian',    '359176234567890', null, 'Non-PTA',             'In repair',      78000,  4500, 0,    null,   '2026-09-20'),
  ('FW-1022', 'Apple',  'iPhone 13',        '128 GB', 'Starlight',   '356892345678901', null, 'PTA Approved',        'Sold',           96000,  3500, 0,    118000, '2026-09-18'),
  ('FW-1021', 'Google', 'Pixel 7 Pro',      '128 GB', 'Hazel',       '357521456789012', null, 'JV / Carrier Locked', 'Purchased',      61000,  0,    0,    null,   '2026-09-12')
on conflict (imei) do nothing;

insert into public.sales (device_id, sale_price, warranty_days, warranty_expires_at, sale_date)
select id, 118000, 7, '2026-09-25'::date, '2026-09-18'
from public.devices where device_code = 'FW-1022'
on conflict (device_id) do nothing;

insert into public.expenses (title, category, amount, expense_date) values
  ('Courier delivery', 'Shipping', 1200, '2026-09-23')
on conflict do nothing;

-- keep future auto-generated device codes clear of the seeded FW-102x range
select setval('public.device_code_seq', 2000, false);
