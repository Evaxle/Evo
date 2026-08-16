import { EventEmitter } from './EventEmitter';
import { storage } from './storage';
import type { AppSettings } from './types';

export const defaultSettings: AppSettings = {
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace",
  wordWrap: 'off',
  tabSize: 4,
  theme: 'dark',
  autosave: true,
  autosaveDelay: 1000,
  minimap: true,
  renderWhitespace: 'none',
  lineNumbers: 'on',
  openAiKey: '',
  fontLigatures: true,
};

export class SettingsStore {
  settings: AppSettings = { ...defaultSettings };
  changed = new EventEmitter<AppSettings>();

  async init(): Promise<void> {
    const saved = await storage.loadSettings();
    if (saved) this.settings = { ...defaultSettings, ...saved };
    this.changed.emit(this.settings);
  }

  update(patch: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...patch };
    storage.saveSettings(this.settings);
    this.changed.emit(this.settings);
  }

  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key];
  }
}
