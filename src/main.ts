// Whisper Transcribe - Obsidian プラグイン
// 音声録音・文字起こしプラグイン

import { Plugin, Notice, TFile, Menu, EventRef } from 'obsidian';
import { SettingsTab, DEFAULT_SETTINGS, type PluginSettings } from './settings';
import { TranscriptionService, type TranscriptionConfig, type TranscriptionProgress } from './api';
import { StorageService, type StorageConfig } from './storage';
import { AudioRecorder } from './recorder';
import { RecorderModal, type ModalState } from './ui/RecorderModal';
import { t } from './i18n';

/**
 * 保持中の録音状態
 */
interface ActiveRecording {
  recorder: AudioRecorder;
  state: ModalState;
  duration: number;
}

/**
 * Whisper Transcribe プラグインクラス
 */
export default class WhisperTranscribePlugin extends Plugin {
  settings!: PluginSettings;
  private transcriptionService!: TranscriptionService;
  private storageService!: StorageService;
  private recorder: AudioRecorder | null = null;
  private statusBarItem: HTMLElement | null = null;
  private activeRecording: ActiveRecording | null = null;

  async onload(): Promise<void> {
    console.log('Whisper Transcribe: Loading plugin');

    // 設定を読み込む
    await this.loadSettings();

    // サービスを初期化
    this.initServices();

    // 設定タブを追加
    this.addSettingTab(new SettingsTab(this.app, this));

    // コマンドを追加
    this.addCommands();

    // リボンアイコンを追加
    this.addRibbonIcon('microphone', t('command.openRecorder'), () => {
      this.openRecorderModal();
    });

    // ステータスバーアイテムを追加
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.addClass('mod-clickable');
    this.statusBarItem.addEventListener('click', () => {
      // 録音中ならモーダルを再表示
      if (this.activeRecording) {
        this.openRecorderModal();
      }
    });

    // ファイルメニューを登録
    this.registerFileMenu();

    console.log('Whisper Transcribe: Plugin loaded');
  }

  onunload(): void {
    console.log('Whisper Transcribe: Unloading plugin');
    
    // 録音中の場合はキャンセル
    if (this.recorder) {
      this.recorder.cancel();
      this.recorder = null;
    }
  }

