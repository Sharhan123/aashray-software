# Screen-by-Screen Redesign Specification

Each section describes a proposed screen and states to preserve. It does not describe implemented changes.

## 1. Dashboard — Website and Android

**Data:** current business-period dates; active residents; occupied/vacant beds; outstanding balances; distinct overdue residents and overdue RENT balance; current-period rent billed and collected; property summaries; upcoming dues; recent payments.

**Actions:** Add resident, Record payment, Generate rent, Add utility, Remind; open a property; open filtered overdue residents by tapping overdue count or amount.

**States:**
- Loading: compact skeletons and keep nav usable.
- Empty: explain that properties/residents or billing have not been set up; link to the relevant setup action.
- Error/offline: retain last successfully loaded view if safe, show timestamp and explicit refresh; do not turn missing values into ₹0.
- Partial data: render available sections and identify which section could not load.

**Desktop:** compact metric row, property table, overdue/follow-up table. **Mobile:** 2-column metric grid, property cards and an overdue list; keep primary actions above long lists.

## 2. Properties list

**Data:** property, address, occupancy, active residents, current rent billed/collected, outstanding/overdue rent, utility balance.

**Actions:** select property; add/edit/deactivate/delete as allowed; create a property.

**States:** loading, first-property empty state, no matching properties, offline/error with retry, and non-destructive confirmation for deactivate/delete. Explain why an occupied property cannot be deactivated or deleted.

**Desktop:** table or compact cards with aligned metrics. **Mobile:** stacked cards with one clear Open property action; keep edit and destructive actions in overflow.

## 3. Property detail / resident operations

**Data:** property, room/bed inventory, vacancy, active residents, current-period collection, balances, per-resident current rent charge, saved due date, paid amount, balance, status and days past due.

**Actions:** resident search; All/Overdue/Due/Cleared/Vacant filters; open resident; Record payment; Remind; Add resident; Generate rent; Add utility; Add room; view collections/deposits.

**States:** distinguish no residents, no rooms, no rent charges generated for the period, all residents cleared, and load failures. Provide an action for each setup empty state.

**Desktop:** resident table with persistent filters and a property financial header. **Mobile:** resident cards, compact filter chips and contextual action sheet; avoid sending staff to a global page and requiring them to reselect the resident/property.

## 4. Residents list and resident profile

**List data:** resident ID, name, mobile, property, room/bed, status, current-period rent state, balance, due date, days past due.

**List actions:** global search; property/status/rent-state filters; Add resident/import; open profile; payment/reminder actions. Remind appears only when a relevant unpaid charge exists, with type clearly stated.

**Profile data:** resident identity and contacts, current/historical allocation, rent schedules, charge ledger, payment/receipt history, deposit ledger, migration position, messages, audit history.

**Profile actions:** Record payment, Remind, edit resident, update tenancy state, manage deposits, view/download/share receipts. Keep delete behind audited super-admin confirmation.

**States:** no search results, no charges, no payments, no deposit history, inactive/checked-out resident and backend error. Avoid interpreting “no current-period bill” as “paid.”

**Desktop:** table list and profile sections. **Mobile:** searchable list cards and profile sections with sticky primary action bar; full financial history must remain readable without horizontal tables.

## 5. Add/edit resident

**Data:** name/mobile/contact, property, available room and bed, admission date, billing start date, monthly rent, due day, deposit amount/initial receipt and notes. The backend returns the rent preview.

**Actions:** select property first; then show only its available rooms/beds; preview rent; review; save. Editing clearly states when a schedule or room change takes effect.

**States:** loading property/room options, no available bed, preview unavailable, validation error, duplicate submission response, and success with link to resident profile. Retain entered values after a recoverable error.

**Desktop:** grouped sections with a summary panel. **Mobile:** one-column form, native date/number inputs and a sticky review/save action. Do not make users re-enter property after opening Add Resident from a property page.

## 6. Rent generation and charge ledger

**Data:** selected period/property, server preview candidates, schedule, occupancy, eligibility/exclusion reason, already-generated charge, proposed amount, due date, totals.

**Actions:** preview one property or all; inspect exclusions; confirm generation; filter the charge ledger by property, resident, period, type and shared status; adjust only with required reason; export CSV.

**States:** invalid period, preview has no eligible residents, all already billed, stale preview, generation in progress, duplicate-safe completion and API failure. Confirmation must state period, property scope, count and amount.

**Desktop:** preview table and ledger below/alongside. **Mobile:** summary first, candidate cards, explicit scope in every step and paginated ledger.

## 7. Payments and receipts

**Data:** resident, selected outstanding charges and balances, received amount, allocation amount, date, method, reference, notes; backend-saved payment and receipt number.

**Actions:** record fully/partially allocated payment or intentionally unallocated payment; allocate later; reverse only with reason; open, print, download/share receipt.

**States:** no outstanding charges, over-allocation validation, duplicate/idempotent response, payment result uncertain (refresh history before retry), reversed payment, receipt not found, PDF/print/share failure.

**Desktop:** payment form plus searchable history table and receipt dialog. **Mobile:** resident search, charge selector, short form, review confirmation; receipt actions use Android Print/Share and web downloads a PDF.

## 8. Utilities

**Data:** property/resident, utility type, billing period, amount, issue/due dates, notes and idempotency key.

**Actions:** create one utility charge with a final review; access unpaid utility filter and related payment/reminder.

**States:** no resident selected, duplicate utility for resident/type/period, invalid dates/amount, confirmation and saved/error state.

**Desktop:** form in billing context with property preset. **Mobile:** dedicated More tool or property action, with property/resident preselected when launched contextually.

## 9. Reminders

**Data:** resident, relevant property and unpaid charge periods, server-calculated balance, oldest due date, saved template and prepared message.

**Actions:** prepare rent/overdue/utility/custom message; edit workspace template in settings; review resolved text; open WhatsApp; record “opened manually”; return to message history.

**States:** no eligible charges, grace-period-only balance, missing/invalid phone, WhatsApp unavailable, preview loading/error, and prepared/opened status. Do not report successful delivery without provider confirmation.

**Desktop:** allow preparation from both resident rows and a reminder workspace. **Mobile:** an inline resident action opens the resolved preview/WhatsApp handoff without repeating resident selection.

## 10. Deposits, reports and administration

**Deposits:** current held balance plus chronological received/refunded/adjusted ledger; confirmation includes resident, amount, type and resulting balance. Empty, loading, duplicate and over-refund states are explicit.

**Reports:** report name, property, period/date range, preview, export/share. Android should offer native share/export or clearly label on-screen row truncation. Empty and date-range validation states are required.

**Staff/settings:** permission-aware screens; staff activation/reset actions remain audited. Settings includes business identity, accepted methods, utilities, timezone, reminder offsets/template, and integration readiness. Clearly distinguish saved manual template from automated Cloud API delivery.

**Data deletion:** keep out of daily navigation. Show exact target/count, retain required reason/typed confirmation, and clearly distinguish reversible deactivation from irreversible delete/reset.
