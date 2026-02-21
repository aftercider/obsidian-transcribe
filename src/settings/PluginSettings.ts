// プラグイン設定

/**
 * プラグイン設定インターフェース
 */
export interface PluginSettings {
  // API設定
  apiKey: string;
  apiUrl: string;
  model: string;
  language: string;
  timeout: number;        // 秒単位
  temperature: number;
  initialPrompt: string;
  
  // 保存設定
  audioFolder: string;
  transcriptFolder: string;
  chunkSizeMB: number;
  
  // トリミング設定
  enableTrimming: boolean;
  autoSkipDuration: number;    // この秒数以下はトリミング画面をスキップ
  defaultThresholdDb: number;  // 無音閾値のデフォルト値（dB）
  minSilenceDuration: number;  // 無音と判定する最小秒数
  silenceMargin: number;       // 音声前後の保護マージン（秒）
}

/**
 * デフォルト設定
 */
export const DEFAULT_SETTINGS: PluginSettings = {
  apiKey: '',
  apiUrl: 'https://api.openai.com/v1/audio/transcriptions',
  model: 'whisper-1',
  language: 'ja',
  timeout: 300,
  temperature: 0,
  initialPrompt: '',
  audioFolder: 'recordings',
  transcriptFolder: 'transcripts',
  chunkSizeMB: 20,
  enableTrimming: true,
  autoSkipDuration: 20,
  defaultThresholdDb: -40,
  minSilenceDuration: 0.6,
  silenceMargin: 0.2
};

/**
 * 設定エクスポート形式
 */
export interface SettingsExport {
  version: string;
  settings: Omit<PluginSettings, 'apiKey'>;
}

/**
 * 設定をエクスポート用に変換（API Keyは除外）
 */
export function exportSettings(settings: PluginSettings, version: string): SettingsExport {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { apiKey: _apiKey, ...rest } = settings;
  return {
    version,
    settings: rest
  };
}

/**
 * エクスポートした設定をインポート
 */
export function importSettings(
  exported: SettingsExport,
  currentSettings: PluginSettings
): PluginSettings {
  return {
    ...currentSettings,
    ...exported.settings
    // apiKey は現在の設定を維持
  };
}

/**
 * 設定を検証
 */
export function validateSettings(settings: PluginSettings): string[] {
  const errors: string[] = [];

  if (!settings.apiKey) {
    errors.push('API Key is required');
  }

  try {
    new URL(settings.apiUrl);
  } catch {
    errors.push('Invalid API URL format');
  }

  if (!settings.model) {
    errors.push('Model is required');
  }

  if (settings.timeout < 1 || settings.timeout > 3600) {
    errors.push('Timeout must be between 1 and 3600 seconds');
  }

  if (settings.temperature < 0 || settings.temperature > 1) {
    errors.push('Temperature must be between 0 and 1');
  }

  if (settings.chunkSizeMB < 1 || settings.chunkSizeMB > 24) {
    errors.push('Chunk size must be between 1 and 24 MB');
  }

  if (settings.autoSkipDuration < 0 || settings.autoSkipDuration > 300) {
    errors.push('Auto skip duration must be between 0 and 300 seconds');
  }

  if (settings.defaultThresholdDb < -60 || settings.defaultThresholdDb > -10) {
    errors.push('Default threshold must be between -60 and -10 dB');
  }

  if (settings.minSilenceDuration < 0.1 || settings.minSilenceDuration > 5.0) {
    errors.push('Min silence duration must be between 0.1 and 5.0 seconds');
  }

  if (settings.silenceMargin < 0 || settings.silenceMargin > 1.0) {
    errors.push('Silence margin must be between 0 and 1.0 seconds');
  }

  return errors;
}
