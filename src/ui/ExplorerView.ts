import { icons } from '../core/icons';
import { bus, EV } from '../core/EventEmitter';
import { commands } from '../core/commands';
import { showContextMenu } from './ContextMenu';
import { showModal } from './Modal';
import { toast } from './Toast';
import { fileIconForName } from '../core/fileIcons';
import type { FileSystem } from '../fs/FileSystem';
import type { FSNode } from '../core/types';

export class ExplorerView {
  el: HTMLElement;
  private treeEl: HTMLElement;
  private expanded = new Set<string>(['root']);
  private selectedId: string | null = null;
  private editingId: string | null = null;

  constructor(
    private root: HTMLElement,
    private fs: FileSystem,
    private onOpenFile: (nodeId: string) => void,
    private onMove: (id: string, parentId: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'evo-view evo-explorer';

    const header = document.createElement('div');
    header.className = 'evo-view-header';
    header.innerHTML = `
      <span class="view-title">EXPLORER</span>
      <div class="view-actions">
        <button class="view-action" data-act="new-file" title="New File"></button>
        <button class="view-action" data-act="new-folder" title="New Folder"></button>
        <button class="view-action" data-act="refresh" title="Refresh"></button>
        <button class="view-action" data-act="collapse" title="Collapse All"></button>
      </div>
    `;
    header
      .querySelector('[data-act="new-file"]')!
      .innerHTML = icons.newfile;
    header
      .querySelector('[data-act="new-folder"]')!
      .innerHTML = icons.newfolder;
    header.querySelector('[data-act="refresh"]')!.innerHTML = icons.refresh;
    header.querySelector('[data-act="collapse"]')!.innerHTML = icons.collapse;

    header.querySelector('[data-act="new-file"]')!.addEventListener('click', () => void commands.execute('explorer.newFile'));
    header.querySelector('[data-act="new-folder"]')!.addEventListener('click', () => void commands.execute('explorer.newFolder'));
    header.querySelector('[data-act="refresh"]')!.addEventListener('click', () => void commands.execute('explorer.refresh'));
    header.querySelector('[data-act="collapse"]')!.addEventListener('click', () => {
      this.expanded.clear();
      this.expanded.add('root');
      this.render();
    });

    this.treeEl = document.createElement('div');
    this.treeEl.className = 'evo-tree';

    this.el.appendChild(header);
    this.el.appendChild(this.treeEl);
    this.root.appendChild(this.el);

    this.fs.changed.on(() => this.render());
    bus.on(EV.EXPLORER_REVEAL, (id: string) => this.reveal(id));
    bus.on(EV.TAB_ACTIVATED, (id: string) => this.setSelected(id, false));
    this.render();
  }

  render(): void {
    this.treeEl.innerHTML = '';
    const rootNode = this.fs.root;
    const container = document.createElement('div');
    container.className = 'tree-root';
    this.renderNode(rootNode, container, 0);
    this.treeEl.appendChild(container);
  }

  private renderNode(node: FSNode, parent: HTMLElement, depth: number): void {
    if (node.type === 'folder') {
      // The workspace root (whatever its id) is always shown expanded, so
      // files are visible right after opening a project/folder/repo.
      const isOpen = node.id === this.fs.root.id || this.expanded.has(node.id);
      const row = document.createElement('div');
      row.className = 'tree-row folder-row';
      row.dataset.id = node.id;
      row.style.paddingLeft = `${depth * 14}px`;
      if (this.selectedId === node.id) row.classList.add('selected');
      if (this.editingId === node.id) row.classList.add('editing');

      const chevron = document.createElement('span');
      chevron.className = 'tree-chevron';
      chevron.innerHTML = isOpen ? icons.chevronDown : icons.chevronRight;
      row.appendChild(chevron);

      const icon = document.createElement('span');
      icon.className = `tree-icon ${isOpen ? 'folder-open' : 'folder-closed'}`;
      icon.innerHTML = isOpen ? icons['folder-open'] : icons.folder;
      row.appendChild(icon);

      const name = document.createElement('span');
      name.className = 'tree-label';
      name.textContent = node.name;
      name.title = this.fs.getPath(node.id);
      row.appendChild(name);

      this.bindRow(row, node);
      parent.appendChild(row);

      if (isOpen) {
        const children = this.fs.childrenOf(node.id);
        const group = document.createElement('div');
        group.className = 'tree-children';
        for (const child of children) this.renderNode(child, group, depth + 1);
        parent.appendChild(group);
      }
    } else {
      const row = document.createElement('div');
      row.className = 'tree-row file-row';
      row.dataset.id = node.id;
      row.style.paddingLeft = `${depth * 14}px`;
      if (this.selectedId === node.id) row.classList.add('selected');
      if (this.editingId === node.id) row.classList.add('editing');

      const spacer = document.createElement('span');
      spacer.className = 'tree-chevron empty';
      row.appendChild(spacer);

      const icon = document.createElement('span');
      icon.className = 'tree-icon file-icon';
      icon.innerHTML = fileIconForName(node.name).svg;
      row.appendChild(icon);

      const name = document.createElement('span');
      name.className = 'tree-label';
      name.textContent = node.name;
      name.title = this.fs.getPath(node.id);
      row.appendChild(name);

      this.bindRow(row, node);
      parent.appendChild(row);
    }
  }

  private bindRow(row: HTMLElement, node: FSNode): void {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setSelected(node.id);
      if (node.type === 'folder') {
        this.toggleFolder(node.id);
      } else {
        this.onOpenFile(node.id);
      }
    });

