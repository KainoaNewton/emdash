# ACP Integration Quick Start

This guide shows how to test the ACP integration in Emdash.

## Prerequisites

Install the Gemini CLI (the reference ACP agent):

```bash
npm install -g @google/gemini-cli
gemini --version
```

## Using the ACP Demo Pane

The ACP integration includes a demo pane component that can be used to test ACP sessions.

### Option 1: Direct Component Usage

Import and use the `AcpDemoPane` component in your workspace view:

```tsx
import { AcpDemoPane } from './components/AcpDemoPane';

function MyWorkspace() {
  return (
    <div className="h-full">
      <AcpDemoPane />
    </div>
  );
}
```

### Option 2: Programmatic Session Creation

Use the ACP API directly in your components:

```tsx
import { useState } from 'react';
import { AcpThreadView } from './components/acp/AcpThreadView';

function MyAcpWorkspace() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  const createSession = async () => {
    const result = await window.electronAPI.acpNewSession({
      providerId: 'gemini',
      workspaceId: 'my-workspace',
      cwd: '/path/to/workspace',
    });
    
    if (result.success && result.sessionId) {
      setSessionId(result.sessionId);
    }
  };
  
  if (sessionId) {
    return (
      <AcpThreadView
        sessionId={sessionId}
        providerId="gemini"
        workspaceId="my-workspace"
        onClose={() => setSessionId(null)}
      />
    );
  }
  
  return <button onClick={createSession}>Start ACP Session</button>;
}
```

## Testing Workflow

1. **Start a session**: Use the demo pane to create a new session
2. **Send a prompt**: Enter a message like "What is the Agent Client Protocol?"
3. **View responses**: Watch real-time notifications appear in the log
4. **Test cancellation**: Start a long-running prompt and click Cancel
5. **Check logs**: Session logs are saved to `<userData>/logs/acp/<sessionId>.log`

## API Reference

### Creating Sessions

```typescript
const result = await window.electronAPI.acpNewSession({
  providerId: 'gemini',       // ACP provider to use
  workspaceId: 'workspace-1', // Your workspace identifier
  cwd: '/workspace/path',     // Working directory for the agent
});

if (result.success) {
  console.log('Session ID:', result.sessionId);
} else {
  console.error('Error:', result.error);
}
```

### Sending Prompts

```typescript
const result = await window.electronAPI.acpPrompt({
  sessionId: 'gemini-workspace-1-1234567890',
  prompt: 'Help me refactor this code',
});
```

### Listening for Events

```typescript
// Listen for notifications
const unsubscribe = window.electronAPI.onAcpUpdate((data) => {
  if (data.type === 'notification') {
    console.log('Notification:', data.payload);
  } else if (data.type === 'stderr') {
    console.log('Stderr:', data.payload);
  } else if (data.type === 'exit') {
    console.log('Process exited:', data.payload.code);
  }
});

// Clean up listener
unsubscribe();
```

### Canceling Prompts

```typescript
await window.electronAPI.acpCancel({ sessionId });
```

### Disposing Sessions

```typescript
await window.electronAPI.acpDispose({ sessionId });
```

## Configuration

Configure ACP settings in your application settings:

```json
{
  "acp": {
    "enabled": true,
    "providers": {
      "gemini": {
        "path": "/custom/path/to/gemini"
      }
    },
    "timeouts": {
      "initializeMs": 15000,
      "promptMs": 600000
    }
  }
}
```

## Troubleshooting

### Session Initialization Fails

**Error**: "Initialize timeout or error"

**Solutions**:
1. Verify Gemini CLI is installed: `gemini --version`
2. Check the binary is in your PATH
3. Try setting a custom path in settings
4. Check stderr output in the ACP thread view

### Invalid JSON Errors

**Error**: "Invalid JSON from agent"

**Solutions**:
1. Ensure you're using a compatible version of the Gemini CLI
2. Check session logs for the actual output
3. Verify the agent is responding with valid JSON-RPC 2.0

### Process Exits Immediately

**Solutions**:
1. Check the working directory exists and is accessible
2. Review stderr output for crash details
3. Check session logs in `<userData>/logs/acp/`

## Development Tips

### Testing with a Mock Agent

For development and testing without Gemini CLI, you can use `spawnOverride`:

```typescript
await window.electronAPI.acpNewSession({
  providerId: 'gemini',
  workspaceId: 'test',
  cwd: '/tmp',
  spawnOverride: {
    command: 'node',
    args: ['/path/to/mock-agent.js'],
  },
});
```

See `docs/acp.md` for a mock agent implementation example.

### Viewing Logs

Session logs include all JSON-RPC traffic:

```bash
# On macOS
tail -f ~/Library/Application\ Support/emdash/logs/acp/*.log

# On Linux
tail -f ~/.config/emdash/logs/acp/*.log

# On Windows
type %APPDATA%\emdash\logs\acp\*.log
```

## Next Steps

- See `docs/acp.md` for complete documentation
- Review the integration plan in `docs/plans/acp-integration-plan.md`
- Explore the source code:
  - Main: `src/main/services/AcpService.ts`
  - IPC: `src/main/ipc/acpIpc.ts`
  - UI: `src/renderer/components/acp/AcpThreadView.tsx`
