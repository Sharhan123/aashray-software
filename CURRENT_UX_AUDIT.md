# Aashray Hospitality — Current UX Audit

**Scope:** read-only inspection of the React website, native Android app, Express API, and Mongoose models in this repository. No application code or business data was changed for this audit. The website and Android project are both present in this workspace; they are not being treated as separate repositories.

## Executive summary

The product has a substantial working backend and two clients, but the clients do not expose the same capabilities. The website has ten top-level navigation entries and detailed finance and administration pages. Android has five bottom tabs and routes secondary operations through a separate Operations screen. Android supports daily resident, rent, payment, receipt, utility, deposit, reminder, and report flows, but it does not expose property or room creation, payment reversal, charge adjustment, or resident deletion.

The highest-risk usability and data-trust issue is the inconsistent overdue definition. The general charge status, dashboard, resident profile, website charge filters, and reports treat a partially unpaid charge as overdue as soon as its saved due timestamp passes. Reminder preparation and the Android current-month resident filter use a five-day elapsed-time cutoff. The Android filter is limited to the selected/current rent period, while dashboard/profile totals include rent and opening-balance charges across periods. These surfaces can disagree for the same resident.

## Existing navigation and screens

### React website

All business routes are behind the authenticated `ProtectedRoute` and share `AppShell`. The sidebar contains ten static links and is not filtered by permission:

| Route | Screen |
|---|---|
| `/` | Properties list and property creation |
| `/dashboard` | Live dashboard |
| `/properties/:id` | Property workspace |
| `/residents` | Resident search, filters, creation, CSV import |
| `/residents/:id` | Resident record, ledger, allocation history, deposits, migration and audit |
| `/rooms` | Room and bed inventory |
| `/billing` | Rent generation, charge ledger, utility creation and adjustments |
| `/payments` | Payment entry, payment history, allocation, reversal and receipt PDF |
| `/messages` | Reminder preparation, preview, WhatsApp handoff and message history |
| `/reports` | CSV report exports |
| `/staff` | Staff accounts, permissions, activation and password reset |
| `/settings` | Business details, reminder offsets, methods, utilities and WhatsApp readiness |

`/` is the default route and is the Properties page, not the dashboard. This makes the dashboard a separate destination despite having a broad metric overview. Every route is rendered inside the shell, whose sidebar also repeats “All properties” as a workspace link.

### Native Android

Android uses Compose Navigation, permission-filtered bottom tabs, a top bar with sign-out, and secondary tools under Operations. The tab set is Home, Properties, Residents, Rent, Payments; tabs are omitted if the user lacks their associated permission. Operations tools include Utility billing, Due reminders, Security deposits, Reports, and Settings.

| Screen | Verified behavior |
|---|---|
| Login | Existing backend session login, session restore, and logout; credentials are not persisted as plaintext. |
| Home | Backend dashboard metrics, upcoming dues, recent payments, links to properties and Operations. |
| Properties | Property cards with room/bed/resident counts and financial totals. No add/edit/deactivate UI. |
| Property detail | Financial summary, rooms, resident list, and quick links to resident list, admission, payment, rent, utility, and reminders. No resident status/payment filters or per-row payment/reminder actions here. |
| Residents | Search, resident status chips, current-period rent chips (All/Paid/Overdue), cards with room/bed/rent/outstanding and rent/utility reminder actions. |
| Resident profile | Details, current room and rent, balance metrics, allocation history, edit action. It does not render the full charges, payment, receipt, deposit transaction, or audit history available on web. |
| Add/edit resident | Property, room, bed, rent schedule, due day, billing start, admission details and deposit; server rent preview and confirmation before admission. |
| Rent | Period and optional property selection; server preview, eligibility summary and explicit confirmation before generation. |
| Payments | Resident search, amount, method/date/reference, optional charge allocation, review confirmation, saved history and receipt navigation. |
| Receipt | Backend receipt detail with payment breakdown; create PDF for Android Print or system Share. |
| Utility billing | Resident, type, period, amount, issue/due dates, review and confirmation. |
| Reminders | Resident and type selection, custom message input, preview, WhatsApp click-to-chat handoff and recent message history. The staff member sends manually. |
| Security deposits | Resident ledger balance/history and confirmed deposit receipt/refund entry. |
| Reports | Select report and date range, display up to 200 rows in the app. |
| Settings | Business settings are backend-backed and editable only with settings permission; reminder template configuration exists in local project code. |

### Backend and financial data

The API is the source of truth. There is one MongoDB model set; Android does not maintain financial balances independently. Money is stored in integer paise. Financial writes are generally protected with permission middleware, audited, and where needed wrapped in MongoDB transactions. Payments and utility/admission flows include idempotency protection.

