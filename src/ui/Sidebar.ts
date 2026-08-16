import type { ViewId } from './ActivityBar';
import { bus, EV } from '../core/EventEmitter';

export class Sidebar {
  private el: HTMLElement;
  private contentEl: HTMLElement;
  private headerEl: HTMLElement;
  private resizeHandle: HTMLElement;

  private static titles: Record<ViewId, string> = {
    home: 'Home',
    explorer: 'Explorer',
    search: 'Search',
    'source-control': 'Source Control',
    run: 'Run and Debug',
    extensions: 'Extensions',
    assistant: 'Assistant',
  };

  private static WIDTH_KEY = 'evo.sidebar.width';
  private static MIN_WIDTH = 160;
  private static MAX_WIDTH = 600;

  constructor(private root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'evo-sidebar';
    this.el.style.width = this.loadWidth();

    this.headerEl = document.createElement('div');
    this.headerEl.className = 'evo-sidebar-header';
    this.el.appendChild(this.headerEl);

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'evo-sidebar-content';
    this.el.appendChild(this.contentEl);

    this.resizeHandle = document.createElement('div');
    this.resizeHandle.className = 'evo-sidebar-resize';
    this.resizeHandle.title = 'Drag to resize';
    this.el.appendChild(this.resizeHandle);

    this.root.appendChild(this.el);
    this.attachResize();
  }

  private loadWidth(): string {
    try {
      const saved = parseInt(localStorage.getItem(Sidebar.WIDTH_KEY) ?? '', 10);
      if (saved >= Sidebar.MIN_WIDTH && saved <= Sidebar.MAX_WIDTH) {
        return `${saved}px`;
      }
    } catch {
      /* ignore */
    }
    return '280px';
  }

  private attachResize(): void {
    const handle = this.resizeHandle;
    let startX = 0;
    let startWidth = 0;
    let dragging = false;

    const onMove = (e: PointerEvent): void => {
      if (!dragging) return;
      const width = Math.min(
        Sidebar.MAX_WIDTH,
        Math.max(Sidebar.MIN_WIDTH, startWidth + (e.clientX - startX)),
      );
      this.el.style.width = `${width}px`;
    };

    const onUp = (): void => {
      if (!dragging) return;
      dragging = false;
      this.el.classList.remove('resizing');
      handle.classList.remove('dragging');
      document.body.classList.remove('resizing-sidebar');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        localStorage.setItem(Sidebar.WIDTH_KEY, this.el.style.width);
      } catch {
        /* ignore */
      }
      bus.emit(EV.SIDEBAR_CHANGED, this.el.style.width);
    };

    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      dragging = true;
      this.el.classList.add('resizing');
      startX = e.clientX;
      startWidth = this.el.getBoundingClientRect().width;
      handle.classList.add('dragging');
      document.body.classList.add('resizing-sidebar');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
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
    bus.emit(EV.SIDEBAR_CHANGED, this.el.style.width);
  }
}
