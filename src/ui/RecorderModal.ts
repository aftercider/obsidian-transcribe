// 録音モーダルUI

import { App, Modal, Notice } from 'obsidian';
import { AudioRecorder, type RecorderState } from '../recorder';
import { TranscriptionService, type TranscriptionProgress } from '../api';
import { StorageService } from '../storage';
import { t } from '../i18n';
import type { PluginSettings } from '../settings';

/**
 * モーダルの表示状態
 */
type ModalState = 'ready' | 'recording' | 'paused' | 'stopped' | 'uploading';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
}

/**
 * 録音モーダルクラス
 */
export class RecorderModal extends Modal {
  private transcriptionService: TranscriptionService;
  private storageService: StorageService;
  private settings: PluginSettings;
  private onStatusUpdate: (state: {
    status: 'recording' | 'paused' | 'uploading';
    time?: string;
    percentage?: number;
  }) => void;

  private recorder: AudioRecorder | null = null;
  private state: ModalState = 'ready';
  private audioBlob: Blob | null = null;
  private duration: number = 0;
  private wakeLockSentinel: WakeLockSentinelLike | null = null;

  // UI要素
  private statusIcon!: HTMLElement;
  private timeDisplay!: HTMLElement;
  private levelMeter!: HTMLElement;
  private levelBar!: HTMLElement;
  private buttonContainer!: HTMLElement;
  private progressContainer!: HTMLElement;
  private progressText!: HTMLElement;
  private progressBar!: HTMLElement;

  constructor(
    app: App,
    transcriptionService: TranscriptionService,
    storageService: StorageService,
    settings: PluginSettings,
    onStatusUpdate: (state: {
      status: 'recording' | 'paused' | 'uploading';
      time?: string;
      percentage?: number;
    }) => void
  ) {
    super(app);
    this.transcriptionService = transcriptionService;
    this.storageService = storageService;
    this.settings = settings;
    this.onStatusUpdate = onStatusUpdate;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('whisper-transcribe-modal');

    // 録音中は背景クリックでモーダルを閉じないようにする
    this.containerEl.addEventListener('click', this.handleBackgroundClick, true);

    // モーダルタイトル
    contentEl.createEl('h2', { text: t('modal.title') });

    // ステータス表示エリア
    const statusArea = contentEl.createDiv({ cls: 'status-area' });
    
    // アイコンと時間表示
    const statusDisplay = statusArea.createDiv({ cls: 'status-display' });
    this.statusIcon = statusDisplay.createSpan({ cls: 'status-icon', text: '⏺' });
    this.timeDisplay = statusDisplay.createSpan({ cls: 'time-display', text: '00:00:00' });

    // 音量レベルメーター
    this.levelMeter = statusArea.createDiv({ cls: 'level-meter' });
    this.levelBar = this.levelMeter.createDiv({ cls: 'level-bar' });

    // 進捗表示（アップロード時）
    this.progressContainer = statusArea.createDiv({ cls: 'progress-container hidden' });
    this.progressText = this.progressContainer.createDiv({ cls: 'progress-text' });
    this.progressBar = this.progressContainer.createDiv({ cls: 'progress-bar' });
    this.progressBar.createDiv({ cls: 'progress-fill' });

    // ボタンエリア
    this.buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    this.updateButtons();

    // スタイルを追加
    this.addStyles();

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  onClose(): void {
    this.containerEl.removeEventListener('click', this.handleBackgroundClick, true);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    void this.releaseWakeLock();

    // リソースをクリーンアップ
    if (this.recorder) {
      this.recorder.cancel();
      this.recorder = null;
    }
  }

  /**
   * 録音開始
   */
  private async startRecording(): Promise<void> {
    try {
      this.recorder = new AudioRecorder();
      
      // 状態変更コールバック
      this.recorder.onStateChange = (state: RecorderState): void => {
        this.duration = state.duration;
        this.updateTimeDisplay(state.duration);
        this.updateLevelMeter(state.audioLevel);
        
        // ステータスバー更新
        if (state.status === 'recording') {
          this.onStatusUpdate({
            status: 'recording',
            time: this.formatTime(state.duration)
          });
        } else if (state.status === 'paused') {
          this.onStatusUpdate({
            status: 'paused',
            time: this.formatTime(state.duration)
          });
        }
      };

      // エラーコールバック
      this.recorder.onError = (error: Error): void => {
        console.error('Recording error:', error);
        new Notice(t('notice.transcriptionFailed', { error: error.message }));
      };

      await this.recorder.start();
      this.state = 'recording';
      this.updateButtons();
      await this.requestWakeLock();
      
      new Notice(t('notice.recordingStarted'));
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('NotAllowedError')) {
        new Notice(t('notice.micPermissionDenied'));
        new Notice(t('notice.micPermissionGuide'));
      } else if (err.message.includes('NotFoundError')) {
        new Notice(t('notice.noMicFound'));
      } else {
        new Notice(t('notice.transcriptionFailed', { error: err.message }));
      }
    }
  }

