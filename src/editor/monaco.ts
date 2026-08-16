import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { languageFromPath } from '../core/language';

self.MonacoEnvironment = {
  getWorker(_: string, label: string): Worker {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);

monaco.editor.defineTheme('evo-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
    { token: 'keyword', foreground: '569CD6' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'type', foreground: '4EC9B0' },
    { token: 'identifier', foreground: '9CDCFE' },
    { token: 'function', foreground: 'DCDCAA' },
    { token: 'variable', foreground: '9CDCFE' },
    { token: 'constant', foreground: '4FC1FF' },
    { token: 'delimiter', foreground: 'D4D4D4' },
    { token: 'tag', foreground: '569CD6' },
    { token: 'attribute.name', foreground: '9CDCFE' },
    { token: 'attribute.value', foreground: 'CE9178' },
    { token: 'operator', foreground: 'D4D4D4' },
    { token: 'regexp', foreground: 'D16969' },
  ],
  colors: {
    'editor.background': '#1e1e1e',
    'editor.foreground': '#d4d4d4',
    'editorCursor.foreground': '#aeafad',
    'editor.lineHighlightBackground': '#2a2a2a55',
    'editorLineNumber.foreground': '#858585',
    'editorLineNumber.activeForeground': '#c6c6c6',
    'editor.selectionBackground': '#264f7855',
    'editor.inactiveSelectionBackground': '#264f7833',
    'editorIndentGuide.background1': '#404040',
    'editorIndentGuide.activeBackground1': '#707070',
    'editorWhitespace.foreground': '#3b3b3b',
    'editorBracketMatch.background': '#0064001a',
    'editorBracketMatch.border': '#888888',
    'editorGutter.background': '#1e1e1e',
    'scrollbarSlider.background': '#ffffff2b',
    'scrollbarSlider.hoverBackground': '#ffffff3d',
    'scrollbarSlider.activeBackground': '#ffffff52',
    'editorWidget.background': '#252526',
    'editorWidget.border': '#454545',
    'editorSuggestWidget.background': '#252526',
    'editorSuggestWidget.border': '#454545',
    'editorSuggestWidget.selectedBackground': '#04395e',
    'input.background': '#3c3c3c',
    'input.border': '#007acc',
    'input.foreground': '#cccccc',
    'focusBorder': '#007acc',
    'list.activeSelectionBackground': '#04395e',
    'list.activeSelectionForeground': '#ffffff',
    'list.hoverBackground': '#2a2d2e',
    'list.inactiveSelectionBackground': '#37373d',
  },
});

monaco.editor.defineTheme('evo-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#ffffff',
    'editor.lineHighlightBackground': '#f3f3f3',
    'editorLineNumber.foreground': '#237893',
  },
});

export function uriForPath(path: string): monaco.Uri {
  // Use file:// URIs so the TypeScript worker treats virtual files as
  // real workspace files (enables cross-file IntelliSense).
  return monaco.Uri.file(path);
}

export function languageForPath(path: string): string {
  return languageFromPath(path);
}

export { monaco };
