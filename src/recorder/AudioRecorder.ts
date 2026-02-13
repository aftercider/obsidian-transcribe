// 音声録音モジュール
// WebブラウザのMediaRecorder APIを使用して音声を録音

/**
 * 録音状態
 */
export interface RecorderState {
  status: 'idle' | 'recording' | 'paused' | 'stopped';
  duration: number;      // 録音時間（秒）
  audioLevel: number;    // 音量レベル（0-1）
}

/**
 * 録音設定
 */
export interface RecorderConfig {
  sampleRate: number;    // サンプルレート（デフォルト: 16000）
  channelCount: number;  // チャンネル数（デフォルト: 1 = モノラル）
  mimeType: string;      // MIMEタイプ（デフォルト: 'audio/webm;codecs=opus'）
}

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: RecorderConfig = {
  sampleRate: 16000,
  channelCount: 1,
  mimeType: 'audio/webm;codecs=opus'
};

/**
 * 音声録音クラス
 * MediaRecorder APIをラップして、録音・一時停止・再開・停止機能を提供
 */
export class AudioRecorder {
  private config: RecorderConfig;
  private state: RecorderState;
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private startTime: number = 0;
  private pausedDuration: number = 0;
  private pauseStartTime: number = 0;
  private durationInterval: ReturnType<typeof setInterval> | null = null;
  private levelInterval: ReturnType<typeof setInterval> | null = null;

  // コールバック
  public onStateChange: ((state: RecorderState) => void) | null = null;
  public onError: ((error: Error) => void) | null = null;

  constructor(config?: Partial<RecorderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      status: 'idle',
      duration: 0,
      audioLevel: 0
    };
  }

  /**
   * 現在の状態を取得
   */
  getState(): RecorderState {
    return { ...this.state };
  }

  /**
   * 設定を取得
   */
  getConfig(): RecorderConfig {
    return { ...this.config };
  }

  /**
   * 録音開始
   */
  async start(): Promise<void> {
    if (this.state.status !== 'idle') {
      return;
    }

    try {
      // マイクアクセスを要求
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: this.config.channelCount,
          sampleRate: this.config.sampleRate
        }
      });

      // AudioContextを作成して音量レベル分析用のAnalyserを設定
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);

      // MediaRecorderを作成
      const mimeType = MediaRecorder.isTypeSupported(this.config.mimeType)
        ? this.config.mimeType
        : 'audio/webm';
      
      this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });
      this.chunks = [];

      // イベントハンドラを設定
      this.mediaRecorder.ondataavailable = (event): void => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = (event): void => {
        const error = new Error(`録音エラー: ${(event as ErrorEvent).error?.message || 'Unknown error'}`);
        this.onError?.(error);
      };

      // 録音開始
      this.mediaRecorder.start(1000); // 1秒ごとにデータを取得
      this.startTime = Date.now();
      this.pausedDuration = 0;

      // 状態更新
      this.updateState({ status: 'recording' });

      // タイマー開始
      this.startTimers();
    } catch (error) {
      const err = error as DOMException;
      if (err.name === 'NotAllowedError') {
        throw new Error('NotAllowedError: マイクの権限が拒否されました');
      } else if (err.name === 'NotFoundError') {
        throw new Error('NotFoundError: マイクが見つかりません');
      }
      throw error;
    }
  }

  /**
   * 一時停止
   */
  pause(): void {
    if (this.state.status !== 'recording' || !this.mediaRecorder) {
      return;
    }

    this.mediaRecorder.pause();
    this.pauseStartTime = Date.now();
    this.updateState({ status: 'paused', audioLevel: 0 });
    this.stopLevelTimer();
  }

  /**
   * 再開
   */
  resume(): void {
    if (this.state.status !== 'paused' || !this.mediaRecorder) {
      return;
    }

    this.mediaRecorder.resume();
    this.pausedDuration += Date.now() - this.pauseStartTime;
    this.updateState({ status: 'recording' });
    this.startLevelTimer();
  }

  /**
   * 停止して録音データを取得
   */
  async stop(): Promise<Blob> {
    if ((this.state.status !== 'recording' && this.state.status !== 'paused') || !this.mediaRecorder) {
      throw new Error('録音中ではありません');
    }

    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        throw new Error('MediaRecorderが初期化されていません');
      }

      this.mediaRecorder.onstop = (): void => {
        const blob = new Blob(this.chunks, { type: this.config.mimeType });
        this.updateState({ status: 'stopped' });
        this.stopTimers();
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * キャンセル（録音破棄）
   */
  cancel(): void {
    this.stopTimers();
    this.cleanup();
    this.updateState({
      status: 'idle',
      duration: 0,
      audioLevel: 0
    });
  }

  /**
   * リソースのクリーンアップ
   */
  private cleanup(): void {
    // MediaRecorderを停止
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;

    // MediaStreamのトラックを停止
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // AudioContextを閉じる
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.chunks = [];
  }

  /**
   * 状態を更新してコールバックを呼び出す
   */
  private updateState(partial: Partial<RecorderState>): void {
    this.state = { ...this.state, ...partial };
    this.onStateChange?.(this.getState());
  }

  /**
   * タイマーを開始
   */
  private startTimers(): void {
    this.startDurationTimer();
    this.startLevelTimer();
  }

  /**
   * タイマーを停止
   */
  private stopTimers(): void {
    this.stopDurationTimer();
    this.stopLevelTimer();
  }

  /**
   * 録音時間タイマーを開始
   */
  private startDurationTimer(): void {
    this.durationInterval = setInterval(() => {
      if (this.state.status === 'recording') {
        const elapsed = Date.now() - this.startTime - this.pausedDuration;
        this.state.duration = elapsed / 1000;
        this.onStateChange?.(this.getState());
      }
    }, 100);
  }

  /**
   * 録音時間タイマーを停止
   */
  private stopDurationTimer(): void {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
  }

  /**
   * 音量レベルタイマーを開始
   */
  private startLevelTimer(): void {
    this.levelInterval = setInterval(() => {
      if (this.state.status === 'recording' && this.analyser) {
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        
        // 平均音量を計算（0-1の範囲に正規化）
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const average = sum / dataArray.length;
        this.state.audioLevel = average / 255;
        this.onStateChange?.(this.getState());
      }
    }, 50);
  }

  /**
   * 音量レベルタイマーを停止
   */
  private stopLevelTimer(): void {
    if (this.levelInterval) {
      clearInterval(this.levelInterval);
      this.levelInterval = null;
    }
  }
}
