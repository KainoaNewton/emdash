import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ExternalLink, Globe, Database, Server, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import ContainerStatusBadge from './ContainerStatusBadge';
import { useToast } from '../hooks/use-toast';
import { useTheme } from '../hooks/useTheme';
import { TerminalPane } from './TerminalPane';
import { TerminalModeBanner } from './TerminalModeBanner';
import { providerMeta } from '../providers/meta';
import MessageList from './MessageList';
import ProviderBar from './ProviderBar';
import useCodexStream from '../hooks/useCodexStream';
import useClaudeStream from '../hooks/useClaudeStream';
import { useInitialPromptInjection } from '../hooks/useInitialPromptInjection';
import { usePlanMode } from '@/hooks/usePlanMode';
import { usePlanActivationTerminal } from '@/hooks/usePlanActivation';
import { log } from '@/lib/logger';
import { logPlanEvent } from '@/lib/planLogs';
import { PLAN_CHAT_PREAMBLE } from '@/lib/planRules';
import { type Provider } from '../types';
import { buildAttachmentsSection, buildImageAttachmentsSection } from '../lib/attachments';
import { Workspace, Message } from '../types/chat';
import {
  getContainerRunState,
  subscribeToWorkspaceRunState,
  type ContainerRunState,
} from '@/lib/containerRuns';

declare const window: Window & {
  electronAPI: {
    codexCheckInstallation: () => Promise<{
      success: boolean;
      isInstalled?: boolean;
      error?: string;
    }>;
    codexCreateAgent: (
      workspaceId: string,
      worktreePath: string
    ) => Promise<{ success: boolean; agent?: any; error?: string }>;
    saveMessage: (message: any) => Promise<{ success: boolean; error?: string }>;
  };
};

interface Props {
  workspace: Workspace;
  projectName: string;
  className?: string;
  initialProvider?: Provider;
}

