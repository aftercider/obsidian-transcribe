// Obsidian API のモック

export class Plugin {
  app: App;
  manifest: PluginManifest;

  constructor(app: App, manifest: PluginManifest) {
    this.app = app;
    this.manifest = manifest;
  }

  async loadData(): Promise<unknown> {
    return {};
  }

  async saveData(_data: unknown): Promise<void> {
    // no-op
  }

  addCommand(_command: Command): Command {
    return _command;
  }

  addRibbonIcon(_icon: string, _title: string, _callback: () => void): HTMLElement {
    return document.createElement('div');
  }

  addSettingTab(_settingTab: PluginSettingTab): void {
    // no-op
  }

  addStatusBarItem(): HTMLElement {
    return document.createElement('div');
  }

  registerEvent(_eventRef: EventRef): void {
    // no-op
  }
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }

  display(): void {
    // no-op
  }

  hide(): void {
    // no-op
  }
}

export class Modal {
  app: App;
  contentEl: HTMLElement;
  modalEl: HTMLElement;

  constructor(app: App) {
    this.app = app;
    this.contentEl = document.createElement('div');
    this.modalEl = document.createElement('div');
  }

  open(): void {
    // no-op
  }

  close(): void {
    // no-op
  }

  onOpen(): void {
    // no-op
  }

  onClose(): void {
    // no-op
  }
}

export class Notice {
  constructor(_message: string, _timeout?: number) {
    // no-op
  }

  hide(): void {
    // no-op
  }
}

export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(_containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
    this.infoEl = document.createElement('div');
    this.nameEl = document.createElement('div');
    this.descEl = document.createElement('div');
    this.controlEl = document.createElement('div');
  }

  setName(_name: string): this {
    return this;
  }

  setDesc(_desc: string): this {
    return this;
  }

  addText(_callback: (text: TextComponent) => void): this {
    return this;
  }

  addTextArea(_callback: (text: TextAreaComponent) => void): this {
    return this;
  }

  addDropdown(_callback: (dropdown: DropdownComponent) => void): this {
    return this;
  }

  addSlider(_callback: (slider: SliderComponent) => void): this {
    return this;
  }

  addButton(_callback: (button: ButtonComponent) => void): this {
    return this;
  }

  addToggle(_callback: (toggle: ToggleComponent) => void): this {
    return this;
  }
}

export class TextComponent {
  inputEl: HTMLInputElement;
  private value = '';

  constructor(_containerEl: HTMLElement) {
    this.inputEl = document.createElement('input');
  }

  setValue(value: string): this {
    this.value = value;
    return this;
  }

  getValue(): string {
    return this.value;
  }

  setPlaceholder(_placeholder: string): this {
    return this;
  }

  onChange(_callback: (value: string) => void): this {
    return this;
  }
}

export class TextAreaComponent {
  inputEl: HTMLTextAreaElement;
  private value = '';

  constructor(_containerEl: HTMLElement) {
    this.inputEl = document.createElement('textarea');
  }

  setValue(value: string): this {
    this.value = value;
    return this;
  }

  getValue(): string {
    return this.value;
  }

  setPlaceholder(_placeholder: string): this {
    return this;
  }

  onChange(_callback: (value: string) => void): this {
    return this;
  }
}

export class DropdownComponent {
  selectEl: HTMLSelectElement;
  private value = '';

  constructor(_containerEl: HTMLElement) {
    this.selectEl = document.createElement('select');
  }

  setValue(value: string): this {
    this.value = value;
    return this;
  }

  getValue(): string {
    return this.value;
  }

  addOption(_value: string, _display: string): this {
    return this;
  }

  addOptions(_options: Record<string, string>): this {
    return this;
  }

  onChange(_callback: (value: string) => void): this {
    return this;
  }
}

export class SliderComponent {
  sliderEl: HTMLInputElement;
  private value = 0;

  constructor(_containerEl: HTMLElement) {
    this.sliderEl = document.createElement('input');
    this.sliderEl.type = 'range';
  }

  setValue(value: number): this {
    this.value = value;
    return this;
  }

  getValue(): number {
    return this.value;
  }

  setLimits(_min: number, _max: number, _step: number): this {
    return this;
  }

  setDynamicTooltip(): this {
    return this;
  }

