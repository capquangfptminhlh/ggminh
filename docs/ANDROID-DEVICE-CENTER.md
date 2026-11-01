# LHM Android Device Center — Phase 1

This is a **real SDK integration**, not an HTML mock phone. It runs beside LHM Ads Browser in the existing Electron Windows app. It does not emulate Android inside Chromium, modify app identities, or claim to pass Play Integrity.

## Install on Windows (one time)

1. Install Android Studio with Android SDK Platform-Tools and Android Emulator.
2. In Android Studio > Device Manager, create a virtual device and install an Android system image. Enable Intel VT-x / AMD-V and Windows Hypervisor Platform in Windows features (reboot if required).
3. Optionally install [scrcpy](https://github.com/Genymobile/scrcpy) for a dedicated mirrored-screen window, and add scrcpy's directory to PATH.
4. Set ANDROID_SDK_ROOT to the SDK folder if it is nonstandard. On most PCs the default is %LOCALAPPDATA%\Android\Sdk.
5. Launch LHM Ads Browser and open **Android Device Center** from the sidebar.

### Current functions

- Discovers actual SDK tools, available AVD names via the Android Emulator AVD list command, and connected devices via ADB.
- Starts a selected existing AVD using the official Android Emulator. The UI reports **starting** until a connected device is detected; it never claims an AVD is booted immediately.
- Opens a screen with scrcpy only after the device is online/authorized, and can stop an Android emulator through ADB.
- Includes strict input validation, shell-free subprocess launch, per-command timeout and maximum output size, and UI text rendering that does not execute device-supplied HTML.
- No hidden downloads, cloud servers, remote ports, auto-root, IMEI changes, device-fingerprint evasion or auto-logins.

### Test

Run: node test/android-manager.js

The normal test pipeline also executes this suite. Tests use a fake Android SDK process adapter and **do not** prove Windows virtualization, ADB access, APK compatibility or real-device runtime. Those require a Windows host with Android SDK installed.

## Release / parity gates (not yet complete)

- [ ] Actual Windows 10/11 end-to-end: AVD boots, appears in ADB, scrcpy opens, emulator stops cleanly.
- [ ] In-app creation/clone/import/export of virtual devices with isolated writable disk images.
- [ ] Android system image downloader with checksums, signer/origin validation and disk checks.
- [ ] Per-AVD resources: RAM, CPU, display, storage and network settings, with capacity warnings.
- [ ] App installation, lifecycle, screenshots, accessibility-tree driven actions, Appium integration.
- [ ] Multi-instance streaming, robust crash recovery, provisioning and encrypted backup/restore.
- [ ] Local MCP/agent capability scopes and approval for external, destructive or account actions.
- [ ] Device/environment integrity assessment and compatibility tests; no unverified bypass claims.
- [ ] Independent AdsSpeed feature parity benchmarks with reproducible evidence.

Do not ship or market this Phase 1 as an AdsSpeed replacement. The current release gates for the Windows browser remain independent.
