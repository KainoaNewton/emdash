import { app } from 'electron';
// Optional build-time defaults for distribution bundles
// Resolve robustly across dev and packaged layouts.
let appConfig: { posthogHost?: string; posthogKey?: string } = {};
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

function loadAppConfig(): { posthogHost?: string; posthogKey?: string } {
  try {
    const dir = __dirname; // e.g., dist/main/main in dev builds
    const candidates = [
      join(dir, 'appConfig.json'), // dist/main/main/appConfig.json
      join(dir, '..', 'appConfig.json'), // dist/main/appConfig.json (CI injection path)
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        const raw = readFileSync(p, 'utf8');
        return JSON.parse(raw);
      }
    }
  } catch {
    // fall through
  }
  return {};
}
appConfig = loadAppConfig();

type TelemetryEvent =
  | 'app_started'
  | 'app_closed'
  | 'feature_used'
  | 'error'
  // Aggregates (privacy-safe)
  | 'workspace_snapshot'
  // Session summary (duration only)
  | 'app_session'
  // Additional lifecycle/perf
  | 'app_perf'
  | 'first_run'
  | 'app_session_heartbeat'
  | 'app_first_interaction'
  // Product events
  | 'project_added'
  | 'workspace_created'
  | 'workspace_deleted'
  | 'workspace_switched'
  | 'container_run_started'
  | 'container_run_completed'
  | 'container_run_failed'
  | 'github_connected'
  | 'pr_list_opened'
  | 'pr_created'
  | 'pr_opened'
  | 'codex_exec_started'
  | 'codex_exec_completed'
  | 'codex_exec_failed'
  | 'command_palette_opened'
  | 'settings_opened'
  | 'telemetry_toggled'
  // Terminal
  | 'terminal_overflow'
  | 'terminal_exit';

interface InitOptions {
  installSource?: string;
}

let enabled = true;
let apiKey: string | undefined;
let host: string | undefined;
let instanceId: string | undefined;
let installSource: string | undefined;
let userOptOut: boolean | undefined; // persisted user setting
let sessionStartMs: number = Date.now();
let sessionId: string = '';
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let firstInteractionSent = false;

const libName = 'emdash';

function getVersionSafe(): string {
  try {
    return app.getVersion();
  } catch {
    return 'unknown';
  }
}

function getInstanceIdPath(): string {
  const dir = app.getPath('userData');
  return join(dir, 'telemetry.json');
}

function loadOrCreateState(): {
  instanceId: string;
  enabledOverride?: boolean;
  createdAt?: string;
  justCreated?: boolean;
} {
  try {
    const file = getInstanceIdPath();
    if (existsSync(file)) {
      const raw = readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.instanceId === 'string' && parsed.instanceId.length > 0) {
        const enabledOverride =
          typeof parsed.enabled === 'boolean' ? (parsed.enabled as boolean) : undefined;
        return {
          instanceId: parsed.instanceId as string,
          enabledOverride,
          createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : undefined,
          justCreated: false,
        };
      }
    }
  } catch {
    // fall through to create
  }
  // Create new random ID
  const id = cryptoRandomId();
  try {
    persistState({ instanceId: id });
  } catch {
    // ignore write errors; still use in-memory id
  }
  return { instanceId: id, justCreated: true };
}