    row.addEventListener('dblclick', (e) => {
      if (row.contains(e.target as Node)) this.startRename(node.id);
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setSelected(node.id);
      this.openContextMenu(node, e.clientX, e.clientY);
    });

    // drag & drop move
    row.draggable = node.id !== 'root';
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/evo-node', node.id);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (node.type === 'folder') row.classList.add('drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drop-target');
      const id = e.dataTransfer?.getData('text/evo-node');
      if (id && id !== node.id) {
        if (node.type === 'folder') this.onMove(id, node.id);
        else {
          const parentId = this.fs.getNode(node.id)?.parentId;
          if (parentId) this.onMove(id, parentId);
        }
      }
    });
  }

  private openContextMenu(node: FSNode, x: number, y: number): void {
    const items = [
      {
        label: 'New File...', icon: icons.newfile,
        action: () => void this.createChild(node.id, 'file'),
      },
      {
        label: 'New Folder...', icon: icons.newfolder,
        action: () => void this.createChild(node.id, 'folder'),
      },
      { separator: true },
      { label: 'Open', icon: icons.open, action: () => this.onOpenFile(node.id) },
      { separator: true },
      {
        label: 'Rename...', icon: icons.rename,
        action: () => this.startRename(node.id),
      },
      {
        label: 'Duplicate', icon: icons.copy,
        action: () => this.duplicate(node),
      },
      {
        label: 'Delete', icon: icons.trash, danger: true,
        action: () => void this.deleteNode(node),
      },
    ];
    showContextMenu(items, x, y);
  }

  private toggleFolder(id: string): void {
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    this.render();
  }

  private setSelected(id: string, focus = true): void {
    this.selectedId = id;
    if (focus) this.render();
  }

  reveal(id: string): void {
    let node = this.fs.getNode(id);
    if (!node) return;
    const open: string[] = [];
    while (node && node.id !== 'root') {
      if (node.parentId) open.push(node.parentId);
      node = this.fs.getNode(node.parentId ?? '');
    }
    open.forEach((p) => this.expanded.add(p));
    this.setSelected(id);
  }

  async createChild(parentId: string, type: 'file' | 'folder'): Promise<void> {    const res = await showModal({
      title: type === 'file' ? 'New File' : 'New Folder',
      placeholder: type === 'file' ? 'name.ext' : 'folder name',
      confirmText: 'Create',
    });
    if (!res.ok || !res.value.trim()) return;
    const name = res.value.trim();
    const node =
      type === 'file'
        ? this.fs.createFile(parentId, name, '')
        : this.fs.createFolder(parentId, name);
    if (!node) {
      toast(`"${name}" already exists`, 'warning');
      return;
    }
    this.expanded.add(parentId);
    if (type === 'file') this.onOpenFile(node.id);
    else this.reveal(node.id);
    this.render();
  }

  startRename(id: string): void {
    const node = this.fs.getNode(id);
    if (!node || node.id === 'root') return;
    this.editingId = id;
    this.render();
    const row = this.treeEl.querySelector(`[data-id="${CSS.escape(id)}"] .tree-label`);
    if (!row) return;
    const input = document.createElement('input');
    input.className = 'tree-rename';
    input.value = node.name;
    input.spellcheck = false;
    row.replaceWith(input);
    input.focus();
    const dot = node.name.lastIndexOf('.');
    if (node.type === 'file' && dot > 0) input.setSelectionRange(0, dot);

    let done = false;
    const commit = (save: boolean) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      if (save && value && value !== node.name) {
        if (!this.fs.rename(id, value)) toast('Name already in use', 'warning');
      }
      this.editingId = null;
      this.render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit(true);
      if (e.key === 'Escape') commit(false);
    });
    input.addEventListener('blur', () => commit(true));
  }

  private duplicate(node: FSNode): void {
    if (node.type === 'folder') {
      toast('Duplicating folders is not supported yet', 'info');
      return;
    }
    const parentId = node.parentId ?? 'root';
    const base = node.name.replace(/\.[^.]+$/, '');
    const ext = node.name.includes('.') ? node.name.slice(node.name.lastIndexOf('.')) : '';
    let name = `${base}-copy${ext}`;
    let n = 2;
    while (this.fs.getNodeByPath(this.fs.getPath(parentId) + '/' + name)) {
      name = `${base}-copy${n}${ext}`;
      n++;
    }
    const copy = this.fs.createFile(parentId, name, node.content);
    if (copy) toast(`Created ${name}`, 'success');
  }

  private async deleteNode(node: FSNode): Promise<void> {
    const res = await showModal({
      title: 'Confirm Delete',
      message: `Are you sure you want to delete "${node.name}"? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (!res.ok) return;
    this.fs.delete(node.id);
    bus.emit(EV.FS_CHANGED, this.fs.root);
    toast(`Deleted ${node.name}`, 'info');
  }
}
