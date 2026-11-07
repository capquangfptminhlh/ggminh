# LHM Android MCP — local read-only bridge (Windows)

**Purpose:** Allow an MCP-compatible AI client (such as a locally configured LHM Robot/Agent client) to discover explicitly permitted Android devices and inspect safe UI geometry using the Android SDK on the same Windows machine. This stage does **not** connect an agent to Electron's write-approval queue or make Android automation autonomous.

## Start and explicit per-device permission

1. Install Node.js 22+ and check out this `ggminh` source repository on the Windows PC with Android SDK/ADB.
2. Run `adb devices -l` yourself. Copy the exact serial of a dedicated test AVD or a device you own and authorize.
3. Configure an MCP-compatible client to spawn the Node.js process. Replace the example path and serial:

```json
{
  "mcpServers": {
    "lhm-android-readonly": {
      "command": "node",
      "args": ["C:\\LHM\\ggminh\\bin\\lhm-android-mcp.js"],
      "env": {
        "LHM_MCP_ALLOWED_SERIALS": "emulator-5554",
        "LHM_MCP_ALLOWED_AVD_BINDINGS": "emulator-5554=Pixel_Test_01"
      }
    }
  }
}
```

**No automatic connection to LHM Agent AI is claimed.** The client must already support MCP stdio. If it does not, a separate integration is required.

`LHM_MCP_ALLOWED_SERIALS` lists a maximum of eight exact emulator serials, such as `emulator-5554,emulator-5556`. **Serials alone grant ZERO access**, because an ADB port can be reused by another profile. Also set `LHM_MCP_ALLOWED_AVD_BINDINGS` with an exact one-to-one serial-to-AVD-name mapping, for example `emulator-5554=Pixel_Test_01,emulator-5556=Pixel_Test_02`. Both permissions are required for each AVD. Before **and after** reading any UI geometry, the bridge checks the current connected ADB emulator's reported AVD name. If the serial is recycled, the device is offline, the console reply is ambiguous, or the names differ, the bridge refuses the read. **Physical phones are excluded from this MCP bridge.** Never bind an AVD holding private accounts, banking data, OTP, messages or sensitive data. The Windows user launching this process still has broad local ADB privileges: stdio and these app checks are **not an operating-system security sandbox**.

The bridge has **no HTTP server/socket/remote listener**, no account or OpenRouter key, and no Android control methods. Launch `node bin/lhm-android-mcp.js` directly, **not `npm run`**, because npm startup banners on stdout can break MCP JSON-RPC. Stdout carries only newline-delimited protocol messages.

## Exposed tools

| Tool | Access |
| --- | --- |
| `android_capabilities` | Bridge details and exact read-only tool list |
| `android_list_devices` | Only online emulators whose serial **and** AVD name match the two allowlists |
| `android_list_avds` | Only currently verified, explicitly bound AVD names; all other profile names are hidden |
| `android_inspect_ui` | Before/after AVD identity check, then max 120 widget roles and geometry; sensitive UI text discarded |

No tap, swipe, typing, screenshot, APK install, arbitrary ADB shell, account duplication or remote AI operations. Such actions stay in LHM Electron behind **native per-step human approval**. A role or navigation hint does not verify what a button actually does.

## Cross-profile privacy boundary

- An MCP client cannot list all AVD profiles without permission. When either allowlist is empty, the bridge reveals no devices, no AVD names and no UI geometry.
- ADB `emulator-5554` is a temporary port, **not a durable profile ID**. Binding to an AVD name and verifying again after the read stops the typical serial-reuse leak. The bridge never returns raw UI text, clipboard contents or screenshots.
- A separate scrcpy mirror defaults to **view-only**, **no audio**, and **no clipboard autosync**. Use Android Control Studio for explicit tap/key actions. This prevents automatic host clipboard spread but cannot protect against an untrusted ADB client, malicious emulator apps, OS compromise, manual screenshots, or someone running scrcpy outside LHM. True hostile-profile isolation requires OS-level separate Windows users/VMs and an external security audit.

## Validation

```powershell
node test/android-mcp-readonly.js
```

The tests exercise handshake, tool discovery, no write access, serial allowlist, privacy redaction, malformed messages, concurrent read limits, and a spawned actual stdio subprocess with no stdout banners. They use mocked Android/ADB; **they do not prove a real AVD booted**.

Remaining work: connect a specific MCP client into the 16-agent LHM Robot Desktop runtime, add its own permission UX, pass native approvals for any requested writes, conduct live Windows AVD acceptance, and benchmark concurrent emulators.
