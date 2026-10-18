# UX Redesign Implementation Plan

This plan follows the read-only audit. It is not approval to change financial behavior or production data. Preserve current Mongo records and public API compatibility unless a phase below explicitly adds a compatible field/query.

## Phase 0 — Lock down current behavior and definitions

**Work:** document current web/mobile route contracts, permission behavior, reporting timezone, due-date boundaries and all charge kinds. Agree that the desired rule is five *calendar* days in `Asia/Kolkata`, overdue only for `daysPastDue > 5`, with no late fee.

**Acceptance:** product owner confirms meanings for opening balances, due day, timezone boundary, “Paid” when no charge exists, and whether the five-day grace applies only to rent or other charges too. No code/data migration.

## Phase 1 — One backend financial-status service (highest priority)

**Backend:** add a reusable, unit-tested calculation for remaining balance, saved due date, calendar days past due in Asia/Kolkata, grace state, overdue state, and overdue amount. Use the issued charge's `dueAt`. Exclude cleared balances; apply partial and external payments; count distinct residents once; separate RENT from OPENING_BALANCE and UTILITY. No late-fee generation.

**API:** use shared service for `/dashboard`, resident lists, resident profile, `/charges` statuses, reports, property summaries and reminder preparation. Return consistent resident-level filter summaries and period/property scope. Preserve existing response fields while adding clarified fields. Do not infer a due date from today's schedule for issued charges.

**Data migration:** no financial record rewrite should be needed if `dueAt`, payment amounts and charge kinds are present. Review existing legacy/opening-balance dates and null/external-payment fields before migration. Existing stored `Charge.status` values may be stale; derive response status and decide whether to backfill only after a dry-run comparison.

**Tests:** UTC and India-midnight edge tests; due day + 0, +5 and +6 calendar days; month/year boundary; partial/full payment; multiple overdue charges for one resident; opening balance and utility separation; external payment; current-period missing charge.

**Acceptance:** every route and both clients show the same amount/state for identical data. Reconciliation queries compare aggregate totals to individual charge ledger sums.

## Phase 2 — Resident and property operations first

**Backend:** support server-side property-scoped resident list status filters and summaries; query must be indexed/paginated and return only balances needed for the selected status. Add a resident-level quick-action response or reuse current profile/list contract compatibly.

**Website:** add resident action cells for payment/remind; add paid/due/overdue filters; expose overdue dashboard links; make the property page's resident table primary.

**Android:** reuse current resident search/filter; add property-context resident actions and status details; expose profile charges/payments/deposit/receipts. Keep current working property/read workflows.

**Acceptance:** no filter calculated client-only; one resident with several overdue charges appears once; current property selection and search survive opening/closing the profile/action.

## Phase 3 — Navigation and dashboard

**Website:** promote dashboard to landing; consolidate daily pages and move low-frequency admin/report settings to More; render nav using the user's permissions and preserve deep links.

**Android:** adjust five tabs to Home, Properties, Residents, Payments, More; group rent and admin operations in More; surface overdue actions on Home. Only move Rent out of a tab after observing usage.

**Acceptance:** staff only sees reachable permitted modules; deep links remain valid; keyboard/screen reader navigation works; all primary daily actions work at phone and desktop breakpoints.

## Phase 4 — Property-first details

Make resident list the central property content; add vacancy and resident payment states, due-date/day count, contextual payment/reminder actions, and compact room inventory. Make property scope visible and sticky across rent, utility, reports and reminders.

**Acceptance:** from a property detail, staff can find a resident and record payment or prepare reminder without searching a global list or reselecting the property/resident.

## Phase 5 — Finance workflow parity and receipts

Review payment allocation/reversal and ledger adjustment parity. Add Android read/action paths only with explicit permission and audited backend endpoints. Retain idempotency and server authority. Keep receipt PDFs based on saved backend records and branding assets; verify print, download and native share on devices.

**Acceptance:** full/partial/unallocated payment, later allocation, reversal, charge balance and receipt breakdown reconcile exactly with backend ledger; no duplicate submission on retry.

## Phase 6 — Reports, administration, accessibility and release

Add Android report export/share; ensure settings template editing has backend deployment and permission coverage; review destructive flows; align empty/error/offline states and accessibility labels. Run API, UI and Android build/device acceptance suites before release.

**Acceptance:** screen-by-screen acceptance list passes for SUPER_ADMIN and representative STAFF permissions; Android installation/update and API connection verified on a physical device; release signing is reproducible and secret material remains outside source control.

## Cross-cutting requirements

- Keep MongoDB and backend as the single source of truth; no local shadow balances.
- Keep audit events on financial adjustments, payment allocation/reversal, deposit changes, permissions and destructive actions.
- Keep WhatsApp click-to-chat manual until Meta consent/template/webhook/delivery workflow is implemented and audited.
- Add no fake financial/demo figures to completed screens.
- Add migrations only after backed-up dry runs with before/after counts and reconciliation.
- Deploy backend before enabling client UI that requires new response/query fields; use additive compatibility during staged web/mobile releases.

## Release acceptance checklist

- Shared overdue calculations and India calendar tests pass.
- Server route tests cover role and permission gates, property scope and pagination.
- Web tests cover filters, resident actions, confirmations, loading/empty/error states and navigation.
- Android tests cover filtering, permission visibility, reminder preview/handoff, payment confirmation, idempotent retry and receipt navigation.
- Smoke test web and Android against staging with representative rent, partial payment, opening balance, utility, deposit and migration scenarios.
- Database snapshot and reconciliation reviewed before production migration/deploy.
