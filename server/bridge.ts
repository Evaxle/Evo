import { spawn, type ChildProcess } from 'child_process';
import http, { type IncomingMessage, type ServerResponse } from 'http';
import net from 'net';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { createRequire } from 'module';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';

/**
 * Shared Evo backend bridge.
 *
 * Used by both the Vite dev plugin and the standalone production server. It
 * owns:
 *
 *   - Port setup: resolves a free port for `opencode serve` (configurable via
 *     `opencodePort`, falling back to the next free port) and reports the main
 *     server port through `/evo/status`.
 *   - The opencode process lifecycle + a same-origin proxy for `/opencode/*`.
 *   - The workspace materialization endpoints `/evo/fs/*` so Evo's virtual FS
 *     can be synced to disk before a turn and read back afterwards.
 *   - A full terminal over WebSocket (`/evo/terminal`): each connection spawns
 *     a real PTY (via node-pty) shell inside the workspace dir.
 */

export interface FSNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children: FSNode[];
  content: string;
  language: string;
  external: boolean;
}

export interface BridgeStatus {
  running: boolean;
  /** Main server port the browser connects to (set by the consumer). */
  port?: number;
  /** Port the opencode serve process is listening on. */
  opencodePort?: number;
  version?: string;
  workspaceDir?: string;
  shell?: string;
  terminal: boolean;
  error?: string;
}

export interface BridgeOptions {
  /** Real directory on disk that mirrors Evo's virtual FS. */
  workspaceDir?: string;
  /** Preferred opencode port; 0/undefined picks the next free port >= 4096. */
  opencodePort?: number;
  /** Extra CORS origins passed to `opencode serve`. */
  cors?: string[];
  shell?: string;
  /** Set false to skip spawning opencode (headless fs/terminal only). */
  startOpenCode?: boolean;
  log?: (msg: string) => void;
}

const DEFAULT_OPENCODE_PORT = 4096;

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(true));
    srv.once('listening', () => {
      srv.close(() => resolve(false));
    });
    srv.listen(port, '127.0.0.1');
  });
}

function findFreePort(start: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        srv.close(() => findFreePort(start + 1).then(resolve, reject));
      } else {
        reject(err);
      }
    });
    srv.listen(start, '127.0.0.1', () => {
      const address = srv.address() as net.AddressInfo;
      const port = address.port;
      srv.close(() => resolve(port));
    });
  });
}

async function resolveOpenCodePort(preferred: number): Promise<number> {
  if (preferred > 0 && !(await isPortInUse(preferred))) return preferred;
  return findFreePort(preferred > 0 ? preferred + 1 : DEFAULT_OPENCODE_PORT);
}

function healthCheck(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: '127.0.0.1', port, path: '/global/health', timeout: 2000 },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(!!JSON.parse(body).healthy);
          } catch {
            resolve(false);
          }
        });
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function getVersion(port: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: '127.0.0.1', port, path: '/global/health', timeout: 2000 },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body).version);
          } catch {
            resolve(undefined);
          }
        });
      },
    );
    req.on('error', () => resolve(undefined));
    req.on('timeout', () => {
      req.destroy();
      resolve(undefined);
    });
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function writeTree(dir: string, node: FSNode): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const child of node.children ?? []) {
    const childPath = path.join(dir, child.name);
    if (child.type === 'folder') {
      writeTree(childPath, child);
    } else {
      fs.writeFileSync(childPath, child.content ?? '');
    }
  }
}

function readTree(dir: string, name: string): FSNode {
  let idCounter = 0;
  const walk = (d: string, n: string): FSNode => {
    const children: FSNode[] = [];
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        children.push(walk(full, entry.name));
      } else if (entry.isFile()) {
        children.push({
          id: `oc-${++idCounter}`,
          name: entry.name,
          type: 'file',
          children: [],
          content: fs.readFileSync(full, 'utf-8'),
          language: 'plaintext',
          external: false,
        });
      }
    }
    return {
      id: `oc-${++idCounter}`,
      name: n,
      type: 'folder',
      children,
      content: '',
      language: 'plaintext',
      external: false,
    };
  };
  return walk(dir, name);
}

