// PluginSettings モジュールのテスト

import {
  DEFAULT_SETTINGS,
  exportSettings,
  importSettings,
  validateSettings,
  type PluginSettings,
  type SettingsExport
} from '../settings/PluginSettings';

describe('PluginSettings', () => {
  describe('DEFAULT_SETTINGS', () => {
    it('すべての必須フィールドが存在する', () => {
      expect(DEFAULT_SETTINGS).toHaveProperty('apiKey');
      expect(DEFAULT_SETTINGS).toHaveProperty('apiUrl');
      expect(DEFAULT_SETTINGS).toHaveProperty('model');
      expect(DEFAULT_SETTINGS).toHaveProperty('language');
      expect(DEFAULT_SETTINGS).toHaveProperty('timeout');
      expect(DEFAULT_SETTINGS).toHaveProperty('temperature');
      expect(DEFAULT_SETTINGS).toHaveProperty('initialPrompt');
      expect(DEFAULT_SETTINGS).toHaveProperty('audioFolder');
      expect(DEFAULT_SETTINGS).toHaveProperty('transcriptFolder');
      expect(DEFAULT_SETTINGS).toHaveProperty('chunkSizeMB');
    });

    it('apiKeyは空文字列', () => {
      expect(DEFAULT_SETTINGS.apiKey).toBe('');
    });

    it('apiUrlはOpenAIのエンドポイント', () => {
      expect(DEFAULT_SETTINGS.apiUrl).toBe('https://api.openai.com/v1/audio/transcriptions');
    });

    it('デフォルトモデルはwhisper-1', () => {
      expect(DEFAULT_SETTINGS.model).toBe('whisper-1');
    });

    it('デフォルト言語は日本語', () => {
      expect(DEFAULT_SETTINGS.language).toBe('ja');
    });

    it('タイムアウトは300秒', () => {
      expect(DEFAULT_SETTINGS.timeout).toBe(300);
    });

    it('temperatureは0', () => {
      expect(DEFAULT_SETTINGS.temperature).toBe(0);
    });

    it('チャンクサイズは20MB', () => {
      expect(DEFAULT_SETTINGS.chunkSizeMB).toBe(20);
    });
  });

  describe('exportSettings', () => {
    const testSettings: PluginSettings = {
      apiKey: 'secret-api-key',
      apiUrl: 'https://custom.api.com/v1/transcriptions',
      model: 'gpt-4o-mini-transcribe',
      language: 'en',
      timeout: 600,
      temperature: 0.5,
      initialPrompt: 'Test prompt',
      audioFolder: 'audio',
      transcriptFolder: 'text',
      chunkSizeMB: 15
    };

    it('API Keyを除外してエクスポートする', () => {
      const exported = exportSettings(testSettings, '1.0.0');
      expect(exported.settings).not.toHaveProperty('apiKey');
    });

    it('バージョンが含まれる', () => {
      const exported = exportSettings(testSettings, '1.2.3');
      expect(exported.version).toBe('1.2.3');
    });

    it('API Key以外の設定が保持される', () => {
      const exported = exportSettings(testSettings, '1.0.0');
      expect(exported.settings.apiUrl).toBe('https://custom.api.com/v1/transcriptions');
      expect(exported.settings.model).toBe('gpt-4o-mini-transcribe');
      expect(exported.settings.language).toBe('en');
      expect(exported.settings.timeout).toBe(600);
      expect(exported.settings.temperature).toBe(0.5);
      expect(exported.settings.initialPrompt).toBe('Test prompt');
      expect(exported.settings.audioFolder).toBe('audio');
      expect(exported.settings.transcriptFolder).toBe('text');
      expect(exported.settings.chunkSizeMB).toBe(15);
    });
  });

  describe('importSettings', () => {
    const currentSettings: PluginSettings = {
      apiKey: 'my-secret-key',
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

    const exported: SettingsExport = {
      version: '1.0.0',
      settings: {
        apiUrl: 'https://custom.api.com/v1/transcriptions',
        model: 'gpt-4o-mini-transcribe',
        language: 'en',
        timeout: 600,
        temperature: 0.5,
        initialPrompt: 'Imported prompt',
        audioFolder: 'audio',
        transcriptFolder: 'text',
        chunkSizeMB: 15
      }
    };

    it('現在のAPI Keyを維持する', () => {
      const imported = importSettings(exported, currentSettings);
      expect(imported.apiKey).toBe('my-secret-key');
    });

    it('エクスポートした設定をインポートする', () => {
      const imported = importSettings(exported, currentSettings);
      expect(imported.apiUrl).toBe('https://custom.api.com/v1/transcriptions');
      expect(imported.model).toBe('gpt-4o-mini-transcribe');
      expect(imported.language).toBe('en');
      expect(imported.timeout).toBe(600);
      expect(imported.temperature).toBe(0.5);
      expect(imported.initialPrompt).toBe('Imported prompt');
      expect(imported.audioFolder).toBe('audio');
      expect(imported.transcriptFolder).toBe('text');
      expect(imported.chunkSizeMB).toBe(15);
    });

    it('部分的なエクスポートでも動作する', () => {
      const partialExport: SettingsExport = {
        version: '1.0.0',
        settings: {
          apiUrl: 'https://api.openai.com/v1/audio/transcriptions',
          model: 'whisper-1',
          language: 'en', // 言語のみ変更
          timeout: 300,
          temperature: 0,
          initialPrompt: '',
          audioFolder: 'recordings',
          transcriptFolder: 'transcripts',
          chunkSizeMB: 20
        }
      };
      const imported = importSettings(partialExport, currentSettings);
      expect(imported.language).toBe('en');
      expect(imported.apiKey).toBe('my-secret-key');
    });
  });

  describe('validateSettings', () => {
    const validSettings: PluginSettings = {
      apiKey: 'sk-test-api-key',
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

    it('有効な設定でエラーなし', () => {
      const errors = validateSettings(validSettings);
      expect(errors).toHaveLength(0);
    });

    it('API Keyが空の場合エラー', () => {
      const settings = { ...validSettings, apiKey: '' };
      const errors = validateSettings(settings);
      expect(errors).toContain('API Key is required');
    });

    it('無効なAPI URLでエラー', () => {
      const settings = { ...validSettings, apiUrl: 'not-a-valid-url' };
      const errors = validateSettings(settings);
      expect(errors).toContain('Invalid API URL format');
    });

    it('モデルが空の場合エラー', () => {
      const settings = { ...validSettings, model: '' };
      const errors = validateSettings(settings);
      expect(errors).toContain('Model is required');
    });

    it('タイムアウトが0以下でエラー', () => {
      const settings = { ...validSettings, timeout: 0 };
      const errors = validateSettings(settings);
      expect(errors).toContain('Timeout must be between 1 and 3600 seconds');
    });

    it('タイムアウトが3600超でエラー', () => {
      const settings = { ...validSettings, timeout: 3601 };
      const errors = validateSettings(settings);
      expect(errors).toContain('Timeout must be between 1 and 3600 seconds');
    });

    it('temperatureが負数でエラー', () => {
      const settings = { ...validSettings, temperature: -0.1 };
      const errors = validateSettings(settings);
      expect(errors).toContain('Temperature must be between 0 and 1');
    });

    it('temperatureが1超でエラー', () => {
      const settings = { ...validSettings, temperature: 1.1 };
      const errors = validateSettings(settings);
      expect(errors).toContain('Temperature must be between 0 and 1');
    });

    it('チャンクサイズが1MB未満でエラー', () => {
      const settings = { ...validSettings, chunkSizeMB: 0 };
      const errors = validateSettings(settings);
      expect(errors).toContain('Chunk size must be between 1 and 24 MB');
    });

    it('チャンクサイズが24MB超でエラー', () => {
      const settings = { ...validSettings, chunkSizeMB: 25 };
      const errors = validateSettings(settings);
      expect(errors).toContain('Chunk size must be between 1 and 24 MB');
    });

    it('複数のエラーを返す', () => {
      const settings = {
        ...validSettings,
        apiKey: '',
        model: '',
        timeout: 0
      };
      const errors = validateSettings(settings);
      expect(errors.length).toBeGreaterThan(1);
      expect(errors).toContain('API Key is required');
      expect(errors).toContain('Model is required');
      expect(errors).toContain('Timeout must be between 1 and 3600 seconds');
    });
  });
});
