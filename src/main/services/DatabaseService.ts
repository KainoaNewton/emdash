import type sqlite3Type from 'sqlite3';
import { join } from 'path';
import { app } from 'electron';
import { existsSync, renameSync } from 'fs';
import { asc, desc, eq, sql } from 'drizzle-orm';
import type {
  AsyncBatchRemoteCallback,
  AsyncRemoteCallback,
  SqliteRemoteDatabase,
} from 'drizzle-orm/sqlite-proxy';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import {
  schema,
  projects,
  workspaces,
  conversations,
  messages,
  type ConversationRow,
  type MessageRow,
  type ProjectRow,
  type WorkspaceRow,
} from '../db/schema';

export interface Project {
  id: string;
  name: string;
  path: string;
  gitInfo: {
    isGitRepo: boolean;
    remote?: string;
    branch?: string;
  };
  githubInfo?: {
    repository: string;
    connected: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  projectId: string;
  name: string;
  branch: string;
  path: string;
  status: 'active' | 'idle' | 'running';
  agentId?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  sender: 'user' | 'agent';
  timestamp: string;
  metadata?: string; // JSON string for additional data
}

export class DatabaseService {
  private sqlite3: typeof sqlite3Type | null = null;
  private connection: sqlite3Type.Database | null = null;
  private orm: SqliteRemoteDatabase<typeof schema> | null = null;
  private dbPath: string;
  private disabled: boolean = false;

  constructor() {
    if (process.env.EMDASH_DISABLE_NATIVE_DB === '1') {
      this.disabled = true;
    }
    const userDataPath = app.getPath('userData');

    // Preferred/current DB filename
    const currentName = 'emdash.db';
    const currentPath = join(userDataPath, currentName);

    // Known legacy filenames we may encounter from earlier builds/docs
    const legacyNames = ['database.sqlite', 'orcbench.db'];

    // If current DB exists, use it
    if (existsSync(currentPath)) {
      this.dbPath = currentPath;
      return;
    }

    // Otherwise, migrate the first legacy DB we find to the current name
    for (const legacyName of legacyNames) {
      const legacyPath = join(userDataPath, legacyName);
      if (existsSync(legacyPath)) {
        try {
          renameSync(legacyPath, currentPath);
          this.dbPath = currentPath;
        } catch {
          // If rename fails for any reason, fall back to using the legacy file in place
          this.dbPath = legacyPath;
        }
        return;
      }
    }

    // No existing DB found; initialize a new one at the current path
    this.dbPath = currentPath;
  }

  async initialize(): Promise<void> {
    if (this.disabled) return;

    await this.loadSqliteModule();
    await this.openConnection();
    await this.enableForeignKeys();
    this.initializeOrm();
    await this.runMigrations();
  }