  /**
   * 一時停止
   */
  private pauseRecording(): void {
    if (this.recorder) {
      this.recorder.pause();
      this.state = 'paused';
      this.statusIcon.setText('⏸');
      this.updateButtons();
    }
  }

  /**
   * 再開
   */
  private resumeRecording(): void {
    if (this.recorder) {
      this.recorder.resume();
      this.state = 'recording';
      this.statusIcon.setText('⏺');
      this.updateButtons();
    }
  }

  /**
   * 停止
   */
  private async stopRecording(): Promise<void> {
    if (this.recorder) {
      this.audioBlob = await this.recorder.stop();
      this.state = 'stopped';
      this.updateButtons();
      await this.releaseWakeLock();
      
      new Notice(t('notice.recordingStopped'));
    }
  }

  /**
   * キャンセル
   */
  private cancelRecording(): void {
    if (this.recorder) {
      this.recorder.cancel();
      this.recorder = null;
    }
    void this.releaseWakeLock();
    this.audioBlob = null;
    this.state = 'ready';
    this.duration = 0;
    this.updateTimeDisplay(0);
    this.updateLevelMeter(0);
    this.updateButtons();
    
    new Notice(t('notice.recordingCancelled'));
  }

  /**
   * 送信
   */
  private async sendRecording(): Promise<void> {
    if (!this.audioBlob) return;

    this.state = 'uploading';
    this.updateButtons();
    this.showProgress();
    await this.requestWakeLock();

    try {
      // 進捗コールバック
      this.transcriptionService.onProgress = (progress: TranscriptionProgress): void => {
        this.updateProgress(progress);
        this.onStatusUpdate({
          status: 'uploading',
          percentage: progress.percentage
        });
      };

      // 音声ファイルを保存
      const audioInfo = await this.storageService.saveAudio(this.audioBlob, this.duration);
      new Notice(t('notice.audioSaved', { path: audioInfo.path }));

      // オフラインチェック
      if (!navigator.onLine) {
        new Notice(t('notice.offlineMode'));
        this.close();
        return;
      }

      // 文字起こし実行
      const result = await this.transcriptionService.transcribe(this.audioBlob);

      // メタデータを作成
      const metadata = this.storageService.createMetadata(
        audioInfo.path,
        this.settings.language,
        this.settings.model,
        this.duration
      );

      // 結果を保存
      const transcriptPath = await this.storageService.saveTranscript(result, metadata);

      // 成功通知
      new Notice(t('notice.transcriptionComplete'));

      // 作成したファイルを開く
      await this.app.workspace.openLinkText(transcriptPath, '');

      await this.releaseWakeLock();

      this.close();
    } catch (error) {
      console.error('Transcription error:', error);
      new Notice(t('notice.transcriptionFailed', { error: (error as Error).message }));
      this.state = 'stopped';
      this.hideProgress();
      this.updateButtons();
      await this.releaseWakeLock();
    }
  }

  /**
   * 録音/送信中かどうか
   */
  private shouldHoldWakeLock(): boolean {
    return this.state === 'recording' || this.state === 'paused' || this.state === 'uploading';
  }

  /**
   * 録音中・一時停止中は背景クリックでモーダルを閉じない
   */
  private handleBackgroundClick = (e: MouseEvent): void => {
    if (this.state === 'recording' || this.state === 'paused') {
      // モーダル外のクリックを無効化
      if (e.target === this.containerEl) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }
  };

