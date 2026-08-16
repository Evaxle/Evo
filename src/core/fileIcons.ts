/**
 * Seti-style file type icons for the explorer and editor tabs,
 * matching VSCode's default (Seti) file-icon theme. Each entry maps a
 * file name/extension to an inline SVG glyph + brand color.
 */

function documentIcon(color: string, lines = 4): string {
  let folds = '';
  for (let i = 0; i < lines; i++) {
    const y = 8 + i * 3;
    folds += `<rect x="${9 + i}" y="${y}" width="${9 - i}" height="1.6" rx="0.8" fill="${color}"/>`;
  }
  return `<path d="M6 2.5a2.5 2.5 0 0 0-2.5 2.5v14A2.5 2.5 0 0 0 6 21.5h12a2.5 2.5 0 0 0 2.5-2.5V8.5L14.5 2.5H6z" fill="${color}" opacity="0.9"/><path d="M14.5 2.5v6h6" fill="none" stroke="#1e1e1e" stroke-width="1.5"/><path d="M18.5 21.5v-6h-6" fill="none" stroke="#1e1e1e" stroke-width="1.5"/>${folds}`;
}

function codeIcon(color: string, symbol?: string): string {
  return `<path d="M6 2.5a2.5 2.5 0 0 0-2.5 2.5v14A2.5 2.5 0 0 0 6 21.5h12a2.5 2.5 0 0 0 2.5-2.5V8.5L14.5 2.5H6z" fill="${color}" opacity="0.92"/><path d="M14.5 2.5v6h6" fill="none" stroke="#1e1e1e" stroke-width="1.6"/>${symbol ?? ''}`;
}

function brandIcon(letter: string, bgColor: string): string {
  return `<rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="${bgColor}"/><text x="12" y="16.4" font-family="Verdana, sans-serif" font-size="12" font-weight="bold" fill="#1e1e1e" text-anchor="middle">${letter}</text>`;
}

export interface FileIcon {
  svg: string;
  color: string;
}

