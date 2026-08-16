import type { FSNode } from '../core/types';
import { languageFromPath } from '../core/language';
import { genId } from './FileSystem';

/**
 * Reads a single local File and returns its text content.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Recursively builds a virtual FSNode tree from a directory handle.
 * Every node keeps its handle so content can be read/written on demand.
 */
export async function nodeFromDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<FSNode> {
  const folder: FSNode = {
    id: genId(),
    name: handle.name,
    type: 'folder',
    children: [],
    content: '',
    language: 'plaintext',
    external: true,
    dirHandle: handle,
  };

  for await (const childHandle of (handle as any).values()) {
    if (childHandle.kind === 'directory') {
      folder.children.push(await nodeFromDirectoryHandle(childHandle));
    } else {
      folder.children.push(nodeFromFileHandle(childHandle, folder));
    }
  }
  folder.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return folder;
}

function nodeFromFileHandle(handle: FileSystemFileHandle, parent: FSNode): FSNode {
  return {
    id: genId(),
    name: handle.name,
    type: 'file',
    parentId: parent.id,
    children: [],
    content: '',
    language: languageFromPath(handle.name),
    external: true,
    fileHandle: handle,
  };
}

export async function readNodeContent(node: FSNode): Promise<string> {
  try {
    if (node.fileHandle) {
      const file = await node.fileHandle.getFile();
      return await readFileAsText(file);
    }
    if (node.dirHandle && node.dirHandle.getFileHandle) {
      const fileHandle = await node.dirHandle.getFileHandle(node.name);
      const file = await fileHandle.getFile();
      return await readFileAsText(file);
    }
  } catch {
    return node.content;
  }
  return node.content;
}

/**
 * Writes content back to an external file handle. Returns false when the
 * file no longer exists or the write fails.
 */
export async function writeNodeContent(node: FSNode, content: string): Promise<boolean> {
  try {
    if (node.fileHandle) {
      const writable = await node.fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    }
    if (node.dirHandle) {
      const fileHandle = await node.dirHandle.getFileHandle(node.name, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Open a folder using the File System Access API (Chrome/Edge). */
export async function pickFolder(): Promise<FSNode | null> {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('Folder picker is not supported in this browser.');
  }
  const handle = await (window as any).showDirectoryPicker();
  return await nodeFromDirectoryHandle(handle);
}

export async function pickFiles(): Promise<FSNode[]> {
  if (!('showOpenFilePicker' in window)) {
    throw new Error('File picker is not supported in this browser.');
  }
  const handles = await (window as any).showOpenFilePicker({ multiple: true });
  return handles.map((h: FileSystemFileHandle) =>
    nodeFromFileHandle(h, { id: '' } as FSNode),
  );
}

interface DroppedEntry {
  name: string;
  kind: 'file' | 'folder';
  file?: File;
  entries?: DroppedEntry[];
}

function entryToDropped(entry: any): Promise<DroppedEntry | null> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file: File) => {
        resolve({ name: file.name, kind: 'file', file });
      }, () => resolve(null));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all: DroppedEntry[] = [];
      const readBatch = () => {
        reader.readEntries((entries: any[]) => {
          if (!entries.length) {
            resolve({ name: entry.name, kind: 'folder', entries: all });
            return;
          }
          Promise.all(entries.map(entryToDropped)).then((results) => {
            all.push(...results.filter((r): r is DroppedEntry => r !== null));
            readBatch();
          });
        }, () => resolve(null));
      };
      readBatch();
    } else {
      resolve(null);
    }
  });
}

/** Reads files/folders dropped onto the window into a virtual tree. */
export async function readDroppedDataTransfer(
  dt: DataTransfer,
): Promise<DroppedEntry[]> {
  if (dt.items && dt.items.length && 'webkitGetAsEntry' in dt.items[0]) {
    const results: DroppedEntry[] = [];
    for (const item of Array.from(dt.items)) {
      const entry = (item as any).webkitGetAsEntry();
      if (entry) {
        const dropped = await entryToDropped(entry);
        if (dropped) results.push(dropped);
      }
    }
    return results;
  }
  // Fallback: plain files only.
  return Array.from(dt.files).map((f) => ({ name: f.name, kind: 'file' as const, file: f }));
}

/**
 * Builds a virtual FSNode tree from dropped entries and attaches it to
 * the given parent folder. External files get their content read lazily.
 */
export async function buildTreeFromDropped(
  entries: DroppedEntry[],
  makeNode: (kind: 'file' | 'folder', name: string) => FSNode,
): Promise<FSNode[]> {
  const nodes: FSNode[] = [];
  for (const entry of entries) {
    const node = makeNode(entry.kind, entry.name);
    if (entry.kind === 'file') {
      if (entry.file) {
        try {
          node.content = await readFileAsText(entry.file);
        } catch {
          node.content = '';
        }
      }
    } else if (entry.entries) {
      const subNodes = await buildTreeFromDropped(entry.entries, makeNode);
      node.children = subNodes;
    }
    nodes.push(node);
  }
  return nodes;
}
