import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import { icons } from '../core/icons';
import { TerminalConnection, type TerminalInitInfo } from '../lib/terminal';

interface TermTab {
  id: number;
  tabEl: HTMLElement;
  labelEl: HTMLElement;
  host: HTMLElement;
  term: Terminal;
  fit: FitAddon;
  conn: TerminalConnection | null;
  closed: boolean;
  ro?: ResizeObserver;
}

const THEME = {
  background: '#1e1e1e',
  foreground: '#cccccc',
  cursor: '#aeafad',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

const DEBOUNCE_MS = 100;

/**
 * Bottom-panel terminal for Evo. Supports multiple sessions as tabs, each one
 * a real PTY shell hosted by the backend bridge (`/evo/terminal` WebSocket)
 * and rendered with xterm.js.
 */
export class TerminalPanel {
  el: HTMLElement;
  private root: HTMLElement;
  private tabsEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private tabs: TermTab[] = [];
  private active: TermTab | null = null;
  private nextId = 1;
  private visible = false;
  private creatingTab = false;
  private resizeTimers = new Map<number, number>();

  constructor(root: HTMLElement) {
    this.root = root;
    this.el = document.createElement('div');
    this.el.className = 'evo-terminal-panel';
    this.render();
    root.appendChild(this.el);

    window.addEventListener('resize', () => {
      if (this.active) this.fitAndSync(this.active);
    });

    this.installResizeHandle();
  }

  private installResizeHandle(): void {
    const handle = this.el.querySelector<HTMLElement>('.terminal-resize');
    if (!handle) return;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = this.el.offsetHeight;
      handle.classList.add('dragging');
      const onMove = (ev: MouseEvent) => {
        const h = Math.min(500, Math.max(100, startH + (startY - ev.clientY)));
        this.el.style.height = `${h}px`;
      };
      const onUp = () => {
        handle.classList.remove('dragging');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (this.active) this.fitAndSync(this.active);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  private render(): void {
    this.el.innerHTML = `
      <div class="terminal-resize" title="Drag to resize"></div>
      <div class="terminal-header">
        <div class="terminal-tabs"></div>
        <div class="terminal-actions">
          <span class="terminal-status"></span>
          <button class="terminal-action" data-act="new" title="New terminal (Ctrl+Shift+\`)">${icons.newfile}</button>
          <button class="terminal-action" data-act="clear" title="Clear">${icons.clear}</button>
          <button class="terminal-action" data-act="kill" title="Kill active shell">${icons.trash}</button>
          <button class="terminal-action" data-act="close" title="Close panel (Ctrl+\`)">${icons.chevronDown}</button>
        </div>
      </div>
      <div class="terminal-body"></div>
    `;

    this.tabsEl = this.el.querySelector('.terminal-tabs')!;
    this.bodyEl = this.el.querySelector('.terminal-body')!;
    this.statusEl = this.el.querySelector('.terminal-status')!;
    this.statusEl.textContent = 'Terminal';

    this.el.querySelector('[data-act="new"]')!.addEventListener('click', () => {
      this.newTerminal();
    });
    this.el.querySelector('[data-act="clear"]')!.addEventListener('click', () => {
      this.active?.term.clear();
    });
    this.el.querySelector('[data-act="kill"]')!.addEventListener('click', () => {
      this.active?.conn?.kill();
    });
    this.el.querySelector('[data-act="close"]')!.addEventListener('click', () => {
      this.toggle(false);
    });
  }

  private setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  private setActive(tab: TermTab | null): void {
    this.active = tab;
    for (const t of this.tabs) {
      t.tabEl.classList.toggle('active', t === tab);
      t.host.classList.toggle('active', t === tab);
    }
    if (tab) {
      this.fitAndSync(tab);
      tab.term.focus();
    }
  }

  private fitAndSync(tab: TermTab): void {
    if (!this.visible) return;
    try {
      tab.fit.fit();
    } catch {
      /* terminal may not be rendered yet */
    }
    tab.conn?.resize(tab.term.cols, tab.term.rows);
  }

  /** Create a new terminal tab and focus it. */
  newTerminal(): void {
    if (this.creatingTab) return;
    this.creatingTab = true;
    try {
      this.show();
      const tab = this.createTab();
      this.tabs.push(tab);
      this.tabsEl.appendChild(tab.tabEl);
      this.bodyEl.appendChild(tab.host);
      this.setActive(tab);
      this.setStatus('Connecting…');
    } finally {
      this.creatingTab = false;
    }
  }

  private createTab(): TermTab {
    const id = this.nextId++;
    const tabEl = document.createElement('div');
    tabEl.className = 'terminal-tab';
    tabEl.title = 'Terminal';
    const labelEl = document.createElement('span');
    labelEl.className = 'terminal-tab-label';
    labelEl.textContent = 'terminal';
    const close = document.createElement('button');
    close.className = 'terminal-tab-close';
    close.innerHTML = icons.close;
    close.title = 'Kill terminal';
    tabEl.appendChild(labelEl);
    tabEl.appendChild(close);

    const host = document.createElement('div');
    host.className = 'terminal-host';

    const term = new Terminal({
      fontFamily: `var(--font-mono), monospace`,
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      allowProposedApi: true,
      theme: THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);

    const tab: TermTab = { id, tabEl, labelEl, host, term, fit, conn: null, closed: false };

    tabEl.addEventListener('click', (e) => {
      if (e.target !== close) this.setActive(tab);
    });
    close.addEventListener('click', () => this.closeTab(tab));

    const conn = new TerminalConnection({
      cols: term.cols,
      rows: term.rows,
      onData: (d) => {
        if (!tab.closed) term.write(d);
      },
      onInit: (info: TerminalInitInfo) => {
        tab.labelEl.textContent = `${info.shell} ${info.pid ?? ''}`.trim();
        tab.tabEl.title = `Shell: ${info.shell} · cwd: ${info.cwd}`;
        this.setStatus(info.cwd || 'Terminal');
        this.fitAndSync(tab);
      },
      onExit: (code) => {
        if (tab.closed) return;
        term.write(
          `\r\n\x1b[90m[process exited with code ${code ?? 'unknown'} — close or create a new terminal]\x1b[0m\r\n`,
        );
      },
      onStatus: () => {
        /* keep the cwd in the status area */
      },
    });
    tab.conn = conn;
    conn.open();

    term.onData((d) => conn.send(d));
    term.onResize(({ cols, rows }) => conn.resize(cols, rows));

    // Refit + resync on container size changes.
    const ro = new ResizeObserver(() => {
      const timer = this.resizeTimers.get(id);
      if (timer) window.clearTimeout(timer);
      this.resizeTimers.set(
        id,
        window.setTimeout(() => {
          this.resizeTimers.delete(id);
          this.fitAndSync(tab);
        }, DEBOUNCE_MS),
      );
    });
    ro.observe(host);
    tab.ro = ro;

    // Clicking the terminal focuses xterm.
    host.addEventListener('mousedown', () => term.focus());

    return tab;
  }

  private closeTab(tab: TermTab): void {
    if (tab.closed) return;
    tab.closed = true;
    try {
      tab.ro?.disconnect();
    } catch {
      /* ignore */
    }
    tab.conn?.kill();
    tab.conn?.dispose();
    tabElRemove(tab);
    const idx = this.tabs.indexOf(tab);
    if (idx >= 0) this.tabs.splice(idx, 1);
    if (this.active === tab) {
      this.active = null;
      this.setActive(this.tabs[Math.min(idx, this.tabs.length - 1)] ?? null);
    }
    if (!this.tabs.length) {
      this.setStatus('No terminals — create one with +');
    }

    function tabElRemove(t: TermTab): void {
      t.tabEl.remove();
      t.host.remove();
      t.term.dispose();
    }
  }

  private closeAll(): void {
    for (const tab of [...this.tabs]) this.closeTab(tab);
  }

  /** Show/hide the whole panel. */
  toggle(force?: boolean): boolean {
    const next = force ?? !this.visible;
    this.visible = next;
    this.root.classList.toggle('hidden', !next);
    this.el.classList.toggle('hidden', !next);
    if (next) {
      if (!this.tabs.length && !this.creatingTab) {
        // First open: create a terminal. Guarded so `newTerminal()` (which
        // calls `show()`) can't re-enter this branch recursively.
        this.newTerminal();
      } else if (this.active) {
        window.requestAnimationFrame(() => this.fitAndSync(this.active!));
        this.active.term.focus();
      }
    }
    return next;
  }

  show(): void {
    this.toggle(true);
  }

  isVisible(): boolean {
    return this.visible;
  }

  clearActive(): void {
    this.active?.term.clear();
  }

  /** Make sure the panel reflects the current screen (call on workspace open). */
  refresh(): void {
    if (this.visible && this.active) {
      window.requestAnimationFrame(() => this.fitAndSync(this.active!));
    }
  }

  dispose(): void {
    this.closeAll();
    this.el.remove();
  }
}
