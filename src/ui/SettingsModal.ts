import { defaultSettings, type SettingsStore } from '../core/SettingsStore';

/**
 * A VSCode-style settings modal that edits the current AppSettings.
 */
export function showSettings(settings: SettingsStore): void {
  const s = settings.settings;
  const overlay = document.createElement('div');
  overlay.className = 'evo-settings-overlay';

  const panel = document.createElement('div');
  panel.className = 'evo-settings';

  const header = document.createElement('div');
  header.className = 'evo-settings-header';
  const title = document.createElement('h2');
  title.textContent = 'Settings';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'evo-settings-close';
  closeBtn.textContent = '✕';
  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'evo-settings-body';

  const field = (
    label: string,
    desc: string,
    control: HTMLElement,
  ): void => {
    const row = document.createElement('div');
    row.className = 'evo-settings-row';
    const info = document.createElement('div');
    info.className = 'evo-settings-info';
    const l = document.createElement('label');
    l.textContent = label;
    const d = document.createElement('p');
    d.textContent = desc;
    info.appendChild(l);
    info.appendChild(d);
    row.appendChild(info);
    row.appendChild(control);
    body.appendChild(row);
  };

  // Theme
  const theme = document.createElement('select');
  theme.className = 'evo-settings-select';
  theme.innerHTML = `<option value="dark">Evo Dark</option><option value="light">Evo Light</option>`;
  theme.value = s.theme;
  field('Theme', 'Controls the color theme of the editor.', theme);

  // Font size
  const fontSize = document.createElement('input');
  fontSize.type = 'number';
  fontSize.className = 'evo-settings-number';
  fontSize.min = '8';
  fontSize.max = '32';
  fontSize.value = String(s.fontSize);
  field('Font Size', 'Controls the editor font size in pixels.', fontSize);

  // Word wrap
  const wordWrap = document.createElement('select');
  wordWrap.className = 'evo-settings-select';
  wordWrap.innerHTML = `<option value="off">off</option><option value="on">on</option>`;
  wordWrap.value = s.wordWrap;
  field('Word Wrap', 'Controls how lines should wrap.', wordWrap);

  // Tab size
  const tabSize = document.createElement('input');
  tabSize.type = 'number';
  tabSize.className = 'evo-settings-number';
  tabSize.min = '2';
  tabSize.max = '8';
  tabSize.value = String(s.tabSize);
  field('Tab Size', 'The number of spaces a tab is equal to.', tabSize);

  // Autosave
  const autosave = document.createElement('input');
  autosave.type = 'checkbox';
  autosave.className = 'evo-settings-checkbox';
  autosave.checked = s.autosave;
  field('Autosave', 'Automatically save files after changes.', autosave);

  // Minimap
  const minimap = document.createElement('input');
  minimap.type = 'checkbox';
  minimap.className = 'evo-settings-checkbox';
  minimap.checked = s.minimap;
  field('Minimap', 'Render a minimap next to the editor.', minimap);

  // Font ligatures
  const ligatures = document.createElement('input');
  ligatures.type = 'checkbox';
  ligatures.className = 'evo-settings-checkbox';
  ligatures.checked = s.fontLigatures;
  field('Font Ligatures', 'Enable font ligatures in the editor.', ligatures);

  // Render whitespace
  const whitespace = document.createElement('select');
  whitespace.className = 'evo-settings-select';
  whitespace.innerHTML = `<option value="none">none</option><option value="boundary">boundary</option><option value="all">all</option>`;
  whitespace.value = s.renderWhitespace;
  field('Render Whitespace', 'Controls how whitespace characters are rendered.', whitespace);

  // Line numbers
  const lineNumbers = document.createElement('select');
  lineNumbers.className = 'evo-settings-select';
  lineNumbers.innerHTML = `<option value="on">on</option><option value="off">off</option><option value="relative">relative</option>`;
  lineNumbers.value = s.lineNumbers;
  field('Line Numbers', 'Controls how line numbers are displayed.', lineNumbers);

  panel.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'evo-settings-footer';
  const reset = document.createElement('button');
  reset.className = 'evo-btn evo-btn-secondary';
  reset.textContent = 'Reset All';
  footer.appendChild(reset);
  const done = document.createElement('button');
  done.className = 'evo-btn evo-btn-primary';
  done.textContent = 'Done';
  footer.appendChild(done);
  panel.appendChild(footer);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const close = () => {
    settings.update({
      theme: theme.value as 'dark' | 'light',
      fontSize: clamp(parseInt(fontSize.value) || defaultSettings.fontSize, 8, 32),
      wordWrap: wordWrap.value as 'off' | 'on',
      tabSize: clamp(parseInt(tabSize.value) || defaultSettings.tabSize, 2, 8),
      autosave: autosave.checked,
      minimap: minimap.checked,
      fontLigatures: ligatures.checked,
      renderWhitespace: whitespace.value as 'none' | 'boundary' | 'all',
      lineNumbers: lineNumbers.value as 'on' | 'off' | 'relative',
    });
    overlay.remove();
  };

  closeBtn.addEventListener('click', close);
  done.addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  reset.addEventListener('click', () => {
    settings.update({ ...defaultSettings });
    overlay.remove();
  });
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
