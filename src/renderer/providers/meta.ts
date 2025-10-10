export type UiProvider =
  | 'codex'
  | 'claude'
  | 'droid'
  | 'gemini'
  | 'cursor'
  | 'copilot'
  | 'amp'
  | 'opencode'
  | 'aider';

export type ProviderMeta = {
  label: string;
  icon?: string; // import path to image asset
  terminalOnly: boolean;
  cli?: string; // command to launch in TerminalPane, for terminal-only providers
  helpUrl?: string; // docs link for terminal-only providers
  idlePatterns?: RegExp[];
  busyPatterns?: RegExp[];
};

export const providerMeta: Record<UiProvider, ProviderMeta> = {
  aider: {
    label: 'Aider',
    icon: '../../assets/images/aider.png',
    terminalOnly: true,
    cli: 'aider',
    helpUrl: 'https://aider.chat/docs/',
    idlePatterns: [/Ready|Awaiting|Press Enter/i, /Add files or prompt/i],
    busyPatterns: [/Thinking|Working|Generating|Applying|Analyzing|Editing/i],
  },
  opencode: {
    label: 'OpenCode',
    icon: '../../assets/images/opencode.png',
    terminalOnly: true,
    cli: 'opencode',
    helpUrl: 'https://opencode.ai/docs/cli/',
    idlePatterns: [/Ready|Awaiting|Press Enter|Next command/i],
    busyPatterns: [/Thinking\.{0,3}/i, /waiting\s+for\s+response/i, /esc\s*to\s*cancel/i],
  },
  amp: {
    label: 'Amp',
    icon: '../../assets/images/ampcode.png',
    terminalOnly: true,
    cli: 'amp',
    helpUrl: 'https://ampcode.com/manual#install',
    idlePatterns: [/Ready|Awaiting|Press Enter/i],
    busyPatterns: [/Thinking|Working|Executing|Running|Applying|Analyzing/i],
  },
  codex: {
    label: 'Codex',
    icon: '../../assets/images/openai.png',
    terminalOnly: true,
    cli: 'codex',
    helpUrl: 'https://developers.openai.com/codex/quickstart',
    idlePatterns: [
      /Ready|Awaiting input|Press Enter/i,
      /\b\/(status|approvals|model)\b/i,
      /send\s+\S*\s*newline|transcript|quit/i,
    ],
    busyPatterns: [
      /Esc to interrupt/i,
      /\(\s*(?:\d+\s*m\s*)?\d+\s*s\s*•\s*Esc to interrupt\s*\)/i,
      /Responding to\b/i,
      /Executing|Running|Thinking|Working|Analyzing|Identifying|Inspecting|Summarizing|Refactoring|Applying|Updating|Generating|Scanning|Parsing|Checking/i,
    ],
  },
  claude: {
    label: 'Claude Code',
    icon: '../../assets/images/claude.png',
    terminalOnly: true,
    cli: 'claude',
    helpUrl: 'https://docs.claude.com/en/docs/claude-code/quickstart',
    idlePatterns: [/Ready|Awaiting|Next command|Use \/login/i],
    busyPatterns: [
      /esc\s*to\s*interrupt/i,
      /wrangling|crafting|thinking|reasoning|analyzing|planning|reading|scanning|applying/i,
    ],
  },
  droid: {
    label: 'Droid',
    icon: '../../assets/images/factorydroid.png',
    terminalOnly: true,
    cli: 'droid',
    helpUrl: 'https://docs.factory.ai/cli/getting-started/quickstart',
    idlePatterns: [/Ready|Awaiting|Press Enter/i],
    busyPatterns: [
      /esc\s*to\s*cancel/i,
      /Thinking\.{0,3}/i,
      /Running|Working|Executing|Generating|Applying|Planning|Analyzing/i,
    ],
  },
  gemini: {
    label: 'Gemini',
    icon: '../../assets/images/gemini.png',
    terminalOnly: true,
    cli: 'gemini',
    helpUrl: 'https://github.com/google-gemini/gemini-cli',
    idlePatterns: [/Ready|Awaiting|Press Enter/i],
    busyPatterns: [
      /esc\s*to\s*cancel/i,
      /Thinking\.{0,3}/i,
      /[\u2800-\u28FF].*Thinking/i,
      /Running|Working|Executing|Generating|Applying|Planning|Analyzing/i,
    ],
  },
  cursor: {
    label: 'Cursor',
    icon: '../../assets/images/cursorlogo.png',
    terminalOnly: true,
    cli: 'cursor-agent',
    helpUrl: 'https://cursor.com/install',
    idlePatterns: [/Add a follow-up/i, /Auto\s*[\r\n]+\s*\/\s*commands/i],
    busyPatterns: [/^.*?Generating\.?/im, /\bWorking\b|\bExecuting\b|\bRunning\b/i],
  },
  copilot: {
    label: 'Copilot',
    icon: '../../assets/images/ghcopilot.png',
    terminalOnly: true,
    cli: 'copilot',
    helpUrl: 'https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli',
    idlePatterns: [
      /Ready|Press Enter|Next step/i,
      /Do you want to/i,
      /Confirm with number keys/i,
      /approve all file operations/i,
      /Yes, and approve/i,
    ],
    busyPatterns: [/Thinking|Working|Generating/i],
  },
};
