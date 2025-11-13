import {
  TerminalSessionManager,
  type SessionTheme,
  type TerminalSessionOptions,
} from './TerminalSessionManager';

const DEFAULT_SCROLLBACK_LINES = 100_000;

interface AttachOptions {
  workspaceId: string;
  container: HTMLElement;
  cwd?: string;
  shell?: string;
  env?: Record<string, string>;
  initialSize: { cols: number; rows: number };
  theme: SessionTheme;
}

class SessionRegistry {
  private readonly sessions = new Map<string, TerminalSessionManager>();

  attach(options: AttachOptions): TerminalSessionManager {
    const session = this.getOrCreate(options);
    session.setTheme(options.theme);
    session.attach(options.container);
    return session;
  }

  detach(workspaceId: string) {
    this.sessions.get(workspaceId)?.detach();
  }

  dispose(workspaceId: string) {
    const session = this.sessions.get(workspaceId);
    if (!session) return;
    session.dispose();
    this.sessions.delete(workspaceId);
  }

  disposeAll() {
    for (const id of Array.from(this.sessions.keys())) {
      this.dispose(id);
    }
  }

  private getOrCreate(options: AttachOptions): TerminalSessionManager {
    const existing = this.sessions.get(options.workspaceId);
    if (existing) return existing;

    const sessionOptions: TerminalSessionOptions = {
      workspaceId: options.workspaceId,
      cwd: options.cwd,
      shell: options.shell,
      env: options.env,
      initialSize: options.initialSize,
      scrollbackLines: DEFAULT_SCROLLBACK_LINES,
      theme: options.theme,
      telemetry: {
        track: (event: string, payload?: Record<string, unknown>) => {
          try {
            if (event === 'terminal_overflow') {
              const p = payload || {};
              const mapped: Record<string, unknown> = {};
              if (typeof (p as any).bytes === 'number') mapped.bytes = (p as any).bytes;
              if (typeof (p as any).windowBytes === 'number')
                mapped.window_bytes = (p as any).windowBytes;
              if (typeof (p as any).maxWindowBytes === 'number')
                mapped.max_window_bytes = (p as any).maxWindowBytes;
              void (window as any).electronAPI?.captureTelemetry?.('terminal_overflow', mapped);
              return;
            }
            if (event === 'terminal_exit') {
              const p = payload || {};
              const mapped: Record<string, unknown> = {};
              if ((p as any).exitCode != null) mapped.exit_code = (p as any).exitCode as any;
              if ((p as any).signal != null) mapped.signal = (p as any).signal as any;
              if ((p as any).totalBytes != null) mapped.total_bytes = (p as any).totalBytes as any;
              void (window as any).electronAPI?.captureTelemetry?.('terminal_exit', mapped);
              return;
            }
            // Fallback: feature tag
            void (window as any).electronAPI?.captureTelemetry?.('feature_used', {
              feature: String(event),
            });
          } catch {}
        },
      },
    };

    const session = new TerminalSessionManager(sessionOptions);
    this.sessions.set(options.workspaceId, session);
    return session;
  }
}

export const terminalSessionRegistry = new SessionRegistry();
