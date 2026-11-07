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

## Open Chrome inside a dedicated Android emulator (owner-approved)

After an AVD reports `sys.boot_completed=1` in **Android Device Center**, its row now enables **Mở Chrome**. This asks for an Electron-native confirmation, verifies that the selected target is still an ADB-authorized `emulator-XXXX`, verifies boot completion, and checks that `com.android.chrome` is installed before sending one fixed `monkey` launcher event. If Chrome is missing, choose a suitable official Android system image with Chrome. No browser APK is silently downloaded or installed.

- This button opens Chrome **inside Android**, not a desktop Chromium profile. The emulator window or optional scrcpy displays its screen. Chrome first-run prompts remain user-controlled. No automatic URL visits, cookie copying, profile cloning, or hidden browsing.
- The command returns `launch-requested` when ADB confirms injection. This **does not prove Chrome is visibly in the foreground**; the operator should verify the window. Busy/booting/uninstalled/offline/physical-phone/uncertain command results fail closed; no blind retry.
- The regular `npm test` includes `test/android-browser-launch.js` plus `test/android-live-smoke.js` (ADB fixtures, not Android hardware).
- For **actual Windows AVD** validation, manually run workflow `.github/workflows/android-live-windows.yml` on a dedicated `[self-hosted, Windows, X64, android-sdk]` runner and select `test_chrome=YES` with a clean AVD with Chrome preinstalled. The harness checks a Chrome resumed/focused ActivityManager marker and a valid PNG screenshot, then requests AVD shutdown. If the foreground marker is not observed it reports FAIL. It does not prove page load, internet access, account behavior, performance or multi-instance stability.
- An initial `test_chrome=NO` run remains the recommended read-only/basic HOME+snapshot preflight. Test only a clean AVD without personal accounts.

**Commercial gate remains OPEN:** no measured multi-AVD latency/CPU/RAM stability, no owner-endorsed physical Windows AVD acceptance, and no semantic browser interaction parity with competing Android platforms.

### Open a requested HTTPS page in Android Chrome

In **Android Control Studio**, choose a booted, ADB-authorized Android emulator, enter a public HTTPS address, and click **Mở trang trên Android**. Electron shows the exact URL in a **native per-site confirmation dialog** before dispatching a Chrome VIEW intent. The operation is manual and is **not an MCP tool or autonomous Agent command**.

To avoid unsafe ADB remote-shell argument handling, the local validator deliberately supports only ordinary public ASCII DNS domains, HTTPS, paths and one simple query string. It rejects credential-bearing URLs, nonstandard ports, IP/local/private-style hostnames, fragments, ampersands, shell metacharacters, Unicode hostnames and oversized URLs. Some ordinary complex URLs will therefore be refused until a safer transport is implemented. It never executes arbitrary shell code.

The result `intent-sent-unverified` means that Android accepted the intent request; it is **not proof** that the browser rendered, loaded the page, connected to the network, or preserved a login session. Check the Chrome window or capture a fresh local screenshot. A navigation action invalidates the previous screenshot in Control Studio to prevent tapping stale pixels. Any uncertain ADB timeout is **never automatically retried**; inspect the screen first.

`test/android-browser-navigation.js` covers validation, concurrency, boot, package, renderer wiring, native approval and error redaction using mock ADB. The regular `npm test` runs it on Linux and Windows. Live AVD compatibility, website rendering, page-load metrics and concurrent-emulator benchmarks still need separate Windows owner acceptance.

### One-click real Windows AVD acceptance (no GitHub runner required)

From a **complete, trusted `ggminh` source checkout**, with Node.js 22+, Android Studio SDK Platform-Tools, Android Emulator, a system image with Chrome, Windows virtualization (WHPX) enabled, and an already-created clean AVD:

1. Double-click **`CHECK_ANDROID_WINDOWS.cmd`** in the repository root.
2. The local diagnostic checks ADB + Emulator, lists existing AVDs, free host RAM, CPU threads, and launch-gate readiness.
3. Type the exact name of a **dedicated disposable test AVD** (without personal accounts, banking, OTP, messages or customer data).
4. Choose **1 = boot/screenshot**, **2 = Chrome foreground**, or **3 = Chrome foreground plus public `example.com` page heading**.
5. Type the exact confirmation **YES** to authorize launching and stopping only the selected AVD. The harness refuses an already-running AVD and requests cleanup shutdown. Read the sanitized PASS/FAIL result in the local console.

