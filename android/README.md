# Aashray Hospitality Android

The Android client is a native Kotlin application built with Jetpack Compose. It talks to the same authenticated backend as the web client, but renders native Android screens, bottom navigation, dialogs, forms, and lists. It does not load the React website in a WebView.

The native implementation is being brought up to date with the web product. See [ANDROID_PARITY_AUDIT.md](ANDROID_PARITY_AUDIT.md) for the current feature inventory, gaps, and verification status. Production data and financial calculations remain server-backed.

## Build a debug APK

Requirements: Android Studio or Android SDK command-line tools, Android API 35, and JDK 17. Open the `android` directory in Android Studio, or run from PowerShell:

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat testDebugUnitTest assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`. To install it on a connected Android device with USB debugging enabled:

```powershell
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

## Installable release build for device testing

The local `app-release.apk` is signed with a testing key configured in the ignored `keystore.properties` file. Keep the keystore private and backed up if you want future test APKs to install as updates. Losing the key means a later APK cannot update this test installation without uninstalling it first.

Connect an Android phone with USB debugging enabled, accept its computer authorization prompt, then run from the `android` directory:

```powershell
adb devices
adb install -r app\build\outputs\apk\release\app-release.apk
```

For public distribution, create a separate production signing key and protect its credentials. Do not reuse or publish the local testing key.

## Tests

The Android module has API boundary tests for session handling, permission payloads, payment allocation, and resident admission. Run them with:

```powershell
.\gradlew.bat testDebugUnitTest
```