const FILE_ICONS: Record<string, FileIcon> = {
  // Documents
  md: { svg: documentIcon('#519ABA'), color: '#519ABA' },
  markdown: { svg: documentIcon('#519ABA'), color: '#519ABA' },
  txt: { svg: documentIcon('#B0B0B0'), color: '#B0B0B0' },
  pdf: { svg: documentIcon('#F05133'), color: '#F05133' },
  log: { svg: documentIcon('#9d9d9d'), color: '#9d9d9d' },
  csv: { svg: documentIcon('#89D185'), color: '#89D185' },
  tsv: { svg: documentIcon('#89D185'), color: '#89D185' },

  // JS / TS
  js: { svg: brandIcon('JS', '#F7DF1E'), color: '#F7DF1E' },
  jsx: { svg: brandIcon('JS', '#F7DF1E'), color: '#F7DF1E' },
  mjs: { svg: brandIcon('JS', '#F7DF1E'), color: '#F7DF1E' },
  cjs: { svg: brandIcon('JS', '#F7DF1E'), color: '#F7DF1E' },
  ts: { svg: brandIcon('TS', '#3178C6'), color: '#3178C6' },
  tsx: { svg: brandIcon('TS', '#3178C6'), color: '#3178C6' },

  // Web
  html: { svg: brandIcon('<', '#E44D26'), color: '#E44D26' },
  htm: { svg: brandIcon('<', '#E44D26'), color: '#E44D26' },
  css: { svg: brandIcon('#', '#42A5F5'), color: '#42A5F5' },
  scss: { svg: brandIcon('S', '#C76395'), color: '#C76395' },
  sass: { svg: brandIcon('S', '#C76395'), color: '#C76395' },
  less: { svg: brandIcon('L', '#2A4D80'), color: '#2A4D80' },
  vue: { svg: brandIcon('V', '#41B883'), color: '#41B883' },
  svelte: { svg: brandIcon('S', '#FF3E00'), color: '#FF3E00' },

  // Config / data
  json: { svg: codeIcon('#C2C2C2'), color: '#C2C2C2' },
  jsonc: { svg: codeIcon('#C2C2C2'), color: '#C2C2C2' },
  yml: { svg: codeIcon('#8AB4F8'), color: '#8AB4F8' },
  yaml: { svg: codeIcon('#8AB4F8'), color: '#8AB4F8' },
  toml: { svg: codeIcon('#9d9d9d'), color: '#9d9d9d' },
  xml: { svg: codeIcon('#E37933'), color: '#E37933' },
  svg: { svg: codeIcon('#FFB13B'), color: '#FFB13B' },
  sql: { svg: codeIcon('#DAD8D8'), color: '#DAD8D8' },

  // Languages
  py: { svg: brandIcon('PY', '#4B8BBE'), color: '#4B8BBE' },
  go: { svg: brandIcon('GO', '#00ADD8'), color: '#00ADD8' },
  rs: { svg: brandIcon('RS', '#DEA584'), color: '#DEA584' },
  c: { svg: codeIcon('#555555'), color: '#555555' },
  h: { svg: codeIcon('#555555'), color: '#555555' },
  cpp: { svg: codeIcon('#F34B7D'), color: '#F34B7D' },
  hpp: { svg: codeIcon('#F34B7D'), color: '#F34B7D' },
  cs: { svg: brandIcon('C#', '#68217A'), color: '#68217A' },
  java: { svg: brandIcon('J', '#B07219'), color: '#B07219' },
  rb: { svg: brandIcon('RB', '#CC342D'), color: '#CC342D' },
  php: { svg: brandIcon('PHP', '#777BB4'), color: '#777BB4' },
  swift: { svg: brandIcon('S', '#F05138'), color: '#F05138' },
  kt: { svg: brandIcon('K', '#7F52FF'), color: '#7F52FF' },
  sh: { svg: codeIcon('#89E051'), color: '#89E051' },
  bash: { svg: codeIcon('#89E051'), color: '#89E051' },
  zsh: { svg: codeIcon('#89E051'), color: '#89E051' },
  fish: { svg: codeIcon('#89E051'), color: '#89E051' },
  ps1: { svg: codeIcon('#012456'), color: '#012456' },

  // Tools / dotfiles
  gitignore: { svg: codeIcon('#F14C4C'), color: '#F14C4C' },
  gitattributes: { svg: codeIcon('#F14C4C'), color: '#F14C4C' },
  lock: { svg: codeIcon('#E6C07B'), color: '#E6C07B' },
  env: { svg: codeIcon('#C8C8C8'), color: '#C8C8C8' },
  editorconfig: { svg: codeIcon('#F7DF1E'), color: '#F7DF1E' },
  dockerfile: { svg: codeIcon('#2496ED'), color: '#2496ED' },
  makefile: { svg: codeIcon('#D5D5D5'), color: '#D5D5D5' },
  tf: { svg: brandIcon('TF', '#844FBA'), color: '#844FBA' },

  // Images / media
  png: { svg: codeIcon('#9d9d9d'), color: '#9d9d9d' },
  jpg: { svg: codeIcon('#9d9d9d'), color: '#9d9d9d' },
  jpeg: { svg: codeIcon('#9d9d9d'), color: '#9d9d9d' },
  gif: { svg: codeIcon('#9d9d9d'), color: '#9d9d9d' },
  webp: { svg: codeIcon('#9d9d9d'), color: '#9d9d9d' },
  ico: { svg: codeIcon('#9d9d9d'), color: '#9d9d9d' },
  mp3: { svg: codeIcon('#E6C07B'), color: '#E6C07B' },
  wav: { svg: codeIcon('#E6C07B'), color: '#E6C07B' },
  mp4: { svg: codeIcon('#E6C07B'), color: '#E6C07B' },

  // Test files
  test: { svg: codeIcon('#B8E986'), color: '#B8E986' },
  spec: { svg: codeIcon('#B8E986'), color: '#B8E986' },
};

/** Icon for a specific file name (exact match first, then extension). */
export function fileIconForName(name: string): FileIcon {
  const lower = name.toLowerCase();
  if (FILE_ICONS[lower]) return FILE_ICONS[lower];

  const base = lower.replace(/\.[^.]+$/, '');
  if (FILE_ICONS[base]) return FILE_ICONS[base];

  if (base.endsWith('.test') || base.endsWith('.spec') || lower.includes('.test.')) {
    return FILE_ICONS.test;
  }

  const ext = lower.split('.').pop() ?? '';
  return (
    FILE_ICONS[ext] ??
    (ext === 'html' || ext === 'htm' ? FILE_ICONS.html : FILE_ICONS.txt)
  );
}

/** Brand-color for a file name (used when rendering plain glyphs). */
export function fileColorForName(name: string): string {
  return fileIconForName(name).color;
}

export function fileGlyphForName(name: string): string {
  const f = fileIconForName(name);
  return f.svg;
}