function cryptoRandomId(): string {
  try {
    const { randomUUID } = require('crypto');
    return randomUUID();
  } catch {
    // Very old Node fallback; not expected in Electron 28+
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function isEnabled(): boolean {
  return (
    enabled === true &&
    userOptOut !== true &&
    !!apiKey &&
    !!host &&
    typeof instanceId === 'string' &&
    instanceId.length > 0
  );
}

function getBaseProps() {
  return {
    app_version: getVersionSafe(),
    electron_version: process.versions.electron,
    node_version: process.versions.node,
    v8_version: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    is_dev: !app.isPackaged,
    install_source: installSource ?? (app.isPackaged ? 'dmg' : 'dev'),
    $lib: libName,
    session_id: sessionId,
  } as const;
}

function sanitizeEventAndProps(event: TelemetryEvent, props: Record<string, any> | undefined) {
  const p: Record<string, any> = {};
  const baseAllowed = new Set([
    // explicitly allow only these keys to avoid PII
    'feature',
    'type',
    // session
    'session_duration_ms',
    'first_interaction_ms',
    // aggregates (counts + buckets only)
    'workspace_count',
    'workspace_count_bucket',
    'project_count',
    'project_count_bucket',
    // perf
    'cold_start_ms',
    'first_paint_ms',
    // container/codex/run props
    'mode',
    'success',
    'duration_ms',
    // terminal props
    'bytes',
    'window_bytes',
    'max_window_bytes',
    'exit_code',
    'signal',
    'total_bytes',
    // toggles
    'enabled',
  ]);

  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (!baseAllowed.has(k)) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        p[k] = v;
      }
    }
  }

  // Helpers
  const clampInt = (n: any, min = 0, max = 10_000_000) => {
    const v = typeof n === 'number' ? Math.floor(n) : Number.parseInt(String(n), 10);
    if (!Number.isFinite(v)) return undefined;
    return Math.min(Math.max(v, min), max);
  };

  const BUCKETS = new Set(['0', '1-2', '3-5', '6-10', '>10']);

  // Event-specific constraints
  switch (event) {
    case 'feature_used':
      // Only retain a simple feature name
      if (typeof p.feature !== 'string') delete p.feature;
      break;
    case 'error':
      if (typeof p.type !== 'string') delete p.type;
      break;
    case 'app_perf': {
      const cap = (n: any, max = 5 * 60 * 1000) => {
        const v = clampInt(n, 0, max);
        return v == null ? undefined : v;
      };
      if (p.cold_start_ms != null) p.cold_start_ms = cap(p.cold_start_ms);
      if (p.first_paint_ms != null) p.first_paint_ms = cap(p.first_paint_ms);
      for (const k of Object.keys(p)) if (k !== 'cold_start_ms' && k !== 'first_paint_ms') delete p[k];
      break;
    }
    case 'app_session':
      // Only duration
      if (p.session_duration_ms != null) {
        const v = clampInt(p.session_duration_ms, 0, 1000 * 60 * 60 * 24); // up to 24h
        if (v == null) delete p.session_duration_ms;
        else p.session_duration_ms = v;
      }
      // strip any other keys
      for (const k of Object.keys(p)) if (k !== 'session_duration_ms') delete p[k];
      break;
    case 'app_session_heartbeat': {
      if (p.session_duration_ms != null) {
        const v = clampInt(p.session_duration_ms, 0, 1000 * 60 * 60 * 24);
        if (v == null) delete p.session_duration_ms;
        else p.session_duration_ms = v;
      }
      for (const k of Object.keys(p)) if (k !== 'session_duration_ms') delete p[k];
      break;
    }
    case 'app_first_interaction':
      if (p.first_interaction_ms != null) {
        const v = clampInt(p.first_interaction_ms, 0, 1000 * 60 * 60);
        if (v == null) delete p.first_interaction_ms;
        else p.first_interaction_ms = v;
      }
      for (const k of Object.keys(p)) if (k !== 'first_interaction_ms') delete p[k];
      break;
    case 'workspace_snapshot':
      // Allow only counts and very coarse buckets
      if (p.workspace_count != null) {
        const v = clampInt(p.workspace_count, 0, 100000);
        if (v == null) delete p.workspace_count;
        else p.workspace_count = v;
      }
      if (p.project_count != null) {
        const v = clampInt(p.project_count, 0, 100000);
        if (v == null) delete p.project_count;
        else p.project_count = v;
      }
      if (p.workspace_count_bucket && !BUCKETS.has(String(p.workspace_count_bucket))) {
        delete p.workspace_count_bucket;
      }
      if (p.project_count_bucket && !BUCKETS.has(String(p.project_count_bucket))) {
        delete p.project_count_bucket;
      }
      // strip anything else
      for (const k of Object.keys(p)) {
        if (
          k !== 'workspace_count' &&
          k !== 'workspace_count_bucket' &&
          k !== 'project_count' &&
          k !== 'project_count_bucket'
        ) {
          delete p[k];
        }
      }
      break;
    case 'container_run_started':
      if (typeof p.mode !== 'string') delete p.mode;
      for (const k of Object.keys(p)) if (k !== 'mode') delete p[k];
      break;
    case 'container_run_completed':
      if (typeof p.success !== 'boolean') delete p.success;
      if (p.duration_ms != null) {
        const v = clampInt(p.duration_ms, 0, 1000 * 60 * 60);
        if (v == null) delete p.duration_ms;
        else p.duration_ms = v;
      }
      for (const k of Object.keys(p)) if (k !== 'success' && k !== 'duration_ms') delete p[k];
      break;
    case 'container_run_failed':
      if (typeof p.type !== 'string') delete p.type;
      for (const k of Object.keys(p)) if (k !== 'type') delete p[k];
      break;
    case 'codex_exec_started':
      // no props retained
      for (const k of Object.keys(p)) delete p[k];
      break;
    case 'codex_exec_completed':
      if (typeof p.success !== 'boolean') delete p.success;
      if (p.duration_ms != null) {
        const v = clampInt(p.duration_ms, 0, 1000 * 60 * 60);
        if (v == null) delete p.duration_ms;
        else p.duration_ms = v;
      }
      for (const k of Object.keys(p)) if (k !== 'success' && k !== 'duration_ms') delete p[k];
      break;
    case 'codex_exec_failed':
      if (typeof p.type !== 'string') delete p.type;
      for (const k of Object.keys(p)) if (k !== 'type') delete p[k];
      break;
    case 'terminal_overflow':
      if (p.bytes != null) p.bytes = clampInt(p.bytes, 0, 1_000_000_000);
      if (p.window_bytes != null) p.window_bytes = clampInt(p.window_bytes, 0, 10_000_000_000);
      if (p.max_window_bytes != null)
        p.max_window_bytes = clampInt(p.max_window_bytes, 0, 10_000_000_000);
      for (const k of Object.keys(p))
        if (k !== 'bytes' && k !== 'window_bytes' && k !== 'max_window_bytes') delete p[k];
      break;
    case 'terminal_exit':
      if (p.exit_code != null) p.exit_code = clampInt(p.exit_code, -1, 10_000);
      if (p.signal != null) p.signal = clampInt(p.signal, 0, 256);
      if (p.total_bytes != null) p.total_bytes = clampInt(p.total_bytes, 0, 10_000_000_000);
      for (const k of Object.keys(p))
        if (k !== 'exit_code' && k !== 'signal' && k !== 'total_bytes') delete p[k];
      break;
    case 'telemetry_toggled':
      if (typeof p.enabled !== 'boolean') delete p.enabled;
      for (const k of Object.keys(p)) if (k !== 'enabled') delete p[k];
      break;
    default:
      // no additional props for lifecycle events
      for (const k of Object.keys(p)) delete p[k];
      break;
  }

  return p;
}

