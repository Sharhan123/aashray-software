# Proposed UX Architecture

This is a proposal from the code audit, not an implemented design. Keep existing APIs and financial records intact while the navigation and common resident workflow are simplified.

## Design principles

1. Start daily work from a property or a resident, not from a collection of backend modules.
2. Put the next useful action beside the record it affects.
3. Show one shared payment state vocabulary, based on the authoritative server calculation.
4. Keep reports, staff, integrations, settings, and destructive administration available but secondary.
5. Keep web and Android terminology and business rules aligned; adapt interaction patterns to each platform.
6. Do not represent opening WhatsApp as a delivered message. Status should remain prepared/opened manually until delivery evidence exists.

## Website navigation

```text
Dashboard
Properties
Residents
Payments
More
  Rent & charges
  Reminders
  Reports
  Staff & permissions
  Settings
```

- Make `/dashboard` the authenticated landing route, subject to permissions.
- Properties and Residents are daily operational destinations. Payments is direct because recording collections is frequent.
- “More” is a grouped navigation section, not a separate data module. Keep deep links/bookmarks for existing routes working.
- Make selected property visible in the shell when within `/properties/:id` or a property-scoped workflow. Provide one “All properties” control.
- Build navigation items from user permissions. The backend remains the authority and must continue checking every endpoint.

## Dashboard structure

1. **Compact summary:** active residents, occupied/vacant beds, outstanding balance, overdue resident count, overdue rent amount, current-month rent collected.
2. **Action row:** Add resident, Record payment, Generate rent, Add utility, Remind overdue residents.
3. **Property overview:** one row/card per property with occupancy, current collection, rent outstanding and overdue count.
4. **Follow-up list:** overdue rent rows first, then dues in grace period and upcoming due items. Each row opens a resident profile and provides Record payment/Remind.
5. **Recent activity:** a restrained recent payments list; avoid duplicating metrics already above.

The overdue count and amount both open the same server-filtered overdue residents view, with the selected property scope retained. Empty states distinguish “no charges generated” from “all charges cleared.”

## Property detail structure

1. Header: property name/address, occupancy, property switcher/back to all properties.
2. Primary action bar: Add resident, Record payment, Generate rent, Add utility; secondary menu for Reminders, Deposits, Collections, Rooms.
3. Compact finance strip: current-period rent billed/collected, overdue rent, utility balance.
4. **Residents are the primary content:** search and filters `All / Overdue / Due (grace) / Cleared`; each row shows resident, room/bed, rent, outstanding rent, status, due date, days past due, and direct Record payment/Remind actions when eligible.
5. Rooms and vacant beds as a secondary collapsible/list section with add-room action.
6. Property history/reports as a secondary route or panel.

For narrow screens, make resident rows stacked cards and place secondary actions in an overflow menu or bottom sheet. Do not hide the resident name, amount, or overdue state.

## Android home and navigation

Retain native Material navigation and a small five-destination bar:

```text
Home | Properties | Residents | Payments | More
```

- Move Rent from a permanent tab into a More section and keep Generate rent as a home/property action. If analytics show rent generation is a daily/high-frequency action, restore it as a tab.
- Home: compact property selector/overview, overdue amount/count, upcoming due residents, and prominent payment/reminder actions.
- Global resident search should be available from Home and Residents without needing to choose property first.
- Property detail should make resident list and payment/reminder actions one tap away.
- More contains Rent & charges, Utilities, Due reminders, Deposits, Reports, Staff (admin only), Settings (permission filtered).
- Preserve Android system patterns: search field, Material filter chips, confirmation dialog for financial writes, system PDF print/share.

## Shared rent state vocabulary

Use server-calculated states, with business timezone `Asia/Kolkata`:

- **Cleared:** charge balance is zero.
- **Upcoming:** due date has not arrived.
- **Due / grace:** due date has passed by 0–5 calendar days and a balance remains.
- **Overdue:** days past due is greater than 5 and a balance remains.
- **No bill:** no charge exists for the requested billing period.

Show the saved charge due date and calendar days past due; do not calculate a new due date from a resident's current schedule for an already-issued charge. Partial payment reduces the displayed balance. Residents with multiple rent charges appear once in the overdue-resident list, while amount is the sum of overdue RENT balances only. Opening balances and utilities need separate labels/filters. No late fee is added.

## Data and integration boundaries

- Keep MongoDB as the sole business/financial store. Both clients call the same API.
- Add a reusable backend overdue query/service and use it for dashboard, property, resident filters, reports, profile summaries, and reminder eligibility.
- Return resident-level overdue summaries (distinct resident count, amount, oldest due date, days past due) with the filtered list rather than reproducing calculations in each client.
- Preserve existing route paths during the first rollout; add query options or response fields compatibly. Keep idempotency keys on financial writes.
- Template edits remain workspace settings. Preview the resolved message before WhatsApp handoff. Manual opening must never set a delivered state.
