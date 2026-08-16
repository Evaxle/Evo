import { storage } from '../core/storage';
import { emptyRoot, type FileSystem } from './FileSystem';
import type { FSNode, WorkspaceMeta } from '../core/types';

const KEY_ACTIVE = 'active-workspace';

export interface WorkspaceSnapshot extends WorkspaceMeta {
  root: FSNode;
}

export class WorkspaceStore {
  private currentId: string | null = null;

  constructor(private fs: FileSystem) {}

  /** Restore the last active workspace if one exists. */
  async init(): Promise<void> {
    await this.fs.loadFromStorage();
    try {
      const id = localStorage.getItem(KEY_ACTIVE);
      if (id) {
        const snap = await this.loadSnapshot(id);
        if (snap) {
          this.fs.root = snap.root;
          this.fs.reindex();
          this.fs.changed.emit(this.fs.root);
          this.currentId = id;
        }
      }
    } catch {
      /* ignore */
    }
    if (!this.currentId) {
      this.currentId = this.fs.root.id;
    }
  }

  async list(): Promise<WorkspaceMeta[]> {
    return storage.listWorkspaces();
  }

  async loadSnapshot(id: string): Promise<WorkspaceSnapshot | null> {
    const all = await storage.listWorkspaces();
    const item = all.find((w) => w.id === id) as WorkspaceSnapshot | undefined;
    return item ?? null;
  }

  async open(id: string): Promise<void> {
    const snap = await this.loadSnapshot(id);
    if (!snap) return;
    this.fs.root = snap.root;
    this.fs.reindex();
    this.fs.changed.emit(this.fs.root);
    this.currentId = id;
    localStorage.setItem(KEY_ACTIVE, id);
    await this.touch(id);
  }

  /** Create a brand-new empty workspace. */
  async createNew(name: string): Promise<void> {
    this.fs.root = emptyRoot();
    this.fs.root.name = name || 'evo-workspace';
    this.fs.reindex();
    this.fs.changed.emit(this.fs.root);
    this.currentId = null;
    localStorage.removeItem(KEY_ACTIVE);
  }

  /** Persist the current FS as a named workspace snapshot. */
  async save(name: string, makeActive = true): Promise<string> {
    const id = this.currentId ?? genWsId();
    const meta: WorkspaceSnapshot = {
      id,
      name,
      folderName: this.fs.root.name,
      lastOpened: Date.now(),
      root: this.fs.root,
    };
    await storage.saveWorkspace(meta);
    if (makeActive) {
      this.currentId = id;
      localStorage.setItem(KEY_ACTIVE, id);
    }
    return id;
  }

  async remove(id: string): Promise<void> {
    await storage.removeWorkspace(id);
    if (this.currentId === id) {
      this.currentId = null;
      localStorage.removeItem(KEY_ACTIVE);
    }
  }

  /** Save current FS state into the active workspace snapshot (autosave). */
  async autosave(): Promise<void> {
    if (!this.currentId) return;
    const meta: WorkspaceSnapshot = {
      id: this.currentId,
      name: this.fs.root.name,
      folderName: this.fs.root.name,
      lastOpened: Date.now(),
      root: this.fs.root,
    };
    await storage.saveWorkspace(meta);
  }

  private async touch(id: string): Promise<void> {
    const snap = await this.loadSnapshot(id);
    if (!snap) return;
    snap.lastOpened = Date.now();
    await storage.saveWorkspace(snap);
  }
}

let wsCounter = 0;
function genWsId(): string {
  wsCounter += 1;
  return `ws-${Date.now().toString(36)}-${wsCounter}`;
}
