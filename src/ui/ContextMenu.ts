export interface MenuItem {
  label?: string;
  icon?: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
  danger?: boolean;
  submenu?: MenuItem[];
}

/**
 * Shows a VSCode-style context menu at a screen position.
 */
export function showContextMenu(
  items: MenuItem[],
  x: number,
  y: number,
): void {
  hideContextMenu();

  const menu = document.createElement('div');
  menu.className = 'evo-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const build = (list: MenuItem[], parent: HTMLElement) => {
    for (const item of list) {
      if (item.separator) {
        parent.appendChild(document.createElement('div')).className = 'evo-menu-sep';
        continue;
      }
      const btn = document.createElement('button');
      btn.className = 'evo-menu-item';
      if (item.disabled) btn.classList.add('disabled');
      if (item.danger) btn.classList.add('danger');
      if (item.icon) {
        const ic = document.createElement('span');
        ic.className = 'evo-menu-icon';
        ic.innerHTML = item.icon;
        btn.appendChild(ic);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'evo-menu-icon';
        btn.appendChild(spacer);
      }
      const label = document.createElement('span');
      label.className = 'evo-menu-label';
      label.textContent = item.label ?? '';
      btn.appendChild(label);

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideContextMenu();
        item.action?.();
      });

      if (item.submenu) {
        const arrow = document.createElement('span');
        arrow.className = 'evo-menu-arrow';
        arrow.textContent = '›';
        btn.appendChild(arrow);
        btn.addEventListener('mouseenter', () => {
          openSubmenu(item.submenu!, btn);
        });
      }
      parent.appendChild(btn);
    }
  };

  const openSubmenu = (sub: MenuItem[], anchor: HTMLElement) => {
    const existing = menu.querySelector('.evo-menu-sub');
    existing?.remove();
    const rect = anchor.getBoundingClientRect();
    const subMenu = document.createElement('div');
    subMenu.className = 'evo-menu evo-menu-sub';
    subMenu.style.left = `${rect.right}px`;
    subMenu.style.top = `${rect.top}px`;
    build(sub, subMenu);
    document.body.appendChild(subMenu);
    fitOnScreen(subMenu);
    anchor.addEventListener(
      'mouseleave',
      () => setTimeout(() => subMenu.remove(), 200),
      { once: true },
    );
  };

  build(items, menu);
  document.body.appendChild(menu);

  const fitOnScreen = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) el.style.left = `${window.innerWidth - rect.width - 4}px`;
    if (rect.bottom > window.innerHeight) el.style.top = `${window.innerHeight - rect.height - 4}px`;
  };
  fitOnScreen(menu);

  const onDocClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.evo-menu')) hideContextMenu();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') hideContextMenu();
  };
  document.addEventListener('mousedown', onDocClick, { once: true });
  document.addEventListener('keydown', onKey, { once: true });
}

export function hideContextMenu(): void {
  document.querySelectorAll('.evo-menu').forEach((el) => el.remove());
}
