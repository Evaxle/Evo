import { icons } from '../core/icons';
import { toast } from './Toast';
import {
  getOpenCodeStatus,
  syncWorkspaceToDisk,
  readWorkspaceFromDisk,
  listProviders,
  setProviderApiKey,
  removeProviderAuth,
  createSession,
  sendMessageAsync,
  subscribeToEvents,
  type OpenCodeEvent,
  type OpenCodeSession,
  type OpenCodeProviders,
} from '../lib/opencode';
import type { FileSystem } from '../fs/FileSystem';
import type { FSNode } from '../core/types';

export interface AssistantViewOptions {
  /** Called with the remote FS tree after a turn so main.ts can merge + refresh. */
  onApplyRemoteRoot: (root: FSNode) => void;
  /** Called when an assistant message wants to open a file. */
  onOpenFile: (nodeId: string) => void;
}

interface PendingPart {
  el: HTMLElement;
  textEl: HTMLElement | null;
  text: string;
}

/**
 * Chat panel that talks to a local opencode server through the Vite bridge.
 * Before each turn the current workspace is materialized to disk so opencode
 * edits the same files the user sees; afterwards the edits are pulled back
 * into the virtual FS.
 */
export class AssistantView {
  el: HTMLElement;
  private bodyEl: HTMLElement;
  private statusEl!: HTMLElement;
  private statusDot!: HTMLElement;
  private providerSelect!: HTMLSelectElement;
  private keyInput!: HTMLInputElement;
  private saveKeyBtn!: HTMLButtonElement;
  private connectedEl!: HTMLElement;
  private modelSelect!: HTMLSelectElement;
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private newSessionBtn!: HTMLButtonElement;
  private refreshBtn!: HTMLButtonElement;

  private providers: OpenCodeProviders | null = null;
  private session: OpenCodeSession | null = null;
  private busy = false;
  private pendingParts = new Map<string, PendingPart>();

  constructor(
    private root: HTMLElement,
    private fs: FileSystem,
    private opts: AssistantViewOptions,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'evo-view evo-assistant';

    const header = document.createElement('div');
    header.className = 'evo-view-header';
    header.innerHTML = `<span class="view-title">ASSISTANT</span>`;
    this.el.appendChild(header);

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'assistant-body';
    this.el.appendChild(this.bodyEl);

    this.renderShell();
    this.root.appendChild(this.el);

    this.subscribe();
    void this.refresh();
  }

  private subscribe(): void {
    subscribeToEvents((ev) => void this.handleEvent(ev));
  }

