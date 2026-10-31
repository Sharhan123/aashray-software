# Android native rework and parity audit

Audit date: 24 October 2026. Android is implemented as a separate Kotlin and Jetpack Compose client using the same authenticated backend as the website. `MainActivity` launches the native app; `WebWorkspace` is not the launcher or the main application UI.

## Native app coverage

| Web area | Android implementation |
|---|---|
| Sign in and permissions | Native sign-in, persisted secure session cookie, server permission checks and role-aware navigation. |
| Dashboard | New branded dashboard aligned with the website, mobile quick actions, amount privacy, rent collection progress, portfolio cards, due-grace and overdue filters, and recent payment links. Rent billed, collected and outstanding cards open their matching report. |
| Properties | Property portfolio and resident/room detail; create, edit, deactivate and audited delete for authorized users; property resident list and property-scoped actions. |
| Residents | Search with server pagination, Active/Notice/Checked-out counts, Paid/Due-in-grace/Overdue filters, CSV preview/import, add/edit, profile and rent preview, messaging, checkout, cycle-rent cancellation, extra-day charges, readmission, full statement PDF and eligible post-checkout deposit refunds. |
| Rooms and beds | Native room inventory, capacity/availability and authorized create, edit and deactivate actions. Resident assignment is handled in the resident admission/readmission workflows. |
| Rent and utilities | Monthly rent preview/generation, rent charge history, utility creation and utility charge history. |
| Payments and deposits | Searchable resident selection, payment review modal, allocation, notes, history, receipt PDF, audited reversal, deposit ledger and refunds. |
| Messages and reminders | Prepare/review WhatsApp reminders; owner reminder create/list/acknowledge/snooze/stop/delete; foreground ringtone alert with stop and snooze actions. |
| Reports | Backend reports with date filters and native shareable PDF/CSV output. |
| Staff and settings | Role-aware staff create/update/access and password reset; business settings and persisted light/dark theme. |
| Mobile navigation and layout | Native bottom navigation, system/back-stack navigation, Compose forms and dialogs, responsive cards and vertically scrolling layouts. |

## Verification and remaining limits

- The new native dashboard and the resident checkout/refund flows are included in the current source.
- `:app:assembleDebug` completed successfully on 24 October 2026 after the latest changes.
- ADB could not start its local server in this environment, so installation, physical-device screenshots, accessibility sizing and back-button behavior still need validation on the owner's device.
- The owner reminder alarm currently rings while the app is active; OS notifications/background ringing after the app is closed are not implemented.
- Native screens follow the website's branding, colors, cards and workflows, with mobile-native navigation and controls. They are not pixel-for-pixel copies of desktop layouts.
- The debug APK is for device testing. Any release APK built with the local test signing configuration is not suitable for public distribution; production distribution requires the protected production signing key.

## Release checklist

1. Install the current debug APK on the target Android device and verify login, dashboard, resident search, payment, checkout/refund, reports, and back navigation.
2. Capture any layout or workflow issues at the device's actual resolution and font scale, then fix and rebuild.
3. Build/sign the production release with the protected release key before publishing.