  /**
   * 設定を読み込む
   */
  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  /**
   * 設定を保存
   */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.updateServices();
  }

  /**
   * サービスを初期化
   */
  private initServices(): void {
    // TranscriptionService を初期化
    const transcriptionConfig: TranscriptionConfig = {
      apiKey: this.settings.apiKey,
      apiUrl: this.settings.apiUrl,
      model: this.settings.model,
      language: this.settings.language,
      timeout: this.settings.timeout * 1000, // 秒→ミリ秒
      temperature: this.settings.temperature,
      initialPrompt: this.settings.initialPrompt,
      chunkSizeMB: this.settings.chunkSizeMB
    };
    this.transcriptionService = new TranscriptionService(transcriptionConfig);

    // StorageService を初期化
    const storageConfig: StorageConfig = {
      audioFolder: this.settings.audioFolder,
      transcriptFolder: this.settings.transcriptFolder
    };
    this.storageService = new StorageService(this.app.vault, storageConfig);
  }

  /**
   * サービス設定を更新
   */
  private updateServices(): void {
    this.transcriptionService.updateConfig({
      apiKey: this.settings.apiKey,
      apiUrl: this.settings.apiUrl,
      model: this.settings.model,
      language: this.settings.language,
      timeout: this.settings.timeout * 1000,
      temperature: this.settings.temperature,
      initialPrompt: this.settings.initialPrompt,
      chunkSizeMB: this.settings.chunkSizeMB
    });

    this.storageService.updateConfig({
      audioFolder: this.settings.audioFolder,
      transcriptFolder: this.settings.transcriptFolder
    });
  }

  /**
   * コマンドを追加
   */
  private addCommands(): void {
    // 録音モーダルを開く
    this.addCommand({
      id: 'open-recorder',
      name: t('command.openRecorder'),
      callback: () => {
        this.openRecorderModal();
      }
    });

    // 音声ファイルを文字起こし
    this.addCommand({
      id: 'transcribe-audio-file',
      name: t('command.transcribeFile'),
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (file && this.isAudioFile(file)) {
          if (!checking) {
            this.transcribeFile(file);
          }
          return true;
        }
        return false;
      }
    });
  }

  /**
   * ファイルメニューを登録
   */
  private registerFileMenu(): void {
    // Obsidian APIの型定義にfile-menuイベントが含まれていないため、型アサーションを使用
    this.registerEvent(
      (this.app.workspace as unknown as { on: (name: string, callback: (menu: Menu, file: TFile) => void) => EventRef }).on('file-menu', (menu: Menu, file: TFile): void => {
        if (this.isAudioFile(file)) {
          menu.addItem((item) => {
            item
              .setTitle(t('command.transcribeFile'))
              .setIcon('file-text')
              .onClick(() => {
                this.transcribeFile(file);
              });
          });
        }
      })
    );
  }

  /**
   * 音声ファイルかどうか判定
   */
  private isAudioFile(file: TFile): boolean {
    const audioExtensions = ['webm', 'mp3', 'wav', 'm4a', 'ogg', 'flac'];
    return audioExtensions.includes(file.extension.toLowerCase());
  }

  /**
   * 録音モーダルを開く
   */
  private openRecorderModal(): void {
    const modal = new RecorderModal(
      this.app,
      this.transcriptionService,
      this.storageService,
      this.settings,
      (state) => this.updateStatusBar(state),
      (recorder, state, duration) => this.handleRecorderChange(recorder, state, duration),
      this.activeRecording ?? undefined
    );
    modal.open();
  }

  /**
   * 録音状態が変わった時のハンドラ
   */
  private handleRecorderChange(recorder: AudioRecorder | null, state: ModalState, duration: number): void {
    if (recorder && (state === 'recording' || state === 'paused')) {
      this.activeRecording = { recorder, state, duration };
    } else {
      this.activeRecording = null;
      this.clearStatusBar();
    }
  }

  /**
   * ファイルを文字起こし
   */
  private async transcribeFile(file: TFile): Promise<void> {
    try {
      new Notice(t('notice.recordingStarted')); // 処理開始通知

      // ファイルを読み込む
      const arrayBuffer = await this.app.vault.readBinary(file);
      const blob = new Blob([arrayBuffer], { type: this.getMimeType(file.extension) });

      // 進捗通知
      this.transcriptionService.onProgress = (progress: TranscriptionProgress): void => {
        this.updateStatusBar({
          status: 'uploading',
          percentage: progress.percentage,
          uploadedMB: progress.uploadedBytes / (1024 * 1024),
          totalMB: progress.totalBytes / (1024 * 1024)
        });
      };

      // 文字起こし実行
      const result = await this.transcriptionService.transcribe(blob);

      // メタデータを作成
      const metadata = this.storageService.createMetadata(
        file.path,
        this.settings.language,
        this.settings.model,
        result.duration
      );

      // 結果を保存
      const transcriptPath = await this.storageService.saveTranscript(result, metadata);

      // ステータスバーをクリア
      this.clearStatusBar();

      // 成功通知
      new Notice(t('notice.transcriptionComplete'));

      // 作成したファイルを開く
      const transcriptFile = this.app.vault.getAbstractFileByPath(transcriptPath);
      if (transcriptFile instanceof TFile) {
        await this.app.workspace.openLinkText(transcriptPath, '');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      this.clearStatusBar();
      new Notice(t('notice.transcriptionFailed', { error: (error as Error).message }));
    }
  }

  /**
   * MIMEタイプを取得
   */
  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      webm: 'audio/webm',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      ogg: 'audio/ogg',
      flac: 'audio/flac'
    };
    return mimeTypes[extension.toLowerCase()] || 'audio/webm';
  }

  /**
   * ステータスバーを更新
   */
  private updateStatusBar(state: {
    status: 'recording' | 'paused' | 'uploading';
    time?: string;
    percentage?: number;
    uploadedMB?: number;
    totalMB?: number;
  }): void {
    if (!this.statusBarItem) return;

    switch (state.status) {
      case 'recording':
        this.statusBarItem.setText(t('status.recording', { time: state.time || '00:00:00' }));
        this.statusBarItem.setAttr('title', t('status.clickToOpen'));
        break;
      case 'paused':
        this.statusBarItem.setText(t('status.paused', { time: state.time || '00:00:00' }));
        this.statusBarItem.setAttr('title', t('status.clickToOpen'));
        break;
      case 'uploading':
        this.statusBarItem.setText(t('status.uploading', { percentage: state.percentage || 0 }));
        this.statusBarItem.setAttr('title', '');
        break;
    }
  }

  /**
   * ステータスバーをクリア
   */
  private clearStatusBar(): void {
    if (this.statusBarItem) {
      this.statusBarItem.setText('');
      this.statusBarItem.setAttr('title', '');
    }
  }

  /**
   * API接続テスト
   */
  async testConnection(): Promise<boolean> {
    return this.transcriptionService.testConnection();
  }
}
