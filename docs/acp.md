# ACP Integration Documentation

## Overview

Emdash now supports the Agent Client Protocol (ACP), enabling rich interaction with ACP-capable agents. This integration provides a dedicated UI view for ACP sessions with real-time streaming, terminal output, and structured notifications.

## What is ACP?

The Agent Client Protocol is a standardized protocol for communicating with AI coding agents. It uses JSON-RPC 2.0 over stdio to enable:

- Structured message exchange (requests, responses, notifications)
- File system operations (read/write)
- Terminal output streaming
- Model and mode selection
- Authentication flows

Learn more: https://agentclientprotocol.com/overview/introduction

## Features

### Phase 1 (MVP) - Available Now

- **Session Management**: Create, manage, and dispose ACP sessions
- **Streaming Messages**: Real-time notification streaming from agents
- **Terminal Output**: Stderr capture and display
- **Interactive Prompts**: Send prompts and receive structured responses
- **Session Lifecycle**: Initialize, prompt, cancel, and clean shutdown

### Phase 2+ (Roadmap)

- File operations and diff previews
- Authentication flows
- Model/mode selection
- MCP server passthrough
- Multiple terminal instances per session

## Supported Providers

### Gemini CLI

The reference implementation uses Google's Gemini CLI.

**Installation:**
```bash
npm install -g @google/gemini-cli
```

**Verify installation:**
```bash
gemini --version
```

## Configuration

ACP settings are stored in your application settings file:

```json
{
  "acp": {
    "enabled": true,
    "providers": {
      "gemini": {
        "path": "/custom/path/to/gemini"  // Optional: override binary path
      }
    },
    "timeouts": {
      "initializeMs": 15000,   // Initialize timeout (1s - 60s)
      "promptMs": 600000       // Prompt timeout (10s - 1h)
    }
  }
}
```

### Settings

- **`acp.enabled`** (boolean): Feature flag to enable/disable ACP. Default: `true`
- **`acp.providers.gemini.path`** (string, optional): Override the Gemini binary path
- **`acp.timeouts.initializeMs`** (number): Maximum time to wait for session initialization
- **`acp.timeouts.promptMs`** (number): Maximum time to wait for prompt completion

## Using ACP in Emdash

### Creating a Session

1. Navigate to the ACP demo pane (currently accessible via developer tools)
2. Configure session parameters:
   - **Provider**: Select `gemini` (or other ACP-capable provider)
   - **Workspace ID**: Identifier for your workspace
   - **Working Directory**: The CWD for the agent process
3. Click "Create Session"

### Interacting with an Agent

Once a session is created:

1. The session status indicator shows the current state (ready, running, error, exited)
2. Enter your prompt in the text area
3. Click "Send" or press Enter to submit
4. View real-time notifications and responses in the log area
5. Click "Cancel" to abort an in-progress prompt

### Understanding the Log

The ACP Thread View displays different types of messages:

- **User**: Your prompts (blue badge)
- **Notification**: JSON-RPC notifications from the agent (gray badge)
- **stderr**: Standard error output (red badge)
- **exit**: Process exit events (gray badge)
- **error**: Protocol or connection errors (red badge)

## Architecture

### Main Process

**AcpService (`src/main/services/AcpService.ts`)**
- Manages child processes for ACP agents
- Implements JSON-RPC 2.0 over newline-delimited JSON
- Handles session lifecycle (spawn, initialize, dispose)
- Forwards notifications to the renderer via IPC

**acpIpc (`src/main/ipc/acpIpc.ts`)**
- IPC handlers for renderer communication
- Bridges AcpService to Electron's IPC system
- Event forwarding for real-time updates

### Preload

Safely exposes ACP APIs to the renderer:
- `acpNewSession(args)`: Create a new session
- `acpPrompt(sessionId, prompt)`: Send a prompt
- `acpCancel(sessionId)`: Cancel ongoing prompt
- `acpDispose(sessionId)`: Dispose session
- `onAcpUpdate(callback)`: Listen for notifications
- `onAcpError(callback)`: Listen for errors

### Renderer

**AcpThreadView (`src/renderer/components/acp/AcpThreadView.tsx`)**
- Interactive session interface
- Real-time log display
- Status tracking
- Input controls (send, cancel)

**AcpDemoPane (`src/renderer/components/AcpDemoPane.tsx`)**
- Session creation wizard
- Provider configuration
- Error handling

## Protocol Details

### Transport

- **Format**: JSON-RPC 2.0
- **Framing**: Newline-delimited JSON (upgrade to official ACP SDK in Phase 2)
- **stdio**: Stdin for requests/notifications, stdout for responses/notifications, stderr for logs

### Capabilities

Emdash advertises these capabilities during initialization:

```json
{
  "fs": {
    "read_text_file": true,
    "write_text_file": true
  },
  "terminal": true,
  "meta": {
    "terminal_output": true
  }
}
```

### Version

- Minimum protocol version: v1
- Sessions with version < 1 are rejected

## Troubleshooting

### Session Initialization Fails

**Problem**: "Initialize timeout or error"

**Solutions**:
1. Verify the provider binary is installed and in PATH
2. Check `acp.providers.gemini.path` if using a custom installation
3. Increase `acp.timeouts.initializeMs` in settings
4. Check stderr output in the log for error details

### Invalid JSON Errors

**Problem**: "Invalid JSON from agent"

**Solutions**:
1. Ensure the agent binary outputs valid JSON-RPC 2.0
2. Check for binary output corruption or encoding issues
3. Review session logs in `userData/logs/acp/`

### Process Exits Unexpectedly

**Problem**: Session exits with non-zero code

**Solutions**:
1. Check stderr output for crash details
2. Verify CWD exists and is accessible
3. Review agent-specific documentation for requirements

## Logs

ACP session logs are written to:
```
<userData>/logs/acp/<sessionId>.log
```

Each log includes:
- Timestamps
- JSON-RPC requests and responses
- Notifications
- stderr output
- Exit events

## Development

### Testing with a Mock Agent

Create a simple JSON-RPC echo server for testing:

```javascript
#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.method === 'initialize') {
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: { protocolVersion: '1', capabilities: {} }
    }));
  } else if (msg.method === 'prompt') {
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      method: 'message',
      params: { content: `Echo: ${msg.params.prompt}` }
    }));
    setTimeout(() => {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: { status: 'completed' }
      }));
    }, 1000);
  }
});
```

Save as `mock-acp-agent.js`, make executable, and use as `spawnOverride` in `acpNewSession`.

### Extending ACP

To add a new provider:

1. Update settings types in `src/main/settings.ts`
2. Add spawn spec in `AcpService.getProviderSpawnSpec()`
3. Document provider requirements and installation

## Security

- stdio streams are never exposed directly to the renderer
- All messages are parsed and validated before forwarding
- Paths and content are sanitized in UI logs
- No embedded code or shell commands are executed from agent output

## References

- [ACP Documentation](https://agentclientprotocol.com/overview/introduction)
- [Zed's ACP Implementation](https://github.com/zed-industries/zed)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)

## Future Enhancements

See the full integration plan in `docs/plans/acp-integration-plan.md` for:
- Phase 2: File operations, diffs, auth, model selection
- Phase 3: MCP passthrough, multiple terminals, robust error UX
- Phase 4: Polish, settings UI, accessibility, documentation
