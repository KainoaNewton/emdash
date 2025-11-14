import { ipcMain } from 'electron';
import net from 'node:net';

export function registerNetIpc() {
  ipcMain.handle(
    'net:probe-ports',
    async (
      _e,
      args: { host?: string; ports?: number[]; timeoutMs?: number }
    ): Promise<{ ok: boolean; reachable: number[] }> => {
      try {
        const host = (args?.host || 'localhost').trim() || 'localhost';
        const ports = Array.isArray(args?.ports) ? args!.ports!.filter((p) => Number(p) > 0) : [];
        const timeoutMs = Math.max(100, Math.min(Number(args?.timeoutMs || 800), 5000));
        if (!ports.length) return { ok: true, reachable: [] };

        return await new Promise<{ ok: boolean; reachable: number[] }>((resolve) => {
          const reachable = new Set<number>();
          let pending = ports.length;
          let resolved = false;

          const finish = () => {
            if (!resolved) {
              resolved = true;
              resolve({ ok: true, reachable: Array.from(reachable) });
            }
          };

          for (const port of ports) {
            const socket = new net.Socket();
            const onDone = () => {
              try {
                socket.destroy();
              } catch {}
              pending -= 1;
              if (pending <= 0) finish();
            };
            socket.setTimeout(timeoutMs);
            socket.once('connect', () => {
              try {
                socket.end();
              } catch {}
              reachable.add(port);
              // Return early on first success to speed up UX
              finish();
            });
            socket.once('timeout', onDone);
            socket.once('error', onDone);
            try {
              socket.connect(port, host);
            } catch {
              onDone();
            }
          }
        });
      } catch {
        return { ok: true, reachable: [] };
      }
    }
  );
}

