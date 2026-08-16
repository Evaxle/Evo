import { icons } from '../core/icons';
import type { FileSystem } from '../fs/FileSystem';
import type { FSNode } from '../core/types';

export class SearchView {
  el: HTMLElement;
  private inputEl: HTMLInputElement;
  private resultsEl: HTMLElement;

  constructor(
    private root: HTMLElement,
    private fs: FileSystem,
    private onOpenFile: (nodeId: string, position?: { line: number; col: number }) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'evo-view evo-search';

    const header = document.createElement('div');
    header.className = 'evo-view-header';
    header.innerHTML = `<span class="view-title">SEARCH</span>`;
    this.el.appendChild(header);

    const inputWrap = document.createElement('div');
    inputWrap.className = 'search-input-wrap';
    const iconEl = document.createElement('span');
    iconEl.className = 'search-input-icon';
    iconEl.innerHTML = icons.search;
    this.inputEl = document.createElement('input');
    this.inputEl.className = 'search-input';
    this.inputEl.placeholder = 'Search in files';
    this.inputEl.spellcheck = false;
    inputWrap.appendChild(iconEl);
    inputWrap.appendChild(this.inputEl);
    this.el.appendChild(inputWrap);

    const matchCaseBtn = document.createElement('button');
    matchCaseBtn.className = 'search-option';
    matchCaseBtn.textContent = 'Aa';
    matchCaseBtn.title = 'Match Case';
    matchCaseBtn.classList.add('search-option');
    const optionsRow = document.createElement('div');
    optionsRow.className = 'search-options';
    optionsRow.appendChild(matchCaseBtn);
    this.el.appendChild(optionsRow);

    this.resultsEl = document.createElement('div');
    this.resultsEl.className = 'search-results';
    this.el.appendChild(this.resultsEl);

    let caseSensitive = false;
    matchCaseBtn.addEventListener('click', () => {
      caseSensitive = !caseSensitive;
      matchCaseBtn.classList.toggle('active', caseSensitive);
    });

    let timer: number | null = null;
    this.inputEl.addEventListener('input', () => {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(() => this.run(caseSensitive), 250);
    });
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.run(caseSensitive);
    });

    this.root.appendChild(this.el);
  }

  private run(caseSensitive: boolean): void {
    const query = this.inputEl.value;
    this.resultsEl.innerHTML = '';
    if (!query.trim()) {
      this.showEmpty('Type to search across files');
      return;
    }

    const results: Array<{ node: FSNode; line: number; col: number; preview: string }> = [];
    const walk = (node: FSNode) => {
      if (node.type === 'file') {
        const content = node.content;
        const needle = caseSensitive ? query : query.toLowerCase();
        const hay = caseSensitive ? content : content.toLowerCase();
        let idx = hay.indexOf(needle);
        while (idx !== -1 && results.length < 200) {
          const lineStart = content.lastIndexOf('\n', idx - 1) + 1;
          const lineNumber = content.slice(0, lineStart).split('\n').length;
          const col = idx - lineStart + 1;
          const start = Math.max(0, idx - 20);
          const preview = content.slice(start, idx + query.length + 40).replace(/\n/g, ' ');
          results.push({ node, line: lineNumber, col, preview: `${' '.repeat(lineNumber).slice(-3)}  ${preview}` });
          idx = hay.indexOf(needle, idx + 1);
        }
      }
      node.children?.forEach(walk);
    };
    walk(this.fs.root);

    const count = document.createElement('div');
    count.className = 'search-count';
    count.textContent = `${results.length} result${results.length === 1 ? '' : 's'} in ${new Set(results.map((r) => r.node.id)).size} file${new Set(results.map((r) => r.node.id)).size === 1 ? '' : 's'}`;
    this.resultsEl.appendChild(count);

    const fileResults = new Map<string, typeof results>();
    for (const r of results) {
      if (!fileResults.has(r.node.id)) fileResults.set(r.node.id, []);
      fileResults.get(r.node.id)!.push(r);
    }

    for (const [nodeId, lines] of fileResults) {
      const node = this.fs.getNode(nodeId)!;
      const fileHeader = document.createElement('div');
      fileHeader.className = 'search-file';
      fileHeader.innerHTML = `<span class="file-icon">${icons.file}</span><span class="file-name">${node.name}</span>`;
      fileHeader.addEventListener('click', () => this.onOpenFile(nodeId));
      this.resultsEl.appendChild(fileHeader);

      for (const r of lines) {
        const item = document.createElement('div');
        item.className = 'search-result';
        item.innerHTML = `<span class="line-num">${r.line}</span><span class="preview"></span>`;
        const preview = item.querySelector<HTMLElement>('.preview')!;
        preview.textContent = r.preview;
        item.addEventListener('click', () => this.onOpenFile(nodeId, { line: r.line, col: r.col }));
        this.resultsEl.appendChild(item);
      }
    }

    if (!results.length) this.showEmpty('No results found');
  }

  private showEmpty(msg: string): void {
    const el = document.createElement('div');
    el.className = 'search-empty';
    el.textContent = msg;
    this.resultsEl.appendChild(el);
  }

  focus(): void {
    this.inputEl.focus();
    this.inputEl.select();
  }
}
