export interface ModalOptions {
  title: string;
  message?: string;
  placeholder?: string;
  inputValue?: string;
  confirmText?: string;
  cancelText?: string;
  /** If true the dialog has a select instead of an input. */
  select?: boolean;
  options?: string[];
}

export interface ModalResult {
  ok: boolean;
  value: string;
}

/**
 * Prompts the user with a modal dialog. Resolves {ok, value}.
 */
export function showModal(opts: ModalOptions): Promise<ModalResult> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'evo-modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'evo-modal';

    const title = document.createElement('h3');
    title.className = 'evo-modal-title';
    title.textContent = opts.title;
    dialog.appendChild(title);

    if (opts.message) {
      const msg = document.createElement('p');
      msg.className = 'evo-modal-message';
      msg.textContent = opts.message;
      dialog.appendChild(msg);
    }

    let input: HTMLInputElement | HTMLSelectElement;
    if (opts.select) {
      input = document.createElement('select');
      input.className = 'evo-modal-input';
      (opts.options ?? []).forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        input.appendChild(option);
      });
      if (opts.inputValue) input.value = opts.inputValue;
    } else {
      input = document.createElement('input');
      input.className = 'evo-modal-input';
      input.type = 'text';
      input.placeholder = opts.placeholder ?? '';
      input.value = opts.inputValue ?? '';
      input.spellcheck = false;
    }
    dialog.appendChild(input);

    const buttons = document.createElement('div');
    buttons.className = 'evo-modal-buttons';

    const cancel = document.createElement('button');
    cancel.className = 'evo-btn evo-btn-secondary';
    cancel.textContent = opts.cancelText ?? 'Cancel';
    buttons.appendChild(cancel);

    const confirm = document.createElement('button');
    confirm.className = 'evo-btn evo-btn-primary';
    confirm.textContent = opts.confirmText ?? 'OK';
    buttons.appendChild(confirm);

    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const close = (result: ModalResult) => {
      overlay.remove();
      resolve(result);
    };

    cancel.addEventListener('click', () => close({ ok: false, value: input.value }));
    confirm.addEventListener('click', () => close({ ok: true, value: input.value }));
    (input as HTMLInputElement).addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') close({ ok: true, value: input.value });
      if (e.key === 'Escape') close({ ok: false, value: input.value });
    });
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) close({ ok: false, value: input.value });
    });

    input.focus();
    if (input instanceof HTMLInputElement) input.select();
  });
}
