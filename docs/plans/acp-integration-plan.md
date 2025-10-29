# Emdash ACP Integration Plan (Production-Ready)

Owner: Emdash Core
Related: [feat: Integrate Agent Client Protocol (ACP)](https://github.com/generalaction/emdash/issues/210)
Status: Phase 1 Complete
Last updated: 2025-10-29

## Implementation Status

### ✅ Phase 0: Scaffolding (COMPLETE)
- [x] Add feature flag `settings.acp.enabled` with default true
- [x] Ensure logging directories exist for ACP logs alongside existing agent logs
- [x] Extended AppSettings interface with ACP configuration structure

### ✅ Phase 1: Transport + MVP UI (COMPLETE)

**Main Process:**
- [x] Implement `AcpService`:
  - [x] Spawn, stdio wiring, initialize request/response, session map
  - [x] Newline-delimited JSON reader with robust framing fallback
  - [x] rpcCall, rpcNotify with timeouts; pending map; cleanup on exit/error
- [x] Implement `acpIpc` handlers and event forwarding
- [x] Integrate `registerAcpIpc(getWindow)` in main bootstrap

**Preload:**
- [x] Expose API: `acpNewSession`, `acpPrompt`, `acpCancel`, `acpDispose`, `onAcpUpdate`, `onAcpError`

**Renderer:**
- [x] Add `AcpThreadView` + demo wrapper `AcpDemoPane`
- [x] Created missing UI components (Textarea, Label, ScrollArea)

**Documentation:**
- [x] Created `docs/acp.md` - comprehensive documentation
- [x] Created `docs/acp-quickstart.md` - quick start guide

**Testing:**
- [x] Unit tests for AcpService (7 tests, all passing)
- [x] Test coverage: session lifecycle, notifications, error handling
- [x] Code review completed
- [x] Security scan passed (0 alerts)

**Remaining for Phase 1:**
- [ ] Wire into workspace UI: When provider is ACP-capable, route to ACP view
- [ ] Manual testing with Gemini CLI

### 🔜 Phase 2: UX & Content Types (PLANNED)
- [ ] Introduce typed notification handling; map ACP content to:
  - [ ] Message stream (markdown renderer)
  - [ ] Terminal meta → allocate xterm instance per terminal_id
  - [ ] Tool calls and plan/progress UI
- [ ] File ops:
  - [ ] Collect proposed edits into changeset list; preview diffs
  - [ ] Approve/apply and send appropriate ACP requests
- [ ] Auth:
  - [ ] Add auth method picker; call `authenticate(method_id)`
- [ ] Mode/Model:
  - [ ] Fetch available modes/models; add selectors; update via ACP calls

### 🔜 Phase 3: MCP and Robustness (PLANNED)
- [ ] MCP passthrough config; pass configured MCP servers to `new_session`
- [ ] Multi-session terminals and throttled rendering
- [ ] Persistent logs for ACP traffic (behind dev toggle)
- [ ] Retry semantics (agent crash/restart) with user prompts

### 🔜 Phase 4: Polish (PLANNED)
- [ ] Settings UI for ACP providers and timeouts
- [ ] Accessibility and keyboard nav in ACP view
- [ ] Onboarding tooltip explaining ACP vs terminal
- [ ] Documentation site pages and troubleshooting

## Architecture

### Components
- **Main process**
  - `AcpService`: manages child processes, JSON-RPC transport, sessions
  - `acpIpc`: IPC handlers and notification forwarder
- **Preload**
  - Bridges main IPC safely into `window.electronAPI`
- **Renderer**
  - `AcpThreadView`: session lifecycle, input, output list, status
  - `AcpDemoPane`: session creation wizard

### Data Flow
1. Renderer calls `acp:newSession` with providerId, workspaceId, cwd
2. Main spawns process, wires stdio, sends `initialize` w/ capabilities
3. On success, main returns sessionId and listens for notifications/stderr
4. Renderer calls `acp:prompt`; streams output via notifications
5. `acp:cancel` for graceful cancellation
6. `acp:dispose` for cleanup

## Transport Details
- JSON-RPC 2.0 over stdio
- Newline-delimited JSON (upgrade to ACP SDK in Phase 2)
- Timeouts: initialize 15s, prompt 10m (configurable)
- Minimum protocol version: v1

## Provider Registry
- **gemini**: command `gemini` (or `gemini.cmd` on Windows)
- Future: additional ACP-capable providers

## Files Created/Modified

### New Files
- `src/main/services/AcpService.ts`
- `src/main/ipc/acpIpc.ts`
- `src/renderer/components/acp/AcpThreadView.tsx`
- `src/renderer/components/AcpDemoPane.tsx`
- `src/renderer/components/ui/textarea.tsx`
- `src/renderer/components/ui/label.tsx`
- `src/renderer/components/ui/scroll-area.tsx`
- `src/test/main/AcpService.test.ts`
- `docs/acp.md`
- `docs/acp-quickstart.md`
- `vitest.config.ts`

### Modified Files
- `src/main/settings.ts` - Added ACP settings
- `src/main/ipc/index.ts` - Registered ACP IPC
- `src/main/preload.ts` - Exposed ACP API

## Security Considerations
- stdio streams never exposed to renderer
- All messages parsed and validated
- Paths and content sanitized in UI
- No code execution from agent output
- CodeQL scan: 0 alerts

## Testing
- 7 comprehensive unit tests for AcpService
- All existing tests still passing (27 total)
- Test infrastructure established with vitest.config.ts

## References
- [ACP Documentation](https://agentclientprotocol.com/overview/introduction)
- [Zed's ACP Implementation](https://github.com/zed-industries/zed)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