  async saveProject(project: Omit<Project, 'createdAt' | 'updatedAt'>): Promise<void> {
    if (this.disabled) return;
    if (!this.orm) throw new Error('Database not initialized');

    await this.orm
      .insert(projects)
      .values({
        id: project.id,
        name: project.name,
        path: project.path,
        gitRemote: project.gitInfo.remote ?? null,
        gitBranch: project.gitInfo.branch ?? null,
        githubRepository: project.githubInfo?.repository ?? null,
        githubConnected: project.githubInfo?.connected ?? false,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .onConflictDoUpdate({
        target: projects.path,
        set: {
          name: sql`excluded.name`,
          gitRemote: sql`excluded.git_remote`,
          gitBranch: sql`excluded.git_branch`,
          githubRepository: sql`excluded.github_repository`,
          githubConnected: sql`excluded.github_connected`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .run();
  }

  async getProjects(): Promise<Project[]> {
    if (this.disabled) return [];
    if (!this.orm) throw new Error('Database not initialized');

    const rows = await this.orm
      .select()
      .from(projects)
      .orderBy(desc(projects.updatedAt))
      .all();

    return rows.map((row: ProjectRow) => ({
      id: row.id,
      name: row.name,
      path: row.path,
      gitInfo: {
        isGitRepo: !!(row.gitRemote || row.gitBranch),
        remote: row.gitRemote ?? undefined,
        branch: row.gitBranch ?? undefined,
      },
      githubInfo: row.githubRepository
        ? {
            repository: row.githubRepository,
            connected: !!row.githubConnected,
          }
        : undefined,
      createdAt: row.createdAt ?? '',
      updatedAt: row.updatedAt ?? '',
    }));
  }

  async saveWorkspace(workspace: Omit<Workspace, 'createdAt' | 'updatedAt'>): Promise<void> {
    if (this.disabled) return;
    if (!this.orm) throw new Error('Database not initialized');

    const rawMetadata =
      typeof workspace.metadata === 'string'
        ? workspace.metadata
        : workspace.metadata
          ? JSON.stringify(workspace.metadata)
          : null;

    await this.orm
      .insert(workspaces)
      .values({
        id: workspace.id,
        projectId: workspace.projectId,
        name: workspace.name,
        branch: workspace.branch,
        path: workspace.path,
        status: workspace.status,
        agentId: workspace.agentId ?? null,
        metadata: rawMetadata,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .onConflictDoUpdate({
        target: workspaces.id,
        set: {
          projectId: sql`excluded.project_id`,
          name: sql`excluded.name`,
          branch: sql`excluded.branch`,
          path: sql`excluded.path`,
          status: sql`excluded.status`,
          agentId: sql`excluded.agent_id`,
          metadata: sql`excluded.metadata`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .run();
  }

  async getWorkspaces(projectId?: string): Promise<Workspace[]> {
    if (this.disabled) return [];
    if (!this.orm) throw new Error('Database not initialized');

    let query = this.orm.select().from(workspaces);
    if (projectId) {
      query = query.where(eq(workspaces.projectId, projectId));
    }

    const rows = await query.orderBy(desc(workspaces.updatedAt)).all();

    return rows.map((row: WorkspaceRow) => ({
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      branch: row.branch,
      path: row.path,
      status: row.status ?? 'idle',
      agentId: row.agentId ?? undefined,
      metadata: this.parseMetadata(row.metadata),
      createdAt: row.createdAt ?? '',
      updatedAt: row.updatedAt ?? '',
    }));
  }

  async deleteProject(projectId: string): Promise<void> {
    if (this.disabled) return;
    if (!this.orm) throw new Error('Database not initialized');

    await this.orm.delete(projects).where(eq(projects.id, projectId)).run();
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    if (this.disabled) return;
    if (!this.orm) throw new Error('Database not initialized');

    await this.orm.delete(workspaces).where(eq(workspaces.id, workspaceId)).run();
  }

  // Conversation management methods
  async saveConversation(
    conversation: Omit<Conversation, 'createdAt' | 'updatedAt'>
  ): Promise<void> {
    if (!this.orm) throw new Error('Database not initialized');

    await this.orm
      .insert(conversations)
      .values({
        id: conversation.id,
        workspaceId: conversation.workspaceId,
        title: conversation.title,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .onConflictDoUpdate({
        target: conversations.id,
        set: {
          workspaceId: sql`excluded.workspace_id`,
          title: sql`excluded.title`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .run();
  }

  async getConversations(workspaceId: string): Promise<Conversation[]> {
    if (this.disabled) return [];
    if (!this.orm) throw new Error('Database not initialized');

    const rows = await this.orm
      .select()
      .from(conversations)
      .where(eq(conversations.workspaceId, workspaceId))
      .orderBy(desc(conversations.updatedAt))
      .all();

    return rows.map((row: ConversationRow) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      title: row.title,
      createdAt: row.createdAt ?? '',
      updatedAt: row.updatedAt ?? '',
    }));
  }

  async getOrCreateDefaultConversation(workspaceId: string): Promise<Conversation> {
    if (this.disabled) {
      return {
        id: `conv-${workspaceId}-default`,
        workspaceId,
        title: 'Default Conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    if (!this.orm) throw new Error('Database not initialized');

    const existing = await this.orm
      .select()
      .from(conversations)
      .where(eq(conversations.workspaceId, workspaceId))
      .orderBy(asc(conversations.createdAt))
      .limit(1)
      .get();

    if (existing) {
      return {
        id: existing.id,
        workspaceId: existing.workspaceId,
        title: existing.title,
        createdAt: existing.createdAt ?? '',
        updatedAt: existing.updatedAt ?? '',
      };
    }

    const conversationId = `conv-${workspaceId}-${Date.now()}`;

    await this.orm
      .insert(conversations)
      .values({
        id: conversationId,
        workspaceId,
        title: 'Default Conversation',
        createdAt: sql`CURRENT_TIMESTAMP`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .run();

    return {
      id: conversationId,
      workspaceId,
      title: 'Default Conversation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Message management methods
  async saveMessage(message: Omit<Message, 'timestamp'>): Promise<void> {
    if (this.disabled) return;
    if (!this.orm) throw new Error('Database not initialized');

    await this.orm
      .insert(messages)
      .values({
        id: message.id,
        conversationId: message.conversationId,
        content: message.content,
        sender: message.sender,
        metadata: message.metadata ?? null,
        timestamp: sql`CURRENT_TIMESTAMP`,
      })
      .run();

    await this.orm
      .update(conversations)
      .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(conversations.id, message.conversationId))
      .run();
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    if (this.disabled) return [];
    if (!this.orm) throw new Error('Database not initialized');

    const rows = await this.orm
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.timestamp))
      .all();

    return rows.map((row: MessageRow) => ({
      id: row.id,
      conversationId: row.conversationId,
      content: row.content,
      sender: row.sender,
      timestamp: row.timestamp ?? new Date().toISOString(),
      metadata: row.metadata ?? undefined,
    }));
  }

  async deleteConversation(conversationId: string): Promise<void> {
    if (this.disabled) return;
    if (!this.orm) throw new Error('Database not initialized');

    await this.orm.delete(conversations).where(eq(conversations.id, conversationId)).run();
  }

  async close(): Promise<void> {
    if (this.disabled || !this.connection) return;

    await new Promise<void>((resolve, reject) => {
      this.connection!.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.connection = null;
    this.orm = null;
  }

  private async loadSqliteModule(): Promise<void> {
    if (this.sqlite3) return;
    try {
      // Dynamic import to avoid eager native module load during startup
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.sqlite3 = (await import('sqlite3')) as unknown as typeof sqlite3Type;
    } catch (error) {
      throw error;
    }
  }

  private async openConnection(): Promise<void> {
    if (!this.sqlite3) throw new Error('sqlite3 module not loaded');
    if (this.connection) return;

    await new Promise<void>((resolve, reject) => {
      const db = new this.sqlite3!.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.connection = db;
        resolve();
      });
    });
  }

  private async enableForeignKeys(): Promise<void> {
    if (!this.connection) return;
    await this.runRaw('PRAGMA foreign_keys = ON;');
  }

  private initializeOrm(): void {
    if (!this.connection) throw new Error('Database connection not established');

    const { callback, batchCallback } = this.createRemoteCallbacks();
    this.orm = drizzle(callback, batchCallback, { schema });
  }

  private createRemoteCallbacks(): {
    callback: AsyncRemoteCallback;
    batchCallback: AsyncBatchRemoteCallback;
  } {
    const callback: AsyncRemoteCallback = async (query, params, method) => {
      switch (method) {
        case 'run':
          await this.runRaw(query, params);
          return { rows: [] };
        case 'get': {
          const row = await this.getRaw(query, params);
          return { rows: row };
        }
        case 'values': {
          const rows = await this.allRaw(query, params);
          return { rows: rows.map((r) => Object.values(r)) };
        }
        case 'all':
        default: {
          const rows = await this.allRaw(query, params);
          return { rows };
        }
      }
    };

    const batchCallback: AsyncBatchRemoteCallback = async (batch) => {
      const results = [];
      for (const item of batch) {
        results.push(await callback(item.sql, item.params, item.method));
      }
      return results;
    };

    return { callback, batchCallback };
  }

  private async runMigrations(): Promise<void> {
    if (!this.orm) throw new Error('Database not initialized');

    const migrationsFolder = this.getMigrationsFolder();
    if (!existsSync(migrationsFolder)) {
      // In development we may not have generated migrations yet.
      return;
    }

    await migrate(
      this.orm,
      async (queries) => {
        for (const query of queries) {
          await this.runRaw(query);
        }
      },
      {
        migrationsFolder,
      }
    );
  }

  private getMigrationsFolder(): string {
    const basePath = app.isPackaged ? process.resourcesPath : app.getAppPath();
    return join(basePath, 'drizzle');
  }

  private runRaw(query: string, params: unknown[] = []): Promise<void> {
    if (!this.connection) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      this.connection!.run(query, params, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private allRaw<T = any>(query: string, params: unknown[] = []): Promise<T[]> {
    if (!this.connection) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      this.connection!.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows ?? []);
        }
      });
    });
  }

  private getRaw<T = any>(query: string, params: unknown[] = []): Promise<T | undefined> {
    if (!this.connection) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      this.connection!.get(query, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ?? undefined);
        }
      });
    });
  }

  private parseMetadata(value: string | null | undefined): any {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch (error) {
      console.warn('Failed to parse workspace metadata:', error);
      return null;
    }
  }
}

export const databaseService = new DatabaseService();
