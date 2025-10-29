import { ipcMain, BrowserWindow } from 'electron';
import { acpService } from '../services/AcpService';
import { log } from '../lib/logger';

/**
 * Register ACP IPC handlers.
 */
export function registerAcpIpc(getWindow: () => BrowserWindow | null): void {
  // Create new session
  ipcMain.handle('acp:newSession', async (_, args) => {
    try {
      const result = await acpService.newSession(args);
      return result;
    } catch (err: any) {
      log.error('acpIpc', `newSession error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // Send prompt
  ipcMain.handle('acp:prompt', async (_, args) => {
    try {
      const { sessionId, prompt } = args;
      const result = await acpService.prompt(sessionId, prompt);
      return result;
    } catch (err: any) {
      log.error('acpIpc', `prompt error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // Cancel prompt
  ipcMain.handle('acp:cancel', async (_, args) => {
    try {
      const { sessionId } = args;
      const result = await acpService.cancel(sessionId);
      return result;
    } catch (err: any) {
      log.error('acpIpc', `cancel error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // Dispose session
  ipcMain.handle('acp:dispose', async (_, args) => {
    try {
      const { sessionId } = args;
      acpService.dispose(sessionId);
      return { success: true };
    } catch (err: any) {
      log.error('acpIpc', `dispose error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // Forward notifications to renderer
  acpService.on('notification', (data) => {
    const win = getWindow();
    if (win) {
      win.webContents.send('acp:update', data);
    }
  });

  // Forward errors to renderer
  acpService.on('error', (data) => {
    const win = getWindow();
    if (win) {
      win.webContents.send('acp:error', data);
    }
  });

  log.info('acpIpc', 'ACP IPC handlers registered');
}
