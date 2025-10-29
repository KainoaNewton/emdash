import React, { useEffect, useState, useRef } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';

interface AcpThreadViewProps {
  sessionId: string;
  providerId: string;
  workspaceId: string;
  onClose?: () => void;
}

interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'notification' | 'stderr' | 'exit' | 'user' | 'error';
  content: any;
}

export const AcpThreadView: React.FC<AcpThreadViewProps> = ({
  sessionId,
  providerId,
  workspaceId,
  onClose,
}) => {
  const [status, setStatus] = useState<'ready' | 'running' | 'error' | 'exited'>('ready');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Listen for ACP updates
    const unsubscribeUpdate = window.electronAPI.onAcpUpdate((data) => {
      if (data.sessionId !== sessionId) return;

      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        type: data.type,
        content: data.payload,
      };

      setLogs((prev) => [...prev, entry]);

      if (data.type === 'exit') {
        setStatus('exited');
        setIsSending(false);
      }

      // Auto-scroll to bottom
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 50);
    });

    const unsubscribeError = window.electronAPI.onAcpError((data) => {
      if (data.sessionId && data.sessionId !== sessionId) return;

      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        type: 'error',
        content: data.error,
      };

      setLogs((prev) => [...prev, entry]);
      setStatus('error');
      setIsSending(false);
    });

    return () => {
      unsubscribeUpdate();
      unsubscribeError();
    };
  }, [sessionId]);

  const handleSend = async () => {
    if (!inputValue.trim() || isSending) return;

    const userEntry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      type: 'user',
      content: inputValue,
    };

    setLogs((prev) => [...prev, userEntry]);
    setIsSending(true);
    setStatus('running');

    const result = await window.electronAPI.acpPrompt({
      sessionId,
      prompt: inputValue,
    });

    if (!result.success) {
      const errorEntry: LogEntry = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        type: 'error',
        content: result.error || 'Unknown error',
      };
      setLogs((prev) => [...prev, errorEntry]);
      setStatus('error');
    }

    setInputValue('');
    setIsSending(false);
  };

  const handleCancel = async () => {
    const result = await window.electronAPI.acpCancel({ sessionId });
    if (result.success) {
      setStatus('ready');
      setIsSending(false);
    }
  };

  const handleClose = async () => {
    await window.electronAPI.acpDispose({ sessionId });
    if (onClose) onClose();
  };

  const renderLogEntry = (entry: LogEntry) => {
    const timeStr = entry.timestamp.toLocaleTimeString();

    switch (entry.type) {
      case 'user':
        return (
          <div key={entry.id} className="mb-2">
            <div className="flex items-baseline gap-2">
              <Badge variant="outline" className="text-xs">
                {timeStr}
              </Badge>
              <Badge variant="default">You</Badge>
            </div>
            <div className="mt-1 pl-4 text-sm font-medium">{entry.content}</div>
          </div>
        );

      case 'notification':
        return (
          <div key={entry.id} className="mb-2">
            <div className="flex items-baseline gap-2">
              <Badge variant="outline" className="text-xs">
                {timeStr}
              </Badge>
              <Badge variant="secondary">{entry.content.method || 'notification'}</Badge>
            </div>
            <pre className="mt-1 pl-4 text-xs overflow-x-auto bg-muted/50 p-2 rounded">
              {JSON.stringify(entry.content, null, 2)}
            </pre>
          </div>
        );

      case 'stderr':
        return (
          <div key={entry.id} className="mb-2">
            <div className="flex items-baseline gap-2">
              <Badge variant="outline" className="text-xs">
                {timeStr}
              </Badge>
              <Badge variant="destructive">stderr</Badge>
            </div>
            <pre className="mt-1 pl-4 text-xs text-destructive">{entry.content}</pre>
          </div>
        );

      case 'exit':
        return (
          <div key={entry.id} className="mb-2">
            <div className="flex items-baseline gap-2">
              <Badge variant="outline" className="text-xs">
                {timeStr}
              </Badge>
              <Badge variant="secondary">exit</Badge>
            </div>
            <div className="mt-1 pl-4 text-sm">Exit code: {entry.content.code ?? 'null'}</div>
          </div>
        );

      case 'error':
        return (
          <div key={entry.id} className="mb-2">
            <div className="flex items-baseline gap-2">
              <Badge variant="outline" className="text-xs">
                {timeStr}
              </Badge>
              <Badge variant="destructive">error</Badge>
            </div>
            <div className="mt-1 pl-4 text-sm text-destructive">{entry.content}</div>
          </div>
        );

      default:
        return null;
    }
  };

  const statusColor =
    status === 'ready'
      ? 'bg-green-500'
      : status === 'running'
        ? 'bg-blue-500'
        : status === 'error'
          ? 'bg-red-500'
          : 'bg-gray-500';

  return (
    <Card className="flex flex-col h-full w-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-3">
          <div className={`h-2 w-2 rounded-full ${statusColor}`} />
          <div>
            <div className="font-semibold">ACP Session</div>
            <div className="text-xs text-muted-foreground">
              {providerId} • {workspaceId.slice(0, 8)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {status}
          </Badge>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={handleClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Log area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {logs.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Session ready. Send a prompt to get started.
          </div>
        ) : (
          <div>{logs.map(renderLogEntry)}</div>
        )}
      </ScrollArea>

      {/* Input area */}
      <div className="border-t p-4 space-y-2">
        <Textarea
          placeholder="Enter your prompt..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={isSending || status === 'exited'}
          rows={3}
        />
        <div className="flex gap-2">
          <Button onClick={handleSend} disabled={isSending || status === 'exited' || !inputValue.trim()}>
            {isSending ? 'Sending...' : 'Send'}
          </Button>
          {isSending && (
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