const ChatInterface: React.FC<Props> = ({ workspace, projectName, className, initialProvider }) => {
  const { toast } = useToast();
  const { effectiveTheme } = useTheme();
  const [inputValue, setInputValue] = useState('');
  const [imageAttachments, setImageAttachments] = useState<string[]>([]);
  const [isCodexInstalled, setIsCodexInstalled] = useState<boolean | null>(null);
  const [isClaudeInstalled, setIsClaudeInstalled] = useState<boolean | null>(null);
  const [claudeInstructions, setClaudeInstructions] = useState<string | null>(null);
  const [agentCreated, setAgentCreated] = useState(false);
  const [provider, setProvider] = useState<Provider>(initialProvider || 'codex');
  const [lockedProvider, setLockedProvider] = useState<Provider | null>(null);
  const [hasDroidActivity, setHasDroidActivity] = useState(false);
  const [hasGeminiActivity, setHasGeminiActivity] = useState(false);
  const [hasCursorActivity, setHasCursorActivity] = useState(false);
  const [hasCopilotActivity, setHasCopilotActivity] = useState(false);
  const [cliStartFailed, setCliStartFailed] = useState(false);
  const [containerState, setContainerState] = useState<ContainerRunState | undefined>(() =>
    getContainerRunState(workspace.id)
  );
  const reduceMotion = useReducedMotion();
  const [portsExpanded, setPortsExpanded] = useState(false);
  const initializedConversationRef = useRef<string | null>(null);

  const codexStream = useCodexStream(
    // Disable Codex chat stream when Codex is terminal-only
    providerMeta.codex.terminalOnly
      ? null
      : {
          workspaceId: workspace.id,
          workspacePath: workspace.path,
        }
  );

  const claudeStream = useClaudeStream(
    provider === 'claude' && !providerMeta.claude.terminalOnly
      ? { workspaceId: workspace.id, workspacePath: workspace.path }
      : null
  );
  const activeStream = provider === 'codex' ? codexStream : claudeStream;

  // Unified Plan Mode (per workspace)
  const { enabled: planEnabled, setEnabled: setPlanEnabled } = usePlanMode(
    workspace.id,
    workspace.path
  );

  // Log transitions for visibility
  useEffect(() => {
    log.info('[plan] state changed', { workspaceId: workspace.id, enabled: planEnabled });
  }, [planEnabled, workspace.id]);

  // For terminal providers with native plan activation commands
  usePlanActivationTerminal({
    enabled: planEnabled,
    providerId: provider,
    workspaceId: workspace.id,
    workspacePath: workspace.path,
  });

  useEffect(() => {
    initializedConversationRef.current = null;
    setCliStartFailed(false);
    setContainerState(getContainerRunState(workspace.id));
  }, [workspace.id]);

  // Auto-expand/collapse ports in chat view based on container activity
  useEffect(() => {
    const status = containerState?.status;
    const active = status === 'starting' || status === 'building' || status === 'ready';
    if (status === 'ready' && (containerState?.ports?.length ?? 0) > 0) setPortsExpanded(true);
    if (!active) setPortsExpanded(false);
  }, [containerState?.status, containerState?.ports?.length]);

  // On workspace change, restore last-selected provider (including Droid).
  // If a locked provider exists (including Droid), prefer locked.
  // If initialProvider is provided, use it as the highest priority.
  useEffect(() => {
    try {
      const lastKey = `provider:last:${workspace.id}`;
      const lockedKey = `provider:locked:${workspace.id}`;
      const last = window.localStorage.getItem(lastKey) as Provider | null;
      const locked = window.localStorage.getItem(lockedKey) as Provider | null;

      setLockedProvider(locked);
      setHasDroidActivity(locked === 'droid');
      setHasGeminiActivity(locked === 'gemini');
      setHasCursorActivity(locked === 'cursor');
      setHasCopilotActivity(locked === 'copilot');
      // Priority: initialProvider > locked > last > default
      if (initialProvider) {
        setProvider(initialProvider);
      } else {
        const validProviders: Provider[] = [
          'qwen',
          'codex',
          'claude',
          'droid',
          'gemini',
          'cursor',
          'copilot',
          'amp',
          'opencode',
          'charm',
          'auggie',
        ];
        if (locked && (validProviders as string[]).includes(locked)) {
          setProvider(locked as Provider);
        } else if (last && (validProviders as string[]).includes(last)) {
          setProvider(last as Provider);
        } else {
          setProvider('codex');
        }
      }
    } catch {
      setProvider(initialProvider || 'codex');
    }
  }, [workspace.id, initialProvider]);

  // Persist last-selected provider per workspace (including Droid)
  useEffect(() => {
    try {
      window.localStorage.setItem(`provider:last:${workspace.id}`, provider);
    } catch {}
  }, [provider, workspace.id]);

  // When a chat becomes locked (first user message sent or terminal activity), persist the provider
  useEffect(() => {
    try {
      const userLocked =
        provider !== 'droid' &&
        provider !== 'gemini' &&
        provider !== 'cursor' &&
        activeStream.messages &&
        activeStream.messages.some((m) => m.sender === 'user');
      const droidLocked = provider === 'droid' && hasDroidActivity;
      const geminiLocked = provider === 'gemini' && hasGeminiActivity;
      const cursorLocked = provider === 'cursor' && hasCursorActivity;
      const copilotLocked = provider === 'copilot' && hasCopilotActivity;

      if (userLocked || droidLocked || geminiLocked || cursorLocked || copilotLocked) {
        window.localStorage.setItem(`provider:locked:${workspace.id}`, provider);
        setLockedProvider(provider);
      }
    } catch {}
  }, [
    provider,
    workspace.id,
    activeStream.messages,
    hasDroidActivity,
    hasGeminiActivity,
    hasCursorActivity,
  ]);

  // Check Claude Code installation when selected
  useEffect(() => {
    let cancelled = false;
    if (provider !== 'claude') {
      setIsClaudeInstalled(null);
      setClaudeInstructions(null);
      return;
    }
    (async () => {
      try {
        const res = await (window as any).electronAPI.agentCheckInstallation?.('claude');
        if (cancelled) return;
        if (res?.success) {
          setIsClaudeInstalled(!!res.isInstalled);
          if (!res.isInstalled) {
            const inst = await (window as any).electronAPI.agentGetInstallationInstructions?.(
              'claude'
            );
            setClaudeInstructions(
              inst?.instructions ||
                'Install: npm install -g @anthropic-ai/claude-code\nThen run: claude and use /login'
            );
          } else {
            setClaudeInstructions(null);
          }
        } else {
          setIsClaudeInstalled(false);
        }
      } catch {
        setIsClaudeInstalled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider, workspace.id]);

  // When switching providers, ensure other streams are stopped
  useEffect(() => {
    (async () => {
      try {
        if (provider !== 'codex') await (window as any).electronAPI.codexStopStream?.(workspace.id);
        if (provider !== 'claude')
          await (window as any).electronAPI.agentStopStream?.({
            providerId: 'claude',
            workspaceId: workspace.id,
          });
      } catch {}
    })();
  }, [provider, workspace.id]);

  useEffect(() => {
    if (!codexStream.isReady) return;

    const convoId = codexStream.conversationId;
    if (!convoId) return;
    if (initializedConversationRef.current === convoId) return;

    initializedConversationRef.current = convoId;

    // Check if we need to add a welcome message
    // This runs when messages are loaded but could be empty or contain initial prompt
    const checkForWelcomeMessage = async () => {
      if (codexStream.messages.length === 0) {
        // Check database directly for any existing messages to see if there's an initial prompt
        try {
          const messagesResult = await window.electronAPI.getMessages(convoId);
          if (messagesResult.success && messagesResult.messages) {
            const hasInitialPrompt = messagesResult.messages.some((msg: any) => {
              try {
                const metadata = JSON.parse(msg.metadata || '{}');
                return metadata.isInitialPrompt;
              } catch {
                return false;
              }
            });

            // Only add welcome message if there's no initial prompt and no messages at all
            if (!hasInitialPrompt && messagesResult.messages.length === 0) {
              const welcomeMessage: Message = {
                id: `welcome-${Date.now()}`,
                content: 'Hello! What can the agent do for you?',
                sender: 'agent',
                timestamp: new Date(),
              };

              await window.electronAPI.saveMessage({
                id: welcomeMessage.id,
                conversationId: convoId,
                content: welcomeMessage.content,
                sender: welcomeMessage.sender,
                metadata: JSON.stringify({ isWelcome: true }),
              });

              codexStream.appendMessage(welcomeMessage);
            }
          }
        } catch (error) {
          console.error('Failed to check for welcome message:', error);
        }
      }
    };

    checkForWelcomeMessage();
  }, [
    codexStream.isReady,
    codexStream.conversationId,
    codexStream.messages.length,
    codexStream.appendMessage,
  ]);

  useEffect(() => {
    const initializeCodex = async () => {
      try {
        const installResult = await window.electronAPI.codexCheckInstallation();
        if (installResult.success) {
          setIsCodexInstalled(installResult.isInstalled ?? false);

          if (installResult.isInstalled) {
            const agentResult = await window.electronAPI.codexCreateAgent(
              workspace.id,
              workspace.path
            );
            if (agentResult.success) {
              setAgentCreated(true);
              const { log } = await import('../lib/logger');
              log.info('Codex agent created for workspace:', workspace.name);
            } else {
              console.error('Failed to create Codex agent:', agentResult.error);
              toast({
                title: 'Error',
                description: 'Failed to create Codex agent. Please try again.',
                variant: 'destructive',
              });
            }
          }
        } else {
          console.error('Failed to check Codex installation:', installResult.error);
        }
      } catch (error) {
        console.error('Error initializing Codex:', error);
      }
    };

    initializeCodex();
  }, [workspace.id, workspace.path, workspace.name, toast]);

  // Basic Claude installer check (optional UX). We'll rely on user to install as needed.
  // We still gate sending by agentCreated (workspace+conversation ready).

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    if (provider === 'claude' && isClaudeInstalled === false) {
      toast({
        title: 'Claude Code not installed',
        description: 'Install Claude Code CLI and login first. See instructions below.',
        variant: 'destructive',
      });
      return;
    }

    const activeConversationId =
      provider === 'codex' ? codexStream.conversationId : claudeStream.conversationId;
    if (!activeConversationId) return;

    // Prepare optional wire-only preamble (not shown in UI)
    let wirePrefix = '';
    const messageWithContext = inputValue;
    if (planEnabled) {
      try {
        const key = `planPreambleSent:${workspace.id}:${activeConversationId}`;
        const sent = localStorage.getItem(key) === '1';
        if (!sent) {
          wirePrefix = `${PLAN_CHAT_PREAMBLE}\n\n`;
          localStorage.setItem(key, '1');
        }
      } catch {}
    }

    const attachmentsSection = await buildAttachmentsSection(workspace.path, inputValue, {
      maxFiles: 6,
      maxBytesPerFile: 200 * 1024,
    });
    const imageSection = buildImageAttachmentsSection(workspace.path, imageAttachments);

    const result =
      provider === 'codex'
        ? await codexStream.send(messageWithContext, attachmentsSection + imageSection, wirePrefix)
        : await claudeStream.send(
            messageWithContext,
            attachmentsSection + imageSection,
            wirePrefix
          );
    if (!result.success) {
      if (result.error && result.error !== 'stream-in-progress') {
        toast({
          title: 'Communication Error',
          description: 'Failed to start Codex stream. Please try again.',
          variant: 'destructive',
        });
      }
      return;
    }

    setInputValue('');
    setImageAttachments([]);
  };

  const handleCancelStream = async () => {
    if (!codexStream.isStreaming && !claudeStream.isStreaming) return;
    const result = provider === 'codex' ? await codexStream.cancel() : await claudeStream.cancel();
    if (!result.success) {
      toast({
        title: 'Cancel Failed',
        description: 'Unable to stop Codex stream. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const streamingOutputForList =
    activeStream.isStreaming || activeStream.streamingOutput ? activeStream.streamingOutput : null;
  // Allow switching providers freely while in Droid mode
  const providerLocked = lockedProvider !== null;

  const isTerminal = providerMeta[provider]?.terminalOnly === true;

  const initialInjection = useMemo(() => {
    if (!isTerminal) return null;
    const md = workspace.metadata || null;
    const p = (md?.initialPrompt || '').trim();
    if (p) return p;
    const parts: string[] = [];
    const issue = md?.linearIssue;
    if (issue) {
      const parts: string[] = [];
      const line1 = `Linked Linear issue: ${issue.identifier}${issue.title ? ` — ${issue.title}` : ''}`;
      parts.push(line1);
      const details: string[] = [];
      if (issue.state?.name) details.push(`State: ${issue.state.name}`);
      if (issue.assignee?.displayName || issue.assignee?.name)
        details.push(`Assignee: ${issue.assignee?.displayName || issue.assignee?.name}`);
      if (issue.team?.key) details.push(`Team: ${issue.team.key}`);
      if (issue.project?.name) details.push(`Project: ${issue.project.name}`);
      if (details.length) parts.push(`Details: ${details.join(' • ')}`);
      if (issue.url) parts.push(`URL: ${issue.url}`);
      const desc = (issue as any)?.description;
      if (typeof desc === 'string' && desc.trim()) {
        const trimmed = desc.trim();
        const max = 1500;
        const body = trimmed.length > max ? trimmed.slice(0, max) + '\n…' : trimmed;
        parts.push('', 'Issue Description:', body);
      }
      return parts.join('\n');
    }

    const gh = (md as any)?.githubIssue as
      | {
          number: number;
          title?: string;
          url?: string;
          state?: string;
          assignees?: any[];
          labels?: any[];
          body?: string;
        }
      | undefined;
    if (gh) {
      const parts: string[] = [];
      const line1 = `Linked GitHub issue: #${gh.number}${gh.title ? ` — ${gh.title}` : ''}`;
      parts.push(line1);
      const details: string[] = [];
      if (gh.state) details.push(`State: ${gh.state}`);
      try {
        const as = Array.isArray(gh.assignees)
          ? gh.assignees
              .map((a: any) => a?.name || a?.login)
              .filter(Boolean)
              .join(', ')
          : '';
        if (as) details.push(`Assignees: ${as}`);
      } catch {}
      try {
        const ls = Array.isArray(gh.labels)
          ? gh.labels
              .map((l: any) => l?.name)
              .filter(Boolean)
              .join(', ')
          : '';
        if (ls) details.push(`Labels: ${ls}`);
      } catch {}
      if (details.length) parts.push(`Details: ${details.join(' • ')}`);
      if (gh.url) parts.push(`URL: ${gh.url}`);
      const body = typeof gh.body === 'string' ? gh.body.trim() : '';
      if (body) {
        const max = 1500;
        const clipped = body.length > max ? body.slice(0, max) + '\n…' : body;
        parts.push('', 'Issue Description:', clipped);
      }
      return parts.join('\n');
    }

    const j = md?.jiraIssue as any;
    if (j) {
      const lines: string[] = [];
      const l1 = `Linked Jira issue: ${j.key}${j.summary ? ` — ${j.summary}` : ''}`;
      lines.push(l1);
      const details: string[] = [];
      if (j.status?.name) details.push(`Status: ${j.status.name}`);
      if (j.assignee?.displayName || j.assignee?.name)
        details.push(`Assignee: ${j.assignee?.displayName || j.assignee?.name}`);
      if (j.project?.key) details.push(`Project: ${j.project.key}`);
      if (details.length) lines.push(`Details: ${details.join(' • ')}`);
      if (j.url) lines.push(`URL: ${j.url}`);
      return lines.join('\n');
    }
    return null;
  }, [isTerminal, workspace.metadata]);

  useInitialPromptInjection({
    workspaceId: workspace.id,
    providerId: provider,
    prompt: initialInjection,
    enabled: isTerminal,
  });

  // Ensure a provider is stored for this workspace so fallbacks can subscribe immediately
  useEffect(() => {
    try {
      localStorage.setItem(`workspaceProvider:${workspace.id}`, provider);
    } catch {}
  }, [provider, workspace.id]);

  useEffect(() => {
    const off = subscribeToWorkspaceRunState(workspace.id, (state) => {
      setContainerState(state);
    });
    return () => {
      off?.();
    };
  }, [workspace.id]);

  const containerStatusNode = useMemo(() => {
    const state = containerState;
    if (!state?.runId) return null;
    const ports = state.ports ?? [];
    const containerActive =
      state.status === 'starting' || state.status === 'building' || state.status === 'ready';
    if (!containerActive) return null; // Hide bar in chat when not active

    const norm = (s: string) => s.toLowerCase();
    const sorted = [...ports].sort((a, b) => {
      const ap = state.previewService && norm(state.previewService) === norm(a.service);
      const bp = state.previewService && norm(state.previewService) === norm(b.service);
      if (ap && !bp) return -1;
      if (!ap && bp) return 1;
      const an = norm(a.service);
      const bn = norm(b.service);
      if (an !== bn) return an < bn ? -1 : 1;
      if (a.container !== b.container) return a.container - b.container;
      return a.host - b.host;
    });

    const ServiceIcon: React.FC<{ name: string; port: number }> = ({ name, port }) => {
      const [src, setSrc] = React.useState<string | null>(null);
      React.useEffect(() => {
        let cancelled = false;
        (async () => {
          try {
            const api: any = (window as any).electronAPI;
            if (!api?.resolveServiceIcon) return;
            // Allow network fetch in production to populate cache/offline use
            const res = await api.resolveServiceIcon({
              service: name,
              allowNetwork: true,
              workspacePath: workspace.path,
            });
            if (!cancelled && res?.ok && typeof res.dataUrl === 'string') setSrc(res.dataUrl);
          } catch {}
        })();
        return () => {
          cancelled = true;
        };
      }, [name]);
      if (src) return <img src={src} alt="" className="h-3.5 w-3.5 rounded-sm" />;
      const webPorts = new Set([80, 443, 3000, 5173, 8080, 8000]);
      const dbPorts = new Set([5432, 3306, 27017, 1433, 1521]);
      if (webPorts.has(port)) return <Globe className="h-3.5 w-3.5" aria-hidden="true" />;
      if (dbPorts.has(port)) return <Database className="h-3.5 w-3.5" aria-hidden="true" />;
      return <Server className="h-3.5 w-3.5" aria-hidden="true" />;
    };
    return (
      <div className="mt-4 px-6">
        <div className="mx-auto max-w-4xl rounded-md border border-border bg-muted/20 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-medium text-foreground">
              <ContainerStatusBadge
                active={
                  state.status === 'starting' ||
                  state.status === 'building' ||
                  state.status === 'ready'
                }
                isStarting={state.status === 'starting' || state.status === 'building'}
                isReady={state.status === 'ready'}
                startingAction={false}
                stoppingAction={false}
                onStart={() => {}}
                onStop={() => {}}
                showStop={false}
              />
              {state.containerId ? (
                <span className="ml-2 text-xs text-muted-foreground">#{state.containerId}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {containerActive ? (
                <button
                  type="button"
                  onClick={() => setPortsExpanded((v) => !v)}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border/70 bg-background px-2.5 text-xs font-medium"
                  aria-expanded={portsExpanded}
                  aria-controls={`chat-ports-${workspace.id}`}
                >
                  <ChevronDown
                    className={[
                      'h-3.5 w-3.5 transition-transform',
                      portsExpanded ? 'rotate-180' : '',
                    ].join(' ')}
                    aria-hidden="true"
                  />
                  Ports
                </button>
              ) : null}
              {state.previewUrl ? (
                <button
                  type="button"
                  className="inline-flex items-center rounded border border-primary/60 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                  onClick={() => window.electronAPI.openExternal(state.previewUrl!)}
                  aria-label="Open preview (external)"
                  title="Open preview"
                >
                  Open Preview
                  <ExternalLink className="ml-1.5 h-3 w-3" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
          <AnimatePresence initial={false}>
            {portsExpanded && sorted.length ? (
              <motion.div
                id={`chat-ports-${workspace.id}`}
                className="text-xs text-muted-foreground"
                initial={reduceMotion ? false : { opacity: 0, height: 0, paddingTop: 0 }}
                animate={{ opacity: 1, height: 'auto', paddingTop: 8 }}
                exit={
                  reduceMotion
                    ? { opacity: 1, height: 'auto', paddingTop: 0 }
                    : { opacity: 0, height: 0, paddingTop: 0 }
                }
                transition={
                  reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
                }
                style={{ overflow: 'hidden', display: 'grid' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 font-medium text-foreground">
                      Ports
                    </span>
                    <span>Mapped host → container per service</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {sorted.map((port) => (
                    <span
                      key={`${state.runId}-${port.service}-${port.host}`}
                      className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1"
                    >
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <ServiceIcon name={port.service} port={port.container} />
                        <span className="font-medium">{port.service}</span>
                      </span>
                      <span>host {port.host}</span>
                      <span>→</span>
                      <span>container {port.container}</span>
                      {state.previewService === port.service ? (
                        <span className="rounded bg-primary/10 px-1 py-0.5 text-primary">
                          preview
                        </span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          {state.lastError ? (
            <div className="mt-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
              {state.lastError.message}
            </div>
          ) : null}
        </div>
      </div>
    );
  }, [containerState, portsExpanded, reduceMotion, workspace.id, workspace.path]);

  return (
    <div className={`flex h-full flex-col bg-white dark:bg-gray-800 ${className}`}>
      {isTerminal ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-6 pt-4">
            <div className="mx-auto max-w-4xl space-y-2">
              {(() => {
                if (provider === 'codex' && isCodexInstalled === false) {
                  return (
                    <TerminalModeBanner
                      provider={provider as any}
                      onOpenExternal={(url) => window.electronAPI.openExternal(url)}
                    />
                  );
                }
                if (provider === 'claude' && isClaudeInstalled === false) {
                  return (
                    <TerminalModeBanner
                      provider={provider as any}
                      onOpenExternal={(url) => window.electronAPI.openExternal(url)}
                    />
                  );
                }
                if (provider !== 'codex' && provider !== 'claude' && cliStartFailed) {
                  return (
                    <TerminalModeBanner
                      provider={provider as any}
                      onOpenExternal={(url) => window.electronAPI.openExternal(url)}
                    />
                  );
                }
                return null;
              })()}
            </div>
          </div>
          {containerStatusNode}
          <div className="mt-4 min-h-0 flex-1 px-6">
            <div
              className={`mx-auto h-full max-w-4xl overflow-hidden rounded-md ${
                provider === 'charm' ? (effectiveTheme === 'dark' ? 'bg-gray-800' : 'bg-white') : ''
              }`}
            >
              <TerminalPane
                id={`${provider}-main-${workspace.id}`}
                cwd={workspace.path}
                shell={providerMeta[provider].cli}
                env={
                  planEnabled
                    ? {
                        EMDASH_PLAN_MODE: '1',
                        EMDASH_PLAN_FILE: `${workspace.path}/.emdash/planning.md`,
                      }
                    : undefined
                }
                keepAlive={true}
                onActivity={() => {
                  try {
                    window.localStorage.setItem(`provider:locked:${workspace.id}`, provider);
                    setLockedProvider(provider);
                  } catch {}
                }}
                onStartError={() => {
                  // Mark CLI missing or failed to launch
                  setCliStartFailed(true);
                }}
                onStartSuccess={() => setCliStartFailed(false)}
                variant={effectiveTheme === 'dark' ? 'dark' : 'light'}
                themeOverride={
                  provider === 'charm'
                    ? { background: effectiveTheme === 'dark' ? '#1f2937' : '#ffffff' }
                    : undefined
                }
                contentFilter={
                  provider === 'charm' && effectiveTheme !== 'dark'
                    ? 'invert(1) hue-rotate(180deg) brightness(1.1) contrast(1.05)'
                    : undefined
                }
                className="h-full w-full"
              />
            </div>
          </div>
        </div>
      ) : codexStream.isLoading ? (
        <div
          className="flex-1 overflow-y-auto px-6 pb-2 pt-6"
          style={{
            maskImage: 'linear-gradient(to bottom, black 0%, black 93%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 93%, transparent 100%)',
          }}
        >
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="flex items-center justify-center py-8">
              <div className="font-sans text-sm text-gray-500 dark:text-gray-400">
                Loading conversation...
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {provider === 'claude' && isClaudeInstalled === false ? (
            <div className="px-6 pt-4">
              <div className="mx-auto max-w-4xl">
                <div className="whitespace-pre-wrap rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  {claudeInstructions ||
                    'Install Claude Code: npm install -g @anthropic-ai/claude-code\nThen run: claude and use /login'}
                </div>
              </div>
            </div>
          ) : null}
          {containerStatusNode}
          <MessageList
            messages={activeStream.messages}
            streamingOutput={streamingOutputForList}
            isStreaming={activeStream.isStreaming}
            awaitingThinking={
              provider === 'codex' ? codexStream.awaitingThinking : claudeStream.awaitingThinking
            }
            providerId={provider === 'codex' ? 'codex' : 'claude'}
          />
        </>
      )}

      {isTerminal ? (
        <ProviderBar
          provider={provider}
          linearIssue={workspace.metadata?.linearIssue || null}
          githubIssue={workspace.metadata?.githubIssue || null}
          jiraIssue={workspace.metadata?.jiraIssue || null}
          planModeEnabled={planEnabled}
          onPlanModeChange={setPlanEnabled}
          onApprovePlan={async () => {
            try {
              await logPlanEvent(workspace.path, 'Plan approved via UI; exiting Plan Mode');
            } catch {}
            setPlanEnabled(false);
          }}
        />
      ) : null}
    </div>
  );
};

export default ChatInterface;
