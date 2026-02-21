# Whisper Transcribe for Obsidian

[![CI](https://github.com/aftercider/obsidian-transcribe/actions/workflows/ci.yml/badge.svg)](https://github.com/aftercider/obsidian-transcribe/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/aftercider/obsidian-transcribe/graph/badge.svg)](https://codecov.io/gh/aftercider/obsidian-transcribe)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22whisper-transcribe%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)](https://obsidian.md/plugins?id=whisper-transcribe)

Obsidian用の音声録音・文字起こしプラグイン。OpenAI Whisper APIを使用して、録音した音声をリアルタイムで文字起こしします。

## 機能

- 🎙️ **音声録音** - ブラウザのMediaRecorder APIを使用した高品質録音
- ⏸️ **一時停止/再開** - 録音中に一時停止・再開が可能
- 📊 **音量レベル表示** - リアルタイムで音量レベルを可視化
- 🔄 **自動チャンク分割** - 20MB以上の大容量ファイルを自動分割送信
- 🌐 **多言語対応** - 日本語・英語UI、10言語の文字起こし対応
- 📁 **ファイル管理** - 音声ファイルと文字起こし結果を自動保存

## インストール

### 手動インストール

1. [Releases](https://github.com/aftercider/obsidian-transcribe/releases)から最新版をダウンロード
2. `main.js`、`manifest.json`、`styles.css`をVaultの`.obsidian/plugins/whisper-transcribe/`にコピー
3. Obsidianを再起動
4. 設定 → コミュニティプラグイン → Whisper Transcribeを有効化

### 開発版インストール

```bash
cd your-vault/.obsidian/plugins
git clone https://github.com/aftercider/obsidian-transcribe.git whisper-transcribe
cd whisper-transcribe
npm install
npm run build
```

## 使い方

### 録音を開始

1. コマンドパレット（`Ctrl/Cmd + P`）を開く
2. 「Whisper Transcribe: 録音開始」を選択
3. 録音モーダルが表示される

### 録音モーダル

| ボタン | 機能 |
|--------|------|
| 🎙️ 録音開始 | 録音を開始 |
| ⏸️ 一時停止 | 録音を一時停止 |
| ▶️ 再開 | 一時停止から再開 |
| ⏹️ 停止 | 録音を停止 |
| 📤 送信 | Whisper APIに送信して文字起こし |
| ❌ キャンセル | 録音を破棄 |

### 既存の音声ファイルを文字起こし

1. ファイルエクスプローラーで音声ファイルを右クリック
2. 「文字起こし」を選択

対応形式: `.webm`, `.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`

## 設定

### API設定

| 項目 | 説明 | デフォルト |
|------|------|-----------|
| API Key | OpenAI APIキー（必須） | - |
| API URL | Whisper APIエンドポイント | `https://api.openai.com/v1/audio/transcriptions` |
| Model | 使用するモデル | `whisper-1` |
| Language | 文字起こし言語 | `ja`（日本語） |
| Timeout | タイムアウト秒数 | 300秒 |
| Temperature | 出力のランダム性 | 0 |
| Initial Prompt | 文字起こしの補助プロンプト | - |

### 保存設定

| 項目 | 説明 | デフォルト |
|------|------|-----------|
| Audio Folder | 音声ファイルの保存先 | `recordings` |
| Transcript Folder | 文字起こし結果の保存先 | `transcripts` |
| Chunk Size | 分割送信サイズ（MB） | 20 |

### 対応言語

文字起こし対応言語:
- 日本語 (ja)
- 英語 (en)
- 中国語 (zh)
- 韓国語 (ko)
- ドイツ語 (de)
- フランス語 (fr)
- スペイン語 (es)
- イタリア語 (it)
- ポルトガル語 (pt)
- ロシア語 (ru)

## 文字起こし結果

文字起こし結果は以下の形式でMarkdownファイルとして保存されます：

```markdown
---
created: 2026-02-10T12:34:56
duration: 120
model: whisper-1
language: ja
audio_file: recordings/recording_20260210_123456.webm
---

文字起こしされたテキストがここに入ります。
```

## 開発

### 必要環境

- Node.js v24以上
- npm

### セットアップ

```bash
npm install
```

### ビルド

```bash
# 開発ビルド（監視モード）
npm run dev

# 本番ビルド
npm run build
```

### テスト

```bash
# 全テスト実行
npm test

# カバレッジ付き
npm run test:coverage
```

### リント

```bash
npm run lint
```

## ライセンス

Apache License 2.0

## 謝辞

- [Obsidian](https://obsidian.md/) - ナレッジベースアプリケーション
- [OpenAI Whisper](https://openai.com/research/whisper) - 音声認識モデル
