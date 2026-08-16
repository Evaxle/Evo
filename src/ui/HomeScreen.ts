import { icons } from '../core/icons';
import { showModal } from './Modal';
import { toast } from './Toast';
import { listProjects, deleteProject, renameProject, getGitHubLink } from '../lib/cloud';
import { listRepos, githubConfigured, linkGitHubAccount, type GitHubRepo } from '../lib/github';
import type { WorkspaceMeta } from '../core/types';

export interface HomeScreenOptions {
  username: string | null;
  signedIn: boolean;
  onOpenCloudProject: (id: string) => void;
  onCreateProject: (name: string) => void;
  onOpenLocalWorkspace: (id: string) => void;
  onOpenLocalFolder: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onLoadRepo: (owner: string, repo: string, branch: string) => void;
}

export class HomeScreen {
  el: HTMLElement;
  opts: HomeScreenOptions;
  private gridEl!: HTMLElement;
  private githubEl!: HTMLElement;
  private localWorkspaces: WorkspaceMeta[] = [];

  constructor(
    private root: HTMLElement,
    opts: HomeScreenOptions,
  ) {
    this.opts = opts;
    this.el = document.createElement('div');
    this.el.className = 'evo-home';
    this.renderShell();
    this.root.appendChild(this.el);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const grid = this.gridEl;
    grid.innerHTML = '';

    const projects = this.opts.signedIn ? await listProjects() : [];
    const hasLocal = this.localWorkspaces.length > 0;

    if (projects.length || hasLocal) {
      const section = document.createElement('div');
      section.className = 'home-section';
      const title = document.createElement('h2');
      title.className = 'home-section-title';
      title.textContent = this.opts.signedIn ? 'Your Projects' : 'Local Workspaces';
      section.appendChild(title);

      const rows = document.createElement('div');
      rows.className = 'home-project-list';

      let idx = 0;
      for (const p of projects) {
        rows.appendChild(this.projectCard(p.name, p.updated_at, {
          onOpen: () => this.opts.onOpenCloudProject(p.id),
          onRename: () => void this.renameCloud(p),
          onDelete: () => void this.deleteCloud(p.id),
        }, idx++));
      }
      for (const w of this.localWorkspaces) {
        rows.appendChild(this.projectCard(w.name, new Date(w.lastOpened).toLocaleDateString(), {
          onOpen: () => this.opts.onOpenLocalWorkspace(w.id),
        }, idx++));
      }
      section.appendChild(rows);
      grid.appendChild(section);
    } else {
      const empty = document.createElement('div');
      empty.className = 'home-empty';
      empty.innerHTML = `
        <div class="home-empty-icon">${icons.folder}</div>
        <p>No projects yet. Create one to get started.</p>`;
      grid.appendChild(empty);
    }

    void this.renderGitHub();
  }

  private projectCard(
    name: string,
    updated: string,
    actions: { onOpen: () => void; onRename?: () => void; onDelete?: () => void },
    index = 0,
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'home-project-card';
    card.style.animationDelay = `${Math.min(index, 10) * 35}ms`;
    card.innerHTML = `
      <div class="hpc-icon">${icons.folder}</div>
      <div class="hpc-info">
        <span class="hpc-name"></span>
        <span class="hpc-updated"></span>
      </div>
      <div class="hpc-actions"></div>
    `;
    card.querySelector<HTMLElement>('.hpc-name')!.textContent = name;
    card.querySelector<HTMLElement>('.hpc-updated')!.textContent = `Updated ${updated}`;

    const actionsEl = card.querySelector<HTMLElement>('.hpc-actions')!;
    if (actions.onRename) {
      actionsEl.appendChild(this.iconBtn(icons.rename, 'Rename', actions.onRename));
    }
    if (actions.onDelete) {
      actionsEl.appendChild(this.iconBtn(icons.trash, 'Delete', actions.onDelete));
    }
    card.querySelector<HTMLElement>('.hpc-icon')!.addEventListener('click', actions.onOpen);
    card.addEventListener('dblclick', actions.onOpen);

    return card;
  }

