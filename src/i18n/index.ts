// 国際化（i18n）モジュール
// Obsidianの言語設定に追従して翻訳テキストを提供

import en from './en.json';
import ja from './ja.json';

// Obsidianはmomentをグローバルに提供
declare const moment: { locale: () => string } | undefined;

// サポートする言語
export type Locale = 'en' | 'ja';

// 翻訳データの型
type TranslationData = Record<string, string>;

// 翻訳データマップ
const translations: Record<Locale, TranslationData> = {
  en,
  ja
};

// サポートされている言語かチェック
function isSupportedLocale(locale: string): locale is Locale {
  return locale === 'en' || locale === 'ja';
}

/**
 * 国際化クラス
 * Obsidianの言語設定に追従して翻訳テキストを提供
 */
export class I18n {
  private locale: Locale;

  constructor() {
    // Obsidianの言語設定を取得
    const obsidianLocale = this.detectLocale();
    this.locale = isSupportedLocale(obsidianLocale) ? obsidianLocale : 'en';
  }

  /**
   * Obsidianの言語設定を検出
   */
  private detectLocale(): string {
    try {
      // Obsidianはmoment.jsをグローバルに提供しており、moment.locale()で現在の言語を取得可能
      if (typeof moment !== 'undefined' && moment.locale) {
        return moment.locale();
      }
      return 'en';
    } catch {
      // テスト環境などでObsidianが利用できない場合
      return 'en';
    }
  }

  /**
   * 現在の言語を取得
   */
  getLocale(): Locale {
    return this.locale;
  }

  /**
   * 言語を設定
   */
  setLocale(locale: Locale): void {
    if (isSupportedLocale(locale)) {
      this.locale = locale;
    } else {
      this.locale = 'en';
    }
  }

  /**
   * 翻訳テキストを取得
   * @param key - 翻訳キー（例: 'modal.title'）
   * @param params - 置換パラメータ（例: { percentage: 45 }）
   * @returns 翻訳されたテキスト、キーが存在しない場合はキー名を返す
   */
  t(key: string, params?: Record<string, string | number>): string {
    // 現在の言語の翻訳を取得
    let text = translations[this.locale]?.[key];
    
    // 見つからない場合は英語にフォールバック
    if (text === undefined) {
      text = translations.en?.[key];
    }
    
    // それでも見つからない場合はキー名を返す
    if (text === undefined) {
      return key;
    }

    // パラメータ置換
    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
      }
    }

    return text;
  }
}

// グローバルインスタンス
let globalI18n: I18n | null = null;

/**
 * グローバルI18nインスタンスを取得または作成
 */
function getI18nInstance(): I18n {
  if (!globalI18n) {
    globalI18n = new I18n();
  }
  return globalI18n;
}

/**
 * グローバル翻訳関数
 */
export function t(key: string, params?: Record<string, string | number>): string {
  return getI18nInstance().t(key, params);
}

/**
 * グローバル言語取得関数
 */
export function getLocale(): Locale {
  return getI18nInstance().getLocale();
}

/**
 * グローバル言語設定関数
 */
export function setLocale(locale: Locale): void {
  getI18nInstance().setLocale(locale);
}

/**
 * I18nインスタンスをリセット（テスト用）
 */
export function resetI18n(): void {
  globalI18n = null;
}
