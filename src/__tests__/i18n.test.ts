// i18n モジュールのテスト

import { I18n, t, getLocale, setLocale, type Locale } from '../i18n';
import { setMomentLocale } from './setup';

describe('I18n', () => {
  let i18n: I18n;

  beforeEach(() => {
    // デフォルト言語を英語に設定
    setMomentLocale('en');
    i18n = new I18n();
  });

  describe('getLocale', () => {
    it('Obsidianの言語設定に追従する（英語）', () => {
      setMomentLocale('en');
      const newI18n = new I18n();
      expect(newI18n.getLocale()).toBe('en');
    });

    it('Obsidianの言語設定に追従する（日本語）', () => {
      setMomentLocale('ja');
      const newI18n = new I18n();
      expect(newI18n.getLocale()).toBe('ja');
    });

    it('未対応言語は英語にフォールバック', () => {
      setMomentLocale('fr');
      const newI18n = new I18n();
      expect(newI18n.getLocale()).toBe('en');
    });
  });

  describe('t (translate)', () => {
    it('存在するキーで正しい英語翻訳を返す', () => {
      setMomentLocale('en');
      const newI18n = new I18n();
      expect(newI18n.t('modal.title')).toBe('Recording');
    });

    it('存在するキーで正しい日本語翻訳を返す', () => {
      setMomentLocale('ja');
      const newI18n = new I18n();
      expect(newI18n.t('modal.title')).toBe('録音');
    });

    it('存在しないキーでキー名を返す', () => {
      expect(i18n.t('nonexistent.key')).toBe('nonexistent.key');
    });

    it('パラメータが正しく置換される', () => {
      setMomentLocale('en');
      const newI18n = new I18n();
      const result = newI18n.t('modal.uploading', {
        percentage: 45,
        uploaded: '12.3',
        total: '27.4'
      });
      expect(result).toBe('Uploading: 45% (12.3MB / 27.4MB)');
    });

    it('日本語でパラメータが正しく置換される', () => {
      setMomentLocale('ja');
      const newI18n = new I18n();
      const result = newI18n.t('modal.uploading', {
        percentage: 45,
        uploaded: '12.3',
        total: '27.4'
      });
      expect(result).toBe('アップロード中: 45% (12.3MB / 27.4MB)');
    });

    it('複数パラメータが正しく置換される', () => {
      setMomentLocale('en');
      const newI18n = new I18n();
      const result = newI18n.t('notice.transcriptionFailed', {
        error: 'API Error'
      });
      expect(result).toBe('Transcription failed: API Error');
    });
  });

  describe('setLocale', () => {
    it('言語を手動で変更できる', () => {
      i18n.setLocale('ja');
      expect(i18n.getLocale()).toBe('ja');
      expect(i18n.t('modal.title')).toBe('録音');
    });

    it('無効な言語は英語にフォールバック', () => {
      i18n.setLocale('invalid' as Locale);
      expect(i18n.getLocale()).toBe('en');
    });
  });

  describe('グローバル関数', () => {
    it('t() グローバル関数が動作する', () => {
      setLocale('en');
      expect(t('modal.start')).toBe('Start Recording');
    });

    it('getLocale() グローバル関数が動作する', () => {
      setLocale('ja');
      expect(getLocale()).toBe('ja');
    });
  });
});

describe('翻訳キーの網羅性', () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n();
  });

  const requiredKeys = [
    // モーダル
    'modal.title',
    'modal.start',
    'modal.pause',
    'modal.resume',
    'modal.stop',
    'modal.send',
    'modal.cancel',
    'modal.uploading',
    'modal.cancelConfirm',
    'modal.yes',
    'modal.no',
    // 設定
    'settings.title',
    'settings.apiSection',
    'settings.storageSection',
    'settings.apiKey',
    'settings.apiKeyDesc',
    'settings.apiUrl',
    'settings.apiUrlDesc',
    'settings.model',
    'settings.modelDesc',
    'settings.language',
    'settings.languageDesc',
    'settings.timeout',
    'settings.timeoutDesc',
    'settings.temperature',
    'settings.temperatureDesc',
    'settings.initialPrompt',
    'settings.initialPromptDesc',
    'settings.audioFolder',
    'settings.audioFolderDesc',
    'settings.transcriptFolder',
    'settings.transcriptFolderDesc',
    'settings.chunkSize',
    'settings.chunkSizeDesc',
    'settings.testConnection',
    'settings.testSuccess',
    'settings.testFailed',
    'settings.export',
    'settings.import',
    'settings.importSuccess',
    'settings.importFailed',
    // 通知
    'notice.recordingStarted',
    'notice.recordingStopped',
    'notice.recordingCancelled',
    'notice.transcriptionComplete',
    'notice.transcriptionFailed',
    'notice.audioSaved',
    'notice.micPermissionDenied',
    'notice.micPermissionGuide',
    'notice.noMicFound',
    'notice.offlineMode',
    // コマンド
    'command.openRecorder',
    'command.transcribeFile',
    // ステータスバー
    'status.recording',
    'status.paused',
    'status.uploading'
  ];

  it.each(requiredKeys)('キー "%s" が英語で存在する', (key) => {
    i18n.setLocale('en');
    const result = i18n.t(key);
    expect(result).not.toBe(key); // キー名そのままではない
  });

  it.each(requiredKeys)('キー "%s" が日本語で存在する', (key) => {
    i18n.setLocale('ja');
    const result = i18n.t(key);
    expect(result).not.toBe(key); // キー名そのままではない
  });
});
