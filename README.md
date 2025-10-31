<img width="4856" height="1000" alt="gh_banner" src="https://github.com/user-attachments/assets/7c7c6e83-774a-43f4-8a6f-df10b3ba5751" />

<br />

[![MIT License](https://img.shields.io/badge/License-MIT-555555.svg?labelColor=333333&color=666666)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/generalaction/emdash?labelColor=333333&color=666666)](https://github.com/generalaction/emdash)
[![Last Commit](https://img.shields.io/github/last-commit/generalaction/emdash?labelColor=333333&color=666666)](https://github.com/generalaction/emdash/commits/main)
[![Commit Activity](https://img.shields.io/github/commit-activity/m/generalaction/emdash?labelColor=333333&color=666666)](https://github.com/generalaction/emdash/graphs/commit-activity)
[![Issues](https://img.shields.io/github/issues/generalaction/emdash?labelColor=333333&color=666666)](https://github.com/generalaction/emdash/issues)
[![Release](https://img.shields.io/github/v/release/generalaction/emdash?labelColor=333333&color=666666)](https://github.com/generalaction/emdash/releases)
[![Downloads](https://img.shields.io/github/downloads/generalaction/emdash/total?labelColor=333333&color=666666)](https://github.com/generalaction/emdash/releases)
<br>
[![Discord](https://img.shields.io/badge/Discord-join-%235462eb?labelColor=%235462eb&logo=discord&logoColor=%23f5f5f5)](https://discord.gg/Rm63cQaE)
[![Follow @emdashsh on X](https://img.shields.io/twitter/follow/emdashsh?logo=X&color=%23f5f5f5)](https://twitter.com/intent/follow?screen_name=emdashsh)

<br />

<div align="center" style="margin:24px 0;">

  <a href="https://github.com/generalaction/emdash/releases" style="display:inline-block; margin-right:24px; text-decoration:none; outline:none; border:none;">
    <img src="./docs/media/downloadformacos.png" alt="Download app for macOS" height="40">
  </a>

</div>

<br />

**Run multiple coding agents in parallel—provider-agnostic, worktree-isolated, and local-first.**

Emdash lets you develop and test multiple features with multiple agents in parallel. It’s provider-agnostic (we support 10+ CLIs, such as Claude Code and Codex) and runs each agent in its own Git worktree to keep changes clean; when the environment matters, you can run a PR in its own Docker container. Hand off Linear, GitHub, or Jira tickets to an agent, review diffs side-by-side, and keep everything local—your data never leaves your machine.

## Install

### macOS

- Download for macOS (Apple Silicon): https://github.com/generalaction/emdash/releases/latest/download/emdash-arm64.dmg
- Download for macOS (Intel x64): https://github.com/generalaction/emdash/releases/latest/download/emdash-x64.dmg

### Linux

- Download AppImage (x64): https://github.com/generalaction/emdash/releases/latest/download/emdash-x64.AppImage
- Download Debian package (x64): https://github.com/generalaction/emdash/releases/latest/download/emdash-x64.deb

### Windows

- Download Portable Exe (x64): https://github.com/generalaction/emdash/releases/latest/download/emdash-x64.exe
- Download NSIS Installer (x64): https://github.com/generalaction/emdash/releases/latest/download/emdash-x64-installer.exe

### Manual Installation

Either download the package for your platform from Releases (links above), or build and run the app locally — see Requirements and Getting Started below.

### Homebrew

[![Homebrew](https://img.shields.io/badge/-Homebrew-000000?style=for-the-badge&logo=homebrew&logoColor=FBB040)](https://formulae.brew.sh/cask/emdash)

Install and manage emdash with Homebrew:

```bash
# Install
brew install --cask emdash

# Upgrade
brew upgrade --cask emdash

# Uninstall
brew uninstall --cask emdash
```

If Homebrew does not find the cask yet, run `brew update`.

## Requirements

- Node.js 22.12.0+ and Git
- One or more providers (install as needed):
  - [OpenAI Codex CLI](https://github.com/openai/codex) (install + authenticate)
  - Optional: [Claude Code CLI](https://www.npmjs.com/package/@anthropic-ai/claude-code) (install + authenticate)
- Optional: [GitHub CLI](https://docs.github.com/en/github-cli/github-cli/quickstart) for PRs, badges, and repo info

### Codex CLI

Install the Codex CLI and authenticate it:

```bash
npm install -g @openai/codex
# or
brew install codex

# authenticate
codex
```

### Claude Code CLI (optional)

Install the Claude Code CLI and authenticate it:

```bash
npm install -g @anthropic-ai/claude-code

# start and login
claude
# then use /login inside the CLI
```

### GitHub CLI

Install and authenticate GitHub CLI for GitHub features:

**Install [GitHub CLI](https://docs.github.com/en/github-cli/github-cli/quickstart):**

- **macOS:** `brew install gh`
- **Linux:** `sudo apt install gh` (Ubuntu/Debian) or `sudo dnf install gh` (Fedora)
- **Windows:** `winget install GitHub.cli`

**Authenticate:**

```bash
gh auth login
```

## Getting Started

### Prerequisites

1. **Node.js 20.0.0+ (recommended: 22.20.0)** and Git
2. Install and authenticate at least one provider (Codex or Claude Code)
3. (Optional) Install and authenticate [GitHub CLI](https://docs.github.com/en/github-cli/github-cli/quickstart)

### Development Setup

1. **Clone this repository**
   ```bash
   git clone https://github.com/generalaction/emdash.git
   cd emdash
   ```

2. **Use the correct Node.js version**
   
   This project uses Node.js 22.20.0. Choose one:

   **Option A: Using nvm (recommended)**
   ```bash
   nvm use
   # or if you don't have v22.20.0 installed:
   nvm install
   ```

   **Option B: Manual installation**
   - Download and install Node.js 22.20.0 from [nodejs.org](https://nodejs.org/)

3. **Install and run**
   ```bash
   npm run d
   ```
   
   This single command installs dependencies, rebuilds native modules, and starts the dev server.
   
   Alternatively, you can run these steps separately:
   ```bash
   npm install  # Install dependencies
   npm run dev  # Start development server
   ```

#### Database & migrations

Emdash stores app data in a local SQLite file and manages the schema with [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm).
Migrations live in `/drizzle` and run automatically on app start (dev and packaged).

### Troubleshooting

#### SIGSEGV / Segmentation Fault on Startup

If you encounter a segmentation fault (SIGSEGV) when running the app, it's caused by native modules (sqlite3, node-pty, keytar) compiled for the wrong Node.js/Electron version. This happens when:
- Switching between Node.js versions
- Updating Electron
- Using a different machine/architecture
- Installing packages after changing versions

**Quick fix:**
```bash
npm run rebuild
```

**If that doesn't work, nuclear option:**
```bash
npm run reset
```

This removes `node_modules` and reinstalls everything from scratch.

### Usage

In the chat input, use the provider selector to switch between Codex and Claude Code. Once a chat has started with Codex or Claude, the provider is locked for that chat.

### Plan Mode (read‑only)

Enable a per‑workspace read‑only mode for all terminal providers.

- Writes a policy at `.emdash/planning.md` and a helper `PLANNING.md` at repo root; sets `EMDASH_PLAN_MODE=1`/`EMDASH_PLAN_FILE` for the terminal (no text is printed).
- Optionally triggers native plan mode where supported (e.g., Claude Code `/plan`).
- Toggle via the Provider Bar. Verify with `echo $EMDASH_PLAN_MODE`, `echo $EMDASH_PLAN_FILE`, or by opening `.emdash/planning.md`.
- Notes: `.emdash/` is hidden from Changes; worktrees skip editing `.git/info/exclude`. Behavior is advisory by default.

## Build from Source

### macOS

```bash
npm run package:mac
```

Outputs: `release/emdash-arm64.dmg` and `release/emdash-arm64.zip`

**Note:** Native modules (node-pty, sqlite3, keytar) are automatically rebuilt for Electron during `npm install` via the postinstall hook.

### Linux

Install build dependencies:

```bash
# Debian/Ubuntu
sudo apt-get install -y python3 python3-dev build-essential

# Fedora/RHEL
sudo dnf install -y python3 python3-devel gcc gcc-c++ make

# Arch
sudo pacman -S python base-devel
```

Build the app:

```bash
npm run package:linux
```

Outputs: `release/emdash-x64.AppImage` and `release/emdash-x64.deb`

**AppImage Usage:**
```bash
chmod +x emdash-x64.AppImage
./emdash-x64.AppImage
```

**Debian Package:**
```bash
sudo dpkg -i emdash-x64.deb
emdash  # Run from command line after install
```

### Windows

Install build dependencies (via [Chocolatey](https://chocolatey.org/)):

```powershell
choco install python build-essentials
```

Or install manually:
- [Python 3](https://www.python.org/downloads/)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) (or Visual Studio with C++ workload)

Build the app:

```bash
npm run package:win
```

Outputs: `release/emdash-x64.exe` (portable) and `release/emdash-x64-installer.exe` (NSIS installer)

### Cross-Platform Build

To build for all platforms:

```bash
npm run build        # Compiles TypeScript and Vite
npm run package      # Builds for current platform
```

To build for a specific platform on macOS:

```bash
npm run package:mac      # macOS
npm run package:linux    # Linux (requires cross-build tools)
npm run package:win      # Windows (requires cross-build tools)
```

**Note:** Native modules (sqlite3, node-pty, keytar) require platform-specific compilation. Building for a different platform than your current OS may require additional cross-compilation setup.

## Demos

emdash in action

- Creating a CONTRIBUTIONS.md file for an open source repository

<p align="center">
  <img src="./docs/media/demo.gif" alt="Demo: parallel agents with preserved stream state" width="100%" style="border-radius:12px">

Running multiple Codex agents in parallel

- Monitor and review the work of several agents within emdash

<p align="center">
  <img src="./docs/media/parallel.gif" alt="Demo: parallel agents with preserved stream state" width="100%" style="border-radius:12px">
  
</p>

Open a Pull Request from the dashboard

- Review diffs, set title/description, choose target branch, and publish to GitHub — all from emdash

<p align="center">
  <img src="./docs/media/openpr.gif" alt="Open a PR from the emdash dashboard" width="100%" style="border-radius:12px">
</p>

## Data Persistence

emdash uses SQLite for local data persistence, ensuring your projects and workspaces are maintained across application sessions. All data is stored locally on your machine, providing privacy and offline functionality.

### Database Architecture

The application maintains two primary data structures:

#### Projects Table

Stores information about opened Git repositories and their GitHub integration status:

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  git_remote TEXT,
  git_branch TEXT,
  github_repository TEXT,
  github_connected BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Key Features:**

- **Unique Path Constraint**: Prevents duplicate project entries
- **Git Integration**: Tracks remote URLs and current branches
- **GitHub Status**: Monitors connection state with [GitHub CLI](https://docs.github.com/en/github-cli/github-cli/quickstart)
- **Automatic Timestamps**: Tracks creation and modification times

#### Workspaces Table

Manages isolated agent workspaces with their associated Git worktrees:

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT DEFAULT 'idle',
  agent_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);
```

**Key Features:**

- **Cascade Deletion**: Removing a project automatically cleans up associated workspaces
- **Status Tracking**: Monitors workspace state (idle, running, completed)
- **Agent Assignment**: Links workspaces to specific agent instances
- **Branch Management**: Tracks Git branch names for each workspace

### Data Location

The SQLite database is automatically created in your system's application data directory:

- **macOS**: `~/Library/Application Support/emdash/emdash.db`
- **Windows**: `%APPDATA%/emdash/emdash.db`
- **Linux**: `~/.config/emdash/emdash.db`

### Database Operations

The application provides a comprehensive set of database operations through the `DatabaseService`:

- **Project Management**: Save, retrieve, and delete project entries
- **Workspace Management**: Create, update, and remove workspace records
- **Automatic Initialization**: Database and tables are created on first launch
- **Error Handling**: Robust error handling with detailed logging

### Storage Usage

The application stores conversation history locally, which may consume disk space over time:

### Clearing Local Storage (Reset Database)

If you want to reset or reclaim space, you can delete the app's local database. This removes saved conversations and resets projects/workspaces. The database is recreated automatically on next launch.

Important

- Quit the app before deleting the DB to avoid file‑in‑use errors.
- Paths with spaces need quotes (e.g. `"Application Support"`).

Default locations (packaged app)

- macOS: `~/Library/Application Support/emdash/emdash.db`
- Windows: `%APPDATA%/emdash/emdash.db`
- Linux: `~/.config/emdash/emdash.db`

Development builds (Electron default)

- macOS: `~/Library/Application Support/Electron/emdash.db`

Note: legacy filenames we migrate from (safe to remove if present): `database.sqlite`, `orcbench.db`.

Quick commands (macOS)

```bash
# Quit the app first

# Packaged path (if you ran a built app)
rm -f "$HOME/Library/Application Support/emdash/emdash.db" \
      "$HOME/Library/Application Support/emdash/emdash.db-wal" \
      "$HOME/Library/Application Support/emdash/emdash.db-shm"

# Dev path (vite/electron dev)
rm -f "$HOME/Library/Application Support/Electron/emdash.db" \
      "$HOME/Library/Application Support/Electron/emdash.db-wal" \
      "$HOME/Library/Application Support/Electron/emdash.db-shm"

# Optional: remove legacy DB filenames if they exist
rm -f "$HOME/Library/Application Support/emdash/database.sqlite" \
      "$HOME/Library/Application Support/emdash/orcbench.db"
rm -f "$HOME/Library/Application Support/Electron/database.sqlite" \
      "$HOME/Library/Application Support/Electron/orcbench.db"

# One-liner to locate any emdash.db under your home folder (preview only)
find "$HOME" -type f -name 'emdash.db*' -print
```

## What's Next

- [ ] Additional providers
- [ ] Workspace lifecycle hooks to run custom scripts on create, run, and archive (e.g., install deps, copy env files, clean up resources)
- [ ] Planning chat with controlled execution (draft actions in a separate chat, then run them one by one)
- [x] Linear integration to track and close out issues
- [ ] Assign the same prompt to different providers at the same time and compare results

## Issue Integrations

### Jira

<img src="./src/assets/images/jira.png" alt="Jira" height="18" />  Connect your Jira site and attach issues to workspaces.

- Prerequisites
  - Site URL: the base URL of your site, for example `https://your-domain.atlassian.net`.
  - Email: your Atlassian account email.
  - API token: create at https://id.atlassian.com/manage-profile/security/api-tokens.
- Connect
  - Open Settings → Integrations → Jira → Set up Jira.
  - Enter Site URL, Email, and API token → Connect.
- Use
  - In “New Workspace” → Advanced options → Jira issue, type an exact key (e.g., `ABC-123`) or search text.
  - If listing is limited, you can still fetch a specific issue by its key.
- Tips
  - Use your atlassian.net site URL, not `api.atlassian.com`.
  - If listing fails or you get 401/403, your account may lack the “Browse projects” permission for those projects.

### Linear

<img src="./src/assets/images/linear-icon.png" alt="Linear" height="18" />  Connect Linear to browse and attach issues.

- Prerequisites
  - Linear API key (create from Linear → Settings → API).
- Connect
  - Open Settings → Integrations → Linear, paste your API key → Connect.
- Use
  - In “New Workspace” → Advanced options → Linear issue, pick from the list or search by title/assignee.

## Security & Privacy

- We take data security and privacy seriously. See docs/telemetry.md for exact details.
- Your code, chats, and repository contents stay local. Emdash does not send your code or chats to us.
- Using third-party CLIs (e.g., Codex, Claude, GitHub CLI) may transmit data to those providers per their policies.

### Telemetry

- By default, Emdash collects basic, anonymous usage statistics via PostHog to understand which features are used and improve stability. This helps us prioritize development and track aggregate adoption. We only send coarse aggregates (e.g., counts/buckets of projects and workspaces) and session duration — never code, paths, or content.
- What we collect:
  - Lifecycle events (e.g., app start/close), feature usage events (feature name only), and non-identifying context (app version, platform, architecture, Electron version, install source).
  - We do not collect code, prompts, repository names, file paths, environment variables, or personally identifiable information.
- How we protect your privacy:
  - Telemetry is anonymous; a random instance ID is stored locally on your device.
  - Autocapture and session replay are disabled; only explicit, allowlisted events are sent.
- Opt-out:
  - Toggle it off in Settings → General → Privacy & Telemetry, or set `TELEMETRY_ENABLED=false` before launching the app.
- Full details, including the exact list of events and properties: see docs/telemetry.md.

<p align="center">
  <img src="./docs/media/disabletelemetry.png" alt="Privacy & Telemetry settings toggle" width="720">
</p>

Maintainers
- Telemetry configuration (PostHog host and project key) is injected via CI for official builds. Local development does not send telemetry unless you explicitly provide credentials.
- Recommended PostHog settings for the project: disable IP capture, autocapture, session replay, and geo‑IP enrichment by default.
