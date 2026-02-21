# 設定画面仕様 (Settings)

## 概要

プラグイン設定を管理する設定タブ。

## モジュール

### SettingTab クラス

#### 責務

- 設定UIの表示
- 設定値の保存
- API接続テスト
- 設定のインポート/エクスポート

#### 設定項目

##### API設定セクション

| 項目 | 入力タイプ | バリデーション |
|-----|-----------|---------------|
| API Key | テキスト（password） | 必須 |
| API URL | テキスト | URL形式 |
| Model | ドロップダウン/テキスト | 必須 |
| Language | ドロップダウン | 言語コード |
| Timeout (秒) | 数値 | 1-3600 |
| Temperature | スライダー | 0-1 |
| Initial Prompt | テキストエリア | 任意 |

##### 保存設定セクション

| 項目 | 入力タイプ | バリデーション |
|-----|-----------|---------------|
| Audio Folder | テキスト（フォルダ提案） | パス形式 |
| Transcript Folder | テキスト（フォルダ提案） | パス形式 |
| Chunk Size (MB) | 数値 | 1-24 |

##### トリミング設定セクション

| 項目 | 入力タイプ | バリデーション |
|-----|-----------|---------------|
| Enable Trimming | トグル | - |
| Auto Skip Duration (秒) | 数値 | 0-300 |
| Default Threshold (dB) | スライダー | -60〜-10 |
| Min Silence Duration (秒) | 数値 | 0.1-5.0 |
| Silence Margin (秒) | 数値 | 0-1.0 |

##### アクション

| ボタン | 機能 |
|-------|------|
| Test Connection | API接続テスト |
| Export Settings | 設定をJSON出力 |
| Import Settings | JSONから設定読込 |

#### 設定データ構造

```typescript
interface PluginSettings {
  // API設定
  apiKey: string;
  apiUrl: string;
  model: string;
  language: string;
  timeout: number;
  temperature: number;
  initialPrompt: string;
  
  // 保存設定
  audioFolder: string;
  transcriptFolder: string;
  chunkSizeMB: number;
  
  // トリミング設定
  enableTrimming: boolean;
  autoSkipDuration: number;
  defaultThresholdDb: number;
  minSilenceDuration: number;
  silenceMargin: number;
}

const DEFAULT_SETTINGS: PluginSettings = {
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
```

#### エクスポート形式

```json
{
  "version": "0.1.0",
  "settings": {
    "apiUrl": "https://api.openai.com/v1/audio/transcriptions",
    "model": "whisper-1",
    "language": "ja",
    "timeout": 300,
    "temperature": 0,
    "initialPrompt": "",
    "audioFolder": "recordings",
    "transcriptFolder": "transcripts",
    "chunkSizeMB": 20,
    "enableTrimming": true,
    "autoSkipDuration": 20,
    "defaultThresholdDb": -40,
    "minSilenceDuration": 0.6,
    "silenceMargin": 0.2
  }
}
```

※ apiKey はセキュリティのためエクスポートに含めない

---

## i18n キー

| キー | en | ja |
|-----|----|----|
| settings.title | Whisper Transcribe Settings | Whisper Transcribe 設定 |
| settings.apiKey | API Key | API キー |
| settings.apiUrl | API URL | API URL |
| settings.model | Model | モデル |
| settings.language | Language | 言語 |
| settings.timeout | Timeout (seconds) | タイムアウト (秒) |
| settings.temperature | Temperature | 温度 |
| settings.initialPrompt | Initial Prompt | 初期プロンプト |
| settings.audioFolder | Audio Folder | 音声フォルダ |
| settings.transcriptFolder | Transcript Folder | 文字起こしフォルダ |
| settings.chunkSize | Chunk Size (MB) | チャンクサイズ (MB) |
| settings.enableTrimming | Enable Trimming | トリミングを有効化 |
| settings.autoSkipDuration | Auto Skip Duration (sec) | 自動スキップ秒数 |
| settings.defaultThresholdDb | Default Threshold (dB) | デフォルト閾値 (dB) |
| settings.minSilenceDuration | Min Silence Duration (sec) | 最小無音長 (秒) |
| settings.silenceMargin | Silence Margin (sec) | 無音マージン (秒) |
| settings.testConnection | Test Connection | 接続テスト |
| settings.testSuccess | Connection successful | 接続成功 |
| settings.testFailed | Connection failed | 接続失敗 |
| settings.export | Export Settings | 設定をエクスポート |
| settings.import | Import Settings | 設定をインポート |
| settings.importSuccess | Settings imported | 設定をインポートしました |

---

## テストケース

### SettingTab

1. **初期表示**
   - デフォルト値が設定される
   - すべての入力項目が表示される

2. **設定保存**
   - 値変更後に保存される
   - 再読み込み後も値が維持される

3. **バリデーション**
   - 不正なURL形式でエラー表示
   - timeout範囲外でエラー表示

4. **接続テスト成功**
   - 有効な設定で成功メッセージ

5. **接続テスト失敗**
   - 無効なAPI Keyで失敗メッセージ

6. **設定エクスポート**
   - JSONファイルがダウンロードされる
   - apiKey が含まれない

7. **設定インポート**
   - JSONファイルから設定が読み込まれる
   - インポート成功メッセージ

8. **インポート失敗**
   - 不正なJSONでエラーメッセージ
