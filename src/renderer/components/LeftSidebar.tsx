import React from 'react';
import ReorderList from './ReorderList';
import { Button } from './ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from './ui/sidebar';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';
import { Home, ChevronDown, Plus } from 'lucide-react';
import ActiveRuns from './ActiveRuns';
import GithubStatus from './GithubStatus';
import { WorkspaceItem } from './WorkspaceItem';
import ProjectDeleteButton from './ProjectDeleteButton';

interface Project {
  id: string;
  name: string;
  path: string;
  repoKey?: string;
  gitInfo: {
    isGitRepo: boolean;
    remote?: string;
    branch?: string;
  };
  githubInfo?: {
    repository: string;
    connected: boolean;
  };
  workspaces?: Workspace[];
}

interface Workspace {
  id: string;
  name: string;
  branch: string;
  path: string;
  status: 'active' | 'idle' | 'running';
  agentId?: string;
}

const SidebarToggleButton: React.FC = () => {
  const { toggle } = useSidebar();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="absolute -right-3 top-4 z-20 hidden h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-background/80 lg:inline-flex"
      aria-label="Toggle sidebar"
    ></Button>
  );
};

interface LeftSidebarProps {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (project: Project) => void;
  onGoHome: () => void;
  onSelectWorkspace?: (workspace: Workspace) => void;
  activeWorkspace?: Workspace | null;
  onReorderProjects?: (sourceId: string, targetId: string) => void;
  onReorderProjectsFull?: (newOrder: Project[]) => void;
  githubInstalled?: boolean;
  githubAuthenticated?: boolean;
  githubUser?: { login?: string; name?: string; avatar_url?: string } | null;
  onSidebarContextChange?: (state: {
    open: boolean;
    isMobile: boolean;
    setOpen: (next: boolean) => void;
  }) => void;
  onCreateWorkspaceForProject?: (project: Project) => void;
  isCreatingWorkspace?: boolean;
  onDeleteWorkspace?: (project: Project, workspace: Workspace) => void | Promise<void>;
  onDeleteProject?: (project: Project) => void | Promise<void>;
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  projects,
  selectedProject,
  onSelectProject,
  onGoHome,
  onSelectWorkspace,
  activeWorkspace,
  onReorderProjects,
  onReorderProjectsFull,
  githubInstalled = true,
  githubAuthenticated = false,
  githubUser,
  onSidebarContextChange,
  onCreateWorkspaceForProject,
  isCreatingWorkspace,
  onDeleteWorkspace,
  onDeleteProject,
}) => {
  const { open, isMobile, setOpen } = useSidebar();
  const [deletingProjectId, setDeletingProjectId] = React.useState<string | null>(null);

  const handleDeleteProject = React.useCallback(
    async (project: Project) => {
      if (!onDeleteProject) {
        return;
      }
      setDeletingProjectId(project.id);
      try {
        await onDeleteProject(project);
      } finally {
        setDeletingProjectId((current) => (current === project.id ? null : current));
      }
    },
    [onDeleteProject]
  );

  const githubProfileUrl = React.useMemo(() => {
    if (!githubAuthenticated) {
      return null;
    }
    const login = githubUser?.login?.trim();
    return login ? `https://github.com/${login}` : null;
  }, [githubAuthenticated, githubUser?.login]);

  const handleGithubProfileClick = React.useCallback(() => {
    if (!githubProfileUrl || typeof window === 'undefined') {
      return;
    }
    const api = (window as any).electronAPI;
    api?.openExternal?.(githubProfileUrl);
  }, [githubProfileUrl]);

  React.useEffect(() => {
    onSidebarContextChange?.({ open, isMobile, setOpen });
  }, [open, isMobile, setOpen, onSidebarContextChange]);

  const renderGithubStatus = () => (
    <GithubStatus
      installed={githubInstalled}
      authenticated={githubAuthenticated}
      user={githubUser}
    />
  );

  return (
    <div className="relative h-full">
      <Sidebar className="lg:border-r-0">
        <SidebarContent>
          <SidebarGroup className="mb-2">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Button
                      variant="ghost"
                      onClick={onGoHome}
                      aria-label="Home"
                      className="justify-start"
                    >
                      <Home className="h-5 w-5 text-gray-600 dark:text-gray-400 sm:h-4 sm:w-4" />
                      <span className="hidden text-sm font-medium sm:inline">Home</span>
                    </Button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <ActiveRuns
            projects={projects}
            onSelectProject={onSelectProject}
            onSelectWorkspace={onSelectWorkspace}
          />

          <SidebarGroup>
            <SidebarGroupLabel className="sr-only">Projects</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <ReorderList
                  as="div"
                  axis="y"
                  items={projects}
                  onReorder={(newOrder) => {
                    if (onReorderProjectsFull) {
                      onReorderProjectsFull(newOrder as Project[]);
                    } else if (onReorderProjects) {
                      const oldIds = projects.map((p) => p.id);
                      const newIds = (newOrder as Project[]).map((p) => p.id);
                      for (let i = 0; i < newIds.length; i++) {
                        if (newIds[i] !== oldIds[i]) {
                          const sourceId = newIds.find((id) => id === oldIds[i]);
                          const targetId = newIds[i];
                          if (sourceId && targetId && sourceId !== targetId) {
                            onReorderProjects(sourceId, targetId);
                          }
                          break;
                        }
                      }
                    }
                  }}
                  className="m-0 min-w-0 list-none space-y-1 p-0"
                  itemClassName="relative group cursor-pointer rounded-md list-none min-w-0"
                  getKey={(p) => (p as Project).id}
                >
                  {(project) => {
                    const typedProject = project as Project;
                    const isDeletingProject = deletingProjectId === typedProject.id;
                    const showProjectDelete = Boolean(onDeleteProject);
                    return (
                      <SidebarMenuItem>
                        <Collapsible defaultOpen className="group/collapsible">
                          <div className="group/project group/workspace flex w-full min-w-0 items-center rounded-md px-2 py-2 text-sm font-medium focus-within:bg-accent focus-within:text-accent-foreground hover:bg-accent hover:text-accent-foreground">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 flex-col bg-transparent text-left outline-none focus-visible:outline-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectProject(typedProject);
                              }}
                            >
                              <span className="block truncate">{typedProject.name}</span>
                              <span className="hidden truncate text-xs text-muted-foreground sm:block">
                                {typedProject.githubInfo?.repository || typedProject.path}
                              </span>
                            </button>
                            <div className="relative flex flex-shrink-0 items-center pl-6">
                              {showProjectDelete ? (
                                <ProjectDeleteButton
                                  projectName={typedProject.name}
                                  onConfirm={() => handleDeleteProject(typedProject)}
                                  isDeleting={isDeletingProject}
                                  aria-label={`Delete project ${typedProject.name}`}
                                  className={`absolute left-0 inline-flex h-5 w-5 items-center justify-center rounded p-0.5 text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-muted hover:text-destructive focus:opacity-100 focus-visible:opacity-100 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-100 ${
                                    isDeletingProject
                                      ? 'opacity-100'
                                      : 'group-hover/workspace:opacity-100'
                                  }`}
                                />
                              ) : null}
                              <CollapsibleTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`Toggle workspaces for ${typedProject.name}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex h-5 w-5 items-center justify-center rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                  <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                                </button>
                              </CollapsibleTrigger>
                            </div>
                          </div>

                          <CollapsibleContent asChild>
                            <div className="ml-7 mt-2 min-w-0 space-y-1">
                              <div className="hidden min-w-0 space-y-1 sm:block">
                                {typedProject.workspaces?.map((workspace) => {
                                  const isActive = activeWorkspace?.id === workspace.id;
                                  return (
                                    <div
                                      key={workspace.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (
                                          onSelectProject &&
                                          selectedProject?.id !== typedProject.id
                                        ) {
                                          onSelectProject(typedProject);
                                        }
                                        onSelectWorkspace && onSelectWorkspace(workspace);
                                      }}
                                      className={`group/workspace min-w-0 rounded-md px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 ${
                                        isActive ? 'bg-black/5 dark:bg-white/5' : ''
                                      }`}
                                      title={workspace.name}
                                    >
                                      <WorkspaceItem
                                        workspace={workspace}
                                        showDelete
                                        onDelete={
                                          onDeleteWorkspace
                                            ? () => onDeleteWorkspace(typedProject, workspace)
                                            : undefined
                                        }
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onSelectProject && selectedProject?.id !== typedProject.id) {
                                    onSelectProject(typedProject);
                                  } else if (!selectedProject) {
                                    onSelectProject?.(typedProject);
                                  }
                                  onCreateWorkspaceForProject?.(typedProject);
                                }}
                                disabled={isCreatingWorkspace}
                                aria-label={`Add workspace to ${typedProject.name}`}
                              >
                                <Plus className="h-3 w-3 flex-shrink-0 text-gray-400" aria-hidden />
                                <span className="truncate">Add workspace</span>
                              </button>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </SidebarMenuItem>
                    );
                  }}
                </ReorderList>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-gray-200 px-2 py-2 dark:border-gray-800 sm:px-4 sm:py-4">
          <SidebarMenu className="w-full">
            <SidebarMenuItem>
              <SidebarMenuButton
                tabIndex={githubProfileUrl ? 0 : -1}
                onClick={(e) => {
                  if (!githubProfileUrl) {
                    return;
                  }
                  e.preventDefault();
                  handleGithubProfileClick();
                }}
                className={`flex w-full items-center justify-start gap-2 px-2 py-2 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-0 ${
                  githubProfileUrl
                    ? 'hover:bg-black/5 dark:hover:bg-white/5'
                    : 'cursor-default hover:bg-transparent'
                }`}
                aria-label={githubProfileUrl ? 'Open GitHub profile' : undefined}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                  <div className="hidden truncate sm:block">{renderGithubStatus()}</div>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarToggleButton />
    </div>
  );
};

export default LeftSidebar;
