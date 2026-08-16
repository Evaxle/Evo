import { icons } from '../core/icons';

interface LoadingOverlayHandle {
  setMessage(message: string): void;
  done(): void;
}

/**
 * Full-screen loading overlay with a spinner + message.
 * Use for project loads, repo imports and folder uploads.
 */
export function showLoading(message: string): LoadingOverlayHandle {
  let overlay = document.querySelector<HTMLElement>('.evo-loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'evo-loading-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="evo-loading-card">
      <div class="evo-loading-spinner">${icons.spinner}</div>
      <p class="evo-loading-message"></p>
    </div>
  `;
  const msgEl = overlay.querySelector<HTMLElement>('.evo-loading-message')!;
  msgEl.textContent = message;

  // Reset then replay the entrance animation.
  overlay.classList.remove('show');
  void overlay.offsetWidth;
  overlay.classList.add('show');

  let closed = false;
  return {
    setMessage(m: string) {
      msgEl.textContent = m;
    },
    done() {
      if (closed) return;
      closed = true;
      overlay!.classList.remove('show');
      window.setTimeout(() => overlay!.remove(), 300);
    },
  };
}