  onChange(_callback: (value: number) => void): this {
    return this;
  }
}

export class ButtonComponent {
  buttonEl: HTMLButtonElement;

  constructor(_containerEl: HTMLElement) {
    this.buttonEl = document.createElement('button');
  }

  setButtonText(_text: string): this {
    return this;
  }

  setCta(): this {
    return this;
  }

  setWarning(): this {
    return this;
  }

  onClick(_callback: () => void): this {
    return this;
  }

  setDisabled(_disabled: boolean): this {
    return this;
  }
}

export class ToggleComponent {
  toggleEl: HTMLElement;
  private value = false;

  constructor(_containerEl: HTMLElement) {
    this.toggleEl = document.createElement('div');
  }

  setValue(value: boolean): this {
    this.value = value;
    return this;
  }

  getValue(): boolean {
    return this.value;
  }

  onChange(_callback: (value: boolean) => void): this {
    return this;
  }
}

export interface App {
  vault: Vault;
  workspace: Workspace;
}

export interface Vault {
  adapter: DataAdapter;
  create(path: string, data: string): Promise<TFile>;
  createBinary(path: string, data: ArrayBuffer): Promise<TFile>;
  createFolder(path: string): Promise<void>;
  read(file: TFile): Promise<string>;
  readBinary(file: TFile): Promise<ArrayBuffer>;
  modify(file: TFile, data: string): Promise<void>;
  delete(file: TFile): Promise<void>;
  getAbstractFileByPath(path: string): TAbstractFile | null;
  getFiles(): TFile[];
}

export interface DataAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

export interface Workspace {
  getActiveFile(): TFile | null;
  openLinkText(linkText: string, sourcePath: string): Promise<void>;
}

export interface TAbstractFile {
  name: string;
  path: string;
  vault: Vault;
  parent: TFolder | null;
}

export interface TFile extends TAbstractFile {
  basename: string;
  extension: string;
  stat: FileStats;
}

export interface TFolder extends TAbstractFile {
  children: TAbstractFile[];
  isRoot(): boolean;
}

export interface FileStats {
  ctime: number;
  mtime: number;
  size: number;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  author: string;
  authorUrl?: string;
  isDesktopOnly?: boolean;
}

export interface Command {
  id: string;
  name: string;
  callback?: () => void;
  checkCallback?: (checking: boolean) => boolean | void;
  editorCallback?: (editor: Editor, view: MarkdownView) => void;
  editorCheckCallback?: (checking: boolean, editor: Editor, view: MarkdownView) => boolean | void;
  hotkeys?: Hotkey[];
}

export interface Hotkey {
  modifiers: string[];
  key: string;
}

export interface Editor {
  getValue(): string;
  setValue(content: string): void;
  replaceSelection(replacement: string): void;
  getCursor(): EditorPosition;
  setCursor(pos: EditorPosition): void;
}

export interface EditorPosition {
  line: number;
  ch: number;
}

export interface MarkdownView {
  editor: Editor;
  file: TFile | null;
}

export interface EventRef {
  // イベント参照
}

export interface Menu {
  addItem(callback: (item: MenuItem) => void): this;
  showAtMouseEvent(event: MouseEvent): void;
}

export interface MenuItem {
  setTitle(title: string): this;
  setIcon(icon: string): this;
  onClick(callback: () => void): this;
}

export function normalizePath(path: string): string {
  // パスの正規化
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

// moment互換
export function moment(date?: Date | string | number): {
  format: (formatStr: string) => string;
  toISOString: () => string;
} {
  const d = date ? new Date(date) : new Date();
  return {
    format: (formatStr: string) => {
      const pad = (n: number): string => n.toString().padStart(2, '0');
      return formatStr
        .replace('YYYY', d.getFullYear().toString())
        .replace('MM', pad(d.getMonth() + 1))
        .replace('DD', pad(d.getDate()))
        .replace('HH', pad(d.getHours()))
        .replace('mm', pad(d.getMinutes()))
        .replace('ss', pad(d.getSeconds()));
    },
    toISOString: () => d.toISOString()
  };
}

// Obsidianの言語取得
let mockLocale = 'en';

export function setMockLocale(locale: string): void {
  mockLocale = locale;
}

// moment.locale() の代替
export function getLocale(): string {
  return mockLocale;
}
