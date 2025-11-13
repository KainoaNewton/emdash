import { ipcMain } from 'electron';
import {
  capture,
  isTelemetryEnabled,
  getTelemetryStatus,
  setTelemetryEnabledViaUser,
  getSessionElapsedMs,
} from '../telemetry';

let firstUserEventSent = false;

export function registerTelemetryIpc() {
  ipcMain.handle('telemetry:capture', async (_event, args: { event: string; properties?: any }) => {
    try {
      if (!isTelemetryEnabled()) return { success: false, disabled: true };
      const ev = String(args?.event || '') as any;
      const allowed = new Set([
        'feature_used',
        'error',
        'project_added',
        'workspace_created',
        'workspace_deleted',
        'workspace_switched',
        'container_run_started',
        'container_run_completed',
        'container_run_failed',
        'github_connected',
        'pr_list_opened',
        'pr_created',
        'pr_opened',
        'codex_exec_started',
        'codex_exec_completed',
        'codex_exec_failed',
        'command_palette_opened',
        'settings_opened',
        'terminal_overflow',
        'terminal_exit',
        'telemetry_toggled',
      ]);
      if (!allowed.has(ev)) return { success: false, error: 'event_not_allowed' };
      const props =
        args?.properties && typeof args.properties === 'object' ? args.properties : undefined;
      if (!firstUserEventSent) {
        firstUserEventSent = true;
        try {
          const elapsed = getSessionElapsedMs();
          capture('app_first_interaction', { first_interaction_ms: elapsed });
        } catch {}
      }
      capture(ev, props);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'capture_failed' };
    }
  });

  ipcMain.handle('telemetry:get-status', async () => {
    try {
      return { success: true, status: getTelemetryStatus() };
    } catch (e: any) {
      return { success: false, error: e?.message || 'status_failed' };
    }
  });

  ipcMain.handle('telemetry:set-enabled', async (_event, enabled: boolean) => {
    try {
      setTelemetryEnabledViaUser(Boolean(enabled));
      return { success: true, status: getTelemetryStatus() };
    } catch (e: any) {
      return { success: false, error: e?.message || 'update_failed' };
    }
  });
}
