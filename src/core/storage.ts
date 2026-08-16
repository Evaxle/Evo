import type { AppSettings, FSNode, OpenEditorsState, WorkspaceMeta } from './types';

const DB_NAME = 'evo-db';
const DB_VERSION = 1;

const STORE_FS = 'fs';
const STORE_WORKSPACES = 'workspaces';
const STORE_SETTINGS = 'settings';
const STORE_EDITOR = 'editor';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FS)) db.createObjectStore(STORE_FS);
      if (!db.objectStoreNames.contains(STORE_WORKSPACES)) {
        db.createObjectStore(STORE_WORKSPACES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS);
      if (!db.objectStoreNames.contains(STORE_EDITOR)) db.createObjectStore(STORE_EDITOR);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const req = op(t.objectStore(storeName));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const storage = {
  async saveFs(root: FSNode): Promise<void> {
    try {
      await tx(STORE_FS, 'readwrite', (s) => s.put(root, 'root'));
    } catch (err) {
      console.warn('Failed to persist file system:', err);
    }
  },

  async loadFs(): Promise<FSNode | null> {
    try {
      const root = await tx<FSNode | undefined>(STORE_FS, 'readonly', (s) =>
        s.get('root'),
      );
      return root ?? null;
    } catch {
      return null;
    }
  },

  async listWorkspaces(): Promise<WorkspaceMeta[]> {
    try {
      const all = await tx<WorkspaceMeta[]>(STORE_WORKSPACES, 'readonly', (s) =>
        s.getAll(),
      );
      return (all ?? []).sort((a, b) => b.lastOpened - a.lastOpened);
    } catch {
      return [];
    }
  },

  async saveWorkspace(meta: WorkspaceMeta): Promise<void> {
    try {
      await tx(STORE_WORKSPACES, 'readwrite', (s) => s.put(meta));
    } catch {
      /* ignore */
    }
  },

  async removeWorkspace(id: string): Promise<void> {
    try {
      await tx(STORE_WORKSPACES, 'readwrite', (s) => s.delete(id));
    } catch {
      /* ignore */
    }
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await tx(STORE_SETTINGS, 'readwrite', (s) => s.put(settings, 'settings'));
    } catch {
      /* ignore */
    }
  },

  async loadSettings(): Promise<AppSettings | null> {
    try {
      const s = await tx<AppSettings | undefined>(STORE_SETTINGS, 'readonly', (s) =>
        s.get('settings'),
      );
      return s ?? null;
    } catch {
      return null;
    }
  },

  async saveEditorState(state: OpenEditorsState): Promise<void> {
    try {
      await tx(STORE_EDITOR, 'readwrite', (s) => s.put(state, 'editors'));
    } catch {
      /* ignore */
    }
  },

  async loadEditorState(): Promise<OpenEditorsState | null> {
    try {
      const s = await tx<OpenEditorsState | undefined>(STORE_EDITOR, 'readonly', (s) =>
        s.get('editors'),
      );
      return s ?? null;
    } catch {
      return null;
    }
  },
};
