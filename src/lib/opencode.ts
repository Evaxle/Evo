import type { FSNode } from '../core/types';

/**
 * Types matching the opencode HTTP server (opencode serve).
 * See https://opencode.ai/docs/server for the full spec.
 */

export interface OpenCodeStatus {
  running: boolean;
  port?: number;
  version?: string;
  error?: string;
}

export interface OpenCodeSession {
  id: string;
  slug?: string;
  directory?: string;
  title?: string;
  agent?: string;
  model?: { id: string; providerID: string; variant?: string };
  time?: { created: number; updated: number };
}

export interface OpenCodePart {
  id: string;
  type: string;
  text?: string;
  state?: unknown;
  tool?: string;
  callID?: string;
  [key: string]: unknown;
}

export interface OpenCodeMessage {
  info: {
    id: string;
    role: 'user' | 'assistant';
    sessionID: string;
    [key: string]: unknown;
  };
  parts: OpenCodePart[];
}

export interface OpenCodeEvent {
  id: string;
  type: string;
  properties: {
    sessionID?: string;
    messageID?: string;
    part?: OpenCodePart;
    delta?: string;
    field?: string;
    status?: { type: string };
    [key: string]: unknown;
  };
}

export interface ProviderModel {
  id: string;
  providerID: string;
  name?: string;
  [key: string]: unknown;
}

export interface OpenCodeProvider {
  id: string;
  name: string;
  source?: string;
  models: Record<string, ProviderModel>;
  [key: string]: unknown;
}

export interface OpenCodeProviders {
  all: OpenCodeProvider[];
  default: Record<string, string>;
  connected: string[];
}

export interface ProviderAuthMethod {
  type: 'oauth' | 'api' | 'wellknown';
  label: string;
  prompts?: Array<{ type: string; key: string; message?: string }>;
}

// ---- Bridge helpers --------------------------------------------------------

async function bridge(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = (body as { error?: string })?.error ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `opencode bridge request failed (${res.status})`);
  }
  return res;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await bridge(path, init);
  return (await res.json()) as T;
}

// ---- Status / lifecycle ----------------------------------------------------

export function getOpenCodeStatus(): Promise<OpenCodeStatus> {
  return json('/evo/status');
}

/** Materialize Evo's virtual FS to the real workspace dir opencode edits. */
export function syncWorkspaceToDisk(root: FSNode): Promise<{ ok: boolean; dir: string }> {
  return json('/evo/fs/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root }),
  });
}

/** Read the real workspace dir back into an FSNode tree after a turn. */
export function readWorkspaceFromDisk(): Promise<{ root: FSNode }> {
  return json('/evo/fs/read');
}

// ---- opencode server API ---------------------------------------------------

export function ocHealth(): Promise<{ healthy: boolean; version: string }> {
  return json('/opencode/global/health');
}

export function listProviders(): Promise<OpenCodeProviders> {
  return json('/opencode/provider');
}

export function listProviderAuthMethods(): Promise<Record<string, ProviderAuthMethod[]>> {
  return json('/opencode/provider/auth');
}

/** Save an API key for a provider (type: api). */
export function setProviderApiKey(providerID: string, key: string): Promise<boolean> {
  return json(`/opencode/auth/${providerID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'api', key }),
  });
}

export function removeProviderAuth(providerID: string): Promise<boolean> {
  return json(`/opencode/auth/${providerID}`, { method: 'DELETE' });
}

export function createSession(body?: {
  title?: string;
  model?: { id: string; providerID: string };
}): Promise<OpenCodeSession> {
  return json('/opencode/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

export function listSessions(): Promise<OpenCodeSession[]> {
  return json('/opencode/session');
}

export function getSession(id: string): Promise<OpenCodeSession> {
  return json(`/opencode/session/${id}`);
}

/** Send a message and wait for the full response. */
export function sendMessage(
  sessionID: string,
  text: string,
  model?: { providerID: string; modelID: string },
): Promise<OpenCodeMessage> {
  return json(`/opencode/session/${sessionID}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parts: [{ type: 'text', text }],
      ...(model ? { model } : {}),
    }),
  });
}

/** Send a message without waiting; watch the /event stream instead. */
export async function sendMessageAsync(
  sessionID: string,
  text: string,
  model?: { providerID: string; modelID: string },
): Promise<void> {
  await bridge(`/opencode/session/${sessionID}/prompt_async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parts: [{ type: 'text', text }],
      ...(model ? { model } : {}),
    }),
  });
}

export function listMessages(sessionID: string): Promise<OpenCodeMessage[]> {
  return json(`/opencode/session/${sessionID}/message`);
}

/**
 * Open the server-sent event stream and call `onEvent` for every parsed event.
 * Returns an abort function.
 */
export function subscribeToEvents(
  onEvent: (ev: OpenCodeEvent) => void,
  signal?: AbortSignal,
): () => void {
  const controller = new AbortController();
  const aborted = signal ?? controller.signal;

  void (async () => {
    try {
      const res = await fetch('/opencode/event', { signal: aborted });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const block of parts) {
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              onEvent(JSON.parse(line.slice(6)) as OpenCodeEvent);
            } catch {
              /* ignore malformed event */
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('opencode event stream closed:', err);
      }
    }
  })();

  return () => controller.abort();
}
