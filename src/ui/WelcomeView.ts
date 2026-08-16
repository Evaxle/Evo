import { icons } from '../core/icons';
import { commands } from '../core/commands';
import { bus, EV } from '../core/EventEmitter';
import type { WorkspaceStore } from '../fs/WorkspaceStore';

export class WelcomeView {
  private el: HTMLElement;

  constructor(
    private root: HTMLElement,
    private workspaces: WorkspaceStore,
    private onOpenWorkspace: (id: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'evo-welcome';
    this.root.appendChild(this.el);

    this.render();
    bus.on(EV.TABS_CHANGED, () => this.updateVisibility());
    this.updateVisibility();
  }

  private updateVisibility(): void {
    // The app shell toggles visibility; kept simple here.
  }

  private render(): void {
    this.el.innerHTML = '';

    const hero = document.createElement('div');
    hero.className = 'welcome-hero';

    const logo = document.createElement('div');
    logo.className = 'welcome-logo';
    logo.textContent = 'E';
    hero.appendChild(logo);

    const title = document.createElement('h1');
    title.className = 'welcome-title';
    title.textContent = 'Evo';
    hero.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'welcome-sub';
    subtitle.textContent = 'A fast, VSCode-like IDE that runs entirely in your browser.';
    hero.appendChild(subtitle);
    this.el.appendChild(hero);

    const actions = document.createElement('div');
    actions.className = 'welcome-actions';

    this.actionButton(actions, icons.folder, 'Open Folder', 'Browse for a local folder to use as your workspace', () => void commands.execute('file.openFolder'));
    this.actionButton(actions, icons.open, 'Open File', 'Open one or more local files', () => void commands.execute('file.openFile'));
    this.actionButton(actions, icons.newfile, 'New File', 'Create a new file in the current workspace', () => void commands.execute('file.new'));
    this.actionButton(actions, icons.cloud, 'GitHub Codespaces', 'Connect your GitHub account (coming soon)', () => void commands.execute('workbench.action.account'));
    this.el.appendChild(actions);

    const recents = document.createElement('div');
    recents.className = 'welcome-recents';
    const recentsTitle = document.createElement('h2');
    recentsTitle.className = 'welcome-recents-title';
    recentsTitle.textContent = 'Recent';
    recents.appendChild(recentsTitle);

    void this.workspaces.list().then((list) => {
      const slice = list.slice(0, 6);
      if (!slice.length) {
        const none = document.createElement('p');
        none.className = 'welcome-none';
        none.textContent = 'No recent workspaces yet. Open a folder to get started.';
        recents.appendChild(none);
        return;
      }
      for (const ws of slice) {
        const row = document.createElement('button');
        row.className = 'welcome-recent';
        row.innerHTML = `<span class="wr-icon">${icons.folder}</span><span class="wr-name">${ws.name}</span>`;
        row.addEventListener('click', () => this.onOpenWorkspace(ws.id));
        recents.appendChild(row);
      }
    });

    this.el.appendChild(recents);

    const tip = document.createElement('p');
    tip.className = 'welcome-tip';
    tip.innerHTML = `<span>Tip:</span> press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> to open the Command Palette, or <kbd>Ctrl</kbd>+<kbd>P</kbd> to quickly open a file.`;
    this.el.appendChild(tip);
  }

  private actionButton(
    parent: HTMLElement,
    icon: string,
    label: string,
    desc: string,
    onClick: () => void,
  ): void {
    const btn = document.createElement('button');
    btn.className = 'welcome-action';
    btn.innerHTML = `<span class="wa-icon">${icon}</span><span class="wa-text"><span class="wa-label">${label}</span><span class="wa-desc">${desc}</span></span>`;
    btn.addEventListener('click', onClick);
    parent.appendChild(btn);
  }
}
