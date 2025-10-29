import React, { useState } from 'react';
import { AcpThreadView } from './acp/AcpThreadView';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Label } from './ui/label';

/**
 * AcpDemoPane - A demo component for testing ACP integration.
 * This allows creating new ACP sessions and interacting with them.
 */
export const AcpDemoPane: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [providerId, setProviderId] = useState('gemini');
  const [workspaceId, setWorkspaceId] = useState('demo-workspace');
  const [cwd, setCwd] = useState(process.cwd?.() || '/tmp');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateSession = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const result = await window.electronAPI.acpNewSession({
        providerId,
        workspaceId,
        cwd,
      });

      if (result.success && result.sessionId) {
        setSessionId(result.sessionId);
      } else {
        setError(result.error || 'Failed to create session');
      }
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCloseSession = () => {
    setSessionId(null);
    setError(null);
  };

  if (sessionId) {
    return (
      <div className="h-full w-full">
        <AcpThreadView
          sessionId={sessionId}
          providerId={providerId}
          workspaceId={workspaceId}
          onClose={handleCloseSession}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full w-full p-8">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-2">Create ACP Session</h2>
          <p className="text-sm text-muted-foreground">
            Start a new session with an ACP-capable agent provider.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive text-sm rounded border border-destructive">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label htmlFor="providerId">Provider</Label>
            <Input
              id="providerId"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              placeholder="gemini"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Currently supported: gemini (requires @google/gemini-cli)
            </p>
          </div>

          <div>
            <Label htmlFor="workspaceId">Workspace ID</Label>
            <Input
              id="workspaceId"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              placeholder="demo-workspace"
            />
          </div>

          <div>
            <Label htmlFor="cwd">Working Directory</Label>
            <Input
              id="cwd"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="/path/to/workspace"
            />
          </div>
        </div>

        <Button onClick={handleCreateSession} disabled={isCreating} className="w-full">
          {isCreating ? 'Creating Session...' : 'Create Session'}
        </Button>
      </Card>
    </div>
  );
};
