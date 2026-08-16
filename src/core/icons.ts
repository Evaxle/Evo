const svg = (paths: string, viewBox = '0 0 16 16'): string =>
  `<svg viewBox="${viewBox}" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;

/**
 * A small set of inline SVG icons styled after VSCode's codicons,
 * so we avoid pulling in a font dependency.
 */
export const icons: Record<string, string> = {
  files:
    svg('<path d="M2 2h7l2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2z" fill="currentColor"/><path d="M9 2v2h2" fill="currentColor"/>'),
  folder:
    svg('<path d="M1.5 3a1 1 0 0 1 1-1h3.5l1.5 2h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V3z" fill="currentColor"/>'),
  'folder-open':
    svg('<path d="M1.5 3a1 1 0 0 1 1-1h3.5l1.5 2h6a1 1 0 0 1 1 1v1H4a2 2 0 0 0-1.9 1.3L1.5 9V3z" fill="currentColor"/><path d="M1 11l1.5-4.2A1.5 1.5 0 0 1 3.9 6H14a1 1 0 0 1 1 1.2L13.5 12a1.5 1.5 0 0 1-1.4 1H3a1.5 1.5 0 0 1-2-1.4z" fill="currentColor"/>'),
  file: svg('<path d="M3 1.5A1.5 1.5 0 0 1 4.5 0h5l3.5 3.5V12a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12V1.5z" fill="currentColor"/><path d="M9.5 0v3.5H13" fill="currentColor"/>'),
  search:
    svg('<circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M10 10l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
  'source-control':
    svg('<circle cx="5" cy="3" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="5" cy="13" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="11" cy="8" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M5 5v6M7 13h4a2 2 0 0 0 2-2v-1" stroke="currentColor" stroke-width="1.5"/>'),
  run: svg('<path d="M3.5 2l9 6-9 6V2z" fill="currentColor"/>'),
  extensions:
    svg('<rect x="3" y="3" width="4" height="4" rx="1" fill="currentColor"/><rect x="9" y="3" width="4" height="4" rx="1" fill="currentColor"/><rect x="3" y="9" width="4" height="4" rx="1" fill="currentColor"/><rect x="9" y="9" width="4" height="4" rx="1" fill="currentColor"/>'),
  account:
    svg('<circle cx="8" cy="5" r="3" fill="currentColor"/><path d="M2 15a6 6 0 0 1 12 0" fill="currentColor"/>'),
  close:
    svg('<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
  newfile: svg('<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
  newfolder: svg('<path d="M1.5 3a1 1 0 0 1 1-1h3.5l1.5 2h6a1 1 0 0 1 1 1v3h-2v-2h-11v6a1 1 0 0 0 1 1h4v2h-5a1 1 0 0 1-1-1V3z" fill="currentColor"/><path d="M13 9v5M10.5 11.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
  refresh:
    svg('<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M12 1.5v3h-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>'),
  collapse:
    svg('<path d="M8 10.5L4 6h8z" fill="currentColor"/>'),
  expand: svg('<path d="M5.5 4h8L8 11 5.5 4z" fill="currentColor"/>'),
  chevronRight:
    svg('<path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  chevronDown:
    svg('<path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  check:
    svg('<path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  trash:
    svg('<path d="M2 4h12M6 4V2.5A1.5 1.5 0 0 1 7.5 1h1A1.5 1.5 0 0 1 10 2.5V4" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M3.5 4l.7 10a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9l.7-10" stroke="currentColor" stroke-width="1.2" fill="none"/>'),
  rename:
    svg('<path d="M11 2l3 3L5 14H2v-3L11 2z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>'),
  copy: svg('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M3.5 10a2 2 0 0 1-2-2V3.5a2 2 0 0 1 2-2H9a2 2 0 0 1 2 2" stroke="currentColor" stroke-width="1.3" fill="none"/>'),
  open: svg('<path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2l1.2 1.6h5.8A1.5 1.5 0 0 1 14 6.1v.9H3.5a1.5 1.5 0 0 0-1.5 1.5V9A1.5 1.5 0 0 1 2 4.5z" fill="currentColor"/><path d="M3 8.5h11l-1.5 4.6a1.5 1.5 0 0 1-1.4 1H5.9a1.5 1.5 0 0 1-1.4-1L3 8.5z" fill="currentColor"/>'),
  download:
    svg('<path d="M8 1v9M4.5 7L8 10.5 11.5 7" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 13h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'),
  upload:
    svg('<path d="M8 10V1M4.5 4.5L8 1 11.5 4.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 13h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'),
  folderOpened:
    svg('<path d="M1.5 3a1 1 0 0 1 1-1h3.5l1.5 2h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V3z" fill="currentColor"/>'),
  gear: svg('<circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'),
  settings: svg('<circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'),
  menu: svg('<path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
  home: svg('<path d="M2 7.5L8 2l6 5.5V14H2V7.5z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/><path d="M5.5 14V9h5v5" stroke="currentColor" stroke-width="1.3" fill="none"/>'),
  branch:
    svg('<circle cx="5" cy="3" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="5" cy="13" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="11" cy="8" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M5 5v6M7 13h4a2 2 0 0 0 2-2v-1" stroke="currentColor" stroke-width="1.5"/>'),
  sync:
    svg('<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M12 1.5v3h-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>'),
  ellipsis: svg('<circle cx="3.5" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="12.5" cy="8" r="1.2" fill="currentColor"/>'),
  warning:
    svg('<path d="M8 1L15 14H1L8 1z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/><path d="M8 6v3M8 11.5v.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'),
  info: svg('<circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M8 7v4M8 4.5v.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'),
  error:
    svg('<circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'),
  terminal:
    svg('<path d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M4 6l3 2-3 2M8.5 10H11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'),
  bell: svg('<path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3-1.5 4-1.5 4h12s-1.5-1-1.5-4A4.5 4.5 0 0 0 8 1.5z" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M6.5 12a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1.2" fill="none"/>'),
  code: svg('<path d="M6 4L2.5 8 6 12M10 4l3.5 4L10 12" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  debug:
    svg('<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M8 3v1M8 12v1M3 8h1M12 8h1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'),
  commit:
    svg('<circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M8 5V1M8 11v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'),
  splitVertical:
    svg('<rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M8 2v12" stroke="currentColor" stroke-width="1.3"/>'),
  splitHorizontal:
    svg('<rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M2 8h12" stroke="currentColor" stroke-width="1.3"/>'),
  chevronDownSmall:
    svg('<path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  layout:
    svg('<rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M6 3v10" stroke="currentColor" stroke-width="1.3"/>'),
  wand: svg('<path d="M2 14L11 5M12.5 2.5l1 1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M4 2l.7 1.3L6 4l-1.3.7L4 6l-.7-1.3L2 4l1.3-.7L4 2z" fill="currentColor"/><path d="M10 8l.7 1.3L12 10l-1.3.7L10 12l-.7-1.3L8 10l1.3-.7L10 8z" fill="currentColor"/>'),
  cloud:
    svg('<path d="M4.5 12a3 3 0 1 1 .3-6A4 4 0 0 1 12 7.5a2.5 2.5 0 0 1-.5 4.5H4.5z" stroke="currentColor" stroke-width="1.3" fill="none"/>'),
  spinner:
    svg('<path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>'),
};

export type IconName = keyof typeof icons;

export function icon(name: IconName | string): string {
  return icons[name] ?? icons.file;
}
