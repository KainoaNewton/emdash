import { ipcMain } from 'electron';
import { log } from '../lib/logger';
import { GitHubService } from '../services/GitHubService';
import { worktreeService } from '../services/WorktreeService';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);
const githubService = new GitHubService();

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export function registerGithubIpc() {
  ipcMain.handle('github:connect', async (_, projectPath: string) => {
    try {
      // Check if GitHub CLI is authenticated
      const isAuth = await githubService.isAuthenticated();
      if (!isAuth) {
        return { success: false, error: 'GitHub CLI not authenticated' };
      }

      // Get repository info from GitHub CLI
      try {
        const { stdout } = await execAsync(
          'gh repo view --json name,nameWithOwner,defaultBranchRef',
          { cwd: projectPath }
        );
        const repoInfo = JSON.parse(stdout);

        return {
          success: true,
          repository: repoInfo.nameWithOwner,
          branch: repoInfo.defaultBranchRef?.name || 'main',
        };
      } catch (error) {
        return {
          success: false,
          error: 'Repository not found on GitHub or not connected to GitHub CLI',
        };
      }
    } catch (error) {
      log.error('Failed to connect to GitHub:', error);
      return { success: false, error: 'Failed to connect to GitHub' };
    }
  });

  ipcMain.handle('github:auth', async () => {
    try {
      return await githubService.authenticate();
    } catch (error) {
      log.error('GitHub authentication failed:', error);
      return { success: false, error: 'Authentication failed' };
    }
  });

  ipcMain.handle('github:isAuthenticated', async () => {
    try {
      return await githubService.isAuthenticated();
    } catch (error) {
      log.error('GitHub authentication check failed:', error);
      return false;
    }
  });

  // GitHub status: installed + authenticated + user
  ipcMain.handle('github:getStatus', async () => {
    try {
      let installed = true;
      try {
        await execAsync('gh --version');
      } catch {
        installed = false;
      }

      let authenticated = false;
      let user: any = null;
      if (installed) {
        try {
          const { stdout } = await execAsync('gh api user');
          user = JSON.parse(stdout);
          authenticated = true;
        } catch {
          authenticated = false;
          user = null;
        }
      }

      return { installed, authenticated, user };
    } catch (error) {
      log.error('GitHub status check failed:', error);
      return { installed: false, authenticated: false };
    }
  });

  ipcMain.handle('github:getUser', async () => {
    try {
      const token = await (githubService as any)['getStoredToken']();
      if (!token) return null;
      return await githubService.getUserInfo(token);
    } catch (error) {
      log.error('Failed to get user info:', error);
      return null;
    }
  });

  ipcMain.handle('github:getRepositories', async () => {
    try {
      const token = await (githubService as any)['getStoredToken']();
      if (!token) throw new Error('Not authenticated');
      return await githubService.getRepositories(token);
    } catch (error) {
      log.error('Failed to get repositories:', error);
      return [];
    }
  });

  ipcMain.handle('github:cloneRepository', async (_, repoUrl: string, localPath: string) => {
    try {
      return await githubService.cloneRepository(repoUrl, localPath);
    } catch (error) {
      log.error('Failed to clone repository:', error);
      return { success: false, error: 'Clone failed' };
    }
  });

  ipcMain.handle('github:logout', async () => {
    try {
      await githubService.logout();
    } catch (error) {
      log.error('Failed to logout:', error);
    }
  });

  ipcMain.handle(
    'github:listPullRequests',
    async (_, args: { projectPath: string }) => {
      const projectPath = args?.projectPath;
      if (!projectPath) {
        return { success: false, error: 'Project path is required' };
      }

      try {
        const prs = await githubService.getPullRequests(projectPath);
        return { success: true, prs };
      } catch (error) {
        log.error('Failed to list pull requests:', error);
        const message =
          error instanceof Error ? error.message : 'Unable to list pull requests via GitHub CLI';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle(
    'github:createPullRequestWorktree',
    async (
      _,
      args: {
        projectPath: string;
        projectId: string;
        prNumber: number;
        prTitle?: string;
        workspaceName?: string;
        branchName?: string;
      }
    ) => {
      const { projectPath, projectId, prNumber } = args || ({} as typeof args);

      if (!projectPath || !projectId || !prNumber) {
        return { success: false, error: 'Missing required parameters' };
      }

      const defaultSlug = slugify(args.prTitle || `pr-${prNumber}`) || `pr-${prNumber}`;
      const workspaceName =
        args.workspaceName && args.workspaceName.trim().length > 0
          ? args.workspaceName.trim()
          : `pr-${prNumber}-${defaultSlug}`;
      const branchName = args.branchName || `pr/${prNumber}`;

      try {
        const currentWorktrees = await worktreeService.listWorktrees(projectPath);
        const existing = currentWorktrees.find((wt) => wt.branch === branchName);

        if (existing) {
          return { success: true, worktree: existing, branchName, workspaceName: existing.name };
        }

        await githubService.ensurePullRequestBranch(projectPath, prNumber, branchName);

        const worktreesDir = path.resolve(projectPath, '..', 'worktrees');
        const slug = slugify(workspaceName) || `pr-${prNumber}`;
        let worktreePath = path.join(worktreesDir, slug);

        if (fs.existsSync(worktreePath)) {
          worktreePath = path.join(worktreesDir, `${slug}-${Date.now()}`);
        }

        const worktree = await worktreeService.createWorktreeFromBranch(
          projectPath,
          workspaceName,
          branchName,
          projectId,
          { worktreePath }
        );

        return { success: true, worktree, branchName, workspaceName };
      } catch (error) {
        log.error('Failed to create PR worktree:', error);
        const message =
          error instanceof Error ? error.message : 'Unable to create PR worktree via GitHub CLI';
        return { success: false, error: message };
      }
    }
  );
}
