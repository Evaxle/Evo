import { icons } from '../core/icons';
import { bus, EV } from '../core/EventEmitter';
import { commands } from '../core/commands';
import { showContextMenu } from './ContextMenu';
import { fileIconForName } from '../core/fileIcons';
import type { EditorManager } from '../editor/EditorManager';

export class EditorTabs {
  private el: HTMLElement;
  private contentEl: HTMLElement;

  constructor(
    private root: HTMLElement,
    private editor: EditorManager,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'evo-tabs';
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'evo-tabs-content';
    this.el.appendChild(this.contentEl);
    this.root.appendChild(this.el);

    bus.on(EV.TABS_CHANGED, () => this.render());
    bus.on(EV.TAB_CLOSED, () => this.render());
    bus.on(EV.TAB_ACTIVATED, () => this.render());
    this.render();
  }

  render(): void {
    this.contentEl.innerHTML = '';
    const tabs = this.editor.tabInfos();
    const active = this.editor.activeNodeId;

    for (const tab of tabs) {
      const el = document.createElement('div');
      el.className = `evo-tab${tab.nodeId === active ? ' active' : ''}`;
      el.title = tab.path;

      const icon = document.createElement('span');
      icon.className = 'tab-icon';
      icon.innerHTML = fileIconForName(tab.name).svg;
      el.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'tab-label';
      label.textContent = tab.name;
      el.appendChild(label);

      const dirty = document.createElement('span');
      dirty.className = `tab-dirty${tab.dirty ? ' show' : ''}`;
      dirty.textContent = '●';
      el.appendChild(dirty);

      const close = document.createElement('button');
      close.className = 'tab-close';
      close.title = 'Close (Ctrl+W)';
      close.innerHTML = icons.close;
      el.appendChild(close);

      el.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          this.editor.close(tab.nodeId);
        }
      });
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('tab-close')) return;
        void this.editor.activate(tab.nodeId);
      });
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editor.close(tab.nodeId);
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        showContextMenu(
          [
            { label: 'Close', icon: icons.close, action: () => this.editor.close(tab.nodeId) },
            { label: 'Close Others', icon: icons.close, action: () => void this.editor.closeOthers(tab.nodeId) },
            { label: 'Close All', icon: icons.trash, action: () => this.editor.closeAll() },
            { separator: true },
            { label: 'Save', icon: icons.download, action: () => void this.editor.saveNode(tab.nodeId) },
            { separator: true },
            {
              label: 'Reveal in Explorer', icon: icons.files,
              action: () => bus.emit(EV.EXPLORER_REVEAL, tab.nodeId),
            },
            {
              label: 'Open Preview', icon: icons.open,
              action: () => void commands.execute('workbench.action.preview', tab.nodeId),
            },
          ],
          rect.left,
          rect.bottom + 2,
        );
      });

      this.contentEl.appendChild(el);
    }
  }
}
