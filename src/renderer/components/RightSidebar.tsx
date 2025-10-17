import React from 'react';
import { cn } from '@/lib/utils';
import FileChangesPanel from './FileChangesPanel';
import WorkspaceTerminalPanel from './WorkspaceTerminalPanel';
import PreviewPanel from './PreviewPanel';
import { useRightSidebar } from './ui/right-sidebar';

export interface RightSidebarWorkspace {
  id: string;
  name: string;
  branch: string;
  path: string;
  status: 'active' | 'idle' | 'running';
  agentId?: string;
}

interface RightSidebarProps extends React.HTMLAttributes<HTMLElement> {
  workspace: RightSidebarWorkspace | null;
}

const RightSidebar: React.FC<RightSidebarProps> = ({ workspace, className, ...rest }) => {
  const { collapsed } = useRightSidebar();

  const [mode, setMode] = React.useState<'terminal' | 'preview'>('terminal');

  return (
    <aside
      data-state={collapsed ? 'collapsed' : 'open'}
      className={cn(
        'group/right-sidebar relative z-[60] flex h-full w-full min-w-0 flex-shrink-0 flex-col overflow-hidden border-l border-border bg-muted/10 transition-all duration-200 ease-linear',
        'data-[state=collapsed]:pointer-events-none data-[state=collapsed]:border-l-0',
        className
      )}
      aria-hidden={collapsed}
      {...rest}
    >
      <div className="flex h-full w-full min-w-0 flex-col">
        {workspace ? (
          <div className="flex h-full flex-col">
            <FileChangesPanel
              workspaceId={workspace.path}
              className="min-h-0 flex-1 border-b border-border"
            />
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-1 border-b border-border bg-gray-50 px-2 py-1 text-xs dark:bg-gray-900">
                <button
                  className={`rounded px-2 py-1 ${
                    mode === 'terminal'
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'border border-border bg-background hover:bg-muted'
                  }`}
                  onClick={() => setMode('terminal')}
                >
                  Terminal
                </button>
                <button
                  className={`rounded px-2 py-1 ${
                    mode === 'preview'
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'border border-border bg-background hover:bg-muted'
                  }`}
                  onClick={() => setMode('preview')}
                >
                  Preview
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {mode === 'terminal' ? (
                  <WorkspaceTerminalPanel workspace={workspace} className="min-h-0 flex-1" />
                ) : (
                  <PreviewPanel workspace={workspace} className="min-h-0 flex-1" />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col text-sm text-muted-foreground">
            <div className="flex flex-1 flex-col border-b border-border bg-background">
              <div className="border-b border-border bg-gray-50 px-3 py-2 text-sm font-medium text-foreground dark:bg-gray-900">
                <span className="whitespace-nowrap">Changes</span>
              </div>
              <div className="flex flex-1 items-center justify-center px-4 text-center">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                  Select a workspace to review file changes.
                </span>
              </div>
            </div>
            <div className="flex flex-1 flex-col border-t border-border bg-background">
              <div className="border-b border-border bg-gray-50 px-3 py-2 text-sm font-medium text-foreground dark:bg-gray-900">
                <span className="whitespace-nowrap">Terminal / Preview</span>
              </div>
              <div className="flex flex-1 items-center justify-center px-4 text-center">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                  Select a workspace to open terminal or preview.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default RightSidebar;
