import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { createWriteStream, existsSync, mkdirSync, WriteStream } from 'fs';
import path from 'path';
import { app } from 'electron';
import { log } from '../lib/logger';
import { getAppSettings } from '../settings';

// JSON-RPC 2.0 types
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export interface AcpSession {
  id: string;
  providerId: string;
  workspaceId: string;
  cwd: string;
  process: ChildProcess;
  status: 'initializing' | 'ready' | 'error' | 'exited';
  protocolVersion?: string;
  capabilities?: any;
}

export interface AcpNewSessionArgs {
  providerId: string;
  workspaceId: string;
  cwd: string;
  spawnOverride?: { command: string; args?: string[] };
  init?: any;
}

export class AcpService extends EventEmitter {
  private sessions: Map<string, AcpSession> = new Map();
  private pendingRequests: Map<string | number, { resolve: (val: any) => void; reject: (err: any) => void; timeout: NodeJS.Timeout }> = new Map();
  private requestIdCounter = 0;
  private logWriters: Map<string, WriteStream> = new Map();

  constructor() {
    super();
  }

  /**
   * Create a new ACP session by spawning the provider binary.
   */
  async newSession(args: AcpNewSessionArgs): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    const { providerId, workspaceId, cwd, spawnOverride, init } = args;
    const sessionId = `${providerId}-${workspaceId}-${Date.now()}`;

    try {
      // Resolve spawn command
      const spawnSpec = spawnOverride || this.getProviderSpawnSpec(providerId);
      if (!spawnSpec) {
        return { success: false, error: `Provider ${providerId} not found in registry` };
      }

      // Spawn process
      const proc = spawn(spawnSpec.command, spawnSpec.args || [], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      const session: AcpSession = {
        id: sessionId,
        providerId,
        workspaceId,
        cwd,
        process: proc,
        status: 'initializing',
      };

      this.sessions.set(sessionId, session);

      // Setup log writer
      this.setupLogWriter(sessionId);

      // Wire up stdio
      this.wireStdio(sessionId, proc);

      // Send initialize request
      const settings = getAppSettings();
      const timeout = settings.acp.timeouts.initializeMs;
      
      const initParams = init || {
        clientInfo: {
          name: 'emdash',
          version: app.getVersion(),
        },
        capabilities: {
          fs: {
            read_text_file: true,
            write_text_file: true,
          },
          terminal: true,
          meta: {
            terminal_output: true,
          },
        },
      };

      try {
        const result = await this.rpcCall(sessionId, 'initialize', initParams, timeout);
        
        // Check protocol version
        if (result.protocolVersion && parseInt(result.protocolVersion) < 1) {
          this.dispose(sessionId);
          return { success: false, error: 'Unsupported protocol version (requires v1+)' };
        }

        session.status = 'ready';
        session.protocolVersion = result.protocolVersion;
        session.capabilities = result.capabilities;

        log.info('AcpService', `Session ${sessionId} initialized successfully`);
        return { success: true, sessionId };
      } catch (err: any) {
        this.dispose(sessionId);
        return { success: false, error: `Initialize timeout or error: ${err.message}` };
      }
    } catch (err: any) {
      return { success: false, error: `Failed to spawn provider: ${err.message}` };
    }
  }

