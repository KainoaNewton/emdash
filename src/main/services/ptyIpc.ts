import { ipcMain, WebContents } from 'electron';
import { startPty, writePty, resizePty, killPty, getPty } from './ptyManager';
import { log } from '../lib/logger';

const owners = new Map<string, WebContents>();
const listeners = new Set<string>();

// Simple scrollback buffer per PTY id, to replay when re-attaching
const buffers = new Map<string, string[]>();
const MAX_BUFFER_BYTES = 200_000; // ~200 KB

function appendBuffer(id: string, chunk: string) {
  const arr = buffers.get(id) ?? [];
  arr.push(chunk);
  // Trim if over byte budget
  let total = arr.reduce((n, s) => n + Buffer.byteLength(s, 'utf8'), 0);
  while (arr.length > 1 && total > MAX_BUFFER_BYTES) {
    const removed = arr.shift()!;
    total -= Buffer.byteLength(removed, 'utf8');
  }
  buffers.set(id, arr);
}

// --- Input/Output sanitization ---------------------------------------------
// Remove OSC (Operating System Command) sequences and common stray fragments
// so they don't leak into app inputs or visible output when switching/reattaching.
type OscState = {
  inOsc: boolean;
  sawEscInOsc: boolean; // for detecting ST terminator ESC \\
};

const inputOscState = new Map<string, OscState>();
function sanitizeInputChunk(id: string, chunk: string): string {
  let state = inputOscState.get(id);
  if (!state) {
    state = { inOsc: false, sawEscInOsc: false };
    inputOscState.set(id, state);
  }
  let out = '';
  for (let i = 0; i < chunk.length; i++) {
    const ch = chunk[i];
    const code = ch.charCodeAt(0);
    if (!state.inOsc) {
      if (code === 0x1b && i + 1 < chunk.length && chunk[i + 1] === ']') {
        state.inOsc = true;
        state.sawEscInOsc = false;
        i++;
        continue;
      }
      out += ch;
      continue;
    }
    if (code === 0x07) {
      state.inOsc = false;
      state.sawEscInOsc = false;
      continue;
    }
    if (state.sawEscInOsc) {
      if (ch === '\\') {
        state.inOsc = false;
        state.sawEscInOsc = false;
        continue;
      }
      state.sawEscInOsc = false;
    }
    if (code === 0x1b) {
      state.sawEscInOsc = true;
      continue;
    }
  }
  return out;
}

const outputOscState = new Map<string, OscState>();
function sanitizeOutputChunk(id: string, chunk: string): string {
  let state = outputOscState.get(id);
  if (!state) {
    state = { inOsc: false, sawEscInOsc: false };
    outputOscState.set(id, state);
  }
  let out = '';
  for (let i = 0; i < chunk.length; i++) {
    const ch = chunk[i];
    const code = ch.charCodeAt(0);
    if (!state.inOsc) {
      if (code === 0x1b && i + 1 < chunk.length && chunk[i + 1] === ']') {
        state.inOsc = true;
        state.sawEscInOsc = false;
        i++;
        continue;
      }
      out += ch;
      continue;
    }
    if (code === 0x07) {
      state.inOsc = false;
      state.sawEscInOsc = false;
      continue;
    }
    if (state.sawEscInOsc) {
      if (ch === '\\') {
        state.inOsc = false;
        state.sawEscInOsc = false;
        continue;
      }
      state.sawEscInOsc = false;
    }
    if (code === 0x1b) {
      state.sawEscInOsc = true;
      continue;
    }
  }
  // Strip stray color-reply fragments if OSC introducer got cooked away
  out = out.replace(/(^|[\s>])(?:10|11|12);rgb:[0-9a-f]{1,4}\/[0-9a-f]{1,4}\/[0-9a-f]{1,4}(?:;rgb:[0-9a-f]{1,4}\/[0-9a-f]{1,4}\/[0-9a-f]{1,4})*(?=$|\s)/gi, '$1');
  // Strip DA/CPR responses if they surface
  out = out.replace(/\x1b\[\?\d+(?:;\d+)*[a-zA-Z]/g, '');
  out = out.replace(/\x1b\[\d+(?:;\d+)*R/g, '');
  out = out.replace(/(^|[\s>])\d+(?:;\d+)*[cR](?=$|\s)/g, '$1');
  return out;
}

export function registerPtyIpc(): void {
  ipcMain.handle(
    'pty:start',
    (
      event,
      args: {
        id: string;
        cwd?: string;
        shell?: string;
        env?: Record<string, string>;
        cols?: number;
        rows?: number;
      }
    ) => {
      try {
        const { id, cwd, shell, env, cols, rows } = args;
        // Reuse existing PTY if present; otherwise create new
        const existing = getPty(id);
        const proc = existing ?? startPty({ id, cwd, shell, env, cols, rows });
        log.debug('pty:start OK', { id, cwd, shell, cols, rows, reused: !!existing });
        const wc = event.sender;
        owners.set(id, wc);

        // Attach listeners once per PTY id
        if (!listeners.has(id)) {
          proc.onData((data) => {
            const cleaned = sanitizeOutputChunk(id, data);
            if (cleaned) {
              appendBuffer(id, cleaned);
              owners.get(id)?.send(`pty:data:${id}`, cleaned);
            }
          });

          proc.onExit(({ exitCode, signal }) => {
            owners.get(id)?.send(`pty:exit:${id}`, { exitCode, signal });
            owners.delete(id);
            listeners.delete(id);
            buffers.delete(id);
          });
          listeners.add(id);
        }

        // If there's buffered history, replay it to the current owner
        const history = buffers.get(id);
        if (history && history.length) {
          try {
            wc.send(`pty:history:${id}`, history.join(''));
          } catch {}
        }

        // Signal that PTY is ready so renderer may inject initial prompt safely
        try {
          const { BrowserWindow } = require('electron');
          const windows = BrowserWindow.getAllWindows();
          windows.forEach((w: any) => w.webContents.send('pty:started', { id }));
        } catch {}

        return { ok: true };
      } catch (err: any) {
        log.error('pty:start FAIL', {
          id: args.id,
          cwd: args.cwd,
          shell: args.shell,
          error: err?.message || err,
        });
        return { ok: false, error: String(err?.message || err) };
      }
    }
  );

  ipcMain.on('pty:input', (_event, args: { id: string; data: string }) => {
    try {
      const cleaned = sanitizeInputChunk(args.id, args.data);
      if (cleaned) writePty(args.id, cleaned);
    } catch (e) {
      log.error('pty:input error', e);
    }
  });

  ipcMain.on('pty:resize', (_event, args: { id: string; cols: number; rows: number }) => {
    try {
      resizePty(args.id, args.cols, args.rows);
    } catch (e) {
      log.error('pty:resize error', e);
    }
  });

  ipcMain.on('pty:kill', (_event, args: { id: string }) => {
    try {
      killPty(args.id);
      owners.delete(args.id);
      listeners.delete(args.id);
      buffers.delete(args.id);
    } catch (e) {
      log.error('pty:kill error', e);
    }
  });
}
