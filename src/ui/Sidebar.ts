import type { ViewId } from './ActivityBar';

export class Sidebar {
  private el: HTMLElement;
  private contentEl: HTMLElement;
  private headerEl: HTMLElement;

  private static titles: Record<ViewId, string> = {
    home: 'Home',
    explorer: 'Explorer',
    search: 'Search',
    'source-control': 'Source Control',
    run: 'Run and Debug',
    extensions: 'Extensions',
  };

  constructor(private root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'evo-sidebar';

    this.headerEl = document.createElement('div');
    this.headerEl.className = 'evo-sidebar-header';
    this.el.appendChild(this.headerEl);

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'evo-sidebar-content';
    this.el.appendChild(this.contentEl);

    this.root.appendChild(this.el);
  }

  /** Attach a view element, replacing the current content. */
  setView(view: ViewId | null, element: HTMLElement | null): void {
    this.contentEl.innerHTML = '';
    if (view && element) {
      this.headerEl.textContent = Sidebar.titles[view];
      this.contentEl.appendChild(element);
      this.el.classList.remove('hidden');
    } else {
      this.el.classList.add('hidden');
    }
  }

  isVisible(): boolean {
    return !this.el.classList.contains('hidden');
  }

  toggle(): void {
    this.el.classList.toggle('hidden');
  }
}
