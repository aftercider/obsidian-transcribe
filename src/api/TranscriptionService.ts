// 文字起こしAPIサービスモジュール
// OpenAI Whisper API互換のエンドポイントに音声を送信して文字起こし

/**
 * API設定
 */
export interface TranscriptionConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
  language: string;
  timeout: number;
  temperature: number;
  initialPrompt: string;
  chunkSizeMB: number;
}

/**
 * 進捗状態
 */
export interface TranscriptionProgress {
  phase: 'uploading' | 'processing' | 'completed' | 'error';
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
  currentChunk?: number;
  totalChunks?: number;
}

/**
 * 文字起こしセグメント
 */
export interface TranscriptionSegment {
  start: number;   // 開始時間（秒）
  end: number;     // 終了時間（秒）
  text: string;    // テキスト
}

/**
 * 文字起こし結果
 */
export interface TranscriptionResult {
  text: string;                      // 全文テキスト
  segments: TranscriptionSegment[];  // セグメント配列
  duration: number;                  // 音声の長さ（秒）
  language: string;                  // 検出された言語
}

/**
 * 文字起こしAPIサービスクラス
 */
export class TranscriptionService {
  private config: TranscriptionConfig;
  
  // コールバック
  public onProgress: ((progress: TranscriptionProgress) => void) | null = null;
  public onError: ((error: Error) => void) | null = null;

  constructor(config: TranscriptionConfig) {
    this.config = config;
  }

  /**
   * 設定を更新
   */
  updateConfig(config: Partial<TranscriptionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 文字起こし実行
   */
  async transcribe(audioBlob: Blob): Promise<TranscriptionResult> {
    const totalBytes = audioBlob.size;
    const chunkSizeBytes = this.config.chunkSizeMB * 1024 * 1024;
    
    // チャンク分割が必要か判定
    if (totalBytes > chunkSizeBytes) {
      return this.transcribeChunked(audioBlob);
    }

    // 単一リクエストで送信
    return this.transcribeSingle(audioBlob);
  }

  /**
   * 単一ファイルの文字起こし
   */
  private async transcribeSingle(audioBlob: Blob): Promise<TranscriptionResult> {
    this.notifyProgress({
      phase: 'uploading',
      uploadedBytes: 0,
      totalBytes: audioBlob.size,
      percentage: 0
    });

    try {
      const formData = this.createFormData(audioBlob);
      
      const response = await this.fetchWithTimeout(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = await response.json();
      
      this.notifyProgress({
        phase: 'completed',
        uploadedBytes: audioBlob.size,
        totalBytes: audioBlob.size,
        percentage: 100
      });

      return {
        text: data.text || '',
        segments: data.segments || [],
        duration: data.duration || 0,
        language: data.language || this.config.language
      };
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * チャンク分割送信
   */
  private async transcribeChunked(audioBlob: Blob): Promise<TranscriptionResult> {
    const totalBytes = audioBlob.size;
    const chunkSizeBytes = this.config.chunkSizeMB * 1024 * 1024;
    const totalChunks = Math.ceil(totalBytes / chunkSizeBytes);
    
    const results: string[] = [];
    let processedBytes = 0;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSizeBytes;
      const end = Math.min(start + chunkSizeBytes, totalBytes);
      const chunk = audioBlob.slice(start, end, audioBlob.type);

      this.notifyProgress({
        phase: 'uploading',
        uploadedBytes: processedBytes,
        totalBytes,
        percentage: Math.round((processedBytes / totalBytes) * 100),
        currentChunk: i + 1,
        totalChunks
      });

      try {
        const formData = this.createFormData(chunk);
        
        const response = await this.fetchWithTimeout(this.config.apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          body: formData
        });

        if (!response.ok) {
          await this.handleErrorResponse(response);
        }

        const data = await response.json();
        if (data.text) {
          results.push(data.text);
        }

        processedBytes = end;
      } catch (error) {
        this.handleError(error);
        throw error;
      }
    }

    this.notifyProgress({
      phase: 'completed',
      uploadedBytes: totalBytes,
      totalBytes,
      percentage: 100,
      currentChunk: totalChunks,
      totalChunks
    });

    // 結果をマージ
    return {
      text: results.join('\n'),
      segments: [],
      duration: 0,
      language: this.config.language
    };
  }

  /**
   * FormDataを作成
   */
  private createFormData(audioBlob: Blob): FormData {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', this.config.model);
    formData.append('language', this.config.language);
    formData.append('response_format', 'json');
    formData.append('temperature', this.config.temperature.toString());
    
    if (this.config.initialPrompt) {
      formData.append('prompt', this.config.initialPrompt);
    }

    return formData;
  }

  /**
   * タイムアウト付きfetch
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw new Error('タイムアウト: APIリクエストがタイムアウトしました');
      }
      throw new Error(`ネットワークエラー: ${(error as Error).message}`);
    }
  }

  /**
   * エラーレスポンスを処理
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = 'Unknown error';
    
    try {
      const data = await response.json();
      errorMessage = data.error?.message || errorMessage;
    } catch {
      // JSONパースエラーは無視
    }

    switch (response.status) {
      case 401:
        throw new Error(`認証エラー: ${errorMessage}`);
      case 429:
        throw new Error(`レート制限: ${errorMessage}`);
      case 413:
        throw new Error(`ファイルサイズ超過: ${errorMessage}`);
      default:
        throw new Error(`APIエラー (${response.status}): ${errorMessage}`);
    }
  }

  /**
   * エラーを処理
   */
  private handleError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    
    this.notifyProgress({
      phase: 'error',
      uploadedBytes: 0,
      totalBytes: 0,
      percentage: 0
    });
    
    this.onError?.(err);
  }

  /**
   * 進捗を通知
   */
  private notifyProgress(progress: TranscriptionProgress): void {
    this.onProgress?.(progress);
  }

  /**
   * 接続テスト
   * 軽量なリクエストでAPI接続を確認
   */
  async testConnection(): Promise<boolean> {
    try {
      // 小さなテストファイルを作成
      const testBlob = new Blob(['test'], { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('file', testBlob, 'test.webm');
      formData.append('model', this.config.model);
      formData.append('language', this.config.language);
      formData.append('response_format', 'json');

      const response = await this.fetchWithTimeout(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: formData
      });

      // 401/403以外はAPIに接続できている（音声が不正でも接続テストはOK）
      return response.ok || (response.status !== 401 && response.status !== 403);
    } catch {
      return false;
    }
  }
}
