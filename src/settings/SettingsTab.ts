// 設定タブ

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type WhisperTranscribePlugin from '../main';
import { t } from '../i18n';
import { exportSettings, importSettings } from './PluginSettings';

/**
 * 設定タブクラス
 */
export class SettingsTab extends PluginSettingTab {
  plugin: WhisperTranscribePlugin;

  constructor(app: App, plugin: WhisperTranscribePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // API設定セクション
    containerEl.createEl('h2', { text: t('settings.apiSection') });

    // API Key
    new Setting(containerEl)
      .setName(t('settings.apiKey'))
      .setDesc(t('settings.apiKeyDesc'))
      .addText(text => text
        .setPlaceholder('sk-...')
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value;
          await this.plugin.saveSettings();
        })
      );

    // API URL
    new Setting(containerEl)
      .setName(t('settings.apiUrl'))
      .setDesc(t('settings.apiUrlDesc'))
      .addText(text => text
        .setPlaceholder('https://api.openai.com/v1/audio/transcriptions')
        .setValue(this.plugin.settings.apiUrl)
        .onChange(async (value) => {
          this.plugin.settings.apiUrl = value;
          await this.plugin.saveSettings();
        })
      );

    // Model
    new Setting(containerEl)
      .setName(t('settings.model'))
      .setDesc(t('settings.modelDesc'))
      .addText(text => text
        .setPlaceholder('whisper-1')
        .setValue(this.plugin.settings.model)
        .onChange(async (value) => {
          this.plugin.settings.model = value;
          await this.plugin.saveSettings();
        })
      );

    // Language
    new Setting(containerEl)
      .setName(t('settings.language'))
      .setDesc(t('settings.languageDesc'))
      .addDropdown(dropdown => dropdown
        .addOptions({
          'ja': '日本語 (Japanese)',
          'en': 'English',
          'zh': '中文 (Chinese)',
          'ko': '한국어 (Korean)',
          'de': 'Deutsch (German)',
          'fr': 'Français (French)',
          'es': 'Español (Spanish)',
          'it': 'Italiano (Italian)',
          'pt': 'Português (Portuguese)',
          'ru': 'Русский (Russian)'
        })
        .setValue(this.plugin.settings.language)
        .onChange(async (value) => {
          this.plugin.settings.language = value;
          await this.plugin.saveSettings();
        })
      );

    // Timeout
    new Setting(containerEl)
      .setName(t('settings.timeout'))
      .setDesc(t('settings.timeoutDesc'))
      .addText(text => text
        .setPlaceholder('300')
        .setValue(this.plugin.settings.timeout.toString())
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num >= 1 && num <= 3600) {
            this.plugin.settings.timeout = num;
            await this.plugin.saveSettings();
          }
        })
      );

    // Temperature
    new Setting(containerEl)
      .setName(t('settings.temperature'))
      .setDesc(t('settings.temperatureDesc'))
      .addSlider(slider => slider
        .setLimits(0, 1, 0.1)
        .setValue(this.plugin.settings.temperature)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.temperature = value;
          await this.plugin.saveSettings();
        })
      );

    // Initial Prompt
    new Setting(containerEl)
      .setName(t('settings.initialPrompt'))
      .setDesc(t('settings.initialPromptDesc'))
      .addTextArea(text => text
        .setPlaceholder('')
        .setValue(this.plugin.settings.initialPrompt)
        .onChange(async (value) => {
          this.plugin.settings.initialPrompt = value;
          await this.plugin.saveSettings();
        })
      );

    // 接続テストボタン
    new Setting(containerEl)
      .setName(t('settings.testConnection'))
      .addButton(button => button
        .setButtonText(t('settings.testConnection'))
        .onClick(async () => {
          button.setDisabled(true);
          try {
            const success = await this.plugin.testConnection();
            if (success) {
              new Notice(t('settings.testSuccess'));
            } else {
              new Notice(t('settings.testFailed', { error: 'Connection failed' }));
            }
          } catch (error) {
            new Notice(t('settings.testFailed', { error: (error as Error).message }));
          } finally {
            button.setDisabled(false);
          }
        })
      );

    // 保存設定セクション
    containerEl.createEl('h2', { text: t('settings.storageSection') });

    // Audio Folder
    new Setting(containerEl)
      .setName(t('settings.audioFolder'))
      .setDesc(t('settings.audioFolderDesc'))
      .addText(text => text
        .setPlaceholder('recordings')
        .setValue(this.plugin.settings.audioFolder)
        .onChange(async (value) => {
          this.plugin.settings.audioFolder = value;
          await this.plugin.saveSettings();
        })
      );

    // Transcript Folder
    new Setting(containerEl)
      .setName(t('settings.transcriptFolder'))
      .setDesc(t('settings.transcriptFolderDesc'))
      .addText(text => text
        .setPlaceholder('transcripts')
        .setValue(this.plugin.settings.transcriptFolder)
        .onChange(async (value) => {
          this.plugin.settings.transcriptFolder = value;
          await this.plugin.saveSettings();
        })
      );

    // Chunk Size
    new Setting(containerEl)
      .setName(t('settings.chunkSize'))
      .setDesc(t('settings.chunkSizeDesc'))
      .addText(text => text
        .setPlaceholder('20')
        .setValue(this.plugin.settings.chunkSizeMB.toString())
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num >= 1 && num <= 24) {
            this.plugin.settings.chunkSizeMB = num;
            await this.plugin.saveSettings();
          }
        })
      );

    // トリミング設定セクション
    containerEl.createEl('h2', { text: t('settings.trimmingSection') });

    // Enable Trimming
    new Setting(containerEl)
      .setName(t('settings.enableTrimming'))
      .setDesc(t('settings.enableTrimmingDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableTrimming)
        .onChange(async (value) => {
          this.plugin.settings.enableTrimming = value;
          await this.plugin.saveSettings();
        })
      );

    // Auto Skip Duration
    new Setting(containerEl)
      .setName(t('settings.autoSkipDuration'))
      .setDesc(t('settings.autoSkipDurationDesc'))
      .addText(text => text
        .setPlaceholder('20')
        .setValue(this.plugin.settings.autoSkipDuration.toString())
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num >= 0 && num <= 300) {
            this.plugin.settings.autoSkipDuration = num;
            await this.plugin.saveSettings();
          }
        })
      );

    // Default Threshold (dB)
    new Setting(containerEl)
      .setName(t('settings.defaultThresholdDb'))
      .setDesc(t('settings.defaultThresholdDbDesc'))
      .addSlider(slider => slider
        .setLimits(-60, -10, 1)
        .setValue(this.plugin.settings.defaultThresholdDb)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.defaultThresholdDb = value;
          await this.plugin.saveSettings();
        })
      );

    // Min Silence Duration
    new Setting(containerEl)
      .setName(t('settings.minSilenceDuration'))
      .setDesc(t('settings.minSilenceDurationDesc'))
      .addText(text => text
        .setPlaceholder('0.6')
        .setValue(this.plugin.settings.minSilenceDuration.toString())
        .onChange(async (value) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num >= 0.1 && num <= 5.0) {
            this.plugin.settings.minSilenceDuration = num;
            await this.plugin.saveSettings();
          }
        })
      );

    // Silence Margin
    new Setting(containerEl)
      .setName(t('settings.silenceMargin'))
      .setDesc(t('settings.silenceMarginDesc'))
      .addText(text => text
        .setPlaceholder('0.2')
        .setValue(this.plugin.settings.silenceMargin.toString())
        .onChange(async (value) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num >= 0 && num <= 1.0) {
            this.plugin.settings.silenceMargin = num;
            await this.plugin.saveSettings();
          }
        })
      );

    // インポート/エクスポートセクション
    containerEl.createEl('h2', { text: 'Import / Export' });

    // エクスポートボタン
    new Setting(containerEl)
      .setName(t('settings.export'))
      .addButton(button => button
        .setButtonText(t('settings.export'))
        .onClick(() => {
          this.exportSettingsToFile();
        })
      );

    // インポートボタン
    new Setting(containerEl)
      .setName(t('settings.import'))
      .addButton(button => button
        .setButtonText(t('settings.import'))
        .onClick(() => {
          this.importSettingsFromFile();
        })
      );
  }

  /**
   * 設定をファイルにエクスポート
   */
  private exportSettingsToFile(): void {
    const exported = exportSettings(this.plugin.settings, this.plugin.manifest.version);
    const json = JSON.stringify(exported, null, 2);
    
    // ダウンロード用のBlobを作成
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // ダウンロードリンクを作成してクリック
    const a = document.createElement('a');
    a.href = url;
    a.download = 'whisper-transcribe-settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * ファイルから設定をインポート
   */
  private importSettingsFromFile(): void {
    // ファイル選択UIを作成
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (event): Promise<void> => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const exported = JSON.parse(text);
        
        if (!exported.version || !exported.settings) {
          throw new Error('Invalid settings file format');
        }

        this.plugin.settings = importSettings(exported, this.plugin.settings);
        await this.plugin.saveSettings();
        
        // UIを更新
        this.display();
        
        new Notice(t('settings.importSuccess'));
      } catch (error) {
        new Notice(t('settings.importFailed', { error: (error as Error).message }));
      }
    };

    input.click();
  }
}
