# Aashray Hospitality Android

Native Android client for the existing Aashray Hospitality API. The backend remains authoritative for authentication, permissions, occupancy, rent, payments, deposits, receipts, and reports. The Android app uses its existing API and does not keep a local business database.

## Implemented screens and workflows

- Login, session restore, and logout through the backend's CSRF protected cookie session.
- Session cookies persisted only as AES-GCM ciphertext with an Android Keystore key; the app does not retain passwords.
- Role and permission-aware navigation for `SUPER_ADMIN` and `STAFF`.
- Live dashboard, property list, property rooms/occupancy/financial summaries, and permission-gated property quick actions.
- Searchable/filterable resident list; add/edit admission form, resident profile, and backend rent preview. New admissions display a confirmation before the backend writes admission, initial rent, and any deposit received.
- Server-backed monthly rent preview and confirmed generation.
- Payment entry with resident and charge selection, allocation, confirmation, idempotency key, payment history, and receipt navigation.
- Branded receipt preview with Android PDF print and system share-sheet support.
- Utility charges, deposit ledger receipt/refund, due reminders, and resident-list actions that prepare overdue rent/utility messages and open WhatsApp for review and manual sending; reports and settings.
- A CSRF interceptor refreshes the backend token and cookie pair before every unsafe API request so billing previews and reminder preparation satisfy the existing Express middleware.
- Loading, empty, offline, and API error states. Financial values and balances remain sourced from the backend.
- Original Aashray logo asset used in the app shell, launcher, and generated receipt PDF.

The app uses the existing API at `https://aashray-hospitality-api.onrender.com/api/` by default. Override it at build time with the `API_BASE_URL` Gradle property (must be HTTPS). The backend currently uses short-lived cookie sessions with a 12-hour absolute lifetime and no refresh-token endpoint; the Android client restores the session cookie from Android Keystore-encrypted storage and sends users back to login when the backend session expires.

## Build a debug APK

Requirements: Android Studio or Android SDK command-line tools, Android API 35, and JDK 17. Open the `android` directory in Android Studio, or run from a PowerShell terminal:

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat testDebugUnitTest assembleDebug
```

If Gradle needs an explicit API URL, pass the base URL including `/api/`:

```powershell
.\gradlew.bat -PAPI_BASE_URL=https://aashray-hospitality-api.onrender.com/api/ assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`. To install it with a connected Android device with USB debugging enabled:

```powershell
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

## Installable release build for device testing

The current `app-release.apk` is signed with a local testing key at `android/aashray-release-testing.jks`; its ignored `android/keystore.properties` file configures Gradle to use it. Keep both files private and back up the keystore if you want future APKs to install as updates over this one. Losing the key means a later APK cannot update this test installation without uninstalling it first.

Connect an Android phone with USB debugging enabled, accept its computer authorization prompt, then run from the `android` directory:

```powershell
adb devices
adb install -r app\build\outputs\apk\release\app-release.apk
```

The release APK was verified with Android `apksigner`. For public production distribution, create a separate production keystore and protect its credentials; do not reuse or publish the local testing key.

## Production release signing preparation

Create a private release keystore outside version control:

```powershell
keytool -genkeypair -v -keystore "$env:USERPROFILE\aashray-release.jks" -alias aashray -keyalg RSA -keysize 2048 -validity 10000
```

Create `android/keystore.properties` locally with the keystore path and credentials (this file is Git-ignored):

```properties
storeFile=C:/Users/your-name/aashray-release.jks
storePassword=your-store-password
keyAlias=aashray
keyPassword=your-key-password
```

Then build with:

```powershell
.\gradlew.bat assembleRelease
```

The release artifact is under `app/build/outputs/apk/release/`. Verify the generated signature with Android SDK `apksigner` before distribution. The repository does not contain a production signing key. The local testing key and credentials are Git-ignored.

## Tests

`app/src/test` contains API-boundary tests for CSRF/session-cookie login, expired-session handling, backend-driven role permissions, payment allocation/idempotency payloads, and resident admission payloads. Run them with:

```powershell
.\gradlew.bat testDebugUnitTest
```
