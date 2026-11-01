# LHM Android Device Center — Phase 1

This is a **real SDK integration**, not an HTML mock phone. It runs beside LHM Ads Browser in the existing Electron Windows app. It does not emulate Android inside Chromium, modify app identities, or claim to pass Play Integrity.

## Install on Windows (one time)

1. Install Android Studio with Android SDK Platform-Tools and Android Emulator.
2. In Android Studio > SDK Manager install **SDK Command-Line Tools**, Android Emulator and one or more **Android system images**. Enable Intel VT-x / AMD-V and Windows Hypervisor Platform (reboot if required). You can now create AVDs within LHM; no need to pre-create them in Android Studio.
3. Optionally install [scrcpy](https://github.com/Genymobile/scrcpy) for a dedicated mirrored-screen window, and add scrcpy's directory to PATH.
4. Set ANDROID_SDK_ROOT to the SDK folder if it is nonstandard. On most PCs the default is %LOCALAPPDATA%\Android\Sdk.
5. Launch LHM Ads Browser and open **Android Device Center** from the sidebar.

### Current functions

- Discovers actual SDK tools, installed Android system images, available AVD names via the Android Emulator AVD list command, and connected devices via ADB.
- Creates a new AVD from an **already installed** image using the official SDK command-line utility. No implicit download, overwrite, or silent removal.
- Duplicates an AVD's **system image configuration** into a new AVD with **empty application data**. This is not a full clone of accounts, apps, userdata, snapshots or cryptographic material.
- Shows an optional disk-free preflight (6 GiB minimum when measurement is available), a 50-AVD creation limit, and clear missing-tool guidance.
- Starts a selected existing AVD using the official Android Emulator. The UI reports **starting** until a connected device is detected; it never claims an AVD is booted immediately.
- Opens a screen with scrcpy only after the device is online/authorized, and can stop an Android emulator through ADB.
- Includes strict input validation, shell-free subprocess launch, per-command timeout and maximum output size, and UI text rendering that does not execute device-supplied HTML.
- No hidden downloads, cloud servers, remote ports, auto-root, IMEI changes, device-fingerprint evasion or auto-logins.

### Test

Run: node test/android-manager.js

Run: node test/android-provisioner.js

The normal test pipeline also executes both suites. Tests use a fake Android SDK process adapter and **do not** prove Windows virtualization, ADB access, APK compatibility or real-device runtime. Those require a Windows host with Android SDK installed.

## Release / parity gates (not yet complete)

- [ ] Actual Windows 10/11 end-to-end: AVD boots, appears in ADB, scrcpy opens, emulator stops cleanly.
- [x] In-app AVD creation from already installed images and clean configuration-only duplication (mock-tested; live Windows AVD proof pending).
- [ ] Full userdata clone/import/export, disk-image isolation acceptance checks, encrypted backup/restore.
- [ ] Android system image downloader with checksums, signer/origin validation and disk checks.
- [ ] Per-AVD resources: RAM, CPU, display, storage and network settings, with capacity warnings.
- [ ] App installation, lifecycle, screenshots, accessibility-tree driven actions, Appium integration.
- [ ] Multi-instance streaming, robust crash recovery, provisioning and encrypted backup/restore.
- [ ] Local MCP/agent capability scopes and approval for external, destructive or account actions.
- [ ] Device/environment integrity assessment and compatibility tests; no unverified bypass claims.
- [ ] Independent AdsSpeed feature parity benchmarks with reproducible evidence.

Do not ship or market this Phase 1 as an AdsSpeed replacement. The current release gates for the Windows browser remain independent.

Official Android docs now describe avdmanager as deprecated in favor of the newer Android CLI. This implementation uses locally installed avdmanager for compatibility; adding the new CLI as an alternative and performing live Windows E2E tests remain release gates. The Windows .bat launcher is restricted to SDK paths without command interpreter metacharacters and validates AVD names and installed system image identifiers before invocation.
