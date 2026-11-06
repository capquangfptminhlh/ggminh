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
      "env": { "LHM_MCP_ALLOWED_SERIALS": "emulator-5554" }
    }
  }
}
```

**No automatic connection to LHM Agent AI is claimed.** The client must already support MCP stdio. If it does not, a separate integration is required.

`LHM_MCP_ALLOWED_SERIALS` is comma-separated, **at most eight exact serials**, such as `emulator-5554,emulator-5556`. No wildcards. Unset or empty means **no permitted devices**. Expose only dedicated test AVDs; do not include private phones, banking, OTP or sensitive messages. The Windows user launching this process must have local ADB access: stdio is **not** a security sandbox.

The bridge has **no HTTP server/socket/remote listener**, no account or OpenRouter key, and no Android control methods. Launch `node bin/lhm-android-mcp.js` directly, **not `npm run`**, because npm startup banners on stdout can break MCP JSON-RPC. Stdout carries only newline-delimited protocol messages.

## Exposed tools

| Tool | Access |
| --- | --- |
| `android_capabilities` | Bridge details and exact read-only tool list |
| `android_list_devices` | ADB status filtered to explicitly allowed serials |
| `android_list_avds` | Names of configured Android Virtual Devices, no control |
| `android_inspect_ui` | Max 120 widget types, roles, safe navigation hints and geometry; sensitive UI text discarded |

No tap, swipe, typing, screenshot, APK install, arbitrary ADB shell, account duplication or remote AI operations. Such actions stay in LHM Electron behind **native per-step human approval**. A role or navigation hint does not verify what a button actually does.

## Validation

```powershell
node test/android-mcp-readonly.js
```

The tests exercise handshake, tool discovery, no write access, serial allowlist, privacy redaction, malformed messages, concurrent read limits, and a spawned actual stdio subprocess with no stdout banners. They use mocked Android/ADB; **they do not prove a real AVD booted**.

Remaining work: connect a specific MCP client into the 16-agent LHM Robot Desktop runtime, add its own permission UX, pass native approvals for any requested writes, conduct live Windows AVD acceptance, and benchmark concurrent emulators.
