/**
 * A tiny command registry with a VSCode-style command palette.
 * Any UI action can be registered as a command and triggered
 * from the palette, keyboard shortcuts or context menus.
 */
export interface Command {
  id: string;
  title: string;
  category?: string;
  keybinding?: string;
  when?: () => boolean;
  run: (args?: any) => void | Promise<void>;
}

class CommandRegistry {
  private commands = new Map<string, Command>();

  register(cmd: Command): void {
    this.commands.set(cmd.id, cmd);
  }

  unregister(id: string): void {
    this.commands.delete(id);
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  all(): Command[] {
    return [...this.commands.values()].sort((a, b) =>
      a.title.localeCompare(b.title),
    );
  }

  async execute(id: string, args?: any): Promise<void> {
    const cmd = this.commands.get(id);
    if (!cmd) {
      console.warn(`Unknown command: ${id}`);
      return;
    }
    try {
      await cmd.run(args);
    } catch (err) {
      console.error(`Command "${id}" failed:`, err);
    }
  }

  getKeybinding(id: string): string | undefined {
    return this.commands.get(id)?.keybinding;
  }
}

export const commands = new CommandRegistry();
