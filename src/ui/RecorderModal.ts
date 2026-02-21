// 録音モーダルUI

import { App, Modal, Notice } from 'obsidian';
import { AudioRecorder, type RecorderState } from '../recorder';
import { TranscriptionService, type TranscriptionProgress } from '../api';
import { StorageService } from '../storage';
import { AudioTrimmer, type WaveformData, type AudioSegment, type TrimConfig } from '../trimmer';
import { t } from '../i18n';
import type { PluginSettings } from '../settings';

/**
 * モーダルの表示状態
 */
export type ModalState = 'ready' | 'recording' | 'paused' | 'stopped' | 'analyzing' | 'trimming' | 'uploading';

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
  private onRecorderChange: (recorder: AudioRecorder | null, state: ModalState, duration: number) => void;

  // 既存音声ファイルからの再文字起こし用
  private existingAudioPath: string | null = null;

  private recorder: AudioRecorder | null = null;
  private state: ModalState = 'ready';
  private audioBlob: Blob | null = null;
  private duration: number = 0;
  private wakeLockSentinel: WakeLockSentinelLike | null = null;

  // トリミング関連
  private trimmer: AudioTrimmer | null = null;
  private waveformData: WaveformData | null = null;
  private trimmedSegments: AudioSegment[] | null = null;
  private currentThresholdDb: number = -40;
  private trimmedBlob: Blob | null = null;

  // UI要素
  private statusIcon!: HTMLElement;
  private timeDisplay!: HTMLElement;
  private levelMeter!: HTMLElement;
  private levelBar!: HTMLElement;
  private buttonContainer!: HTMLElement;
  private progressContainer!: HTMLElement;
  private progressText!: HTMLElement;
  private progressBar!: HTMLElement;

  // トリミングUI要素
  private trimmingContainer!: HTMLElement;
  private waveformContainer!: HTMLElement;
  private thresholdSlider!: HTMLInputElement;
  private thresholdValue!: HTMLElement;
  private trimResultContainer!: HTMLElement;

  constructor(
    app: App,
    transcriptionService: TranscriptionService,
    storageService: StorageService,
    settings: PluginSettings,
    onStatusUpdate: (state: {
      status: 'recording' | 'paused' | 'uploading';
      time?: string;
      percentage?: number;
    }) => void,
    onRecorderChange: (recorder: AudioRecorder | null, state: ModalState, duration: number) => void,
    existingRecorder?: { recorder: AudioRecorder; state: ModalState; duration: number },
    existingAudio?: { blob: Blob; path: string }
  ) {
    super(app);
    this.transcriptionService = transcriptionService;
    this.storageService = storageService;
    this.settings = settings;
    this.onStatusUpdate = onStatusUpdate;
    this.onRecorderChange = onRecorderChange;

    // 既存の音声ファイルからの再文字起こし
    if (existingAudio) {
      this.audioBlob = existingAudio.blob;
      this.existingAudioPath = existingAudio.path;
    }

    // 既存の録音を引き継ぐ
    if (existingRecorder) {
      this.recorder = existingRecorder.recorder;
      this.state = existingRecorder.state;
      this.duration = existingRecorder.duration;
    }
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

    // トリミングUI（初期は非表示）
    this.trimmingContainer = contentEl.createDiv({ cls: 'trimming-container hidden' });
    
    // 波形表示エリア
    this.waveformContainer = this.trimmingContainer.createDiv({ cls: 'waveform-container' });
    
    // 閾値スライダー
    const thresholdArea = this.trimmingContainer.createDiv({ cls: 'threshold-area' });
    thresholdArea.createSpan({ text: t('trimming.threshold'), cls: 'threshold-label' });
    
    const sliderContainer = thresholdArea.createDiv({ cls: 'slider-container' });
    this.thresholdSlider = sliderContainer.createEl('input', {
      type: 'range',
      cls: 'threshold-slider'
    });
    this.thresholdSlider.min = '-60';
    this.thresholdSlider.max = '-10';
    this.thresholdSlider.value = this.settings.defaultThresholdDb.toString();
    this.thresholdSlider.addEventListener('input', () => {
      this.currentThresholdDb = parseFloat(this.thresholdSlider.value);
      this.thresholdValue.setText(`${this.currentThresholdDb.toFixed(0)} dB`);
      this.updateTrimming();
    });
    
    this.thresholdValue = sliderContainer.createSpan({ 
      text: `${this.settings.defaultThresholdDb} dB`, 
      cls: 'threshold-value' 
    });
    
    // 自動検出ボタン
    const autoBtn = thresholdArea.createEl('button', { 
      text: t('trimming.autoDetect'),
      cls: 'auto-detect-btn'
    });
    autoBtn.addEventListener('click', () => {
      if (this.trimmer && this.waveformData) {
        const autoThreshold = this.trimmer.calculateAutoThreshold(this.waveformData);
        this.currentThresholdDb = autoThreshold;
        this.thresholdSlider.value = autoThreshold.toString();
        this.thresholdValue.setText(`${autoThreshold.toFixed(0)} dB`);
        this.updateTrimming();
      }
    });
    
    // トリミング結果表示
    const resultArea = this.trimmingContainer.createDiv({ cls: 'trim-result-area' });
    resultArea.createDiv({ text: `📊 ${t('trimming.result')}`, cls: 'trim-result-header' });
    this.trimResultContainer = resultArea.createDiv({ cls: 'trim-result-container' });

    // ボタンエリア
    this.buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    
    // 既存の録音を引き継いでいる場合は状態を復元
    if (this.recorder && (this.state === 'recording' || this.state === 'paused')) {
      this.restoreRecordingState();
    }
    
    this.updateButtons();

    // 既存音声ファイルからの再文字起こしの場合、即座にトリミングフローへ
    if (this.audioBlob && this.existingAudioPath) {
      if (this.settings.enableTrimming) {
        void this.startTrimming();
      } else {
        this.state = 'stopped';
        this.updateButtons();
      }
    }

    // スタイルを追加
    this.addStyles();

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  /**
   * 既存の録音状態を復元
   */
  private restoreRecordingState(): void {
    if (!this.recorder) return;

    // UIを現在の状態に更新
    this.updateTimeDisplay(this.duration);
    if (this.state === 'paused') {
      this.statusIcon.setText('⏸');
    }

    // コールバックを再設定
    this.recorder.onStateChange = (state: RecorderState): void => {
      this.duration = state.duration;
      this.updateTimeDisplay(state.duration);
      this.updateLevelMeter(state.audioLevel);
      
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

    this.recorder.onError = (error: Error): void => {
      console.error('Recording error:', error);
      new Notice(t('notice.transcriptionFailed', { error: error.message }));
    };
  }

  onClose(): void {
    this.containerEl.removeEventListener('click', this.handleBackgroundClick, true);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    // 録音中・一時停止中はrecorderを保持してmain.tsに通知
    if ((this.state === 'recording' || this.state === 'paused') && this.recorder) {
      this.onRecorderChange(this.recorder, this.state, this.duration);
      // recorderをnullにしないで保持
      return;
    }

    void this.releaseWakeLock();

    // リソースをクリーンアップ
    if (this.recorder) {
      this.recorder.cancel();
      this.recorder = null;
    }
    this.onRecorderChange(null, 'ready', 0);
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
      await this.releaseWakeLock();
      
      new Notice(t('notice.recordingStopped'));

      // トリミング機能が有効で、録音時間が自動スキップ閾値を超えている場合
      if (this.settings.enableTrimming && this.duration > this.settings.autoSkipDuration) {
        await this.startTrimming();
      } else {
        if (this.settings.enableTrimming && this.duration <= this.settings.autoSkipDuration) {
          new Notice(t('trimming.skipped'));
        }
        this.state = 'stopped';
        this.updateButtons();
      }
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
  private async sendRecording(useOriginal: boolean = false): Promise<void> {
    if (!this.audioBlob) return;

    // トリミング済みBlobがあり、オリジナルを使わない場合はそれを使う
    const blobToSend = (!useOriginal && this.trimmedBlob) ? this.trimmedBlob : this.audioBlob;

    this.state = 'uploading';
    this.updateButtons();
    this.showProgress();
    this.hideTrimmingUI();
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

      // 音声ファイルを保存（既存ファイルからの再文字起こしの場合はスキップ）
      let audioPath: string;
      if (this.existingAudioPath) {
        audioPath = this.existingAudioPath;
      } else {
        const audioInfo = await this.storageService.saveAudio(this.audioBlob, this.duration);
        new Notice(t('notice.audioSaved', { path: audioInfo.path }));
        audioPath = audioInfo.path;
      }

      // オフラインチェック
      if (!navigator.onLine) {
        new Notice(t('notice.offlineMode'));
        this.close();
        return;
      }

      // 文字起こし実行（トリミング済みまたはオリジナルを送信）
      const result = await this.transcriptionService.transcribe(blobToSend);

      // メタデータを作成
      const metadata = this.storageService.createMetadata(
        audioPath,
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
   * トリミング開始
   */
  private async startTrimming(): Promise<void> {
    if (!this.audioBlob) return;

    this.state = 'analyzing';
    this.updateButtons();
    this.showTrimmingUI();
    this.showAnalyzingState();

    try {
      this.trimmer = new AudioTrimmer(200); // 200ms resolution
      this.currentThresholdDb = this.settings.defaultThresholdDb;

      // 波形分析
      this.waveformData = await this.trimmer.analyzeWaveform(this.audioBlob);

      // 自動閾値計算
      const autoThreshold = this.trimmer.calculateAutoThreshold(this.waveformData);
      this.currentThresholdDb = autoThreshold;
      this.thresholdSlider.value = autoThreshold.toString();
      this.thresholdValue.setText(`${autoThreshold.toFixed(0)} dB`);

      // トリミング範囲計算
      this.updateTrimming();

      this.state = 'trimming';
      this.updateButtons();
    } catch (error) {
      console.error('Trimming analysis error:', error);
      // トリミング失敗した場合は通常の停止状態に
      this.state = 'stopped';
      this.hideTrimmingUI();
      this.updateButtons();
    }
  }

  /**
   * トリミング範囲を更新
   */
  private updateTrimming(): void {
    if (!this.trimmer || !this.waveformData) return;

    const config: TrimConfig = {
      thresholdDb: this.currentThresholdDb,
      minSilenceDuration: this.settings.minSilenceDuration,
      silenceMargin: this.settings.silenceMargin
    };

    this.trimmedSegments = this.trimmer.calculateTrimRanges(this.waveformData, config);
    
    // 波形を再描画
    this.drawWaveform();
    
    // 結果を表示
    this.updateTrimResult();
  }

  /**
   * 波形を描画
   */
  private drawWaveform(): void {
    if (!this.trimmedSegments || !this.waveformData) return;

    this.waveformContainer.empty();

    const containerWidth = this.waveformContainer.clientWidth || 400;
    const segmentsPerRow = Math.floor(containerWidth / 4); // 各セグメントは4px幅
    const rowHeight = 40;
    const maxRows = 5;

    const totalSegments = this.trimmedSegments.length;
    const rowCount = Math.min(maxRows, Math.ceil(totalSegments / segmentsPerRow));

    for (let row = 0; row < rowCount; row++) {
      const rowDiv = this.waveformContainer.createDiv({ cls: 'waveform-row' });
      const canvas = rowDiv.createEl('canvas');
      canvas.width = containerWidth;
      canvas.height = rowHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      const startIdx = row * segmentsPerRow;
      const endIdx = Math.min(startIdx + segmentsPerRow, totalSegments);

      for (let i = startIdx; i < endIdx; i++) {
        const segment = this.trimmedSegments[i];
        const x = (i - startIdx) * 4;
        
        // dBから高さを計算（-60dB～0dBを0～1に正規化）
        const normalizedDb = Math.max(0, Math.min(1, (segment.avgDb + 60) / 60));
        const barHeight = Math.max(2, normalizedDb * (rowHeight - 4));
        const y = (rowHeight - barHeight) / 2;

        // 色：無音はグレー、有効は青
        ctx.fillStyle = segment.isSilence ? '#888888' : '#4a9eff';
        ctx.fillRect(x, y, 3, barHeight);
      }
    }

    // 残りのセグメントがある場合はスクロールヒントを表示
    if (totalSegments > rowCount * segmentsPerRow) {
      const hint = this.waveformContainer.createDiv({ cls: 'waveform-hint' });
      hint.setText(`... ${totalSegments - rowCount * segmentsPerRow} more segments`);
    }
  }

  /**
   * トリミング結果を更新
   */
  private updateTrimResult(): void {
    if (!this.trimmer || !this.trimmedSegments || !this.waveformData) return;

    const stats = this.trimmer.calculateTrimStats(
      this.trimmedSegments,
      this.waveformData.duration
    );

    this.trimResultContainer.empty();

    const createResultLine = (label: string, value: string): void => {
      const line = this.trimResultContainer.createDiv({ cls: 'trim-result-line' });
      line.createSpan({ text: label, cls: 'trim-result-label' });
      line.createSpan({ text: value, cls: 'trim-result-value' });
    };

    createResultLine(t('trimming.original'), this.formatTime(stats.trimmedDuration + stats.removedDuration));
    createResultLine(t('trimming.trimmed'), this.formatTime(stats.trimmedDuration));
    createResultLine(t('trimming.reduced'), `${this.formatTime(stats.removedDuration)} (${stats.removedPercentage.toFixed(0)}%)`);
    createResultLine(t('trimming.segments'), `${stats.removedSegments}`);
  }

  /**
   * トリミングUIを表示
   */
  private showTrimmingUI(): void {
    // 録音UIを非表示
    this.statusIcon.parentElement?.addClass('hidden');
    this.levelMeter.addClass('hidden');

    // タイトルを変更
    const titleEl = this.contentEl.querySelector('h2');
    if (titleEl) {
      titleEl.setText(t('trimming.title'));
    }

    // トリミングUIを表示
    this.trimmingContainer.removeClass('hidden');
  }

  /**
   * トリミングUIを非表示
   */
  private hideTrimmingUI(): void {
    this.trimmingContainer.addClass('hidden');

    // 録音UIを表示
    this.statusIcon.parentElement?.removeClass('hidden');
    this.levelMeter.removeClass('hidden');

    // タイトルを戻す
    const titleEl = this.contentEl.querySelector('h2');
    if (titleEl) {
      titleEl.setText(t('modal.title'));
    }
  }

  /**
   * 分析中の状態を表示
   */
  private showAnalyzingState(): void {
    this.waveformContainer.empty();
    this.waveformContainer.createDiv({ 
      cls: 'analyzing-text', 
      text: t('trimming.analyzing') 
    });
    this.trimResultContainer.empty();
  }

  /**
   * トリミング済み音声を送信
   */
  private async sendTrimmedRecording(): Promise<void> {
    if (!this.audioBlob || !this.trimmer || !this.trimmedSegments) return;

    // トリミング中の状態を表示
    this.state = 'analyzing';
    this.updateButtons();
    this.showAnalyzingState();

    try {
      // トリミング実行
      const result = await this.trimmer.trimAudio(this.audioBlob, this.trimmedSegments);
      this.trimmedBlob = result.trimmedBlob;
      
      // 送信
      await this.sendRecording(false);
    } catch (error) {
      console.error('Trim error:', error);
      // トリミング失敗した場合はオリジナルを送信
      await this.sendRecording(true);
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
        this.createButton(t('modal.send'), () => this.sendRecording(true), true);
        this.createButton(t('modal.cancel'), () => this.cancelRecording());
        break;
      case 'analyzing':
        // 分析中はボタンなし
        break;
      case 'trimming':
        this.createButton(t('trimming.sendOriginal'), () => this.sendRecording(true));
        this.createButton(t('trimming.send'), () => this.sendTrimmedRecording(), true);
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
      /* トリミングUI */
      .whisper-transcribe-modal .trimming-container {
        padding: 10px 0;
      }
      .whisper-transcribe-modal .waveform-container {
        background: var(--background-secondary);
        border-radius: 5px;
        padding: 10px;
        margin-bottom: 15px;
        max-height: 220px;
        overflow-y: auto;
      }
      .whisper-transcribe-modal .waveform-row {
        margin-bottom: 5px;
      }
      .whisper-transcribe-modal .waveform-row canvas {
        display: block;
        width: 100%;
      }
      .whisper-transcribe-modal .waveform-hint {
        text-align: center;
        font-size: 12px;
        color: var(--text-muted);
        margin-top: 5px;
      }
      .whisper-transcribe-modal .analyzing-text {
        text-align: center;
        padding: 40px;
        color: var(--text-muted);
      }
      .whisper-transcribe-modal .threshold-area {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 15px;
        flex-wrap: wrap;
      }
      .whisper-transcribe-modal .threshold-label {
        font-weight: 500;
      }
      .whisper-transcribe-modal .slider-container {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 150px;
      }
      .whisper-transcribe-modal .threshold-slider {
        flex: 1;
        min-width: 100px;
      }
      .whisper-transcribe-modal .threshold-value {
        min-width: 50px;
        text-align: right;
        font-family: monospace;
      }
      .whisper-transcribe-modal .auto-detect-btn {
        font-size: 12px;
        padding: 4px 8px;
      }
      .whisper-transcribe-modal .trim-result-area {
        background: var(--background-secondary);
        border-radius: 5px;
        padding: 10px;
      }
      .whisper-transcribe-modal .trim-result-header {
        font-weight: 500;
        margin-bottom: 8px;
      }
      .whisper-transcribe-modal .trim-result-line {
        display: flex;
        justify-content: space-between;
        padding: 2px 0;
        font-size: 13px;
      }
      .whisper-transcribe-modal .trim-result-label {
        color: var(--text-muted);
      }
      .whisper-transcribe-modal .trim-result-value {
        font-family: monospace;
      }
    `;
    this.contentEl.appendChild(style);
  }
}
