# Product Requirements Document (PRD)
## Phone Flipping & Inventory Management App

### Product overview

- **Target platforms:** iOS and Android from one cross-platform codebase.
- **Version control:** GitHub.
- **Data architecture:** Cloud-synced database, such as Supabase, Firebase, or a custom API.

The app manages the end-to-end lifecycle of a phone flipping business, with dedicated workflows for Google Pixel and iPhone devices. It tracks acquisition, diagnostics, repairs, PTA compliance, operating expenses, sales, and profit or loss. The experience should prioritize simple data entry, clear inventory status, and WhatsApp-ready documentation.

## 1. Users and permissions

### Admin / owner

The owner can manage employee accounts, all inventory, overall analytics, total profit and loss, and CSV exports. The owner can record sales and review business-wide financial data.

### Technician / employee

Technicians can log incoming devices, update repair and diagnostic status, enter itemized repair costs, and mark devices ready for sale. Technicians must not see overall business profit and loss. Role restrictions must be enforced in the backend, not merely hidden in the interface.

## 2. Experience and design

- Use a minimalist, card-based mobile interface. Avoid dense tables on phone screens.
- Support native light and dark modes. The primary light-mode visual direction is white with purple accents.
- Provide quick actions to add a device or expense.
- Support a home-screen “+” widget and long-press app shortcuts for “Add Expense” and “Log New Phone”.
- Offer camera OCR to capture a 15-digit IMEI or serial number from a phone or box. Let the user review and correct the extracted value before saving.
- Generate a unique QR code for each logged device. Support thermal-label printing and scanning to open its profile and repair history.

## 3. Inventory and device records

Users must be able to add, edit, and search devices. Each device record should include:

- Make, model, storage capacity, serial number, IMEI 1, and optional IMEI 2.
- Independent PTA status and tax information for each IMEI slot.
- PTA status: PTA Approved, Non-PTA, or JV / Carrier Locked.
- Software status: OEM Unlocked, Bootloader Locked (including Verizon-locked), or Factory Image Flashed.
- Lifecycle status: Purchased, In Repair, Ready for Sale, or Sold.
- Acquisition date, purchase price, and initial condition.
- Before and after condition photographs.
- Unique internal device ID, QR label, and history of changes.

## 4. Device verification

After an IMEI is scanned or entered, the app should request and save verification results where an authorized integration is available:

- PTA Device Verification System: local Pakistan approval or tax status.
- Apple-related status provider, such as an authorized iUnlocker/GSX service, for supported iPhone checks.
- Google Pixel-related provider, such as IMEI.info or Sickw, for supported carrier lock, warranty, and original purchase country checks.

Display the provider, result, and time checked. Do not claim a device is verified when a provider is unavailable or returns an inconclusive result.

## 5. Repairs, parts, taxes, and expenses

- Log each repair or refurbishment action with description, date, technician, part, and exact cost.
- Include a mandatory Pixel diagnostic checklist informed by Google's device diagnostics (*#*#7287#*#*), covering UDFPS calibration, screen burn-in, and battery cycles. Record results rather than implying the app itself performs the hardware tests.
- Maintain a spare-parts ledger for bulk-purchased items such as screens and batteries. Selecting a part for a repair deducts one unit from parts stock and adds its cost to that device.
- Keep PTA Tax Paid separate from hardware repair costs and record it against the relevant IMEI slot.
- Log general operating expenses, such as tools, platform fees, and shipping, separately from device costs.

**Per-device net profit or loss:**

`Final sale price - (Purchase price + total repair costs + PTA tax paid)`

**Overall net profit or loss:**

`Sum of sold-device net profits - general business expenses`

## 6. Sales and customer workflows

- Generate an editable, emoji-friendly marketplace listing with model, storage, condition, PTA status, and battery health for Facebook Marketplace or OLX.
- Support a trade-in or exchange by recording the outgoing sale, creating the incoming device as inventory at its agreed value, and calculating the cash difference received.
- Generate PDF sale receipts, purchase agreements, and repair quotes. Offer one-tap sharing through WhatsApp using a supported share/deep-link flow.
- When a device is sold, let the owner choose a 3-day or 7-day checking warranty. Show active warranties and their remaining time on the owner dashboard.

## 7. Owner analytics and reporting

- Show overall profit and loss based on sold devices and general expenses.
- Show capital tied up in unsold inventory.
- Flag unsold devices aged 15, 30, or 60+ days.
- Show monthly revenue, expense, and net-profit trends.
- Export financial and inventory reports in CSV or Excel-compatible format.
- Restrict all business-wide financial reports and exports to the owner.

## 8. Technical requirements

- Use React Native or Flutter so one codebase can produce Android and iOS builds.
- Use a real-time cloud database through Supabase, Firebase, or a custom backend so authorized employee devices stay in sync.
- Manage source code and changes in GitHub.
- Cache essential records locally. Allow technicians to record repairs and attach photos offline, then synchronize pending changes when connectivity returns.
- Resolve sync conflicts without silently discarding an employee's changes.
- Store photos and sensitive device identifiers securely and enforce permissions server-side.

## 9. Acceptance criteria

- An owner can add, search, edit, repair, sell, and review a device's history and profit.
- A technician can log and update a device but cannot access overall P&L or restricted exports.
- PTA status and tax paid can be recorded independently for IMEI 1 and IMEI 2.
- A repair using an inventoried part updates both parts stock and device costs.
- General expenses affect overall profit but do not change a specific device's profit.
- A sale starts the selected warranty countdown and appears in owner reporting.
- Offline repair entries and photos remain available and synchronize after reconnection.
- Verification results are labeled with their source and never presented as verified without a completed check.