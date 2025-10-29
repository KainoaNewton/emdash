import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

export interface RepositorySettings {
  branchTemplate: string; // e.g., 'agent/{slug}-{timestamp}'
  pushOnCreate: boolean; // default true
}

export interface AcpProviderSettings {
  path?: string; // Override binary path (e.g., for gemini)
}

export interface AcpTimeouts {
  initializeMs: number; // default 15000
  promptMs: number; // default 600000 (10 minutes)
}

export interface AcpSettings {
  enabled: boolean; // Feature flag; default true
  providers: {
    gemini: AcpProviderSettings;
  };
  timeouts: AcpTimeouts;
}

export interface AppSettings {
  repository: RepositorySettings;
  acp: AcpSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  repository: {
    branchTemplate: 'agent/{slug}-{timestamp}',
    pushOnCreate: true,
  },
  acp: {
    enabled: true,
    providers: {
      gemini: {},
    },
    timeouts: {
      initializeMs: 15000,
      promptMs: 600000,
    },
  },
};

function getSettingsPath(): string {
  const dir = app.getPath('userData');
  return join(dir, 'settings.json');
}

function deepMerge<T extends Record<string, any>>(base: T, partial?: Partial<T>): T {
  if (!partial) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const [k, v] of Object.entries(partial)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge((base as any)[k] ?? {}, v as any);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

let cached: AppSettings | null = null;

/**
 * Load application settings from disk with sane defaults.
 */
export function getAppSettings(): AppSettings {
  try {
    if (cached) return cached;
    const file = getSettingsPath();
    if (existsSync(file)) {
      const raw = readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      cached = normalizeSettings(deepMerge(DEFAULT_SETTINGS, parsed));
      return cached;
    }
  } catch {
    // ignore read/parse errors, fall through to defaults
  }
  cached = { ...DEFAULT_SETTINGS };
  return cached;
}

/**
 * Update settings and persist to disk. Partial updates are deeply merged.
 */
export function updateAppSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getAppSettings();
  const merged = deepMerge(current, partial);
  const next = normalizeSettings(merged);
  persistSettings(next);
  cached = next;
  return next;
}

export function persistSettings(settings: AppSettings) {
  try {
    const file = getSettingsPath();
    const dir = dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8');
  } catch {
    // Ignore write errors; settings are best-effort
  }
}

/**
 * Coerce and validate settings for robustness and forward-compatibility.
 */
function normalizeSettings(input: AppSettings): AppSettings {
  const out: AppSettings = {
    repository: {
      branchTemplate: DEFAULT_SETTINGS.repository.branchTemplate,
      pushOnCreate: DEFAULT_SETTINGS.repository.pushOnCreate,
    },
    acp: {
      enabled: DEFAULT_SETTINGS.acp.enabled,
      providers: {
        gemini: {},
      },
      timeouts: {
        initializeMs: DEFAULT_SETTINGS.acp.timeouts.initializeMs,
        promptMs: DEFAULT_SETTINGS.acp.timeouts.promptMs,
      },
    },
  };

  // Repository
  const repo = input?.repository ?? DEFAULT_SETTINGS.repository;
  let template = String(repo?.branchTemplate ?? DEFAULT_SETTINGS.repository.branchTemplate);
  template = template.trim();
  if (!template) template = DEFAULT_SETTINGS.repository.branchTemplate;
  // Keep templates reasonably short to avoid overly long refs
  if (template.length > 200) template = template.slice(0, 200);
  const push = Boolean(repo?.pushOnCreate ?? DEFAULT_SETTINGS.repository.pushOnCreate);

  out.repository.branchTemplate = template;
  out.repository.pushOnCreate = push;

  // ACP
  const acp = input?.acp ?? DEFAULT_SETTINGS.acp;
  out.acp.enabled = Boolean(acp?.enabled ?? DEFAULT_SETTINGS.acp.enabled);
  
  // ACP providers
  if (acp?.providers?.gemini?.path) {
    out.acp.providers.gemini.path = String(acp.providers.gemini.path);
  }

  // ACP timeouts
  const initMs = Number(acp?.timeouts?.initializeMs ?? DEFAULT_SETTINGS.acp.timeouts.initializeMs);
  const promptMs = Number(acp?.timeouts?.promptMs ?? DEFAULT_SETTINGS.acp.timeouts.promptMs);
  out.acp.timeouts.initializeMs = Math.max(1000, Math.min(60000, initMs)); // 1s to 60s
  out.acp.timeouts.promptMs = Math.max(10000, Math.min(3600000, promptMs)); // 10s to 1h

  return out;
}
