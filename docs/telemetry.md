Telemetry

Overview
- Emdash collects anonymous usage telemetry to improve the app.
- Telemetry defaults to enabled and can be disabled via `TELEMETRY_ENABLED=false`.
- Data is sent to PostHog using explicit, allow‑listed events only. IP address is not collected (`$ip` is set to `"0"`).

Environment variables (users)
- `TELEMETRY_ENABLED` (default: `true`): set to `false` to disable.

Maintainers
- Official builds inject the PostHog host and project key via CI. Local development does not send telemetry unless credentials are added explicitly for testing.
- Optional: `INSTALL_SOURCE` can label the distribution channel (e.g., `dmg`, `dev`).

Events
- `app_started` (sent automatically on app start)
  - Properties (added automatically): `app_version`, `electron_version`, `platform`, `arch`, `is_dev`, `install_source`
- `app_closed` (sent automatically on quit)
  - Same automatic properties as above
- `app_session` (on quit) and `app_session_heartbeat` (every 5 minutes)
  - Properties: `session_duration_ms` (capped)
- `app_perf`
  - Properties: `cold_start_ms`, `first_paint_ms` (capped)
- `first_run` (on first launch only)
- `feature_used`
  - Allowed properties: `feature` (string)
- `error`
  - Allowed properties: `type` (string)
- `project_added`, `workspace_created`, `workspace_deleted`, `workspace_switched` (no extra properties)
- `command_palette_opened`, `settings_opened` (no extra properties)
- `telemetry_toggled`
  - Properties: `enabled` (boolean)
- Runs
  - `container_run_started` — Properties: `mode` ('container'|'host')
  - `container_run_completed` — Properties: `success` (boolean), `duration_ms` (capped)
  - `container_run_failed` — Properties: `type` (string)
- Codex
  - `codex_exec_started` — no properties
  - `codex_exec_completed` — Properties: `success` (boolean), `duration_ms` (capped)
  - `codex_exec_failed` — Properties: `type` (string)
- Terminal
  - `terminal_overflow` — Properties: `bytes`, `window_bytes`, `max_window_bytes`
  - `terminal_exit` — Properties: `exit_code`, `signal`, `total_bytes`

Data not collected
- No code, file paths, repository names, prompts, environment variables, or PII are sent.
- IP addresses, session replay, and autocapture are not used by default; only explicit events are sent.

Distinct ID
- A random anonymous `instanceId` is generated and stored locally at: `${appData}/telemetry.json`.
- This ID is used as `distinct_id` for telemetry events.
- Each app launch also gets a random `session_id` added to all events to correlate activity within a single run.

Opt-out
- In-app: Settings → General → Privacy & Telemetry (toggle off), or
- Env var: set `TELEMETRY_ENABLED=false` before launching the app to disable telemetry entirely.

Renderer events (maintainers)
- The renderer may request sending telemetry via a constrained IPC channel handled in the main process. Allowed events are explicitly whitelisted.
- Only allowlisted properties are forwarded; everything else is dropped by the sanitizer in the main process.
- End-users do not need to take any action; telemetry remains optional and can be disabled as described above.
