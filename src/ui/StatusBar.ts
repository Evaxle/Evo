import { icons } from '../core/icons';
import { bus, EV } from '../core/EventEmitter';
import { languageLabel } from '../core/language';
import type { EditorManager } from '../editor/EditorManager';
import type { SettingsStore } from '../core/SettingsStore';
import type { FileSystem } from '../fs/FileSystem';

export class StatusBar {
  private el: HTMLElement;
  private leftEl: HTMLElement;
  private rightEl: HTMLElement;

  constructor(
    private root: HTMLElement,
    private editor: EditorManager,
    private settings: SettingsStore,
    private fs: FileSystem,
  ) {
    this.el = document.createElement('footer');
    this.el.className = 'evo-statusbar';
    this.leftEl = document.createElement('div');
    this.leftEl.className = 'sb-left';
    this.rightEl = document.createElement('div');
    this.rightEl.className = 'sb-right';
    this.el.appendChild(this.leftEl);
    this.el.appendChild(this.rightEl);
    this.root.appendChild(this.el);

    this.renderLeft();
    this.renderRight();

    bus.on(EV.STATUS_UPDATED, () => {
      this.updatePosition();
    });
    bus.on(EV.ACTIVE_FILE_CHANGED, () => {
      this.updateLanguage();
    });
    bus.on(EV.SETTINGS_CHANGED, () => {
      this.updateIndent();
    });
  }

  private item(label: string, title: string, onClick?: () => void): HTMLElement {
    const el = document.createElement('span');
    el.className = 'sb-item';
    el.textContent = label;
    el.title = title;
    if (onClick) {
      el.classList.add('clickable');
      el.addEventListener('click', onClick);
    }
    return el;
  }

  private renderLeft(): void {
    this.leftEl.innerHTML = '';

    const branch = document.createElement('span');
    branch.className = 'sb-item';
    branch.title = 'Branch (coming soon)';
    branch.innerHTML = `${icons.branch} <span>main</span>`;
    this.leftEl.appendChild(branch);

    const sync = document.createElement('span');
    sync.className = 'sb-item';
    sync.title = 'Sync changes (coming soon)';
    sync.innerHTML = icons.sync;
    this.leftEl.appendChild(sync);

    const problems = this.item('⚠ 0', '0 problems');
    problems.classList.add('sb-problems');
    this.leftEl.appendChild(problems);

    const autosave = this.settings.settings.autosave
      ? this.item('Autosave', 'Autosave enabled (Ctrl+, to change)')
      : this.item('Manual Save', 'Autosave disabled (Ctrl+S to save)');
    this.leftEl.appendChild(autosave);
  }

  private renderRight(): void {
    this.rightEl.innerHTML = '';

    const lang = this.item('Plain Text', 'Change Language Mode');
    lang.id = 'sb-lang';
    lang.classList.add('clickable');
    lang.addEventListener('click', () => {
      const node = this.fs.getNode(this.editor.activeNodeId ?? '');
      if (node?.language === 'plaintext') {
        const text = this.rightEl.querySelector('#sb-lang')?.textContent ?? '';
        void text;
      }
    });
    this.rightEl.appendChild(lang);

    const position = this.item('Ln 1, Col 1', 'Go to Line');
    position.id = 'sb-position';
    this.rightEl.appendChild(position);

    const indent = this.item(`Spaces: ${this.settings.settings.tabSize}`, 'Indentation');
    indent.id = 'sb-indent';
    this.rightEl.appendChild(indent);

    const eol = this.item('LF', 'Line Endings');
    this.rightEl.appendChild(eol);

    const encoding = this.item('UTF-8', 'Encoding');
    this.rightEl.appendChild(encoding);

    const notify = document.createElement('span');
    notify.className = 'sb-item';
    notify.title = 'Notifications';
    notify.innerHTML = icons.bell;
    this.rightEl.appendChild(notify);

    this.updateLanguage();
    this.updatePosition();
  }

  private updateLanguage(): void {
    const el = this.rightEl.querySelector('#sb-lang');
    const node = this.fs.getNode(this.editor.activeNodeId ?? '');
    if (el) el.textContent = node ? languageLabel(node.language) : 'Plain Text';
  }

  private updatePosition(): void {
    const el = this.rightEl.querySelector('#sb-position');
    if (el) {
      const { line, col } = this.editor.cursorPosition();
      el.textContent = `Ln ${line}, Col ${col}`;
    }
  }

  private updateIndent(): void {
    const el = this.rightEl.querySelector('#sb-indent');
    if (el) el.textContent = `Spaces: ${this.settings.settings.tabSize}`;
  }
}
