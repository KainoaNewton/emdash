import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Workspace = {
  id: string;
  name: string;
  branch: string;
  path: string;
  status: 'active' | 'idle' | 'running';
};

interface Props {
  workspace: Workspace;
  className?: string;
}

type DetectedScripts = {
  dev?: string;
  start?: string;
  preview?: string;
};

const LOCALHOST_URL_RE = /\bhttps?:\/\/(localhost|127\.0\.0\.1|\[::1\]):(\d{2,5})\b/i;

export const PreviewPanel: React.FC<Props> = ({ workspace, className }) => {
  const ptyId = useMemo(() => `preview-${workspace.id}`, [workspace.id]);

  const [command, setCommand] = useState<string>('');
  const [port, setPort] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [running, setRunning] = useState<boolean>(false);
  const [logs, setLogs] = useState<string>('');
  const [autoDetected, setAutoDetected] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Persist minimal per-workspace settings
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`preview:${workspace.id}`);
      if (saved) {
        const obj = JSON.parse(saved);
        if (typeof obj.command === 'string') setCommand(obj.command);
        if (typeof obj.port === 'string') setPort(obj.port);
      }
    } catch {}
  }, [workspace.id]);

  const savePrefs = useCallback(
    (next: { command?: string; port?: string }) => {
      try {
        const cur = localStorage.getItem(`preview:${workspace.id}`);
        const base = cur ? JSON.parse(cur) : {};
        const merged = { ...base, ...next } as any;
        localStorage.setItem(`preview:${workspace.id}`, JSON.stringify(merged));
      } catch {}
    },
    [workspace.id]
  );

  // Heuristics: detect scripts and pick a sensible default
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.electronAPI.fsRead(workspace.path, 'package.json', 100_000);
        if (!res?.success || !res.content) return;
        const pkg = JSON.parse(res.content);
        const scripts: DetectedScripts = pkg?.scripts || {};
        let defaultCmd = '';
        let defaultPort = '';

        if (scripts.dev) defaultCmd = 'npm run dev';
        else if (scripts.preview) defaultCmd = 'npm run preview';
        else if (scripts.start) defaultCmd = 'npm start';
        else {
          const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
          if (deps.next) {
            defaultCmd = 'npx next dev';
            defaultPort = '3000';
          } else if (deps.vite) {
            defaultCmd = 'npx vite';
            defaultPort = '5173';
          } else if (deps.react && deps['react-scripts']) {
            defaultCmd = 'npm start';
            defaultPort = '3000';
          }
        }

        if (!cancelled) {
          if (!command && defaultCmd) {
            setCommand(defaultCmd);
            setAutoDetected(true);
            savePrefs({ command: defaultCmd });
          }
          if (!port && defaultPort) {
            setPort(defaultPort);
            savePrefs({ port: defaultPort });
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace.path]);

  // Append PTY logs and try to detect URL
  useEffect(() => {
    const offData = window.electronAPI.onPtyData(ptyId, (chunk) => {
      setLogs((prev) => (prev + chunk).slice(-200_000));
      try {
        const m = chunk.match(LOCALHOST_URL_RE);
        if (m && m[0] && !url) {
          setUrl(m[0]);
        }
      } catch {}
    });
    const offExit = window.electronAPI.onPtyExit(ptyId, () => {
      setRunning(false);
    });
    const offHist = window.electronAPI.onPtyHistory?.(ptyId, (hist) => setLogs((prev) => prev + hist));
    return () => {
      offData?.();
      offExit?.();
      offHist?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptyId]);

  const start = useCallback(async () => {
    if (!command.trim()) return;
    setLogs('');
    setUrl(port.trim() ? `http://localhost:${port.trim()}` : '');
    const res = await window.electronAPI.ptyStart({ id: ptyId, cwd: workspace.path });
    if (res?.ok) {
      // Send the command and hit enter
      window.electronAPI.ptyInput({ id: ptyId, data: command + '\n' });
      setRunning(true);
    } else {
      setRunning(false);
    }
  }, [command, port, ptyId, workspace.path]);

  const stop = useCallback(() => {
    try {
      // Try graceful Ctrl+C, then kill
      window.electronAPI.ptyInput({ id: ptyId, data: '\u0003' });
      setTimeout(() => window.electronAPI.ptyKill(ptyId), 500);
    } catch {}
    setRunning(false);
  }, [ptyId]);

  const openExternal = useCallback(() => {
    if (!url) return;
    window.electronAPI.openExternal(url);
  }, [url]);

  const reload = useCallback(() => {
    try {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.location.reload();
      }
    } catch {}
  }, []);

  return (
    <div className={`flex h-full min-h-0 flex-col ${className || ''}`}>
      <div className="flex items-center gap-2 border-b border-border bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            className="w-[46%] min-w-0 rounded border border-border bg-background px-2 py-1 font-mono text-xs outline-none focus:ring-1"
            placeholder="Command (e.g., npm run dev)"
            value={command}
            onChange={(e) => {
              setCommand(e.target.value);
              savePrefs({ command: e.target.value });
            }}
            title={autoDetected ? 'Auto-detected' : 'Custom'}
          />
          <input
            className="w-24 rounded border border-border bg-background px-2 py-1 font-mono text-xs outline-none focus:ring-1"
            placeholder="Port"
            inputMode="numeric"
            value={port}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '');
              setPort(v);
              savePrefs({ port: v });
            }}
          />
          <div className="flex items-center gap-2">
            {!running ? (
              <button
                className="rounded bg-black px-2 py-1 text-xs text-white hover:bg-gray-800"
                onClick={start}
                disabled={!command.trim()}
              >
                Start Preview
              </button>
            ) : (
              <button
                className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                onClick={stop}
              >
                Stop
              </button>
            )}
            <button
              className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
              onClick={openExternal}
              disabled={!url}
              title={url || 'No URL yet'}
            >
              Open in Browser
            </button>
            <button
              className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
              onClick={reload}
              disabled={!url}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {url ? (
          <iframe
            ref={iframeRef}
            src={url}
            title="Workspace Preview"
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            {running
              ? 'Waiting for dev server URL…'
              : 'Set command and start the preview to load a URL'}
          </div>
        )}
      </div>
      <div className="h-32 w-full border-t border-border bg-black p-2 font-mono text-[11px] text-white">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-300">Logs</div>
        <pre className="m-0 h-[calc(100%-1rem)] overflow-auto whitespace-pre-wrap break-words">{logs}</pre>
      </div>
    </div>
  );
};

export default PreviewPanel;

