import { icons } from '../core/icons';
import { commands } from '../core/commands';
import { showContextMenu } from './ContextMenu';

export type ViewId =
  | 'home'
  | 'explorer'
  | 'search'
  | 'source-control'
  | 'run'
  | 'extensions'
  | 'assistant';

export class ActivityBar {
  private el: HTMLElement;
  private buttons = new Map<ViewId, HTMLElement>();
  private active: ViewId | null = null;
  private accountBtn: HTMLElement;

  constructor(
    private root: HTMLElement,
    private onViewChange: (view: ViewId | null) => void,
    private onHome: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'evo-activitybar';

    const top = document.createElement('div');
    top.className = 'ab-top';

    const homeBtn = this.iconButton('home', 'Home');
    homeBtn.addEventListener('click', () => this.onHome());
    top.appendChild(homeBtn);
    top.appendChild(document.createElement('div')).className = 'ab-sep';

    this.addButton(top, 'explorer', 'files', 'Explorer');
    this.addButton(top, 'search', 'search', 'Search');
    this.addButton(top, 'source-control', 'source-control', 'Source Control');
    this.addButton(top, 'run', 'run', 'Run and Debug');
    this.addButton(top, 'extensions', 'extensions', 'Extensions');
    this.addButton(top, 'assistant', 'assistant', 'Assistant');

    const bottom = document.createElement('div');
    bottom.className = 'ab-bottom';

    const settingsBtn = this.iconButton('settings', 'Settings');
    settingsBtn.addEventListener('click', () => void commands.execute('workbench.action.settings'));
    bottom.appendChild(settingsBtn);

    this.accountBtn = this.iconButton('account', 'Account');
    this.accountBtn.addEventListener('click', () => this.openAccountMenu());
    bottom.appendChild(this.accountBtn);

    this.el.appendChild(top);
    this.el.appendChild(bottom);
    this.root.appendChild(this.el);
  }

  private iconButton(name: string, title: string): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'ab-btn';
    btn.title = title;
    btn.innerHTML = (icons as any)[name] ?? icons.account;
    return btn;
  }

  private addButton(parent: HTMLElement, view: ViewId, icon: string, title: string): void {
    const btn = this.iconButton(icon, title);
    btn.dataset.view = view;
    btn.addEventListener('click', () => {
      if (this.active === view) {
        this.setActive(null);
        this.onViewChange(null);
      } else {
        this.setActive(view);
        this.onViewChange(view);
      }
    });
    this.buttons.set(view, btn);
    parent.appendChild(btn);
  }

  setActive(view: ViewId | null): void {
    this.active = view;
    this.buttons.forEach((btn, id) => btn.classList.toggle('active', id === view));
  }

  /** Reflects whether the user is signed in (shows a colored dot). */
  setSignedIn(signedIn: boolean, username?: string): void {
    this.accountBtn.title = signedIn ? `Account (@${username})` : 'Sign In';
    this.accountBtn.classList.toggle('signed-in', signedIn);
  }

  hideForAuth(): void {
    this.el.classList.add('hidden');
  }

  show(): void {
    this.el.classList.remove('hidden');
  }

  /** Opens the account menu with real auth actions. */
  openAccountMenu(): void {
    const rect = this.accountBtn.getBoundingClientRect();
    showContextMenu(
      [
        { label: 'Go to Home', icon: icons.home, action: () => this.onHome() },
        { separator: true },
        {
          label: 'Open Settings', icon: icons.settings,
          action: () => void commands.execute('workbench.action.settings'),
        },
        { separator: true },
        {
          label: 'GitHub',
          icon: icons['source-control'],
          action: () => void commands.execute('workbench.action.openGitHub'),
        },
        {
          label: 'Sign In / Sign Up',
          icon: icons.account,
          action: () => void commands.execute('workbench.action.signIn'),
        },
        {
          label: 'Log Out',
          icon: icons.account,
          danger: true,
          action: () => void commands.execute('workbench.action.signOut'),
        },
      ],
      rect.right - 220,
      rect.top,
    );
  }
}