| Area | Actual implementation |
|---|---|
| Identity and access | `User` has `SUPER_ADMIN` and `STAFF`; staff permissions are explicit strings. Session and CSRF middleware guard writes. Backend permission checks are authoritative. |
| Property/rooms | Property and room CRUD, active/deactivate rules, bed occupancy constraints, explicit legacy-room-to-property assignment. |
| Residents | Search/sort/paging, lifecycle states, room allocations and rent schedules, admission, edit, status update, resident profile, migration/opening-position workflow, CSV import preview/commit, deletion. |
| Rent | Period-specific eligibility preview and generation, schedule effective dates, skip existing rent charge, migration credits/external settlement. |
| Charges/utilities | Rent, utility, and opening-balance charges; charge ledger, CSV export, adjustment with reason/audit record. |
| Payments | Partial/full payment, optional allocation, later allocation, reversal with reason, receipt record and allocation breakdown. Unallocated balance is represented explicitly. |
| Deposits | Append-only received/refunded/adjusted transaction model and computed balance. |
| Reminders | Prepared messages are logged; manual WhatsApp click-to-chat URL; opened status means opened manually, not delivery. Cloud API automation is deliberately disabled. |
| Dashboard/reports | Server aggregates for occupancy, billed/collected/outstanding/overdue, utilities, upcoming dues and recent activity. CSV reports include residents, occupancy, rent, overdue, collections, outstanding, utilities and admissions. |
| Data deletion | Super-admin destructive endpoints exist for resident/property deletion and operational-data reset; UI uses custom in-app confirmation/dialogs and toasts. |

## Current overdue/rent status behavior — critical inconsistency

The requested business rule in the redesign brief is **five calendar days of grace in `Asia/Kolkata`, overdue only when days past due is greater than five, with no late fee**. The inspected implementation does not apply that rule consistently:

1. `server/src/services/billingRules.ts` `chargeStatus()` considers any unpaid charge overdue when `dueAt < now`.
2. `server/src/services/financialCalculations.ts` `residentFinancialSummary()` adds balances for RENT and OPENING_BALANCE to overdue rent when their due timestamp is before now; it has no grace period.
3. `server/src/routes/workspaceRoutes.ts` dashboard overdue aggregate uses `dueAt < now` and includes RENT plus OPENING_BALANCE.
4. `server/src/routes/financeRoutes.ts` `/charges?status=OVERDUE` and `/reports/overdue` use a strict timestamp-before-now rule.
5. Reminder preparation selects charges more than five **24-hour periods** past `dueAt`. That is a rolling 120-hour cutoff, not a five-calendar-day comparison in the business timezone.
6. Android resident chips query `rentPaymentStatus` for the current billing period, with an elapsed-five-day cutoff. “Paid” means a full current-period RENT charge exists and is fully covered; residents without a current-period charge are not included in Paid.
7. The website Residents filter `Has outstanding` is across outstanding charge balances and is not a rent-only or overdue-resident filter. The website dashboard's Overdue rent metric is not a link and there is no overdue-resident count.
8. Resident cards expose total outstanding, not rent-only outstanding or days past due. The property detail view similarly shows aggregate balances and has no days-past-due field.

**Impact:** staff may see different overdue amounts in Dashboard, Billing, Resident profile, Android resident filters, and WhatsApp preparation. A resident can appear overdue on one screen but not qualify for an overdue reminder. The brief's calendar-day definition should be consolidated into one tested backend calculation and used by all queries/aggregates before redesign acceptance.

## Feature inventory

Legend: **Built** means an end-to-end flow exists in code; **Partial** means the core exists but the client or behavior is incomplete/inconsistent; **Missing** means no usable flow was found in the inspected Android/web client.

