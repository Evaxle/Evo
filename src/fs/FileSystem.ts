import { EventEmitter } from '../core/EventEmitter';
import { storage } from '../core/storage';
import { languageFromPath } from '../core/language';
import type { FSNode } from '../core/types';

let idCounter = 0;
export function genId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

const sortNodes = (a: FSNode, b: FSNode): number => {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
};

export function emptyRoot(): FSNode {
  return {
    id: 'root',
    name: 'evo-workspace',
    type: 'folder',
    children: [],
    content: '',
    language: 'plaintext',
    external: false,
  };
}

export class FileSystem {
  root: FSNode = emptyRoot();
  changed = new EventEmitter<FSNode>();
  private persistTimer: number | null = null;
  private byId = new Map<string, FSNode>();

  constructor() {
    this.reindex();
  }

  reindex(): void {
    this.byId.clear();
    const walk = (node: FSNode) => {
      this.byId.set(node.id, node);
      node.children?.forEach(walk);
    };
    walk(this.root);
  }

  getNode(id: string): FSNode | undefined {
    return this.byId.get(id);
  }

  getNodeByPath(path: string): FSNode | undefined {
    if (path === '/' || path === '') return this.root;
    const parts = path.split('/').filter(Boolean);
    let node: FSNode = this.root;
    for (const part of parts) {
      const next = node.children?.find((c) => c.name === part);
      if (!next) return undefined;
      node = next;
    }
    return node;
  }

  getPath(id: string): string {
    const parts: string[] = [];
    let node = this.byId.get(id);
    if (!node) return '';
    while (node && node.id !== 'root') {
      parts.unshift(node.name);
      node = this.byId.get(node.parentId ?? '');
    }
    return '/' + parts.join('/');
  }

  /** Immediate children of a folder, sorted folders-first then alphabetically. */
  childrenOf(id: string): FSNode[] {
    const node = this.byId.get(id);
    if (!node || node.type !== 'folder') return [];
    return [...(node.children ?? [])].sort(sortNodes);
  }

  isDescendant(candidateId: string, ancestorId: string): boolean {
    let node = this.byId.get(candidateId);
    while (node && node.id !== 'root') {
      if (node.parentId === ancestorId) return true;
      node = this.byId.get(node.parentId ?? '');
    }
    return false;
  }

  private emit(): void {
    this.reindex();
    this.changed.emit(this.root);
    this.schedulePersist();
  }

  createFile(parentId: string, name: string, content = ''): FSNode | null {
    const parent = this.byId.get(parentId);
    if (!parent || parent.type !== 'folder') return null;
    if (parent.children?.some((c) => c.name === name)) return null;

    const node: FSNode = {
      id: genId(),
      name,
      type: 'file',
      children: [],
      content,
      language: languageFromPath(name),
      external: parent.external,
    };
    parent.children ??= [];
    parent.children.push(node);
    node.parentId = parent.id;
    this.emit();
    return node;
  }

  createFolder(parentId: string, name: string): FSNode | null {
    const parent = this.byId.get(parentId);
    if (!parent || parent.type !== 'folder') return null;
    if (parent.children?.some((c) => c.name === name)) return null;

    const node: FSNode = {
      id: genId(),
      name,
      type: 'folder',
      children: [],
      content: '',
      language: 'plaintext',
      external: parent.external,
    };
    parent.children ??= [];
    parent.children.push(node);
    node.parentId = parent.id;
    this.emit();
    return node;
  }

  rename(id: string, newName: string): boolean {
    const node = this.byId.get(id);
    if (!node || node.id === 'root') return false;
    const parent = this.byId.get(node.parentId ?? '');
    if (parent?.children?.some((c) => c.id !== id && c.name === newName)) return false;

    node.name = newName;
    if (node.type === 'file') {
      node.language = languageFromPath(newName);
    }
    node.parentId = parent?.id;
    this.emit();
    return true;
  }

  /** Recursively remove a node. Returns the removed node. */
  delete(id: string): FSNode | null {
    const node = this.byId.get(id);
    if (!node || node.id === 'root') return null;
    const parent = this.byId.get(node.parentId ?? '');
    if (!parent) return null;
    parent.children = (parent.children ?? []).filter((c) => c.id !== id);
    this.emit();
    return node;
  }

  move(id: string, newParentId: string): boolean {
    const node = this.byId.get(id);
    const parent = this.byId.get(newParentId);
    if (!node || !parent || parent.type !== 'folder' || node.id === 'root') return false;
    if (parent.id === node.parentId) return true;
    if (this.isDescendant(parent.id, node.id)) return false;

    const oldParent = this.byId.get(node.parentId ?? '');
    if (parent.children?.some((c) => c.name === node.name)) return false;

    oldParent!.children = (oldParent!.children ?? []).filter((c) => c.id !== id);
    parent.children ??= [];
    parent.children.push(node);
    this.emit();
    return true;
  }

  updateContent(id: string, content: string): void {
    const node = this.byId.get(id);
    if (!node || node.type !== 'file') return;
    node.content = content;
    this.reindex();
  }

  persist(): void {
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.persistTimer !== null) return;
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null;
      storage.saveFs(this.root);
    }, 400);
  }

  async loadFromStorage(): Promise<void> {
    const saved = await storage.loadFs();
    if (saved) {
      this.root = saved;
      this.reindex();
      this.changed.emit(this.root);
    }
  }
}