function sendJson(res: ServerResponse, code: number, data: unknown): void {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ---- PTY backends ----------------------------------------------------------
// Primary: node-pty (native, real resize). Fallback: `script` (util-linux,
// ships everywhere; resize is emulated with `stty`), so a terminal still works
// on hosts where the native module can't build (e.g. Alpine/musl).

interface PtyInstance {
  pid: number;
  name: string;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (info: { exitCode: number }) => void): void;
}

interface PtySpawnOptions {
  cols: number;
  rows: number;
  cwd: string;
  env: NodeJS.ProcessEnv;
}

interface PtyBackend {
  name: string;
  spawn(shell: string, opts: PtySpawnOptions): PtyInstance;
}

function makeNodePtyBackend(): PtyBackend | null {
  try {
    const nodeRequire = createRequire(import.meta.url);
    const mod = nodeRequire('node-pty') as typeof import('node-pty');
    return {
      name: 'node-pty',
      spawn(shell, opts) {
        const term = mod.spawn(shell, [], {
          name: 'xterm-256color',
          cols: opts.cols,
          rows: opts.rows,
          cwd: opts.cwd,
          env: opts.env,
        });
        return {
          pid: term.pid,
          name: 'node-pty',
          write: (d) => term.write(d),
          resize: (c, r) => term.resize(c, r),
          kill: () => term.kill(),
          onData: (cb) => term.onData(cb),
          onExit: (cb) => term.onExit((e) => cb({ exitCode: e.exitCode })),
        };
      },
    };
  } catch {
    return null;
  }
}

