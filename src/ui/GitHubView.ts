import { icons } from '../core/icons';
import { getGitHubLink } from '../lib/cloud';
import { commitChanges } from '../lib/github';
import { toast } from './Toast';
import type { FileSystem } from '../fs/FileSystem';
import type { FSNode } from '../core/types';

export interface RepoSession {
  owner: string;
  repo: string;
  branch: string;
  /** path -> original content at load time */
  snapshot: Map<string, string>;
}

interface DiffEntry {
  path: string;
  status: 'modified' | 'added' | 'deleted';
}

export class GitHubView {
  el: HTMLElement;
  private bodyEl: HTMLElement;
  private session: RepoSession | null = null;

  constructor(
    private root: HTMLElement,
    private fs: FileSystem,
    private onOpenFile: (nodeId: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'evo-view evo-github';

    const header = document.createElement('div');
    header.className = 'evo-view-header';
    header.innerHTML = `<span class="view-title">SOURCE CONTROL</span>`;
    this.el.appendChild(header);

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'github-body';
    this.el.appendChild(this.bodyEl);

    this.root.appendChild(this.el);
  }

  setSession(session: RepoSession | null): void {
    this.session = session;
    this.render();
  }

  getSession(): RepoSession | null {
    return this.session;
  }

  async render(): Promise<void> {
    this.bodyEl.innerHTML = '';

    const link = await getGitHubLink();

    if (!link?.token) {
      const card = document.createElement('div');
      card.className = 'github-card';
      card.innerHTML = `
        <div class="github-card-icon">${icons['source-control']}</div>
        <p>Sign in with GitHub to load repositories, edit files and commit your changes.</p>
        <p class="github-empty-sub">Go to the Home screen and sign in with GitHub.</p>
      `;
      this.bodyEl.appendChild(card);
      return;
    }

    if (!this.session) {
      const empty = document.createElement('div');
      empty.className = 'github-empty';
      empty.innerHTML = `
        <p>No repository loaded.</p>
        <p class="github-empty-sub">Load a repository from the Home screen to start editing and committing.</p>
      `;
      this.bodyEl.appendChild(empty);
      return;
    }

    const s = this.session;
    const diffs = this.computeDiff();

    const repoHeader = document.createElement('div');
    repoHeader.className = 'github-repo';
    repoHeader.innerHTML = `
      <div class="github-repo-icon">${icons.branch}</div>
      <div class="github-repo-info">
        <span class="github-repo-name">${s.owner}/${s.repo}</span>
        <span class="github-repo-branch">${s.branch}</span>
      </div>
    `;
    this.bodyEl.appendChild(repoHeader);

    const changes = document.createElement('div');
    changes.className = 'github-changes';
    const countTitle = document.createElement('div');
    countTitle.className = 'github-changes-title';
    countTitle.textContent = diffs.length ? `Changes (${diffs.length})` : 'No changes';
    changes.appendChild(countTitle);

    if (diffs.length) {
      for (const d of diffs) {
        const row = document.createElement('div');
        row.className = `github-file github-file-${d.status}`;
        const status = document.createElement('span');
        status.className = 'github-file-status';
        status.textContent = d.status === 'modified' ? 'M' : d.status === 'added' ? 'A' : 'D';
        const label = document.createElement('span');
        label.className = 'github-file-name';
        label.textContent = d.path;
        row.appendChild(status);
        row.appendChild(label);
        const node = this.fs.getNodeByPath(d.path);
        if (node) {
          row.addEventListener('click', () => this.onOpenFile(node.id));
        }
        changes.appendChild(row);
      }

      const commitWrap = document.createElement('div');
      commitWrap.className = 'github-commit';
      const input = document.createElement('input');
      input.className = 'github-commit-input';
      input.placeholder = 'Message';
      input.spellcheck = false;
      const btn = document.createElement('button');
      btn.className = 'github-btn github-btn-commit';
      btn.textContent = 'Commit & Push';
      btn.addEventListener('click', async () => {
        if (!input.value.trim()) {
          toast('Enter a commit message first', 'warning');
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Committing…';
        const changesPayload = diffs.map((d) => {
          const node = this.fs.getNodeByPath(d.path);
          return {
            path: d.path,
            content: node?.content ?? '',
            deleted: d.status === 'deleted',
          };
        });
        const result = await commitChanges(s.owner, s.repo, s.branch, input.value.trim(), changesPayload);
        btn.disabled = false;
        btn.textContent = 'Commit & Push';
        if (result.ok) {
          toast(`Pushed ${diffs.length} change(s) to ${s.repo}`, 'success');
          this.resyncSnapshot();
          void this.render();
        } else {
          toast(result.error ?? 'Commit failed', 'error', 6000);
        }
      });
      commitWrap.appendChild(input);
      commitWrap.appendChild(btn);
      changes.appendChild(commitWrap);
    }

    this.bodyEl.appendChild(changes);
  }

  private computeDiff(): DiffEntry[] {
    if (!this.session) return [];
    const diffs: DiffEntry[] = [];
    const snapshot = this.session.snapshot;

    const walk = (node: FSNode, prefix: string) => {
      const path = prefix ? `${prefix}/${node.name}` : node.name;
      if (node.type === 'file') {
        const original = snapshot.get(path);
        if (original === undefined) {
          diffs.push({ path, status: 'added' });
        } else if (original !== node.content) {
          diffs.push({ path, status: 'modified' });
        }
      } else {
        node.children?.forEach((c) => walk(c, path));
      }
    };
    walk(this.fs.root, '');

    for (const [path] of snapshot) {
      if (!this.fs.getNodeByPath(path)) {
        diffs.push({ path, status: 'deleted' });
      }
    }
    return diffs;
  }

  private resyncSnapshot(): void {
    if (!this.session) return;
    const snap = new Map<string, string>();
    const walk = (node: FSNode, prefix: string) => {
      const path = prefix ? `${prefix}/${node.name}` : node.name;
      if (node.type === 'file') snap.set(path, node.content);
      else node.children?.forEach((c) => walk(c, path));
    };
    walk(this.fs.root, '');
    this.session.snapshot = snap;
  }
}
