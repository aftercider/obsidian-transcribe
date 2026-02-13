# ストレージ仕様 (Storage)

## 概要

音声ファイルと文字起こし結果ファイルの保存・管理を行う。

## モジュール

### StorageService クラス

#### 責務

- 音声ファイルの保存
- 文字起こしMarkdownファイルの生成・保存
- ファイル名生成（日時ベース、重複対応）
- フォルダ作成

#### インターフェース

```typescript
interface StorageConfig {
  audioFolder: string;
  transcriptFolder: string;
}

interface SavedAudioInfo {
  path: string;           // 保存パス
  filename: string;       // ファイル名
  size: number;           // ファイルサイズ
  duration: number;       // 音声の長さ（秒）
}

interface TranscriptMetadata {
  date: string;           // ISO 8601形式
  language: string;
  model: string;
  duration: number;
  audioFile: string;      // 音声ファイルへのリンク
}

interface StorageService {
  // 音声ファイル保存
  saveAudio(blob: Blob, duration: number): Promise<SavedAudioInfo>;
  
  // 文字起こし結果保存
  saveTranscript(
    result: TranscriptionResult,
    metadata: TranscriptMetadata
  ): Promise<string>;  // 保存パスを返す
  
  // フォルダ存在確認・作成
  ensureFolder(path: string): Promise<void>;
  
  // ユニークファイル名生成
  generateUniqueFilename(
    folder: string,
    prefix: string,
    extension: string
  ): Promise<string>;
}
```

#### ファイル名生成ルール

```
基本形式: YYYY-MM-DD_HHmmss.{ext}

重複時:
  YYYY-MM-DD_HHmmss.webm
  YYYY-MM-DD_HHmmss_1.webm
  YYYY-MM-DD_HHmmss_2.webm
```

#### 文字起こしMarkdown形式

```markdown
---
date: 2026-02-10T14:30:52+09:00
language: ja
model: whisper-1
duration: 125.4
audio_file: "[[recordings/2026-02-10_143052.webm]]"
tags:
  - transcription
---

[00:00:00](recordings/2026-02-10_143052.webm) こんにちは、今日は...

[00:01:30](recordings/2026-02-10_143052.webm) 次のトピックについて...
```

#### タイムスタンプ形式

```
[HH:MM:SS](path/to/audio.webm)
```

- HH: 時（2桁、ゼロパディング）
- MM: 分（2桁、ゼロパディング）
- SS: 秒（2桁、ゼロパディング）

---

## テストケース

### StorageService

1. **音声ファイル保存**
   - Blobを指定フォルダに保存
   - 正しいファイル名が生成される
   - SavedAudioInfo が返却される

2. **文字起こし保存**
   - Markdownファイルが生成される
   - フロントマターが正しい形式
   - タイムスタンプリンクが正しい形式

3. **フォルダ作成**
   - 存在しないフォルダが作成される
   - 既存フォルダはエラーにならない

4. **ファイル名重複対応**
   - 同名ファイル存在時に連番付与
   - _1, _2, ... と増加

5. **タイムスタンプ形式**
   - 0秒 → [00:00:00]
   - 90秒 → [00:01:30]
   - 3661秒 → [01:01:01]

6. **フロントマター生成**
   - 全フィールドが含まれる
   - YAML形式として有効
