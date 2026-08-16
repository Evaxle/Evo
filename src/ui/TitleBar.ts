import { icons } from '../core/icons';
import { commands } from '../core/commands';
import { bus, EV } from '../core/EventEmitter';
import { showContextMenu } from './ContextMenu';
import type { MenuItem } from './ContextMenu';

export class TitleBar {
  private el: HTMLElement;
  private titleEl: HTMLElement;

  constructor(
    private root: HTMLElement,
    private getActiveFile: () => string | null,
  ) {
    this.el = document.createElement('header');
    this.el.className = 'evo-titlebar';

    this.el.innerHTML = `
      <div class="tb-left">
        <button class="tb-btn tb-menu" title="Menu"></button>
        <span class="tb-brand"><span class="tb-logo">E</span><span class="tb-name">Evo</span></span>
      </div>
      <div class="tb-center">
        <span class="tb-workspace"></span>
        <span class="tb-sep">-</span>
        <span class="tb-file"></span>
      </div>
      <div class="tb-right">
        <button class="tb-btn" data-cmd="workbench.action.openCommandPalette" title="Command Palette (Ctrl+Shift+P)"></button>
        <button class="tb-btn tb-account" data-cmd="workbench.action.account" title="Account"></button>
      </div>
    `;

    this.titleEl = this.el.querySelector('.tb-workspace')!;
    this.el.querySelector<HTMLElement>('.tb-file')!.textContent = 'Welcome';

    // bind icons
    this.el.querySelector<HTMLElement>('.tb-menu')!.innerHTML = icons.menu;
    this.el
      .querySelector<HTMLElement>('[data-cmd="workbench.action.openCommandPalette"]')!
      .innerHTML = icons.search;
    this.el.querySelector<HTMLElement>('.tb-account')!.innerHTML = icons.account;

    this.el
      .querySelector<HTMLElement>('.tb-menu')!
      .addEventListener('click', (e) => this.openMenu(e.currentTarget as HTMLElement));
    this.el.querySelectorAll<HTMLElement>('[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.cmd!;
        if (id === 'workbench.action.account') {
          this.openAccountMenu();
        } else {
          void commands.execute(id);
        }
      });
    });

    bus.on(EV.ACTIVE_FILE_CHANGED, () => {
      const fileEl = this.el.querySelector<HTMLElement>('.tb-file')!;
      const name = this.getActiveFile();
      fileEl.textContent = name ?? 'Welcome';
      fileEl.classList.toggle('hidden', !name);
    });
    bus.on(EV.WORKSPACE_CHANGED, (name: string) => {
      this.titleEl.textContent = name;
    });
    bus.on(EV.TAB_CLOSED, () => {
      if (this.el.querySelector('.tb-file')?.textContent === '') {
        this.el.querySelector<HTMLElement>('.tb-file')!.textContent = 'Welcome';
      }
    });

    this.root.appendChild(this.el);
  }

  setWorkspace(name: string): void {
    this.titleEl.textContent = name;
  }

  private openMenu(anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    const items: MenuItem[] = [
      { label: 'Go to Home', icon: icons.home, action: () => void commands.execute('workbench.action.home') },
      { separator: true },
      { label: 'New File', icon: icons.newfile, action: () => void commands.execute('file.new') },
      { label: 'New Folder', icon: icons.newfolder, action: () => void commands.execute('explorer.newFolder') },
      { separator: true },
      { label: 'Open Folder...', icon: icons.folder, action: () => void commands.execute('file.openFolder') },
      { label: 'Open File...', icon: icons.open, action: () => void commands.execute('file.openFile') },
      { separator: true },
      { label: 'Save', icon: icons.download, action: () => void commands.execute('file.save') },
      { label: 'Save All', icon: icons.check, action: () => void commands.execute('file.saveAll') },
      { separator: true },
      { label: 'Command Palette...', icon: icons.search, action: () => void commands.execute('workbench.action.openCommandPalette') },
      { label: 'Settings', icon: icons.settings, action: () => void commands.execute('workbench.action.settings') },
      { separator: true },
      { label: 'Sign In / Sign Up', icon: icons.account, action: () => void commands.execute('workbench.action.signIn') },
      { label: 'Log Out', icon: icons.account, danger: true, action: () => void commands.execute('workbench.action.signOut') },
    ];
    showContextMenu(items, rect.left, rect.bottom + 2);
  }

  private openAccountMenu(): void {
    void commands.execute('workbench.action.account');
  }
}