  private renderShell(): void {
    this.bodyEl.innerHTML = `
      <div class="assistant-status">
        <span class="assistant-status-dot"></span>
        <span class="assistant-status-text">Checking opencode…</span>
        <button class="assistant-btn assistant-btn-icon" data-act="refresh" title="Refresh">${icons.refresh}</button>
      </div>

      <div class="assistant-connect">
        <div class="assistant-connect-title">Connect API key</div>
        <div class="assistant-connect-row">
          <select class="assistant-select assistant-provider"></select>
          <input class="assistant-input assistant-key" type="password" placeholder="API key" autocomplete="off" spellcheck="false">
        </div>
        <div class="assistant-connect-row">
          <button class="assistant-btn assistant-btn-primary" data-act="save-key">Save key</button>
          <span class="assistant-connected"></span>
        </div>
      </div>

      <div class="assistant-model-row">
        <select class="assistant-select assistant-model" title="Model"></select>
        <button class="assistant-btn" data-act="new-session" title="New session">New</button>
      </div>

      <div class="assistant-messages"></div>

      <div class="assistant-composer">
        <textarea class="assistant-input assistant-composer-input" placeholder="Ask opencode to fix, refactor or add to your workspace…" spellcheck="false" rows="2"></textarea>
        <button class="assistant-btn assistant-btn-primary assistant-send" data-act="send">${icons.send}</button>
      </div>
    `;

    this.statusDot = this.bodyEl.querySelector('.assistant-status-dot')!;
    this.statusEl = this.bodyEl.querySelector('.assistant-status-text')!;
    this.providerSelect = this.bodyEl.querySelector('.assistant-provider')!;
    this.keyInput = this.bodyEl.querySelector('.assistant-key')!;
    this.saveKeyBtn = this.bodyEl.querySelector('[data-act="save-key"]')!;
    this.connectedEl = this.bodyEl.querySelector('.assistant-connected')!;
    this.modelSelect = this.bodyEl.querySelector('.assistant-model')!;
    this.messagesEl = this.bodyEl.querySelector('.assistant-messages')!;
    this.inputEl = this.bodyEl.querySelector('.assistant-composer-input')!;
    this.sendBtn = this.bodyEl.querySelector('[data-act="send"]')!;
    this.newSessionBtn = this.bodyEl.querySelector('[data-act="new-session"]')!;
    this.refreshBtn = this.bodyEl.querySelector('[data-act="refresh"]')!;

    this.refreshBtn.addEventListener('click', () => void this.refresh());
    this.saveKeyBtn.addEventListener('click', () => void this.saveKey());
    this.newSessionBtn.addEventListener('click', () => void this.newSession());
    this.sendBtn.addEventListener('click', () => void this.send());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.send();
      }
    });

    this.keyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.saveKey();
      }
    });
  }

  private setStatus(text: string, kind: 'ok' | 'warn' | 'err' = 'ok'): void {
    this.statusEl.textContent = text;
    this.statusDot.classList.toggle('ok', kind === 'ok');
    this.statusDot.classList.toggle('warn', kind === 'warn');
    this.statusDot.classList.toggle('err', kind === 'err');
  }

  /** Refresh bridge/server status + providers + model list. */
  async refresh(): Promise<void> {
    this.setStatus('Checking opencode…', 'warn');
    let status;
    try {
      status = await getOpenCodeStatus();
    } catch (err) {
      this.setStatus(`Bridge unavailable: ${(err as Error).message}`, 'err');
      return;
    }
    if (!status.running) {
      this.setStatus(
        status.error || 'opencode is not running. Restart `npm run dev`.',
        'err',
      );
      this.fillProviderList([]);
      return;
    }
    this.setStatus(
      `opencode v${status.version ?? '?'} · port ${status.port}`,
      'ok',
    );

    try {
      this.providers = await listProviders();
    } catch (err) {
      this.setStatus(`Could not list providers: ${(err as Error).message}`, 'err');
      return;
    }
    this.fillProviderList(this.providers);
    this.populateModels(this.providers);
    this.renderConnected(this.providers);
  }

  private fillProviderList(providers: OpenCodeProviders | []): void {
    this.providerSelect.innerHTML = '';
    let apiProviders: Array<{ id: string; label: string }> = [];
    if (providers && (providers as OpenCodeProviders).all) {
      apiProviders = (providers as OpenCodeProviders).all
        .filter((p) => p.source === 'api' || p.source === 'custom' || p.source === 'config')
        .map((p) => ({ id: p.id, label: p.name }));
    }
    // Always include a few common ones that accept manual API keys.
    const common = ['openai', 'anthropic', 'google', 'openrouter', 'groq', 'deepseek'];
    for (const id of common) {
      if (!apiProviders.some((p) => p.id === id)) {
        apiProviders.push({ id, label: id });
      }
    }
    if (!apiProviders.length) {
      apiProviders = [{ id: 'openai', label: 'openai' }];
    }
    for (const p of apiProviders) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      this.providerSelect.appendChild(opt);
    }
  }

  private async saveKey(): Promise<void> {
    const providerID = this.providerSelect.value;
    const key = this.keyInput.value.trim();
    if (!key) {
      toast('Enter an API key first.', 'warning');
      return;
    }
    this.saveKeyBtn.disabled = true;
    this.saveKeyBtn.textContent = 'Saving…';
    try {
      await setProviderApiKey(providerID, key);
      this.keyInput.value = '';
      toast(`API key saved for ${providerID}.`, 'success');
      this.providers = await listProviders();
      this.populateModels(this.providers);
      this.renderConnected(this.providers);
    } catch (err) {
      toast(`Could not save key: ${(err as Error).message}`, 'error', 6000);
    } finally {
      this.saveKeyBtn.disabled = false;
      this.saveKeyBtn.textContent = 'Save key';
    }
  }

  private async renderConnected(providers: OpenCodeProviders): Promise<void> {
    const connected = providers.connected ?? [];
    if (!connected.length) {
      this.connectedEl.textContent = 'No providers connected yet.';
      return;
    }
    this.connectedEl.innerHTML = '';
    for (const id of connected) {
      const chip = document.createElement('span');
      chip.className = 'assistant-chip';
      chip.textContent = id;
      const x = document.createElement('button');
      x.className = 'assistant-chip-remove';
      x.textContent = '✕';
      x.title = `Remove ${id}`;
      x.addEventListener('click', () => void this.removeProvider(id));
      chip.appendChild(x);
      this.connectedEl.appendChild(chip);
    }
  }

  private async removeProvider(providerID: string): Promise<void> {
    try {
      await removeProviderAuth(providerID);
      toast(`Removed ${providerID}.`, 'success');
      this.providers = await listProviders();
      this.populateModels(this.providers);
      this.renderConnected(this.providers);
    } catch (err) {
      toast(`Could not remove: ${(err as Error).message}`, 'error');
    }
  }

  private populateModels(providers: OpenCodeProviders): void {
    this.modelSelect.innerHTML = '';
    const connected = new Set(providers.connected ?? []);
    let added = 0;
    for (const prov of providers.all) {
      const isConnected = connected.has(prov.id);
      const models = Object.values(prov.models ?? {}).filter((m) => m.id);
      if (!models.length) continue;
      // Prefer connected providers; include the rest only if nothing is connected.
      if (!isConnected && connected.size > 0) continue;
      const group = document.createElement('optgroup');
      group.label = prov.name || prov.id;
      const preferred = providers.default?.[prov.id];
      for (const m of models) {
        const opt = document.createElement('option');
        opt.value = `${prov.id}\u0000${m.id}`;
        opt.textContent = m.name || m.id;
        if (m.id === preferred) opt.selected = true;
        group.appendChild(opt);
      }
      this.modelSelect.appendChild(group);
      added++;
    }
    if (!added) {
      const opt = document.createElement('option');
      opt.value = '\u0000';
      opt.textContent = 'Connect an API key to choose a model';
      this.modelSelect.appendChild(opt);
    }
  }

  private selectedModel(): { providerID: string; modelID: string } | null {
    const value = this.modelSelect.value;
    if (!value || value === '\u0000') return null;
    const [providerID, modelID] = value.split('\u0000');
    return { providerID, modelID };
  }

  private async newSession(): Promise<void> {
    this.session = null;
    this.messagesEl.innerHTML = '';
    this.pendingParts.clear();
    this.addBubble('assistant', 'New session. What should we do?');
  }

  private addBubble(role: 'user' | 'assistant', text?: string): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = `assistant-bubble ${role}`;
    const label = document.createElement('div');
    label.className = 'assistant-bubble-role';
    label.textContent = role === 'user' ? 'You' : 'opencode';
    const textEl = document.createElement('div');
    textEl.className = 'assistant-bubble-text';
    if (text) textEl.textContent = text;
    bubble.appendChild(label);
    bubble.appendChild(textEl);
    this.messagesEl.appendChild(bubble);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    return bubble;
  }

  private addNote(text: string): HTMLElement {
    const note = document.createElement('div');
    note.className = 'assistant-note';
    note.textContent = text;
    this.messagesEl.appendChild(note);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    return note;
  }

  private async ensureSession(): Promise<OpenCodeSession> {
    if (this.session) return this.session;
    const model = this.selectedModel();
    const session = await createSession(
      model ? { model: { id: model.modelID, providerID: model.providerID } } : undefined,
    );
    this.session = session;
    return session;
  }

  private async send(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.busy) return;
    if (!this.statusDot.classList.contains('ok')) {
      toast('opencode is not running.', 'error');
      void this.refresh();
      return;
    }
    this.inputEl.value = '';
    this.addBubble('user', text);
    const note = this.addNote('Syncing workspace…');

    this.busy = true;
    this.sendBtn.disabled = true;
    try {
      await syncWorkspaceToDisk(this.fs.root);
      const session = await this.ensureSession();
      const model = this.selectedModel();
      note.textContent = `Running on ${model ? model.modelID : 'default model'}…`;
      this.addBubble('assistant');
      await sendMessageAsync(
        session.id,
        text,
        model ?? undefined,
      );
      this.busy = false;
      this.sendBtn.disabled = false;
    } catch (err) {
      this.busy = false;
      this.sendBtn.disabled = false;
      this.addBubble('assistant', `Error: ${(err as Error).message}`);
    }
  }

  private async handleEvent(ev: OpenCodeEvent): Promise<void> {
    const sessionID = ev.properties?.sessionID;
    if (this.session && sessionID !== this.session.id) return;

    switch (ev.type) {
      case 'message.part.delta': {
        const field = ev.properties?.field;
        if (field !== 'text') return;
        const delta = ev.properties?.delta ?? '';
        const partID = ev.properties?.partID as string;
        if (!partID) return;
        const part = this.pendingParts.get(partID);
        if (part) {
          part.text += delta;
          if (part.textEl) part.textEl.textContent = part.text;
          this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
        break;
      }
      case 'message.part.updated': {
        const part = ev.properties?.part;
        if (!part || part.type !== 'text') break;
        const partID = part.id;
        const pending = this.pendingParts.get(partID);
        const text = (part.text as string) ?? '';
        if (pending) {
          pending.text = text;
          if (pending.textEl) pending.textEl.textContent = text;
        } else {
          // Attach the first text part to the last assistant bubble.
          const bubbles = this.messagesEl.querySelectorAll('.assistant-bubble.assistant');
          const last = bubbles[bubbles.length - 1] as HTMLElement | undefined;
          const textEl = last?.querySelector('.assistant-bubble-text') as HTMLElement | null;
          this.pendingParts.set(partID, { el: last ?? this.addBubble('assistant'), textEl, text });
          if (textEl) textEl.textContent = text;
        }
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        break;
      }
      case 'message.part.removed': {
        const partID = ev.properties?.part?.id as string;
        if (partID) this.pendingParts.delete(partID);
        break;
      }
      case 'session.status': {
        const type = ev.properties?.status?.type;
        if (type === 'idle') {
          await this.onTurnDone();
        }
        break;
      }
      case 'session.idle': {
        await this.onTurnDone();
        break;
      }
    }
  }

  private turnDoneFired = false;

  private async onTurnDone(): Promise<void> {
    if (this.turnDoneFired) return;
    this.turnDoneFired = true;
    try {
      const { root } = await readWorkspaceFromDisk();
      this.addNote('Applying file changes…');
      this.opts.onApplyRemoteRoot(root);
    } catch (err) {
      this.addBubble('assistant', `Could not pull changes: ${(err as Error).message}`);
    } finally {
      window.setTimeout(() => {
        this.turnDoneFired = false;
      }, 800);
    }
  }
}