  /**
   * Send a prompt to an active ACP session.
   */
  async prompt(sessionId: string, promptText: string): Promise<{ success: boolean; result?: any; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    if (session.status !== 'ready') {
      return { success: false, error: `Session not ready (status: ${session.status})` };
    }

    try {
      const settings = getAppSettings();
      const timeout = settings.acp.timeouts.promptMs;
      const result = await this.rpcCall(sessionId, 'prompt', { prompt: promptText }, timeout);
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Cancel an ongoing prompt.
   */
  async cancel(sessionId: string): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      await this.rpcNotify(sessionId, 'cancel', {});
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Dispose a session and clean up resources.
   */
  dispose(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Kill process
    if (session.process && !session.process.killed) {
      session.process.kill();
    }

    // Clean up pending requests
    this.pendingRequests.forEach((pending, reqId) => {
      if (reqId.toString().startsWith(sessionId)) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Session disposed'));
        this.pendingRequests.delete(reqId);
      }
    });

    // Close log writer
    const writer = this.logWriters.get(sessionId);
    if (writer) {
      writer.end();
      this.logWriters.delete(sessionId);
    }

    this.sessions.delete(sessionId);
    log.info('AcpService', `Session ${sessionId} disposed`);
  }

  /**
   * Get provider spawn specification.
   */
  private getProviderSpawnSpec(providerId: string): { command: string; args?: string[] } | null {
    const settings = getAppSettings();
    
    if (providerId === 'gemini') {
      const command = settings.acp.providers.gemini.path || (process.platform === 'win32' ? 'gemini.cmd' : 'gemini');
      return { command };
    }

    return null;
  }

  /**
   * Wire stdio streams for a session.
   */
  private wireStdio(sessionId: string, proc: ChildProcess): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    let buffer = '';

    // stdout: newline-delimited JSON
    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Ignore lines that are too large (>64KB)
        if (trimmed.length > 65536) {
          log.warn('AcpService', `Session ${sessionId}: Ignoring oversized line (${trimmed.length} bytes)`);
          continue;
        }

        try {
          const msg: JsonRpcMessage = JSON.parse(trimmed);
          this.handleMessage(sessionId, msg);
        } catch (err) {
          log.error('AcpService', `Session ${sessionId}: Invalid JSON: ${trimmed.slice(0, 200)}`);
          this.emit('error', { sessionId, error: 'Invalid JSON from agent' });
        }
      }
    });

    // stderr: forward as-is
    proc.stderr?.on('data', (chunk: Buffer) => {
      const data = chunk.toString('utf8');
      this.writeLog(sessionId, `[stderr] ${data}`);
      this.emit('notification', { sessionId, type: 'stderr', payload: data });
    });

    // exit
    proc.on('exit', (code, signal) => {
      log.info('AcpService', `Session ${sessionId} exited: code=${code}, signal=${signal}`);
      if (session) session.status = 'exited';
      this.emit('notification', { sessionId, type: 'exit', payload: { code } });
      this.dispose(sessionId);
    });

    proc.on('error', (err) => {
      log.error('AcpService', `Session ${sessionId} process error: ${err.message}`);
      if (session) session.status = 'error';
      this.emit('error', { sessionId, error: err.message });
    });
  }

  /**
   * Handle incoming JSON-RPC message.
   */
  private handleMessage(sessionId: string, msg: JsonRpcMessage): void {
    // Response
    if ('id' in msg && 'result' in msg || 'error' in msg) {
      const response = msg as JsonRpcResponse;
      const reqKey = `${sessionId}:${response.id}`;
      const pending = this.pendingRequests.get(reqKey);
      
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(reqKey);

        if (response.error) {
          pending.reject(new Error(response.error.message));
        } else {
          pending.resolve(response.result);
        }
      }
      return;
    }

    // Notification
    if ('method' in msg && !('id' in msg)) {
      const notification = msg as JsonRpcNotification;
      this.writeLog(sessionId, `[notification] ${notification.method}: ${JSON.stringify(notification.params)}`);
      this.emit('notification', { sessionId, type: 'notification', payload: notification });
    }
  }

  /**
   * Make an RPC call with timeout.
   */
  private rpcCall(sessionId: string, method: string, params: any, timeoutMs: number): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.process.stdin) {
      return Promise.reject(new Error('Session not available'));
    }

    const id = ++this.requestIdCounter;
    const reqKey = `${sessionId}:${id}`;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(reqKey);
        reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(reqKey, { resolve, reject, timeout });

      const line = JSON.stringify(request) + '\n';
      session.process.stdin!.write(line, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingRequests.delete(reqKey);
          reject(err);
        }
      });

      this.writeLog(sessionId, `[request] ${method}: ${JSON.stringify(params)}`);
    });
  }

  /**
   * Send a notification (no response expected).
   */
  private rpcNotify(sessionId: string, method: string, params: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.process.stdin) {
      return Promise.reject(new Error('Session not available'));
    }

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const line = JSON.stringify(notification) + '\n';
      session.process.stdin!.write(line, (err) => {
        if (err) reject(err);
        else resolve();
      });

      this.writeLog(sessionId, `[notify] ${method}: ${JSON.stringify(params)}`);
    });
  }

  /**
   * Setup log writer for a session.
   */
  private setupLogWriter(sessionId: string): void {
    try {
      const logsDir = path.join(app.getPath('userData'), 'logs', 'acp');
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }

      const logFile = path.join(logsDir, `${sessionId}.log`);
      const writer = createWriteStream(logFile, { flags: 'a' });
      this.logWriters.set(sessionId, writer);
      
      writer.write(`\n=== Session ${sessionId} started at ${new Date().toISOString()} ===\n`);
    } catch (err: any) {
      log.error('AcpService', `Failed to setup log writer for ${sessionId}: ${err.message}`);
    }
  }

  /**
   * Write to session log file.
   */
  private writeLog(sessionId: string, message: string): void {
    const writer = this.logWriters.get(sessionId);
    if (writer) {
      const timestamp = new Date().toISOString();
      writer.write(`[${timestamp}] ${message}\n`);
    }
  }

  /**
   * Get all active sessions.
   */
  getSessions(): AcpSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get a specific session.
   */
  getSession(sessionId: string): AcpSession | undefined {
    return this.sessions.get(sessionId);
  }
}

// Singleton instance
export const acpService = new AcpService();
