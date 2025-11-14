import { ipcMain, BrowserWindow } from 'electron';
import { browserViewService } from '../services/browserViewService';

export function registerBrowserIpc() {
  ipcMain.handle(
    'browser:view:show',
    (_e, args: { x: number; y: number; width: number; height: number; url?: string }) => {
      const { x, y, width, height, url } = args || ({} as any);
      browserViewService.show({ x, y, width, height }, url);
      return { ok: true };
    }
  );
  ipcMain.handle('browser:view:hide', () => {
    browserViewService.hide();
    return { ok: true };
  });
  ipcMain.handle(
    'browser:view:setBounds',
    (_e, args: { x: number; y: number; width: number; height: number }) => {
      const { x, y, width, height } = args || ({} as any);
      browserViewService.setBounds({ x, y, width, height });
      return { ok: true };
    }
  );
  ipcMain.handle('browser:view:loadURL', (_e, url: string) => {
    browserViewService.loadURL(url);
    return { ok: true };
  });
  ipcMain.handle('browser:view:goBack', () => {
    browserViewService.goBack();
    return { ok: true };
  });
  ipcMain.handle('browser:view:goForward', () => {
    browserViewService.goForward();
    return { ok: true };
  });
  ipcMain.handle('browser:view:reload', () => {
    browserViewService.reload();
    return { ok: true };
  });
  ipcMain.handle('browser:view:openDevTools', () => {
    try {
      const view = (browserViewService as any).view;
      if (view?.webContents) {
        view.webContents.openDevTools();
      }
    } catch {}
    return { ok: true };
  });

  // Forward browser view events to renderer
  const forward = (evt: any) => {
    const all = BrowserWindow.getAllWindows();
    for (const win of all) {
      try {
        win.webContents.send('browser:view:event', evt);
      } catch {}
    }
  };
  browserViewService.onEvent(forward);
}