This is local execution, **not remote testing**: no screenshots, Android screen text, account records, device serials or raw UI XML are stored by the helper or uploaded. The result contains dimensions and observational timings only. The launcher does not install SDK tools, download system images, create/clone profiles, silently log in, or use existing active emulators. A failed acceptance must not be reinterpreted as a PASS.

Alternatively, use PowerShell from the complete repository:

```powershell
node tools/android-local-acceptance.js --list
node tools/android-local-acceptance.js --avd LHM_Test_Pixel --mode basic --ack-clean-avd
node tools/android-local-acceptance.js --avd LHM_Test_Pixel --mode page --ack-clean-avd
```

The `--ack-clean-avd` flag is an explicit operator acknowledgment; it **cannot verify** that an AVD contains no personal data. Do not select one with real accounts. For a downloadable EXE, this source-level acceptance helper does not replace testing the packaged Electron UI. Running this on a real Windows machine provides host evidence absent from normal GitHub CI.

### Real Windows AVD public website acceptance (explicitly opted in)

The manual GitHub workflow `.github/workflows/android-live-windows.yml` can now check a **fixed public sample page** on a clean, dedicated AVD with Chrome already installed. It is not a performance certification. Configure a Windows 10/11 self-hosted runner with SDK, an existing accelerated AVD, and the `android-sdk` label. Select one of these gates:

- `test_chrome=NO, test_page=NO`: basic AVD boot, HOME, local PNG and accessibility probe.
- `test_chrome=YES, test_page=NO`: additionally launch Chrome and observe a resumed Chrome foreground activity and PNG.
- `test_chrome=YES, test_page=YES`: additionally send one HTTPS VIEW intent **only to `https://example.com/`**. Poll Chrome foreground and local UIAutomator XML until the exact public heading `Example Domain` is observed, then capture one local PNG and emit its dimensions and `navigationObservationMs`. The XML and PNG bytes remain on the runner and are **never logged or uploaded**. A missing heading, a lost foreground, missing Chrome or timeout fails the gate. No automatic retry of a potentially delivered navigation intent.

`test_page=YES` without `test_chrome=YES` is explicitly rejected. The harness refuses a running target AVD and requests shutdown only for the emulator it started. The shutdown request is not proof that the OS process exited or that browser cookies were isolated. Do not use personal accounts on the test device.

**Evidence boundaries:** A public heading visible through the Android accessibility tree plus a screenshot is a stronger end-to-end smoke test than ADB intent injection, but does not measure network correctness, pixel-level rendering, interactive page responsiveness, JavaScript execution, FPS, CPU/RAM pressure, account isolation or multi-instance stability. On Android versions that do not expose web content in UIAutomator, this gate can fail even when the page looks correct. Such cases require human review and another inspected measurement, not lowering the acceptance threshold silently. `npm test` runs deterministic mock-ADB tests of the gate but is **not** the live Windows runner result.

## AI Agent MCP access (separate, read-only)

LHM includes an opt-in **local MCP stdio server** at `bin/lhm-android-mcp.js`. It exposes only explicitly allowlisted ADB devices and sanitized UI metadata to a compatible local Agent client; no screenshots or Android write tools. It **does not** automatically connect to the 16-agent Robot Desktop app. See [ANDROID-MCP-BRIDGE.md](ANDROID-MCP-BRIDGE.md) for setup, permission controls and known limitations.

## Local Android widget roles (bounded, no raw labels)

