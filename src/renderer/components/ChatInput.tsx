import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { Button } from './ui/button';
import { ArrowRight } from 'lucide-react';
// Provider selection handled by ProviderSelector component
import { useFileIndex } from '../hooks/useFileIndex';
import FileTypeIcon from './ui/file-type-icon';
import { ProviderSelector } from './ProviderSelector';
import { type Provider } from '../types';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  isLoading: boolean;
  loadingSeconds: number;
  isCodexInstalled: boolean | null;
  agentCreated: boolean;
  disabled?: boolean;
  workspacePath?: string;
  provider?: Provider;
  onProviderChange?: (p: Provider) => void;
  selectDisabled?: boolean;
}

const MAX_LOADING_SECONDS = 60 * 60; // 60 minutes

const formatLoadingTime = (seconds: number): string => {
  if (seconds <= 0) return '0s';

  const clamped = Math.min(seconds, MAX_LOADING_SECONDS);
  const minutes = Math.floor(clamped / 60);
  const remainingSeconds = clamped % 60;

  if (minutes >= 60) {
    return '60m';
  }

  if (minutes === 0) {
    return `${clamped}s`;
  }

  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remainingSeconds}s`;
};

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  onCancel,
  isLoading,
  loadingSeconds,
  isCodexInstalled,
  agentCreated,
  disabled = false,
  workspacePath,
  provider = 'codex',
  onProviderChange,
  selectDisabled = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  // Provider is controlled by parent (codex | claude | droid | gemini | cursor)
  const shouldReduceMotion = useReducedMotion();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // File index for @ mention
  const { search } = useFileIndex(workspacePath);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionResults, setMentionResults] = useState<
    Array<{ path: string; type: 'file' | 'dir' }>
  >([]);

  // Debounce mention search to avoid heavy sync work on every keystroke in large repos
  useEffect(() => {
    if (!mentionOpen) {
      setMentionResults([]);
      return;
    }
    const handle = setTimeout(() => {
      try {
        setMentionResults(search(mentionQuery, 12));
      } catch {
        setMentionResults([]);
      }
    }, 120);
    return () => clearTimeout(handle);
  }, [mentionOpen, mentionQuery, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Send on Enter (unless Shift) when mention is closed
    if (e.key === 'Enter' && !e.shiftKey && !mentionOpen) {
      e.preventDefault();
      if (!isLoading) onSend();
      return;
    }

    // Mention navigation
    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, Math.max(mentionResults.length - 1, 0)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const pick = mentionResults[mentionIndex];
        if (pick) applyMention(pick.path);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMention();
        return;
      }
    }
  };

  function openMention(start: number, query: string) {
    setMentionStart(start);
    setMentionQuery(query);
    setMentionIndex(0);
    setMentionOpen(true);
  }

  function closeMention() {
    setMentionOpen(false);
    setMentionQuery('');
    setMentionStart(null);
    setMentionIndex(0);
  }

  function detectMention(nextValue: string, caret: number) {
    // Find the nearest '@' to the left of caret that starts a token
    // Token continues until whitespace or line break
    let i = caret - 1;
    while (i >= 0) {
      const ch = nextValue[i];
      if (ch === '@') break;
      if (/\s/.test(ch)) return closeMention();
      i--;
    }
    if (i < 0 || nextValue[i] !== '@') return closeMention();

    const start = i; // position of '@'
    const query = nextValue.slice(start + 1, caret);
    openMention(start, query);
  }

  function applyMention(pickPath: string) {
    if (mentionStart == null) return;
    const el = textareaRef.current;
    const caret = el ? el.selectionStart : value.length;
    const before = value.slice(0, mentionStart);
    const after = value.slice(caret);
    // Keep leading '@', insert selected relative path
    const next = `${before}@${pickPath}${after}`;
    onChange(next);
    closeMention();
    // Restore caret after inserted text
    requestAnimationFrame(() => {
      if (el) {
        const pos = before.length + 1 + pickPath.length;
        el.selectionStart = el.selectionEnd = pos;
        el.focus();
      }
    });
  }

  const getPlaceholder = () => {
    if (provider === 'codex' && !isCodexInstalled) {
      return 'Codex CLI not installed...';
    }
    if (!agentCreated) {
      return 'Initializing...';
    }
    if (provider === 'claude') return 'Tell Claude Code what to do...';
    if (provider === 'droid') return 'Factory Droid uses the terminal above.';
    if (provider === 'gemini') return 'Gemini CLI uses the terminal above.';
    if (provider === 'cursor') return 'Cursor CLI runs in the terminal above.';
    if (provider === 'warp') return 'Warp CLI runs in the terminal above.';
    return 'Tell Codex what to do...';
  };

  const trimmedValue = value.trim();
  const baseDisabled =
    disabled ||
    (provider === 'codex'
      ? !isCodexInstalled || !agentCreated
      : provider === 'claude'
        ? !agentCreated
        : true); // droid/gemini/cursor: input disabled, terminal-only

  const textareaDisabled = baseDisabled || isLoading;
  const sendDisabled =
    provider === 'droid' || provider === 'gemini' || provider === 'cursor' || provider === 'warp'
      ? true
      : isLoading
        ? baseDisabled
        : baseDisabled || !trimmedValue;

  return (
    <div className="px-6 pt-4 pb-6">
      <div className="max-w-4xl mx-auto">
        <div
          className={`relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md transition-shadow duration-200 ${
            isFocused ? 'shadow-2xl' : 'shadow-lg'
          }`}
        >
          <div className="p-4">
            <textarea
              ref={textareaRef}
              className="w-full resize-none border-none outline-none bg-transparent text-gray-900 dark:text-gray-100 text-sm placeholder-gray-500 dark:placeholder-gray-400"
              value={value}
              onChange={(e) => {
                const next = e.target.value;
                onChange(next);
                const caret = e.target.selectionStart ?? next.length;
                detectMention(next, caret);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={getPlaceholder()}
              rows={2}
              disabled={textareaDisabled}
              style={{ minHeight: '56px' }}
            />
            {mentionOpen && mentionResults.length > 0 && (
              <div className="absolute left-4 bottom-40 z-20 w-[520px] max-w-[calc(100%-2rem)] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  {mentionResults.map((item, idx) => (
                    <button
                      key={`${item.type}:${item.path}`}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyMention(item.path);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        idx === mentionIndex ? 'bg-gray-100 dark:bg-gray-700' : ''
                      }`}
                    >
                      <span className="inline-flex items-center justify-center w-4 h-4 text-gray-500">
                        <FileTypeIcon path={item.path} type={item.type} size={14} />
                      </span>
                      <span className="truncate text-gray-800 dark:text-gray-200">{item.path}</span>
                    </button>
                  ))}
                </div>
                <div className="px-3 py-1 text-[10px] text-gray-500 border-t border-gray-200 dark:border-gray-700">
                  Type to filter files and folders • ↑/↓ to navigate • Enter to insert
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-3 rounded-b-xl">
            <ProviderSelector
              value={provider as Provider}
              onChange={(v) => {
                if (!selectDisabled && onProviderChange) onProviderChange(v);
              }}
              disabled={selectDisabled}
            />

            <div className="flex items-center gap-2">
              {isLoading && (
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium w-16 text-right tabular-nums">
                  {formatLoadingTime(loadingSeconds)}
                </span>
              )}
              <Button
                type="button"
                onClick={isLoading ? onCancel : onSend}
                disabled={sendDisabled}
                className={`group relative h-9 w-9 p-0 rounded-md text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:pointer-events-none ${
                  isLoading
                    ? 'bg-gray-200 dark:bg-gray-700 hover:bg-red-300 hover:text-white dark:hover:text-white'
                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
                aria-label={
                  provider === 'droid' || provider === 'gemini' || provider === 'cursor' || provider === 'warp'
                    ? 'Terminal-only provider'
                    : isLoading
                      ? 'Stop Codex'
                      : 'Send'
                }
              >
                {provider === 'droid' || provider === 'gemini' || provider === 'cursor' || provider === 'warp' ? (
                  <div className="flex items-center justify-center w-full h-full">
                    <div className="w-3.5 h-3.5 rounded-[3px] bg-gray-500 dark:bg-gray-300" />
                  </div>
                ) : isLoading ? (
                  <div className="flex items-center justify-center w-full h-full">
                    <div className="w-3.5 h-3.5 rounded-[3px] bg-gray-500 dark:bg-gray-300 transition-colors duration-150 group-hover:bg-red-500" />
                  </div>
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