async function posthogCapture(
  event: TelemetryEvent,
  properties?: Record<string, any>
): Promise<void> {
  if (!isEnabled()) return;
  try {
    // Use global fetch if available (Node 18+/Electron 28+)
    const f: any = (globalThis as any).fetch;
    if (!f) return;
    const u = (host || '').replace(/\/$/, '') + '/capture/';
    const body = {
      api_key: apiKey,
      event,
      properties: {
        distinct_id: instanceId,
        $ip: '0',
        ...getBaseProps(),
        ...sanitizeEventAndProps(event, properties),
      },
    };
    await f(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  } catch {
    // swallow errors; telemetry must never crash the app
  }
}

export function init(options?: InitOptions) {
  const env = process.env;
  const enabledEnv = (env.TELEMETRY_ENABLED ?? 'true').toString().toLowerCase();
  enabled = enabledEnv !== 'false' && enabledEnv !== '0' && enabledEnv !== 'no';
  apiKey =
    env.POSTHOG_PROJECT_API_KEY || (appConfig?.posthogKey as string | undefined) || undefined;
  host = normalizeHost(
    env.POSTHOG_HOST || (appConfig?.posthogHost as string | undefined) || undefined
  );
  installSource = options?.installSource || env.INSTALL_SOURCE || undefined;

  const state = loadOrCreateState();
  instanceId = state.instanceId;
  sessionStartMs = Date.now();
  sessionId = cryptoRandomId();
  // If enabledOverride is explicitly false, user opted out; otherwise leave undefined
  userOptOut =
    typeof state.enabledOverride === 'boolean' ? state.enabledOverride === false : undefined;

  // Fire lifecycle start
  void posthogCapture('app_started');
  if (state.justCreated) {
    void posthogCapture('first_run');
  }

  // Heartbeat every 5 minutes to get richer session duration telemetry
  try {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      try {
        const dur = Math.max(0, Date.now() - (sessionStartMs || Date.now()));
        void posthogCapture('app_session_heartbeat', { session_duration_ms: dur });
      } catch {}
    }, 5 * 60 * 1000);
  } catch {}
}

