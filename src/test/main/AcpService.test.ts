import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock child_process
const mockProcesses = new Map<string, any>();
let spawnCallCount = 0;

vi.mock('child_process', () => {
  return {
    spawn: vi.fn((command: string, args?: string[], options?: any) => {
      spawnCallCount++;
      const mockProc = new EventEmitter() as any;
      mockProc.stdin = {
        write: vi.fn((data: string, callback?: any) => {
          // Simulate successful write
          if (callback) callback();
          return true;
        }),
      };
      mockProc.stdout = new EventEmitter();
      mockProc.stderr = new EventEmitter();
      mockProc.kill = vi.fn();
      mockProc.killed = false;

      const key = `${command}-${spawnCallCount}`;
      mockProcesses.set(key, mockProc);

      // Simulate initialize response after a short delay
      setTimeout(() => {
        if (mockProc.stdout) {
          const initResponse = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              protocolVersion: '1',
              capabilities: { fs: true, terminal: true },
            },
          });
          mockProc.stdout.emit('data', Buffer.from(initResponse + '\n'));
        }
      }, 10);

      return mockProc;
    }),
  };
});

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.0-test',
    getPath: (name: string) => '/tmp/test-app',
  },
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
  })),
}));

// Mock logger
vi.mock('../../main/lib/logger', () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock settings
vi.mock('../../main/settings', () => ({
  getAppSettings: vi.fn(() => ({
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
  })),
}));

describe('AcpService', () => {
  let AcpService: any;
  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockProcesses.clear();
    spawnCallCount = 0;

    // Import the service after mocks are set up
    const module = await import('../../main/services/AcpService');
    AcpService = module.AcpService;
    service = new AcpService();
  });

  it('creates a new session successfully', async () => {
    const result = await service.newSession({
      providerId: 'gemini',
      workspaceId: 'test-workspace',
      cwd: '/tmp',
    });

    expect(result.success).toBe(true);
    expect(result.sessionId).toBeDefined();
    expect(result.sessionId).toContain('gemini-test-workspace');
  });

  it('rejects sessions with unsupported providers', async () => {
    const result = await service.newSession({
      providerId: 'unknown-provider',
      workspaceId: 'test-workspace',
      cwd: '/tmp',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found in registry');
  });

  it('handles session disposal correctly', async () => {
    const result = await service.newSession({
      providerId: 'gemini',
      workspaceId: 'test-workspace',
      cwd: '/tmp',
    });

    expect(result.success).toBe(true);
    const sessionId = result.sessionId!;

    // Verify session exists
    const session = service.getSession(sessionId);
    expect(session).toBeDefined();

    // Dispose session
    service.dispose(sessionId);

    // Verify session is removed
    const disposedSession = service.getSession(sessionId);
    expect(disposedSession).toBeUndefined();
  });

  it('forwards notifications to event listeners', async () => {
    return new Promise<void>((resolve) => {
      service.on('notification', (data: any) => {
        expect(data.sessionId).toBeDefined();
        expect(data.type).toBe('notification');
        expect(data.payload).toBeDefined();
        resolve();
      });

      service.newSession({
        providerId: 'gemini',
        workspaceId: 'test-workspace',
        cwd: '/tmp',
      }).then((result: any) => {
        const sessionId = result.sessionId;
        const session = service.getSession(sessionId);
        
        if (session) {
          // Emit a mock notification
          const notification = JSON.stringify({
            jsonrpc: '2.0',
            method: 'test-notification',
            params: { foo: 'bar' },
          });
          session.process.stdout.emit('data', Buffer.from(notification + '\n'));
        }
      });
    });
  });

  it('handles prompt requests', async () => {
    const sessionResult = await service.newSession({
      providerId: 'gemini',
      workspaceId: 'test-workspace',
      cwd: '/tmp',
    });

    expect(sessionResult.success).toBe(true);
    const sessionId = sessionResult.sessionId!;

    // Set up mock response for prompt
    const session = service.getSession(sessionId);
    setTimeout(() => {
      const response = JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: { status: 'completed' },
      });
      session.process.stdout.emit('data', Buffer.from(response + '\n'));
    }, 10);

    const promptResult = await service.prompt(sessionId, 'test prompt');
    expect(promptResult.success).toBe(true);
    expect(promptResult.result).toBeDefined();
  });

  it('returns error for prompt on non-existent session', async () => {
    const result = await service.prompt('non-existent-session', 'test');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('handles cancel requests', async () => {
    const sessionResult = await service.newSession({
      providerId: 'gemini',
      workspaceId: 'test-workspace',
      cwd: '/tmp',
    });

    const sessionId = sessionResult.sessionId!;
    const cancelResult = await service.cancel(sessionId);
    
    expect(cancelResult.success).toBe(true);
  });
});