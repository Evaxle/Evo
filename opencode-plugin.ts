import type { Plugin, ViteDevServer } from 'vite';
import { Bridge } from './server/bridge';

/**
 * Evo <-> opencode bridge for the Vite dev server.
 *
 * Reuses the shared Bridge (server/bridge.ts) so `npm run dev` behaves exactly
 * like the standalone production server: it spawns `opencode serve` on a free
 * port, proxies `/opencode/*`, exposes `/evo/*` for workspace sync and serves
 * the PTY terminal over `/evo/terminal`.
 */

export interface OpenCodePluginOptions {
  /** Preferred opencode port; defaults to the next free port >= 4096. */
  opencodePort?: number;
}

export function opencodePlugin(opts: OpenCodePluginOptions = {}): Plugin {
  const bridge = new Bridge({ opencodePort: opts.opencodePort ?? 0 });

  function install(server: ViteDevServer): void {
    void bridge.start();
    if (server.httpServer) bridge.installUpgradeHandler(server.httpServer);
    server.middlewares.use((req, res, next) => {
      void bridge.handleHttp(req, res).then((handled) => {
        if (!handled) next();
      });
    });
  }

  return {
    name: 'evo-opencode',
    config() {
      return { server: { host: true } };
    },
    configureServer(server) {
      install(server);
      server.httpServer?.on('close', () => void bridge.stop());
    },
    configurePreviewServer(server) {
      install(server);
      server.httpServer?.on('close', () => void bridge.stop());
    },
    closeBundle() {
      void bridge.stop();
    },
  };
}
