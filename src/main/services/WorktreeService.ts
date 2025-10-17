import { execFile } from 'child_process';
import { log } from '../lib/logger';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);

export interface WorktreeInfo {
  id: string;
  name: string;
  branch: string;
  path: string;
  projectId: string;
  status: 'active' | 'paused' | 'completed' | 'error';
  createdAt: string;
  lastActivity?: string;
}

export class WorktreeService {
  private worktrees = new Map<string, WorktreeInfo>();

  /**
   * Slugify workspace name to make it shell-safe
   */
  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Generate a stable ID from the absolute worktree path.
   */
  private stableIdFromPath(worktreePath: string): string {
    const abs = path.resolve(worktreePath);
    const h = crypto.createHash('sha1').update(abs).digest('hex').slice(0, 12);
    return `wt-${h}`;
  }

  /**
   * Create a new Git worktree for an agent workspace
   */
  async createWorktree(
    projectPath: string,
    workspaceName: string,
    projectId: string
  ): Promise<WorktreeInfo> {
    try {
      const sluggedName = this.slugify(workspaceName);
      const timestamp = Date.now();
      const branchName = `agent/${sluggedName}-${timestamp}`;
      const worktreePath = path.join(projectPath, '..', `worktrees/${sluggedName}-${timestamp}`);
      const worktreeId = this.stableIdFromPath(worktreePath);

      log.info(`Creating worktree: ${branchName} -> ${worktreePath}`);

      // Check if worktree path already exists
      if (fs.existsSync(worktreePath)) {
        throw new Error(`Worktree directory already exists: ${worktreePath}`);
      }

      // Ensure worktrees directory exists
      const worktreesDir = path.dirname(worktreePath);
      if (!fs.existsSync(worktreesDir)) {
        fs.mkdirSync(worktreesDir, { recursive: true });
      }

      // Create the worktree
      const { stdout, stderr } = await execFileAsync(
        'git',
        ['worktree', 'add', '-b', branchName, worktreePath],
        { cwd: projectPath }
      );

      log.debug('Git worktree stdout:', stdout);
      log.debug('Git worktree stderr:', stderr);

      // Do not treat localized/progress stderr as failure.
      // Many git commands emit progress to stderr; rely on exit code instead.
      // If execFileAsync didn't throw, assume success and verify on-disk state below.

      // Verify the worktree was actually created
      if (!fs.existsSync(worktreePath)) {
        throw new Error(`Worktree directory was not created: ${worktreePath}`);
      }

      // Ensure codex logs are ignored in this worktree
      this.ensureCodexLogIgnored(worktreePath);

      const worktreeInfo: WorktreeInfo = {
        id: worktreeId,
        name: workspaceName,
        branch: branchName,
        path: worktreePath,
        projectId,
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      this.worktrees.set(worktreeInfo.id, worktreeInfo);

      log.info(`Created worktree: ${workspaceName} -> ${branchName}`);

      // Push the new branch to origin and set upstream so PRs work out of the box
      try {
        await execFileAsync('git', ['push', '--set-upstream', 'origin', branchName], {
          cwd: worktreePath,
        });
        log.info(`Pushed branch ${branchName} to origin with upstream tracking`);
      } catch (pushErr) {
        log.warn('Initial push of worktree branch failed:', pushErr as any);
        // Don't fail worktree creation if push fails - user can push manually later
      }

      return worktreeInfo;
    } catch (error) {
      log.error('Failed to create worktree:', error);
      throw new Error(`Failed to create worktree: ${error}`);
    }
  }

  /**
   * List all worktrees for a project
   */
  async listWorktrees(projectPath: string): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await execFileAsync('git', ['worktree', 'list'], {
        cwd: projectPath,
      });

      const worktrees: WorktreeInfo[] = [];
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        if (line.includes('[') && line.includes(']')) {
          const parts = line.split(/\s+/);
          const worktreePath = parts[0];
          const branchMatch = line.match(/\[([^\]]+)\]/);
          const branch = branchMatch ? branchMatch[1] : 'unknown';

          const managedBranch =
            branch.startsWith('agent/') ||
            branch.startsWith('pr/') ||
            branch.startsWith('orch/');

          if (!managedBranch) {
            const tracked = Array.from(this.worktrees.values()).find(
              (wt) => wt.path === worktreePath
            );
            if (!tracked) continue;
          }

          const existing = Array.from(this.worktrees.values()).find(
            (wt) => wt.path === worktreePath
          );

          worktrees.push(
            existing ?? {
              id: this.stableIdFromPath(worktreePath),
              name: path.basename(worktreePath),
              branch,
              path: worktreePath,
              projectId: path.basename(projectPath),
              status: 'active',
              createdAt: new Date().toISOString(),
            }
          );
        }
      }

      return worktrees;
    } catch (error) {
      log.error('Failed to list worktrees:', error);
      return [];
    }
  }

  /**
   * Remove a worktree
   */
  async removeWorktree(
    projectPath: string,
    worktreeId: string,
    worktreePath?: string,
    branch?: string
  ): Promise<void> {
    try {
      let worktree = this.worktrees.get(worktreeId);

      let pathToRemove = worktree?.path ?? worktreePath;
      let branchToDelete = worktree?.branch ?? branch;

      if (!pathToRemove) {
        throw new Error('Worktree path not provided');
      }

      // Remove the worktree directory via git first
      try {
        await execFileAsync('git', ['worktree', 'remove', pathToRemove], {
          cwd: projectPath,
        });
      } catch (gitError) {
        console.warn('git worktree remove failed, attempting filesystem cleanup', gitError);
      }

      // Ensure directory is removed even if git command failed
      if (fs.existsSync(pathToRemove)) {
        await fs.promises.rm(pathToRemove, { recursive: true, force: true });
      }

      if (branchToDelete) {
        try {
          await execFileAsync('git', ['branch', '-D', branchToDelete], { cwd: projectPath });
        } catch (branchError) {
          console.warn(`Failed to delete branch ${branchToDelete}:`, branchError);
        }
      }

      if (worktree) {
        this.worktrees.delete(worktreeId);
        log.info(`Removed worktree: ${worktree.name}`);
      } else {
        log.info(`Removed worktree ${worktreeId}`);
      }
    } catch (error) {
      log.error('Failed to remove worktree:', error);
      throw new Error(`Failed to remove worktree: ${error}`);
    }
  }

  /**
   * Get worktree status and changes
   */
  async getWorktreeStatus(worktreePath: string): Promise<{
    hasChanges: boolean;
    stagedFiles: string[];
    unstagedFiles: string[];
    untrackedFiles: string[];
  }> {
    try {
      const { stdout: status } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: worktreePath,
      });

      const stagedFiles: string[] = [];
      const unstagedFiles: string[] = [];
      const untrackedFiles: string[] = [];

      const lines = status
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      for (const line of lines) {
        const status = line.substring(0, 2);
        const file = line.substring(3);

        if (status.includes('A') || status.includes('M') || status.includes('D')) {
          stagedFiles.push(file);
        }
        if (status.includes('M') || status.includes('D')) {
          unstagedFiles.push(file);
        }
        if (status.includes('??')) {
          untrackedFiles.push(file);
        }
      }

      return {
        hasChanges: stagedFiles.length > 0 || unstagedFiles.length > 0 || untrackedFiles.length > 0,
        stagedFiles,
        unstagedFiles,
        untrackedFiles,
      };
    } catch (error) {
      log.error('Failed to get worktree status:', error);
      return {
        hasChanges: false,
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
      };
    }
  }

  /**
   * Get the default branch of a repository
   */
  private async getDefaultBranch(projectPath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['remote', 'show', 'origin'], {
        cwd: projectPath,
      });
      const match = stdout.match(/HEAD branch:\s*(\S+)/);
      return match ? match[1] : 'main';
    } catch {
      return 'main';
    }
  }

  /**
   * Merge worktree changes back to main branch
   */
  async mergeWorktreeChanges(projectPath: string, worktreeId: string): Promise<void> {
    try {
      const worktree = this.worktrees.get(worktreeId);
      if (!worktree) {
        throw new Error('Worktree not found');
      }

      const defaultBranch = await this.getDefaultBranch(projectPath);

      // Switch to default branch
      await execFileAsync('git', ['checkout', defaultBranch], { cwd: projectPath });

      // Merge the worktree branch
      await execFileAsync('git', ['merge', worktree.branch], { cwd: projectPath });

      // Remove the worktree
      await this.removeWorktree(projectPath, worktreeId);

      log.info(`Merged worktree changes: ${worktree.name}`);
    } catch (error) {
      log.error('Failed to merge worktree changes:', error);
      throw new Error(`Failed to merge worktree changes: ${error}`);
    }
  }

  /**
   * Get worktree by ID
   */
  getWorktree(worktreeId: string): WorktreeInfo | undefined {
    return this.worktrees.get(worktreeId);
  }

  /**
   * Get all worktrees
   */
  getAllWorktrees(): WorktreeInfo[] {
    return Array.from(this.worktrees.values());
  }

  private ensureCodexLogIgnored(worktreePath: string) {
    try {
      const gitMeta = path.join(worktreePath, '.git');
      let gitDir = gitMeta;
      if (fs.existsSync(gitMeta) && fs.statSync(gitMeta).isFile()) {
        try {
          const content = fs.readFileSync(gitMeta, 'utf8');
          const m = content.match(/gitdir:\s*(.*)\s*$/i);
          if (m && m[1]) {
            gitDir = path.resolve(worktreePath, m[1].trim());
          }
        } catch {}
      }
      const excludePath = path.join(gitDir, 'info', 'exclude');
      try {
        const dir = path.dirname(excludePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        let current = '';
        try {
          current = fs.readFileSync(excludePath, 'utf8');
        } catch {}
        if (!current.includes('codex-stream.log')) {
          fs.appendFileSync(
            excludePath,
            (current.endsWith('\n') || current === '' ? '' : '\n') + 'codex-stream.log\n'
          );
        }
      } catch {}
    } catch {}
  }

  async createWorktreeFromBranch(
    projectPath: string,
    workspaceName: string,
    branchName: string,
    projectId: string,
    options?: { worktreePath?: string }
  ): Promise<WorktreeInfo> {
    const normalizedName = workspaceName || branchName.replace(/\//g, '-');
    const sluggedName = this.slugify(normalizedName) || 'workspace';
    const targetPath =
      options?.worktreePath ||
      path.join(projectPath, '..', `worktrees/${sluggedName}-${Date.now()}`);
    const worktreePath = path.resolve(targetPath);

    if (fs.existsSync(worktreePath)) {
      throw new Error(`Worktree directory already exists: ${worktreePath}`);
    }

    const worktreesDir = path.dirname(worktreePath);
    if (!fs.existsSync(worktreesDir)) {
      fs.mkdirSync(worktreesDir, { recursive: true });
    }

    try {
      await execFileAsync('git', ['worktree', 'add', worktreePath, branchName], {
        cwd: projectPath,
      });
    } catch (error) {
      throw new Error(
        `Failed to create worktree for branch ${branchName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!fs.existsSync(worktreePath)) {
      throw new Error(`Worktree directory was not created: ${worktreePath}`);
    }

    this.ensureCodexLogIgnored(worktreePath);

    const worktreeInfo: WorktreeInfo = {
      id: this.stableIdFromPath(worktreePath),
      name: normalizedName,
      branch: branchName,
      path: worktreePath,
      projectId,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    this.worktrees.set(worktreeInfo.id, worktreeInfo);

    return worktreeInfo;
  }
}

export const worktreeService = new WorktreeService();