| Feature | Web | Android | Notes |
|---|---|---|---|
| Authentication/permissions | Built | Built | Backend enforces permissions; website renders static navigation and may expose links that return permission errors. |
| Dashboard | Built | Built | No clickable overdue count/list; no distinct overdue-resident count. Metric semantics differ from property page. |
| Properties list/detail | Built | Partial | Android reads list/detail but cannot manage property records. Property page's main action set is spread across links. |
| Rooms/beds | Built | Partial | Android property detail shows rooms; no rooms inventory/create/edit flow. |
| Resident search/list | Built | Built | Web has state/room/outstanding/sort filters; Android has state and current-month rent filter. Rent API feature is recent local code and requires deployment to work in a hosted environment. |
| Resident add/edit | Built | Built | Both ask billing start, room/bed and rent; web additionally offers CSV import. |
| Resident profile/history | Built | Partial | Web exposes charges/payments/receipts/deposit/audit/migration. Android exposes summary and allocation history, not full ledgers. |
| Resident deletion | Built | Missing | Web only, with destructive reason confirmation. |
| Monthly rent preview/generation | Built | Built | Both property scope or all-property generation, server preview and confirmation. |
| Charge ledger/adjustment/export | Built | Missing | Web supports filtering, adjusting with reason and CSV export. Android only generates rent and creates utility charges. |
| Payment record/full/partial allocation | Built | Built | Both support allocations, but unallocated-by-default is easy to choose. Android has payment confirmation. |
| Payment reallocation/reversal | Built | Partial | Web has both; Android has no equivalent actions. |
| Receipt view/PDF | Built | Built | Web downloads branded PDF; Android supports PDF print/share. |
| Utility charge | Built | Built | Both have entry; Android adds a review/confirmation step. |
| Security deposits | Built | Built | Web ledger is embedded in resident detail; Android is under Operations. |
| Reminder preparation | Built | Built | Web and Android support custom messages, preview, WhatsApp manual handoff, history. Resident-list quick action exists on Android but not on web. |
| Reminder template settings | Partial | Partial | A rent template field is in current local app/backend code. Hosted behavior depends on deploying the backend settings schema/API changes; no evidence of current production deployment was available in this audit. |
| Reports | Built | Partial | Web CSV export; Android on-screen preview only, capped to 200 rows and no download action. |
| Staff management | Built | Missing | Native app has no staff management screen. |
| Workspace settings | Built | Partial | Web has wider settings; Android shows a subset. |
| Data reset/admin delete | Built | Missing | Web danger zone only. |

## UX issues ranked by severity

### Critical

1. **Overdue rules disagree across product surfaces.** See the detailed list above. This is a trust and collections issue, not just terminology.
2. **No direct overdue residents access from Dashboard.** Amount is displayed without a clickable path or distinct count, forcing staff to reconstruct the list through a different module.
3. **Website resident list cannot send a reminder directly.** The operator must leave the list and manually find the person again in Reminders & Messages.

### High

4. **Property page is a launch pad, not a resident operations workspace.** Its quick actions, aggregate metrics, room table, and resident table are separated; resident rows do not offer payment/reminder actions or payment status/day count.
5. **Web navigation is crowded and duplicates workflow entry points.** Ten sidebar items include infrequent reports, settings, and staff alongside daily tasks; property contextual links repeat those destinations.
6. **Resident list filters conflate “balance” and “rent status.”** The web `outstanding` filter is any charge balance. Android's rent filters are current-period-only. Neither currently offers the exact brief's unified All/Overdue/Due/Cleared/Vacant property filters.
7. **Android resident profile is too shallow for finance follow-up.** It has summary totals and allocation history but not the resident's charge and payment ledgers, receipt links, deposit transactions, or reminder history.
8. **Android property/room administration is incomplete.** Owner work requires switching to the website for create/edit/deactivate and bed inventory.
9. **Permission affordances are inconsistent.** Android filters tabs/tools by permission. Web sidebar and route elements are static after authentication; API permissions still block writes/reads, so staff can encounter denied requests after opening visible links.

### Medium

10. **Rent generation and adjustment live in a finance ledger page.** This is understandable to finance users but creates extra navigation from property operations and makes property scope easy to overlook.
11. **Rent data uses period, due date, charge kind, and status in different filters.** Period fields are mixed with free date ranges; the meaning of “overdue rent” can be unclear when opening balances and utilities appear in adjacent reports.
12. **Android Reports are a reader rather than an export workflow.** Only the first 200 rows render; no local export/share is offered.
13. **Android's broad actions are split between tabs and Operations.** Utility/reminders/deposits/reports/settings require finding the Operations route from Home; contextual property actions help but open separate flows.
14. **Website and mobile terminology differs in detail.** “Rent & Billing,” “Rent,” “Due reminders,” “Overdue rent,” “Outstanding,” and “Past due rent” are used for related but not always equivalent concepts.

## Evidence locations

- Website routes/navigation: `client/src/App.tsx`, `client/src/shell/AppShell.tsx`.
- Website workflows: `client/src/pages/BusinessPages.tsx`.
- Android navigation and permissions: `android/app/src/main/java/com/aashray/hospitality/ui/AashrayApp.kt`.
- Android UI/state/API: `android/app/src/main/java/com/aashray/hospitality/ui/` and `android/app/src/main/java/com/aashray/hospitality/data/`.
- Backend endpoints: `server/src/routes/propertyRoutes.ts`, `propertyManagementRoutes.ts`, `financeRoutes.ts`, `workspaceRoutes.ts`, and `dataDeletionRoutes.ts`.
- Financial logic: `server/src/services/billingRules.ts`, `financialCalculations.ts`, `billingService.ts`, and `paymentRules.ts`.
- Data model: `server/src/models/`.
