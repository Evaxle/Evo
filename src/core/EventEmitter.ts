type Handler<T> = (payload: T) => void;

/**
 * Minimal typed event emitter used across the whole app.
 */
export class EventEmitter<T = void> {
  private handlers = new Set<Handler<T>>();

  on(handler: Handler<T>): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  once(handler: Handler<T>): () => void {
    const off = this.on((payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  emit(payload: T): void {
    for (const handler of this.handlers) handler(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** Simple pub/sub registry with named channels. */
export class EventBus {
  private channels = new Map<string, EventEmitter<any>>();

  channel<T>(name: string): EventEmitter<T> {
    let ch = this.channels.get(name);
    if (!ch) {
      ch = new EventEmitter<T>();
      this.channels.set(name, ch);
    }
    return ch;
  }

  on<T>(name: string, handler: Handler<T>): () => void {
    return this.channel<T>(name).on(handler);
  }

  emit<T>(name: string, payload: T): void {
    this.channel<T>(name).emit(payload);
  }
}

export const bus = new EventBus();

/** Well-known event channel names. */
export const EV = {
  FS_CHANGED: 'fs.changed',
  TAB_OPENED: 'tabs.opened',
  TAB_CLOSED: 'tabs.closed',
  TAB_ACTIVATED: 'tabs.activated',
  TABS_CHANGED: 'tabs.changed',
  EXPLORER_REVEAL: 'explorer.reveal',
  ACTIVE_FILE_CHANGED: 'active.file.changed',
  DIRTY_CHANGED: 'dirty.changed',
  WORKSPACE_CHANGED: 'workspace.changed',
  SETTINGS_CHANGED: 'settings.changed',
  STATUS_UPDATED: 'status.updated',
  SIDEBAR_CHANGED: 'sidebar.changed',
} as const;
