import { bus, EV } from '../core/EventEmitter';
import { monaco, uriForPath } from './monaco';
import type { SettingsStore } from '../core/SettingsStore';
import type { FileSystem } from '../fs/FileSystem';
import type { FSNode } from '../core/types';
import { storage } from '../core/storage';
import { readNodeContent, writeNodeContent } from '../fs/LocalFiles';

interface OpenTab {
  nodeId: string;
  dirty: boolean;
  saveTimer: number | null;
}

export class EditorManager {
  private editor!: monaco.editor.IStandaloneCodeEditor;
  private tabs: OpenTab[] = [];
  private activeId: string | null = null;
  private saveInFlight = new Set<string>();
  private uriToNode = new Map<string, string>();
  private suppressDirty = false;
  private resizeObserver: ResizeObserver | null = null;
  private layoutFrame = 0;

  constructor(
    private fs: FileSystem,
    private settings: SettingsStore,
    private container: HTMLElement,
  ) {}

  init(): void {
    this.editor = monaco.editor.create(this.container, {
      model: null,
      theme: this.settings.settings.theme === 'dark' ? 'evo-dark' : 'evo-light',
      fontSize: this.settings.settings.fontSize,
      fontFamily: this.settings.settings.fontFamily,
      fontLigatures: this.settings.settings.fontLigatures,
      minimap: { enabled: this.settings.settings.minimap },
      wordWrap: this.settings.settings.wordWrap,
      tabSize: this.settings.settings.tabSize,
      renderWhitespace: this.settings.settings.renderWhitespace,
      lineNumbers: this.settings.settings.lineNumbers,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderLineHighlight: 'line',
      padding: { top: 14, bottom: 14 },
      bracketPairColorization: { enabled: true },
      guides: { indentation: true, bracketPairs: true },
      suggest: { preview: true },
      quickSuggestions: { other: true, comments: false, strings: false },
      parameterHints: { enabled: true },
    });

    this.editor.onDidChangeModelContent((e) => {
      if (e.isFlush || this.suppressDirty) return;
      const model = this.editor.getModel();
      if (!model) return;
      const nodeId = this.nodeIdForUri(model.uri.toString());
      if (!nodeId) return;
      this.markDirty(nodeId);
    });

    this.editor.onDidChangeCursorPosition(() => {
      bus.emit(EV.STATUS_UPDATED, this.statusInfo());
    });

    // Keep the editor sized to its container (sidebar drag, window scale,
    // panel toggles, fonts loading). automaticLayout only watches window
    // resizes, so observe the actual container instead.
    this.resizeObserver = new ResizeObserver(() => {
      if (this.layoutFrame) cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = requestAnimationFrame(() => {
        this.layoutFrame = 0;
        this.editor.layout();
      });
    });
    this.resizeObserver.observe(this.container);

    // Re-layout once web fonts finish loading (metrics change the measure).
    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => this.layout());
    }
    window.addEventListener('resize', () => this.layout());

    // React to live settings changes.
    this.settings.changed.on((s) => {
      this.editor.updateOptions({
        theme: s.theme === 'dark' ? 'evo-dark' : 'evo-light',
        fontSize: s.fontSize,
        fontFamily: s.fontFamily,
        fontLigatures: s.fontLigatures,
        minimap: { enabled: s.minimap },
        wordWrap: s.wordWrap,
        tabSize: s.tabSize,
        renderWhitespace: s.renderWhitespace,
        lineNumbers: s.lineNumbers,
      });
      bus.emit(EV.SETTINGS_CHANGED, s);
    });

    // Load persisted open tabs once files are available.
    this.restoreTabs();
  }

  private get nodeIds(): string[] {
    return this.tabs.map((t) => t.nodeId);
  }

  private nodeIdForUri(uri: string): string | null {
    return this.uriToNode.get(uri) ?? null;
  }

  private uriForNode(node: FSNode): monaco.Uri {
    const uri = uriForPath(this.fs.getPath(node.id));
    let model = monaco.editor.getModel(uri);
    if (!model) {
      model = monaco.editor.createModel(node.content, node.language, uri);
    }
    this.uriToNode.set(uri.toString(), node.id);
    return uri;
  }

  private markDirty(nodeId: string): void {
    const tab = this.tabs.find((t) => t.nodeId === nodeId);
    if (!tab) return;
    if (!tab.dirty) {
      tab.dirty = true;
      bus.emit(EV.TABS_CHANGED, this.tabInfos());
      bus.emit(EV.DIRTY_CHANGED, this.dirtyCount());
    }
    if (this.settings.settings.autosave) {
      if (tab.saveTimer) clearTimeout(tab.saveTimer);
      tab.saveTimer = window.setTimeout(
        () => void this.saveNode(nodeId),
        this.settings.settings.autosaveDelay,
      );
    }
  }

  async openNode(nodeId: string, focus = true): Promise<void> {
    const node = this.fs.getNode(nodeId);
    if (!node || node.type !== 'file') return;

    let tab = this.tabs.find((t) => t.nodeId === nodeId);
    if (!tab) {
      // Make sure content is fresh for external files.
      if (node.external) {
        try {
          node.content = await readNodeContent(node);
        } catch {
          /* file may have been deleted */
        }
      }
      this.uriForNode(node);
      tab = { nodeId, dirty: false, saveTimer: null };
      this.tabs.push(tab);
      bus.emit(EV.TAB_OPENED, nodeId);
    }
    if (focus) this.activate(nodeId);
  }

  async activate(nodeId: string): Promise<void> {
    const node = this.fs.getNode(nodeId);
    if (!node || node.type !== 'file') return;
    const tab = this.tabs.find((t) => t.nodeId === nodeId);
    if (!tab) {
      await this.openNode(nodeId, false);
      this.activate(nodeId);
      return;
    }
    if (node.external) {
      try {
        const fresh = await readNodeContent(node);
        const model = monaco.editor.getModel(uriForPath(this.fs.getPath(nodeId)));
        if (model && fresh !== model.getValue()) {
          this.suppressDirty = true;
          model.pushEditOperations([], [{ range: model.getFullModelRange(), text: fresh }], () => null);
          this.suppressDirty = false;
        }
      } catch {
        /* ignore */
      }
    }
    this.activeId = nodeId;
    const uri = uriForPath(this.fs.getPath(nodeId));
    this.editor.setModel(monaco.editor.getModel(uri) ?? null);
    this.editor.focus();
    bus.emit(EV.TAB_ACTIVATED, nodeId);
    bus.emit(EV.ACTIVE_FILE_CHANGED, nodeId);
    bus.emit(EV.STATUS_UPDATED, this.statusInfo());
    this.persistTabs();
  }

  close(nodeId: string): void {
    const idx = this.tabs.findIndex((t) => t.nodeId === nodeId);
    if (idx === -1) return;
    const [tab] = this.tabs.splice(idx, 1);
    if (tab.saveTimer) clearTimeout(tab.saveTimer);
    const uri = uriForPath(this.fs.getPath(nodeId));
    const model = monaco.editor.getModel(uri);
    if (model && !model.isDisposed()) model.dispose();
    this.uriToNode.delete(uri.toString());

    if (this.activeId === nodeId) {
      this.activeId = this.tabs[idx]?.nodeId ?? this.tabs[idx - 1]?.nodeId ?? null;
      if (this.activeId) {
        const node = this.fs.getNode(this.activeId);
        const activeUri = node ? uriForPath(this.fs.getPath(this.activeId)) : null;
        this.editor.setModel(activeUri ? monaco.editor.getModel(activeUri) ?? null : null);
        this.editor.focus();
      } else {
        this.editor.setModel(null);
      }
    }
    bus.emit(EV.TAB_CLOSED, nodeId);
    bus.emit(EV.TABS_CHANGED, this.tabInfos());
    if (this.activeId) {
      bus.emit(EV.ACTIVE_FILE_CHANGED, this.activeId);
      bus.emit(EV.STATUS_UPDATED, this.statusInfo());
    }
    this.persistTabs();
  }

  async saveNode(nodeId?: string): Promise<void> {
    const targetId = nodeId ?? this.activeId;
    if (!targetId) return;
    const tab = this.tabs.find((t) => t.nodeId === targetId);
    const node = this.fs.getNode(targetId);
    if (!tab || !node || node.type !== 'file') return;

    const model = monaco.editor.getModel(uriForPath(this.fs.getPath(targetId)));
    if (!model) return;
    if (this.saveInFlight.has(targetId)) return;
    this.saveInFlight.add(targetId);

    const content = model.getValue();
    try {
      if (node.external) {
        await writeNodeContent(node, content);
      } else {
        this.fs.updateContent(targetId, content);
        this.fs.persist();
      }
      node.content = content;
      if (tab.dirty) {
        tab.dirty = false;
        bus.emit(EV.TABS_CHANGED, this.tabInfos());
        bus.emit(EV.DIRTY_CHANGED, this.dirtyCount());
      }
      if (this.activeId === targetId) {
        bus.emit(EV.STATUS_UPDATED, this.statusInfo());
      }
    } finally {
      this.saveInFlight.delete(targetId);
    }
  }

  async saveAll(): Promise<void> {
    for (const tab of [...this.tabs]) {
      if (tab.dirty) await this.saveNode(tab.nodeId);
    }
  }

  closeAll(): void {
    for (const tab of [...this.tabs]) this.close(tab.nodeId);
  }

  async closeOthers(nodeId: string): Promise<void> {
    for (const tab of [...this.tabs]) {
      if (tab.nodeId !== nodeId) await this.close(tab.nodeId);
    }
  }

  dirtyCount(): number {
    return this.tabs.filter((t) => t.dirty).length;
  }

  hasDirty(): boolean {
    return this.tabs.some((t) => t.dirty);
  }

  get activeNodeId(): string | null {
    return this.activeId;
  }

  tabInfos(): Array<{ nodeId: string; name: string; path: string; dirty: boolean; language: string }> {
    return this.tabs.map((t) => {
      const node = this.fs.getNode(t.nodeId);
      return {
        nodeId: t.nodeId,
        name: node?.name ?? '?',
        path: this.fs.getPath(t.nodeId),
        dirty: t.dirty,
        language: node?.language ?? 'plaintext',
      };
    });
  }

  private statusInfo(): { line: number; col: number; eol: string } {
    const pos = this.editor.getPosition();
    const model = this.editor.getModel();
    const eol = model?.getEOL() === '\n' ? 'LF' : 'CRLF';
    return {
      line: pos?.lineNumber ?? 1,
      col: pos?.column ?? 1,
      eol,
    };
  }

  /** Force a re-layout (used after layout-affecting UI changes). */
  layout(): void {
    this.editor.layout();
  }

  cursorPosition(): { line: number; col: number } {
    const pos = this.editor.getPosition();
    return { line: pos?.lineNumber ?? 1, col: pos?.column ?? 1 };
  }

  setPosition(line: number, col: number): void {
    this.editor.setPosition({ lineNumber: line, column: col });
    this.editor.revealLineInCenter(line);
  }

  persistTabs(): void {
    storage.saveEditorState({ tabs: this.nodeIds, activeId: this.activeId });
  }

  /** Current open-tabs state, for cloud persistence. */
  getState(): { tabs: string[]; activeId: string | null } {
    return { tabs: this.nodeIds, activeId: this.activeId };
  }

  /** Open tabs from an explicit state (cloud or local). */
  async restoreFromState(state: { tabs: string[]; activeId: string | null } | null): Promise<void> {
    this.closeAll();
    if (!state?.tabs?.length) return;
    for (const id of state.tabs) {
      if (this.fs.getNode(id)) {
        await this.openNode(id, false);
      }
    }
    if (state.activeId && this.fs.getNode(state.activeId)) {
      await this.activate(state.activeId);
    } else if (this.tabs.length) {
      await this.activate(this.tabs[0].nodeId);
    }
    bus.emit(EV.TABS_CHANGED, this.tabInfos());
  }

  private async restoreTabs(): Promise<void> {
    const state = await storage.loadEditorState();
    if (!state?.tabs?.length) return;
    for (const id of state.tabs) {
      if (this.fs.getNode(id)) {
        await this.openNode(id, false);
      }
    }
    if (state.activeId && this.fs.getNode(state.activeId)) {
      await this.activate(state.activeId);
    } else if (this.tabs.length) {
      await this.activate(this.tabs[0].nodeId);
    }
    bus.emit(EV.TABS_CHANGED, this.tabInfos());
  }

  /** Reconcile open tabs after external FS changes (deletes/renames). */
  reconcile(): void {
    const valid = this.tabs.filter((t) => this.fs.getNode(t.nodeId));
    for (const t of this.tabs) {
      if (!valid.includes(t)) this.close(t.nodeId);
    }
    bus.emit(EV.TABS_CHANGED, this.tabInfos());
  }
}
