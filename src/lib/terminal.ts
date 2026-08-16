/**
 * WebSocket client for the Evo terminal bridge.
 *
 * Connects to `/evo/terminal` on the same origin (proxied by the Vite dev
 * server or served directly by the standalone backend server). Each connection
 * maps to one PTY-backed shell on the server.
 *
 * Wire protocol:
 *   client -> server  binary frame = raw terminal input
 *   client -> server  text frame   = JSON control message
 *     { type: 'resize', cols, rows }
 *     { type: 'kill' }
 *   server -> client  binary/text frame = raw terminal output
 *   server -> client  text frame = JSON event
 *     { type: 'init', pid, shell, cwd }
 *     { type: 'exit', code }
 *     { type: 'error', message }
 */

export type TerminalStatus = 'connecting' | 'open' | 'closed' | 'error';

export interface TerminalInitInfo {
  pid?: number;
  shell: string;
  cwd: string;
}

export interface TerminalConnectionOptions {
  cols: number;
  rows: number;
  shell?: string;
  onData: (data: string) => void;
  onInit: (info: TerminalInitInfo) => void;
  onExit: (code: number | undefined) => void;
  onStatus: (status: TerminalStatus) => void;
}

export class TerminalConnection {
  status: TerminalStatus = 'connecting';
  private ws: WebSocket | null = null;
  private opts: TerminalConnectionOptions;
  private closed = false;

  constructor(opts: TerminalConnectionOptions) {
    this.opts = opts;
  }

  open(): void {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({
      cols: String(this.opts.cols),
      rows: String(this.opts.rows),
    });
    if (this.opts.shell) params.set('shell', this.opts.shell);
    const url = `${protocol}//${location.host}/evo/terminal?${params.toString()}`;

    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => this.setStatus('open');
    ws.onerror = () => this.setStatus('error');
    ws.onclose = () => {
      this.setStatus('closed');
      this.ws = null;
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        if (ev.data.startsWith('{')) {
          try {
            const msg = JSON.parse(ev.data) as {
              type?: string;
              pid?: number;
              shell?: string;
              cwd?: string;
              code?: number;
              message?: string;
            };
            if (msg.type === 'init') {
              this.opts.onInit({
                pid: msg.pid,
                shell: msg.shell ?? 'shell',
                cwd: msg.cwd ?? '',
              });
              return;
            }
            if (msg.type === 'exit') {
              this.opts.onExit(msg.code);
              this.dispose();
              return;
            }
            if (msg.type === 'error') {
              this.opts.onData(
                `\r\n\x1b[31m${msg.message ?? 'Terminal error'}\x1b[0m\r\n`,
              );
              return;
            }
          } catch {
            /* fall through to raw data */
          }
        }
        this.opts.onData(ev.data);
      } else {
        this.opts.onData(new TextDecoder().decode(ev.data as ArrayBuffer));
      }
    };
  }

  send(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(new TextEncoder().encode(data));
    }
  }

  resize(cols: number, rows: number): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  kill(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'kill' }));
    }
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private setStatus(status: TerminalStatus): void {
    this.status = status;
    this.opts.onStatus(status);
  }
}
