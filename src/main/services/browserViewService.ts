import { BrowserWindow, WebContentsView, app } from 'electron';
import { getMainWindow } from '../app/window';

class BrowserViewService {
  private view: WebContentsView | null = null;
  private visible = false;

  ensureView(win?: BrowserWindow): WebContentsView | null {
    const w = win || getMainWindow() || undefined;
    if (!w) {
      console.error('[BrowserViewService] ensureView: No window');
      return null;
    }
    if (!this.view) {
      console.log('[BrowserViewService] Creating new WebContentsView');
      this.view = new WebContentsView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      w.contentView.addChildView(this.view);
      console.log('[BrowserViewService] WebContentsView added to contentView');
      try {
        this.view.webContents.setWindowOpenHandler?.(() => ({ action: 'deny' }) as any);
      } catch {}
      this.visible = true;
    } else {
      console.log('[BrowserViewService] Reusing existing WebContentsView');
    }
    return this.view;
  }

  show(bounds: Electron.Rectangle, url?: string) {
    console.log('[BrowserViewService] show() called', { bounds, url, hasView: !!this.view });
    const win = getMainWindow() || undefined;
    if (!win) {
      console.error('[BrowserViewService] No main window available');
      return;
    }
    const v = this.ensureView(win);
    if (!v) {
      console.error('[BrowserViewService] Failed to ensure view');
      return;
    }
    console.log('[BrowserViewService] Setting bounds:', bounds);
    v.setBounds(bounds);
    try {
      // Keep rendering even when not focused/visible previously
      v.webContents.setBackgroundThrottling?.(false as any);
    } catch {}
    if (url) {
      console.log('[BrowserViewService] Loading URL:', url);
      try {
        v.webContents.loadURL(url);
      } catch (err) {
        console.error('[BrowserViewService] Failed to loadURL:', err);
      }
    }
    try {
      v.webContents.focus();
    } catch {}
    // Nudge paint on some platforms: re-apply bounds on next tick
    try {
      setTimeout(() => {
        try {
          console.log('[BrowserViewService] Re-applying bounds after delay');
          v.setBounds(bounds);
        } catch {}
      }, 16);
    } catch {}
    this.visible = true;
    console.log('[BrowserViewService] View shown, visible:', this.visible);
  }

  hide() {
    if (!this.view) return;
    try {
      // Move offscreen instead of removing to keep state
      this.view.setBounds({ x: -10000, y: -10000, width: 1, height: 1 });
    } catch {}
    this.visible = false;
  }

  setBounds(bounds: Electron.Rectangle) {
    if (!this.view) return;
    try {
      this.view.setBounds(bounds);
    } catch {}
  }

  loadURL(url: string) {
    const v = this.ensureView();
    if (!v) return;
    try {
      v.webContents.loadURL(url);
    } catch {}
  }

  goBack() {
    try {
      this.view?.webContents.goBack();
    } catch {}
  }
  goForward() {
    try {
      this.view?.webContents.goForward();
    } catch {}
  }
  reload() {
    try {
      this.view?.webContents.reload();
    } catch {}
  }

  isVisible(): boolean {
    return this.visible;
  }
}

export const browserViewService = new BrowserViewService();
