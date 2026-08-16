export type FileType = 'file' | 'folder';

export interface FSNode {
  id: string;
  name: string;
  type: FileType;
  parentId?: string;
  children: FSNode[];
  content: string;
  /** Mime/language hint for the editor. */
  language: string;
  /** true when the node came from a live directory handle (File System Access API). */
  external: boolean;
  /** the FileSystemDirectoryHandle that owns this subtree (external only). */
  dirHandle?: FileSystemDirectoryHandle;
  /** the direct FileSystemFileHandle for an opened local file (external only). */
  fileHandle?: FileSystemFileHandle;
}

export interface TabInfo {
  id: string;
  nodeId: string;
  name: string;
  path: string;
  language: string;
  dirty: boolean;
  modelUri: string;
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  /** millis timestamp of last open */
  lastOpened: number;
  folderName: string;
}

export interface OpenEditorsState {
  tabs: string[]; // ordered nodeIds
  activeId: string | null;
}

export interface AppSettings {
  fontSize: number;
  fontFamily: string;
  wordWrap: 'off' | 'on';
  tabSize: number;
  theme: 'dark' | 'light';
  autosave: boolean;
  autosaveDelay: number;
  minimap: boolean;
  renderWhitespace: 'none' | 'boundary' | 'all';
  lineNumbers: 'on' | 'off' | 'relative';
  openAiKey: string;
  fontLigatures: boolean;
}
