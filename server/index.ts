import http, { type IncomingMessage, type ServerResponse } from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { Bridge } from './bridge.js';

/**
 * Standalone Evo backend server.
 *
 * Serves the built frontend from `dist/` and runs the bridge (opencode proxy,
 * workspace sync and the PTY terminal WebSocket). This is what ships in the
 * Docker image so Evo works outside of the Vite dev server too.
 *
 * Ports & paths are fully configurable through environment variables:
 *
 *   EVO_PORT            main HTTP port                 (default 4000)
 *   EVO_HOST            bind host                      (default 0.0.0.0)
 *   EVO_OPENCODE_PORT   preferred opencode port        (default auto: 4096+)
 *   EVO_WORKSPACE_DIR   real dir backing the virtual FS (default os.tmpdir()/evo-opencode-workspace)
 *   EVO_SHELL           shell used for the terminal    (default $SHELL)
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const PORT = parseInt(process.env.EVO_PORT ?? '', 10) || 4000;
const HOST = process.env.EVO_HOST ?? '0.0.0.0';
const OPENCODE_PORT = parseInt(process.env.EVO_OPENCODE_PORT ?? '', 10) || 0;
const WORKSPACE_DIR =
  process.env.EVO_WORKSPACE_DIR ?? path.join(os.tmpdir(), 'evo-opencode-workspace');
const SHELL = process.env.EVO_SHELL ?? undefined;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.resolve(DIST_DIR, rel);

  // Prevent path traversal outside dist/.
  if (!filePath.startsWith(DIST_DIR + path.sep) && filePath !== DIST_DIR) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback: everything that isn't a real asset goes to index.html.
    filePath = path.join(DIST_DIR, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const cacheable =
    ext === '.js' || ext === '.css' || ext === '.woff' || ext === '.woff2';
  const headers: Record<string, string> = {
    'content-type': MIME[ext] ?? 'application/octet-stream',
  };
  if (cacheable) headers['cache-control'] = 'public, max-age=31536000, immutable';
  else headers['cache-control'] = 'no-cache';

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

async function main(): Promise<void> {
  const bridge = new Bridge({
    workspaceDir: WORKSPACE_DIR,
    opencodePort: OPENCODE_PORT,
    shell: SHELL,
    log: (msg) => console.log('[evo:server]', msg),
  });
  bridge.setPort(PORT);

  const server = http.createServer((req, res) => {
    void bridge.handleHttp(req, res).then((handled) => {
      if (!handled) serveStatic(req, res);
    });
  });
  bridge.installUpgradeHandler(server);

  server.listen(PORT, HOST, () => {
    console.log('');
    console.log(`  Evo server listening on http://${HOST}:${PORT}`);
    console.log(`  Workspace dir:  ${WORKSPACE_DIR}`);
    console.log(`  Shell:          ${bridge.getStatus().shell}`);
    console.log('');
  });

  // Start opencode in the background; the bridge reports 503 via /evo/status
  // until it becomes healthy. The HTTP server is up immediately.
  void bridge.start().then(() => {
    const s = bridge.getStatus();
    if (s.opencodePort) {
      console.log(`[evo:server] opencode ready on http://127.0.0.1:${s.opencodePort} (v${s.version ?? '?'})`);
    }
  });

  const shutdown = (signal: string) => {
    console.log(`\n[evo:server] ${signal} received, shutting down…`);
    server.close();
    void bridge.stop().finally(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main().catch((err) => {
  console.error('[evo:server] fatal:', err);
  process.exit(1);
});