function makeScriptPtyBackend(): PtyBackend {
  return {
    name: 'script',
    spawn(shell, opts) {
      const child = spawn(
        'script',
        ['-qefc', shell, '/dev/null'],
        {
          cwd: opts.cwd,
          env: { ...opts.env, TERM: 'xterm-256color' },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      let exited = false;
      return {
        pid: child.pid ?? -1,
        name: 'script',
        write: (d) => child.stdin?.write(d),
        resize: (cols, rows) => child.stdin?.write(`stty rows ${rows} cols ${cols}\n`),
        kill: () => child.kill(),
        onData: (cb) => child.stdout?.on('data', (d: Buffer) => cb(String(d))),
        onExit: (cb) => {
          child.on('exit', (code) => {
            exited = true;
            cb({ exitCode: code ?? 0 });
          });
          child.on('error', () => {
            if (!exited) cb({ exitCode: 1 });
          });
        },
      };
    },
  };
}

export class Bridge {
  readonly workspaceDir: string;
  readonly shell: string;
  private opencodePort: number;
  private cors: string[];
  private startOpenCode: boolean;
  private log: (msg: string) => void;

  private child: ChildProcess | null = null;
  private ocStatus: {
    running: boolean;
    port?: number;
    version?: string;
    error?: string;
  } = { running: false };
  private mainPort: number | undefined;

  private wss: WebSocketServer | null = null;
  private terminals = new Map<WebSocket, PtyInstance>();
  private ptyBackend: PtyBackend | null = null;

  constructor(opts: BridgeOptions = {}) {
    this.workspaceDir =
      opts.workspaceDir ?? path.join(os.tmpdir(), 'evo-opencode-workspace');
    this.opencodePort = opts.opencodePort ?? 0;
    this.cors = opts.cors ?? [];
    this.shell =
      opts.shell ??
      process.env.SHELL ??
      (process.platform === 'win32' ? 'cmd.exe' : '/bin/bash');
    this.startOpenCode = opts.startOpenCode ?? true;
    this.log = opts.log ?? ((msg) => console.log('[evo:bridge]', msg));
  }

  getStatus(): BridgeStatus {
    return {
      running: this.ocStatus.running,
      port: this.mainPort,
      opencodePort: this.ocStatus.port,
      version: this.ocStatus.version,
      workspaceDir: this.workspaceDir,
      shell: this.shell,
      terminal: this.wss !== null,
      error: this.ocStatus.error,
    };
  }

  /** Set the main server port (reported in /evo/status). */
  setPort(port: number): void {
    this.mainPort = port;
  }

  async start(): Promise<void> {
    fs.mkdirSync(this.workspaceDir, { recursive: true });
    if (!this.startOpenCode) {
      this.log(`bridge ready (no opencode) · workspace ${this.workspaceDir}`);
      return;
    }
    try {
      const port = await resolveOpenCodePort(this.opencodePort);
      this.opencodePort = port;
      const args = ['serve', '--port', String(port), '--hostname', '127.0.0.1'];
      for (const origin of this.cors) {
        args.push('--cors', origin);
      }
      this.child = spawn('opencode', args, {
        cwd: this.workspaceDir,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child.stdout?.on('data', (d: Buffer) => {
        const line = String(d).trim();
        if (line) this.log(line);
      });
      this.child.stderr?.on('data', (d: Buffer) => {
        const line = String(d).trim();
        if (line) console.error('[evo:bridge]', line);
      });
      this.child.on('exit', (code) => {
        this.child = null;
        this.ocStatus = {
          running: false,
          port: code ? this.ocStatus.port : undefined,
          error: code ? `opencode exited with code ${code}` : undefined,
        };
      });

      for (let i = 0; i < 40; i++) {
        if (await healthCheck(port)) {
          this.ocStatus = {
            running: true,
            port,
            version: await getVersion(port),
          };
          this.log(`opencode server ready on http://127.0.0.1:${port}`);
          return;
        }
        await sleep(250);
      }
      this.ocStatus = {
        running: false,
        port: this.ocStatus.port,
        error: 'opencode server did not become healthy',
      };
    } catch (err) {
      this.ocStatus = {
        running: false,
        port: this.ocStatus.port,
        error: String((err as Error)?.message ?? err),
      };
      console.error('[evo:bridge] failed to start opencode:', err);
    }
  }

  async stop(): Promise<void> {
    for (const [ws, term] of this.terminals) {
      try {
        term.kill();
      } catch {
        /* ignore */
      }
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    this.terminals.clear();
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    this.ocStatus = { running: false };
  }

  /** true if this request was handled by the bridge. */
  async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = req.url ?? '/';
    if (url.startsWith('/opencode/')) {
      if (!this.ocStatus.running || !this.ocStatus.port) {
        sendJson(res, 503, {
          error: 'opencode is not running',
          status: this.getStatus(),
          hint: 'Install opencode (`curl -fsSL https://opencode.ai/install | bash`) and restart.',
        });
        return true;
      }
      req.url = url.slice('/opencode'.length) || '/';
      this.forward(req, res, '127.0.0.1', this.ocStatus.port);
      return true;
    }

    if (url.startsWith('/evo/')) {
      await this.handleEvo(req, res, url);
      return true;
    }

    return false;
  }

  private forward(
    req: IncomingMessage,
    res: ServerResponse,
    hostname: string,
    port: number,
  ): void {
    const targetPath = req.url ?? '/';
    const proxyReq = http.request(
      {
        hostname,
        port,
        path: targetPath,
        method: req.method,
        headers: { ...req.headers, host: `${hostname}:${port}` },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        sendJson(res, 502, {
          error: 'opencode server unavailable',
          detail: String(err),
        });
      } else {
        res.end();
      }
    });
    req.pipe(proxyReq);
  }

  private async handleEvo(
    req: IncomingMessage,
    res: ServerResponse,
    url: string,
  ): Promise<void> {
    const pathname = url.split('?')[0] ?? '/';

    if (pathname === '/evo/status') {
      sendJson(res, 200, this.getStatus());
      return;
    }

    if (pathname === '/evo/fs/sync' && req.method === 'POST') {
      try {
        const raw = await readBody(req);
        const { root } = JSON.parse(raw) as { root?: FSNode };
        if (!root) throw new Error('missing root');
        fs.rmSync(this.workspaceDir, { recursive: true, force: true });
        writeTree(this.workspaceDir, root);
        sendJson(res, 200, { ok: true, dir: this.workspaceDir });
      } catch (err) {
        sendJson(res, 400, {
          error: String((err as Error)?.message ?? err),
        });
      }
      return;
    }

    if (pathname === '/evo/fs/read' && req.method === 'GET') {
      try {
        if (!fs.existsSync(this.workspaceDir)) {
          fs.mkdirSync(this.workspaceDir, { recursive: true });
        }
        const root = readTree(this.workspaceDir, path.basename(this.workspaceDir));
        sendJson(res, 200, { root });
      } catch (err) {
        sendJson(res, 500, {
          error: String((err as Error)?.message ?? err),
        });
      }
      return;
    }

    sendJson(res, 404, { error: 'unknown /evo endpoint' });
  }

  // ---- Terminal (WebSocket) ---------------------------------------------

  /**
   * Attach an upgrade listener to an http.Server (or Vite's httpServer).
   * Connections to `/evo/terminal` become PTY-backed terminal sessions;
   * every other path is left untouched so coexisting WebSockets (e.g. Vite
   * HMR) keep working.
   */
  installUpgradeHandler(server: http.Server): void {
    if (!this.wss) {
      this.wss = new WebSocketServer({ noServer: true });
      this.wss.on('connection', (ws, req) => this.onTerminalConnection(ws, req));
    }
    server.on('upgrade', (req, socket, head) => {
      if (req.url?.startsWith('/evo/terminal')) {
        this.wss?.handleUpgrade(req, socket, head, (ws) => {
          this.wss?.emit('connection', ws, req);
        });
      }
    });
  }

  private onTerminalConnection(ws: WebSocket, req: IncomingMessage): void {
    const params = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      .searchParams;
    const cols = Math.min(500, Math.max(2, parseInt(params.get('cols') ?? '80', 10) || 80));
    const rows = Math.min(200, Math.max(2, parseInt(params.get('rows') ?? '24', 10) || 24));
    const shell = params.get('shell') || this.shell;
    const cwd = this.workspaceDir;

    if (!this.ptyBackend) {
      this.ptyBackend =
        makeNodePtyBackend() ??
        (process.platform === 'win32' ? null : makeScriptPtyBackend());
      if (this.ptyBackend) {
        this.log(`terminal backend: ${this.ptyBackend.name}`);
      }
    }

    if (!this.ptyBackend) {
      ws.send(
        JSON.stringify({
          type: 'error',
          message:
            'No terminal backend available. Install node-pty or util-linux `script`.',
        }),
      );
      ws.close();
      return;
    }

    let term: PtyInstance;
    try {
      term = this.ptyBackend.spawn(shell, {
        cols,
        rows,
        cwd,
        env: { ...process.env, TERM: 'xterm-256color' },
      });
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: 'error',
          message: `Failed to launch shell "${shell}": ${(err as Error).message}`,
        }),
      );
      ws.close();
      return;
    }

    this.terminals.set(ws, term);
    this.log(`terminal session started (${term.name}) shell=${shell} cwd=${cwd}`);

    ws.send(
      JSON.stringify({
        type: 'init',
        pid: term.pid,
        shell,
        cwd,
      }),
    );

    term.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });
    term.onExit(({ exitCode }) => {
      this.terminals.delete(ws);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
        ws.close();
      }
    });

    ws.on('message', (data: RawData, isBinary: boolean) => {
      const active = this.terminals.get(ws);
      if (!active) return;
      if (isBinary) {
        active.write(data.toString('utf8'));
        return;
      }
      const text = data.toString('utf8');
      try {
        const msg = JSON.parse(text) as {
          type?: string;
          data?: string;
          cols?: number;
          rows?: number;
        };
        if (msg.type === 'resize') {
          active.resize(
            Math.min(500, Math.max(2, msg.cols ?? cols)),
            Math.min(200, Math.max(2, msg.rows ?? rows)),
          );
        } else if (msg.type === 'input') {
          active.write(msg.data ?? '');
        } else if (msg.type === 'kill') {
          active.kill();
        } else {
          active.write(text);
        }
      } catch {
        active.write(text);
      }
    });

    ws.on('close', () => {
      const active = this.terminals.get(ws);
      if (active) {
        this.terminals.delete(ws);
        try {
          active.kill();
        } catch {
          /* ignore */
        }
      }
    });
    ws.on('error', () => {
      const active = this.terminals.get(ws);
      if (active) {
        this.terminals.delete(ws);
        try {
          active.kill();
        } catch {
          /* ignore */
        }
      }
    });
  }
}
