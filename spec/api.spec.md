# API連携仕様 (Transcription API)

## 概要

OpenAI Whisper API互換のエンドポイントに音声を送信し、文字起こし結果を取得する。

## モジュール

### TranscriptionService クラス

#### 責務

- 音声ファイルのAPI送信
- 大容量ファイルのチャンク分割送信
- レスポンスのパース
- 進捗通知

#### インターフェース

```typescript
interface TranscriptionConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
  language: string;
  timeout: number;
  temperature: number;
  initialPrompt: string;
  chunkSizeMB: number;
}

interface TranscriptionProgress {
  phase: 'uploading' | 'processing' | 'completed' | 'error';
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
  currentChunk?: number;
  totalChunks?: number;
}

interface TranscriptionSegment {
  start: number;   // 開始時間（秒）
  end: number;     // 終了時間（秒）
  text: string;    // テキスト
}

interface TranscriptionResult {
  text: string;                      // 全文テキスト
  segments: TranscriptionSegment[];  // セグメント配列
  duration: number;                  // 音声の長さ（秒）
  language: string;                  // 検出された言語
}

interface TranscriptionService {
  // 文字起こし実行
  transcribe(audioBlob: Blob): Promise<TranscriptionResult>;
  
  // 接続テスト
  testConnection(): Promise<boolean>;
  
  // イベント
  onProgress: (progress: TranscriptionProgress) => void;
  onError: (error: Error) => void;
}
```

#### チャンク送信アルゴリズム

```
1. ファイルサイズを確認
2. chunkSizeMB を超える場合:
   a. サイズベースで分割
   b. 各チャンクを順次送信
   c. 結果をマージ（タイムスタンプ調整）
3. chunkSizeMB 以下の場合:
   a. 単一リクエストで送信
```

#### API リクエスト形式

```
POST {apiUrl}
Content-Type: multipart/form-data
Authorization: Bearer {apiKey}

file: (binary)
model: {model}
language: {language}
response_format: json
temperature: {temperature}
prompt: {initialPrompt}
```

#### API レスポンス形式（json）

```json
{
  "text": "文字起こし結果のテキスト"
}
```

※ verbose_json を使用しない仕様のため、セグメント情報は含まれない。
ただし、将来の拡張に備えてインターフェースには segments を含める。

---

## エラーハンドリング

| HTTPステータス | エラー種別 | 対処 |
|---------------|-----------|------|
| 401 | 認証エラー | API Key確認を促す |
| 429 | レート制限 | リトライ案内 |
| 413 | ファイルサイズ超過 | チャンク分割確認 |
| 500+ | サーバーエラー | リトライ案内 |
| timeout | タイムアウト | タイムアウト設定確認 |
| offline | ネットワークなし | 録音保存のみ完了通知 |

---

## テストケース

### TranscriptionService

1. **正常ケース: 小サイズファイル**
   - 20MB未満のファイル送信
   - TranscriptionResult が返却される

2. **正常ケース: 大サイズファイル**
   - 20MB以上のファイル送信
   - チャンク分割送信される
   - 結果がマージされる

3. **進捗通知**
   - onProgress が適切なタイミングで呼ばれる
   - percentage が 0-100 の範囲

4. **接続テスト成功**
   - testConnection() が true を返す

5. **接続テスト失敗**
   - 無効なAPI Keyで testConnection() が false を返す

6. **エラー: 認証失敗**
   - 401レスポンスで適切なエラー

7. **エラー: タイムアウト**
   - timeout超過で適切なエラー

8. **エラー: オフライン**
   - ネットワークなしで適切なエラー

9. **エラー: 無効なレスポンス**
   - JSONパースエラーで適切なエラー