export function capture(event: TelemetryEvent, properties?: Record<string, any>) {
  if (event === 'app_session') {
    const dur = Math.max(0, Date.now() - (sessionStartMs || Date.now()));
    void posthogCapture(event, { session_duration_ms: dur });
    return;
  }
  void posthogCapture(event, properties);
}

export function shutdown() {
  // No-op for now (no batching). Left for future posthog-node integration.
  try {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  } catch {}
}

export function isTelemetryEnabled(): boolean {
  return isEnabled();
}

export function getTelemetryStatus() {
  return {
    enabled: isEnabled(),
    envDisabled: !enabled,
    userOptOut: userOptOut === true,
    hasKeyAndHost: !!apiKey && !!host,
  };
}

export function setTelemetryEnabledViaUser(enabledFlag: boolean) {
  userOptOut = !enabledFlag;
  // Persist alongside instanceId
  try {
    const file = getInstanceIdPath();
    let state: any = {};
    if (existsSync(file)) {
      try {
        state = JSON.parse(readFileSync(file, 'utf8')) || {};
      } catch {
        state = {};
      }
    }
    state.instanceId = instanceId || state.instanceId || cryptoRandomId();
    state.enabled = enabledFlag; // store explicit preference
    state.updatedAt = new Date().toISOString();
    writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // ignore
  }
  try {
    void posthogCapture('telemetry_toggled', { enabled: enabledFlag });
  } catch {}
}

export function getSessionElapsedMs(): number {
  return Math.max(0, Date.now() - (sessionStartMs || Date.now()));
}

function persistState(state: { instanceId: string; enabledOverride?: boolean }) {
  try {
    const existing = existsSync(getInstanceIdPath())
      ? JSON.parse(readFileSync(getInstanceIdPath(), 'utf8'))
      : {};
    const merged = {
      ...existing,
      instanceId: state.instanceId,
      enabled:
        typeof state.enabledOverride === 'boolean' ? state.enabledOverride : existing.enabled,
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(getInstanceIdPath(), JSON.stringify(merged, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

function normalizeHost(h: string | undefined): string | undefined {
  if (!h) return undefined;
  let s = String(h).trim();
  if (!/^https?:\/\//i.test(s)) {
    s = 'https://' + s;
  }
  return s.replace(/\/+$/, '');
}
