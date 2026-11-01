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
- **Fleet Readiness:** shows measured free RAM / CPU threads, ADB-visible emulator names and Android boot-complete signals. Estimates per-AVD memory from its `config.ini` with a conservative 4 GiB fallback, honoring the API 37 minimum of 4 GiB. Launches are serialized and rejected if parallelism exceeds min(4, CPU threads / 2), if free RAM cannot cover estimated emulator RAM + 1 GiB overhead + 3 GiB reserved for Windows, or if ADB is unavailable. These are safety heuristics, not performance guarantees. Devices started outside LHM are counted when visible via ADB; unknown/offline devices count conservatively. Use **Làm mới thiết bị** to update measurements.
- Opens a screen with scrcpy only after the device is online/authorized, and can stop an Android emulator through ADB.
- **Manual Android Control Studio:** choose an ADB-authorized device, explicitly capture a PNG screen into the *local Electron view* (never uploaded or saved), click the scaled screenshot to tap, swipe up/down, send HOME/BACK key events, and type short basic Latin text into the focused Android app. The screenshot is cleared when the dialog closes.
- **User-approved APK installation:** the Windows native file chooser opens for one .apk file, followed by a separate confirmation identifying the selected target device. The ADB install command does not include replace flags; existing installations are not silently overwritten. Only local regular files up to 256 MiB are accepted.
- Commands are allowlisted and validated, require ADB status `device`, and run with shell:false. The UI exposes no arbitrary ADB shell, port forwarding, hidden monitoring, root, background agent execution or text history.
- Includes strict input validation, shell-free subprocess launch, per-command timeout and maximum output size, and UI text rendering that does not execute device-supplied HTML.
- No hidden downloads, cloud servers, remote ports, auto-root, IMEI changes, device-fingerprint evasion or auto-logins.

## Android UI Inspector — local geometry-only view

The **Android UI Inspector** is a separate read-only screen for operators to inspect interactive Android widgets. It uses `adb -s SERIAL exec-out uiautomator dump /dev/tty` and extracts the nodes flagged `clickable=true`, `enabled=true` with valid screen bounds. It returns only a short widget type and its bounding box/center, capped to 120 entries. All `text`, `content-desc`, package names, resource identifiers and password-entry nodes are removed **inside the Electron main process before any IPC reply**. Raw UI XML is not saved, exported, logged or passed to OpenRouter.

The operator clicks **Quét giao diện** to capture a one-time list and can click **Chạm** on an entry. Coordinates expire after 15 seconds or immediately on switching devices, closing Device Center or attempting a tap. The app never automatically interprets a button's purpose, and a tap could still hit the wrong control if the Android UI changes between inspection and action. This is an operator aid, **not a claim of semantic AI screen understanding**. It requires an authorized, unlocked ADB device; `uiautomator dump` can fail on some applications and during animations. No root, no local XML file on the Android device and no remote processing.

### UI Inspector acceptance still required

- [x] Bounded XML parsing, sensitive-text redaction, password exclusion and per-serial ADB invocation (mock-tested).
- [ ] Live Android 10–17 UIAutomator compatibility, screenshot overlay alignment, orientation changes, secure windows and real touch accuracy.
- [ ] Optional semantic agent integration with separate informed consent, no hidden capture or unreviewed actions.

## Android Agent Workflow — guided, not autonomous

The in-app Android Agent Workflow uses the existing encrypted OpenRouter AI Advisor key to **propose a text-only JSON plan**. The user must explicitly opt in before the *goal description alone* is sent to OpenRouter; neither screenshot bytes, current app contents, device serials nor profile data are provided to the model. If no API key is configured, a **Home → Screenshot** offline template remains usable.

Every plan is parsed using strict JSON and an allowlist of `capture`, `key` (HOME/BACK), `tap`, `swipe` or short validated `text`. Plans are at most six steps and end with a screenshot checkpoint. Proposed coordinates have no visual grounding and can be wrong; users must review each proposal carefully. There is no autonomous vision, OCR, semantic outcome verification, background scheduling or arbitrary ADB shell.

