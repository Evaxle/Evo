import { icons } from '../core/icons';

type ToastKind = 'info' | 'success' | 'warning' | 'error';

export function toast(message: string, kind: ToastKind = 'info', timeout = 3500): void {
  let container = document.querySelector<HTMLElement>('.evo-toasts');
  if (!container) {
    container = document.createElement('div');
    container.className = 'evo-toasts';
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.className = `evo-toast evo-toast-${kind}`;

  const icon = document.createElement('span');
  icon.className = 'evo-toast-icon';
  icon.innerHTML =
    kind === 'success'
      ? icons.check
      : kind === 'warning'
        ? icons.warning
        : kind === 'error'
          ? icons.error
          : icons.info;
  el.appendChild(icon);

  const msg = document.createElement('span');
  msg.className = 'evo-toast-message';
  msg.textContent = message;
  el.appendChild(msg);

  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  window.setTimeout(() => {
    el.classList.remove('show');
    window.setTimeout(() => el.remove(), 300);
  }, timeout);
}
