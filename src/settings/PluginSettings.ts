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
  chunkSizeMB: 20
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

  return errors;
}