  /**
   * 画面復帰時にWake Lockを再取得
   */
  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && this.shouldHoldWakeLock()) {
      void this.requestWakeLock();
    }
  };

  /**
   * Wake Lockを取得（対応端末のみ）
   */
  private async requestWakeLock(): Promise<void> {
    try {
      if (this.wakeLockSentinel || !this.shouldHoldWakeLock()) {
        return;
      }

      const navigatorWithWakeLock = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      };

      if (!navigatorWithWakeLock.wakeLock) {
        return;
      }

      this.wakeLockSentinel = await navigatorWithWakeLock.wakeLock.request('screen');
      this.wakeLockSentinel.addEventListener?.('release', () => {
        this.wakeLockSentinel = null;
      });
    } catch {
      this.wakeLockSentinel = null;
    }
  }

  /**
   * Wake Lockを解放
   */
  private async releaseWakeLock(): Promise<void> {
    if (!this.wakeLockSentinel) {
      return;
    }

    try {
      await this.wakeLockSentinel.release();
    } catch {
      // no-op
    } finally {
      this.wakeLockSentinel = null;
    }
  }

  /**
   * ボタンを更新
   */
  private updateButtons(): void {
    this.buttonContainer.empty();

    switch (this.state) {
      case 'ready':
        this.createButton(t('modal.start'), () => this.startRecording(), true);
        break;
      case 'recording':
        this.createButton(t('modal.pause'), () => this.pauseRecording());
        this.createButton(t('modal.stop'), () => this.stopRecording());
        break;
      case 'paused':
        this.createButton(t('modal.resume'), () => this.resumeRecording());
        this.createButton(t('modal.stop'), () => this.stopRecording());
        break;
      case 'stopped':
        this.createButton(t('modal.send'), () => this.sendRecording(), true);
        this.createButton(t('modal.cancel'), () => this.cancelRecording());
        break;
      case 'uploading':
        // ボタンなし
        break;
    }
  }

  /**
   * ボタンを作成
   */
  private createButton(text: string, onClick: () => void, isPrimary = false): void {
    const btn = this.buttonContainer.createEl('button', { text });
    if (isPrimary) {
      btn.addClass('mod-cta');
    }
    btn.addEventListener('click', onClick);
  }

  /**
   * 時間表示を更新
   */
  private updateTimeDisplay(seconds: number): void {
    this.timeDisplay.setText(this.formatTime(seconds));
  }

  /**
   * レベルメーターを更新
   */
  private updateLevelMeter(level: number): void {
    const percentage = Math.min(100, level * 100);
    this.levelBar.style.width = `${percentage}%`;
  }

  /**
   * 進捗を表示
   */
  private showProgress(): void {
    this.levelMeter.addClass('hidden');
    this.progressContainer.removeClass('hidden');
  }

  /**
   * 進捗を非表示
   */
  private hideProgress(): void {
    this.progressContainer.addClass('hidden');
    this.levelMeter.removeClass('hidden');
  }

  /**
   * 進捗を更新
   */
  private updateProgress(progress: TranscriptionProgress): void {
    const uploadedMB = (progress.uploadedBytes / (1024 * 1024)).toFixed(1);
    const totalMB = (progress.totalBytes / (1024 * 1024)).toFixed(1);
    
    this.progressText.setText(
      t('modal.uploading', {
        percentage: progress.percentage,
        uploaded: uploadedMB,
        total: totalMB
      })
    );

    const fill = this.progressBar.querySelector('.progress-fill') as HTMLElement;
    if (fill) {
      fill.style.width = `${progress.percentage}%`;
    }
  }

  /**
   * 秒を HH:MM:SS 形式にフォーマット
   */
  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    const pad = (n: number): string => n.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  /**
   * スタイルを追加
   */
  private addStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .whisper-transcribe-modal {
        min-width: 300px;
      }
      .whisper-transcribe-modal .status-area {
        text-align: center;
        padding: 20px 0;
      }
      .whisper-transcribe-modal .status-display {
        font-size: 24px;
        margin-bottom: 20px;
      }
      .whisper-transcribe-modal .status-icon {
        margin-right: 10px;
        color: #e74c3c;
      }
      .whisper-transcribe-modal .level-meter {
        height: 10px;
        background: var(--background-modifier-border);
        border-radius: 5px;
        overflow: hidden;
        margin: 10px 0;
      }
      .whisper-transcribe-modal .level-bar {
        height: 100%;
        background: var(--interactive-accent);
        transition: width 0.1s ease;
        width: 0%;
      }
      .whisper-transcribe-modal .button-container {
        display: flex;
        justify-content: center;
        gap: 10px;
        margin-top: 20px;
      }
      .whisper-transcribe-modal .progress-container {
        margin: 10px 0;
      }
      .whisper-transcribe-modal .progress-text {
        margin-bottom: 5px;
        font-size: 14px;
      }
      .whisper-transcribe-modal .progress-bar {
        height: 10px;
        background: var(--background-modifier-border);
        border-radius: 5px;
        overflow: hidden;
      }
      .whisper-transcribe-modal .progress-fill {
        height: 100%;
        background: var(--interactive-accent);
        transition: width 0.3s ease;
        width: 0%;
      }
      .whisper-transcribe-modal .hidden {
        display: none;
      }
    `;
    this.contentEl.appendChild(style);
  }
}