The workflow binds to a single ADB-authorized serial and expires from memory after 10 minutes. **Every step** triggers an independent native Electron confirmation identifying the device, action and step number. The user can cancel between steps; no bulk approval mode exists. After each step, Android is captured locally for human verification, without uploading the image. An ADB timeout is treated as uncertain: the workflow blocks rather than blindly repeating a potentially irreversible action. No workflow history or screenshots are persisted to disk. On closing Device Center, the UI clears its image and attempts session cancellation.

### Agent acceptance still required

- [x] OpenRouter text-only proposal with explicit consent, schema validation, redacted preview, 1-step approval and transient screenshot verification (mock-tested).
- [ ] Live Windows 10/11 end-to-end with AVD booted, UI responsiveness, per-step confirmation, cancellation after timeout and screenshot privacy validation.
- [ ] Screen semantic understanding with independent privacy consent, verified accessibility tree and an explicit AI policy/tool permission model.
- [ ] Local MCP agent bridge with authentication and per-device capabilities; no remote exposure until audited.

### Test


Run: node test/android-manager.js

Run: node test/android-provisioner.js

Run: node test/android-control.js

Run: node test/android-agent-workflow.js

Run: node test/android-ui-inspector.js

The normal test pipeline also executes both suites. Tests use a fake Android SDK process adapter and **do not** prove Windows virtualization, ADB access, APK compatibility or real-device runtime. Those require a Windows host with Android SDK installed.

## Release / parity gates (not yet complete)

- [ ] Actual Windows 10/11 end-to-end: AVD boots, appears in ADB, scrcpy opens, emulator stops cleanly.
- [x] In-app AVD creation from already installed images and clean configuration-only duplication (mock-tested; live Windows AVD proof pending).
- [ ] Full userdata clone/import/export, disk-image isolation acceptance checks, encrypted backup/restore.
- [ ] Android system image downloader with checksums, signer/origin validation and disk checks.
- [x] Host capacity warnings and serialized AVD launch gates (mock-tested). Uses measured host memory and CPU, estimated per-AVD RAM, and ADB state.
- [ ] User controls for RAM/CPU/display/storage/network per AVD and measured multi-instance throughput on real Windows hardware.
- [x] User-approved APK installation, transient screenshot preview and manual tap/swipe/HOME/BACK/short ASCII typing (ADB mock-tested).
- [x] Read-only local UI hierarchy extraction with geometry-only results and redaction (mock-tested).
- [ ] APK smoke test on actual emulator/phone, production accessibility-tree compatibility, scoped Appium/agent workflow, approvals and rollback.
- [ ] Multi-instance streaming, robust crash recovery, provisioning and encrypted backup/restore.
- [ ] Local MCP/agent capability scopes and approval for external, destructive or account actions.
- [ ] Device/environment integrity assessment and compatibility tests; no unverified bypass claims.
- [ ] Independent AdsSpeed feature parity benchmarks with reproducible evidence.

Do not ship or market this Phase 1 as an AdsSpeed replacement. The current release gates for the Windows browser remain independent.

Official Android docs now describe avdmanager as deprecated in favor of the newer Android CLI. This implementation uses locally installed avdmanager for compatibility; adding the new CLI as an alternative and performing live Windows E2E tests remain release gates. The Windows .bat launcher is restricted to SDK paths without command interpreter metacharacters and validates AVD names and installed system image identifiers before invocation.

## Fleet Readiness limits

The 4-instance cap is a deliberately conservative product policy, **not** a statement that the PC can run four emulators smoothly. RAM figures are approximate and GPU, disk I/O, background processes and Hyper-V/WHPX overhead are not directly measured. ADB reports `sys.boot_completed=1` only after Android has completed boot; a started emulator process is not treated as a booted Android device. Confirm live throughput and crash recovery before commercial release.

## Control Studio privacy and testing
The screenshot is captured only when the user clicks the capture button, stays in Electron renderer memory and is cleared on dialog close. It may display private messages, 2FA codes or passwords; never transmit it to AI services without informed approval. The user must explicitly pick the APK and confirm the target serial before installation. Remote AI/agent access to these IPC methods is **not yet enabled**. Tests use simulated ADB callbacks, including a synthetic PNG; they do not establish live device compatibility or app-install success on real hardware.