  private iconBtn(icon: string, title: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'hpc-btn';
    btn.title = title;
    btn.innerHTML = icon;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  private async renameCloud(p: { id: string; name: string }): Promise<void> {
    const res = await showModal({
      title: 'Rename Project',
      inputValue: p.name,
      confirmText: 'Rename',
    });
    if (!res.ok || !res.value.trim()) return;
    if (await renameProject(p.id, res.value.trim())) {
      toast('Project renamed', 'success');
      void this.refresh();
    }
  }

  private async deleteCloud(id: string): Promise<void> {
    const res = await showModal({
      title: 'Delete Project',
      message: 'This permanently deletes the project from your account.',
      confirmText: 'Delete',
    });
    if (!res.ok) return;
    if (await deleteProject(id)) {
      toast('Project deleted', 'success');
      void this.refresh();
    }
  }

  private async renderGitHub(): Promise<void> {
    const wrap = this.githubEl;
    wrap.innerHTML = '';

    if (!githubConfigured()) {
      const note = document.createElement('div');
      note.className = 'home-github-note';
      note.textContent = 'GitHub is not configured yet. Add VITE_GITHUB_CLIENT_ID to enable repository syncing.';
      wrap.appendChild(note);
      return;
    }

    const link = await getGitHubLink();

    if (!link?.token) {
      const card = document.createElement('div');
      card.className = 'home-github-card';
      card.innerHTML = `
        <div class="hg-icon">${icons['source-control']}</div>
        <div class="hg-info">
          <span class="hg-title">GitHub</span>
          <span class="hg-desc">Link your account to load and commit repositories.</span>
        </div>
        <button class="hg-btn">Link GitHub</button>
      `;
      card.querySelector<HTMLButtonElement>('.hg-btn')!.addEventListener('click', () => void this.linkGitHub());
      wrap.appendChild(card);
      return;
    }

    const header = document.createElement('div');
    header.className = 'home-github-linked';
    header.innerHTML = `
      <div class="hg-icon">${icons['source-control']}</div>
      <div class="hg-info">
        <span class="hg-title">Linked as <b>@${link.username || 'unknown'}</b></span>
        <span class="hg-desc">Choose a repository to load into Evo.</span>
      </div>
      <button class="hg-btn hg-btn-ghost">Unlink</button>
    `;
    header.querySelector<HTMLButtonElement>('.hg-btn-ghost')!.addEventListener('click', async () => {
      const { setGitHubLink } = await import('../lib/cloud');
      await setGitHubLink(null);
      toast('GitHub unlinked', 'info');
      void this.renderGitHub();
    });
    wrap.appendChild(header);

    const repoList = document.createElement('div');
    repoList.className = 'home-repos';
    const loading = document.createElement('div');
    loading.className = 'home-repos-loading';
    loading.textContent = 'Loading repositories…';
    repoList.appendChild(loading);
    wrap.appendChild(repoList);

    const repos = await listRepos();
    repoList.innerHTML = '';
    if (!repos.length) {
      repoList.innerHTML = `<div class="home-repos-empty">No repositories found.</div>`;
      return;
    }
    for (const r of repos.slice(0, 12)) {
      repoList.appendChild(this.repoRow(r));
    }
  }

  private repoRow(r: GitHubRepo): HTMLElement {
    const row = document.createElement('button');
    row.className = 'home-repo';
    row.innerHTML = `
      <span class="hr-icon">${icons.branch}</span>
      <span class="hr-info">
        <span class="hr-name"></span>
        <span class="hr-desc"></span>
      </span>
      <span class="hr-branch"></span>
    `;
    row.querySelector<HTMLElement>('.hr-name')!.textContent = r.full_name;
    row.querySelector<HTMLElement>('.hr-desc')!.textContent = r.description ?? 'No description';
    row.querySelector<HTMLElement>('.hr-branch')!.textContent = r.default_branch;
    row.addEventListener('click', () => this.opts.onLoadRepo(r.owner, r.name, r.default_branch));
    return row;
  }

  private async linkGitHub(): Promise<void> {
    toast('Opening GitHub… authorize in the new window/tab.', 'info');
    const result = await linkGitHubAccount();
    if (result.ok) {
      toast(`Linked GitHub as @${result.username}`, 'success');
    } else {
      toast(result.error ?? 'Failed to link GitHub', 'error', 6000);
    }
    void this.renderGitHub();
  }

  private renderShell(): void {
    this.el.innerHTML = `
      <header class="home-header">
        <div class="home-brand">
          <div class="home-brand-logo">E</div>
          <div>
            <h1>Evo</h1>
            <p class="home-brand-sub">${this.opts.signedIn ? `Signed in as <b>@${this.opts.username}</b>` : 'Local mode'}</p>
          </div>
        </div>
        <div class="home-header-actions">
          <button class="home-action" data-act="settings">${icons.settings}<span>Settings</span></button>
          ${this.opts.signedIn ? `<button class="home-action" data-act="logout">${icons.account}<span>Log Out</span></button>` : ''}
        </div>
      </header>

      <div class="home-actions">
        <button class="home-big-btn" data-act="new">${icons.newfile}<span><b>New Project</b><em>Create a blank project</em></span></button>
        <button class="home-big-btn" data-act="folder">${icons.folder}<span><b>Open Local Folder</b><em>Load files from your computer</em></span></button>
      </div>

      <div class="home-grid">
        <div class="home-projects-col">
          <div class="home-grid-title">Projects</div>
          <div class="home-projects-list"></div>
        </div>
        <div class="home-github-col">
          <div class="home-grid-title">GitHub</div>
          <div class="home-github-box"></div>
        </div>
      </div>
    `;

    this.gridEl = this.el.querySelector<HTMLElement>('.home-projects-list')!;
    this.githubEl = this.el.querySelector<HTMLElement>('.home-github-box')!;

    this.el.querySelector<HTMLElement>('[data-act="new"]')!.addEventListener('click', () => void this.newProject());
    this.el.querySelector<HTMLElement>('[data-act="folder"]')!.addEventListener('click', () => this.opts.onOpenLocalFolder());
    this.el.querySelector<HTMLElement>('[data-act="settings"]')!.addEventListener('click', () => this.opts.onOpenSettings());
    this.el.querySelector<HTMLElement>('[data-act="logout"]')?.addEventListener('click', () => this.opts.onLogout());
  }

  setLocalWorkspaces(list: WorkspaceMeta[]): void {
    this.localWorkspaces = list;
    void this.refresh();
  }

  private async newProject(): Promise<void> {
    const res = await showModal({
      title: 'New Project',
      placeholder: 'project name',
      confirmText: 'Create',
    });
    if (!res.ok || !res.value.trim()) return;
    this.opts.onCreateProject(res.value.trim());
  }
}
