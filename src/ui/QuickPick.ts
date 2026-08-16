import { icons } from '../core/icons';

export interface QuickPickItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  group?: string;
  onSelect: () => void;
}

export interface QuickPickOptions {
  placeholder?: string;
  items: QuickPickItem[];
}

/**
 * A VSCode-style fuzzy quick-pick input used by the command palette,
 * quick open and other pickers.
 */
export function showQuickPick(opts: QuickPickOptions): void {
  hideQuickPick();

  const overlay = document.createElement('div');
  overlay.className = 'evo-quick-overlay';

  const box = document.createElement('div');
  box.className = 'evo-quickbox';

  const inputRow = document.createElement('div');
  inputRow.className = 'evo-quick-input-row';
  const icon = document.createElement('span');
  icon.className = 'evo-quick-icon';
  icon.innerHTML = icons.search;
  const input = document.createElement('input');
  input.className = 'evo-quick-input';
  input.placeholder = opts.placeholder ?? 'Type to search...';
  input.spellcheck = false;
  inputRow.appendChild(icon);
  inputRow.appendChild(input);

  const list = document.createElement('div');
  list.className = 'evo-quick-list';

  box.appendChild(inputRow);
  box.appendChild(list);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  let filter = '';
  let selectedIndex = 0;
  let renderedItems: QuickPickItem[] = [];

  const render = () => {
    const q = filter.trim().toLowerCase();
    const scored = opts.items
      .map((item, idx) => ({ item, idx, score: fuzzyScore(item.label, q) }))
      .filter((x) => (q ? x.score > 0 : true))
      .sort((a, b) => b.score - a.score || a.idx - b.idx);

    renderedItems = scored.map((s) => s.item);
    list.innerHTML = '';

    if (!renderedItems.length) {
      const empty = document.createElement('div');
      empty.className = 'evo-quick-empty';
      empty.textContent = 'No matching items';
      list.appendChild(empty);
      return;
    }

    let lastGroup: string | null = null;
    renderedItems.forEach((item, i) => {
      if (item.group && item.group !== lastGroup) {
        lastGroup = item.group;
        const group = document.createElement('div');
        group.className = 'evo-quick-group';
        group.textContent = item.group;
        list.appendChild(group);
      }
      const row = document.createElement('div');
      row.className = 'evo-quick-item';
      row.dataset.index = String(i);

      const ic = document.createElement('span');
      ic.className = 'evo-quick-item-icon';
      ic.innerHTML = item.icon ?? '';
      row.appendChild(ic);

      const label = document.createElement('span');
      label.className = 'evo-quick-item-label';
      label.textContent = item.label;
      row.appendChild(label);

      if (item.description) {
        const desc = document.createElement('span');
        desc.className = 'evo-quick-item-desc';
        desc.textContent = item.description;
        row.appendChild(desc);
      }

      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        select(i);
      });
      row.addEventListener('mouseenter', () => highlight(i));
      list.appendChild(row);
    });
    highlight(0);
  };

  const highlight = (i: number) => {
    selectedIndex = i;
    list.querySelectorAll('.evo-quick-item').forEach((el, idx) => {
      (el as HTMLElement).classList.toggle('highlighted', idx === i);
    });
    const active = list.querySelector<HTMLElement>(`.evo-quick-item[data-index="${i}"]`);
    active?.scrollIntoView({ block: 'nearest' });
  };

  const select = (i: number) => {
    const item = renderedItems[i];
    if (!item) return;
    close();
    item.onSelect();
  };

  const close = () => overlay.remove();

  input.addEventListener('input', () => {
    filter = input.value;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlight(Math.min(selectedIndex + 1, renderedItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlight(Math.max(selectedIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(selectedIndex);
    } else if (e.key === 'Escape') {
      close();
    }
  });
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });

  render();
  input.focus();
}

export function hideQuickPick(): void {
  document.querySelectorAll('.evo-quick-overlay').forEach((el) => el.remove());
}

/** Simple substring score: consecutive matches score higher. */
function fuzzyScore(label: string, query: string): number {
  if (!query) return 1;
  const l = label.toLowerCase();
  let score = 0;
  let qIdx = 0;
  let lastMatch = -2;
  for (let i = 0; i < l.length && qIdx < query.length; i++) {
    if (l[i] === query[qIdx]) {
      score += i === lastMatch + 1 ? 3 : 1;
      lastMatch = i;
      qIdx++;
    }
  }
  return qIdx === query.length ? score : 0;
}