When a user clicks **Quét giao diện**, the inspector now classifies each enabled, clickable widget by Android class (button, input, toggle, picker, slider or general interactive view). It also shows a short **heuristic** hint only when an accessibility label matches an exact closed vocabulary: *Quay lại, Trang chủ, Tìm kiếm, Menu, Đóng, Tiếp theo* (English and Vietnamese). Every other label remains hidden; text, content descriptions, account identifiers and password data are **not returned via IPC**, written to a file or sent to OpenRouter. An XML attribute containing a literal \`>\` no longer truncates the node parser. The one-time tap guard rejects changed role or hint as well as geometry.

**Important:** role and hint are not trustworthy evidence of the button's real-world effect. A label "Next" could still advance a purchase or submit a form. All actions remain reviewed and manually approved; there is no autonomous semantic agent.

### Real Windows Android acceptance gate (opt-in)

The script \`tools/android-live-smoke.js\` is a **real runtime acceptance harness**, not a synthetic/CI proof of Android availability. On a Windows 10/11 PC with VT-x/AMD-V, WHPX, Android SDK tools and a pre-created test AVD, run it from the project root in PowerShell:

\`\`\`powershell
$env:LHM_ANDROID_AVD="LHM_Test_Pixel"
node tools/android-live-smoke.js
\`\`\`

Use a **dedicated test AVD with no personal accounts**. The harness refuses an AVD that is already running. It launches that AVD, waits up to five minutes for ADB \`sys.boot_completed=1\`, validates a real PNG screenshot, sends HOME to the test AVD, inspects the real UI hierarchy locally and requests emulator shutdown in cleanup. It emits only pass/fail, screenshot dimensions and counts; no screenshot, UI text, serial, apps, accounts or secrets are uploaded or logged. A shutdown request is not proof that the emulator exited immediately.

For an unattended **but manually triggered** real-device CI gate, provision a dedicated Windows self-hosted GitHub Actions runner with custom label \`android-sdk\`, Android SDK/AVD already installed, and hardware acceleration available. Then dispatch **Android Live Windows Acceptance (manual, real AVD)**, entering the AVD name. Without such a self-hosted runner, this job cannot run: the ordinary Windows installer workflow continues to use synthetic Android mocks and proves **only the code/build**, not runtime compatibility.

Local mock regressions:
- \`node test/android-role-hints.js\`
- \`node test/android-live-smoke.js\`

Acceptance to ship Android commercially still requires a **successful real runner result**, evidence that boot/screenshot/inspection work on supported Windows hosts, and a separate multi-instance performance benchmark. Do not present the mock tests or installer build as that evidence.

## Android UI Inspector — local geometry-only view

The **Android UI Inspector** is a separate read-only screen for operators to inspect interactive Android widgets. It uses `adb -s SERIAL exec-out uiautomator dump /dev/tty` and extracts the nodes flagged `clickable=true`, `enabled=true` with valid screen bounds. It returns only a short widget type and its bounding box/center, capped to 120 entries. All `text`, `content-desc`, package names, resource identifiers and password-entry nodes are removed **inside the Electron main process before any IPC reply**. Raw UI XML is not saved, exported, logged or passed to OpenRouter.

The operator clicks **Quét giao diện** to capture a one-time list and can click **Chạm** on an entry. A unique, short-lived scan token is kept in Electron main-process memory. Manual node taps require a separate native Windows confirmation and the UIAutomator hierarchy is re-read immediately before a single allowed tap; mismatch, 15-second expiry, device change or replay causes a fail-closed refusal. Scan tokens are never reusable. Coordinates expire after 15 seconds or immediately on switching devices, closing Device Center or attempting a tap. The app never automatically interprets a button's purpose, and a tap could still hit the wrong control if the Android UI changes between inspection and action. This is an operator aid, **not a claim of semantic AI screen understanding**. It requires an authorized, unlocked ADB device; `uiautomator dump` can fail on some applications and during animations. No root, no local XML file on the Android device and no remote processing.

### Inspector-guided Agent Workflow

Click **Agent** next to a freshly inspected interactive node to build a device-bound, two-step offline plan: (1) tap the selected, one-time UI node and (2) capture an Android screenshot for verification. The operator must approve each step in a **native Electron confirmation dialog**. Before the first tap, the main process reads the UI hierarchy again and compares widget class, index and exact bounds. If it changed, **no tap is sent**; the plan blocks. The scan is valid for only 15 seconds and cannot be replayed. No OpenRouter request is made by this path; a detected widget type is not proof of what the button does.

Remote proposals (OpenRouter) remain text-only, explicitly consented and cannot generate `inspector-tap` tokens: the step type is accepted only by the local Inspector-to-Agent code path.

Run: `node test/android-target-guard.js`

### UI Inspector acceptance still required

- [x] Bounded XML parsing, sensitive-text redaction, password exclusion and per-serial ADB invocation (mock-tested).
- [ ] Live Android 10–17 UIAutomator compatibility, screenshot overlay alignment, orientation changes, secure windows and real touch accuracy.
- [x] Operator-guided UI node-to-Agent plan with one-use token, strict reinspection and native per-step approval (mock-tested).
- [ ] Automatic semantic AI widget identification, separate informed consent, no hidden capture or unreviewed actions.

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
