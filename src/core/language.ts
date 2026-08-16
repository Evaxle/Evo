const byExt: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  rb: 'ruby',
  php: 'php',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  sql: 'sql',
  graphql: 'graphql',
  vue: 'html',
  svelte: 'html',
  dockerfile: 'dockerfile',
  conf: 'ini',
  env: 'ini',
  bat: 'bat',
  ps1: 'powershell',
  tex: 'latex',
  diff: 'diff',
  txt: 'plaintext',
  log: 'plaintext',
  gitignore: 'plaintext',
  lock: 'json',
};

const byName: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  license: 'plaintext',
  readme: 'markdown',
  '.env': 'ini',
  'eslintrc': 'json',
  'babelrc': 'json',
  'prettierrc': 'json',
};

export function languageFromPath(path: string): string {
  const name = path.split('/').pop() ?? path;
  const lower = name.toLowerCase();

  if (byName[lower]) return byName[lower];
  if (lower.startsWith('.')) return 'ini';

  const dot = name.lastIndexOf('.');
  if (dot === -1) return 'plaintext';
  const ext = name.slice(dot + 1).toLowerCase();
  return byExt[ext] ?? 'plaintext';
}

/** Human friendly label used in the status bar. */
export function languageLabel(lang: string): string {
  const map: Record<string, string> = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    json: 'JSON',
    css: 'CSS',
    html: 'HTML',
    markdown: 'Markdown',
    python: 'Python',
    plaintext: 'Plain Text',
    shell: 'Shell Script',
    yaml: 'YAML',
    xml: 'XML',
  };
  return map[lang] ?? lang;
}
