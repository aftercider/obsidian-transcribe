# 録音機能仕様 (Recording)

## 概要

WebブラウザのMediaRecorder APIを使用して音声を録音する機能。

## モジュール

### AudioRecorder クラス

#### 責務

- マイクからの音声入力キャプチャ
- WebM/Opus形式での録音
- 一時停止/再開
- 音量レベルの取得

#### インターフェース

```typescript
interface RecorderState {
  status: 'idle' | 'recording' | 'paused' | 'stopped';
  duration: number;        // 録音時間（秒）
  audioLevel: number;      // 音量レベル（0-1）
}

interface RecorderConfig {
  sampleRate: number;      // デフォルト: 16000
  channelCount: number;    // デフォルト: 1（モノラル）
  mimeType: string;        // デフォルト: 'audio/webm;codecs=opus'
}

interface AudioRecorder {
  // 状態
  getState(): RecorderState;
  
  // 操作
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): Promise<Blob>;
  cancel(): void;
  
  // イベント
  onStateChange: (state: RecorderState) => void;
  onError: (error: Error) => void;
}
```

#### 状態遷移

```
idle -> recording (start)
recording -> paused (pause)
recording -> stopped (stop)
paused -> recording (resume)
paused -> stopped (stop)
* -> idle (cancel)
```

#### エラーケース

| エラー | 原因 | 対処 |
|--------|------|------|
| NotAllowedError | マイク権限拒否 | 権限ガイダンス表示 |
| NotFoundError | マイクなし | エラー通知 |
| NotSupportedError | MediaRecorder非対応 | エラー通知 |

---

## テストケース

### AudioRecorder

1. **初期状態**
   - status が 'idle'
   - duration が 0
   - audioLevel が 0

2. **録音開始**
   - start() 後、status が 'recording'
   - duration が増加
   - audioLevel が更新される

3. **一時停止**
   - pause() 後、status が 'paused'
   - duration が停止
   - audioLevel が 0

4. **再開**
   - resume() 後、status が 'recording'
   - duration が再開

5. **停止**
   - stop() 後、status が 'stopped'
   - Blob が返却される
   - Blob の type が 'audio/webm;codecs=opus'

6. **キャンセル**
   - cancel() 後、status が 'idle'
   - Blob は返却されない

7. **エラー: マイク権限拒否**
   - start() で NotAllowedError
   - onError コールバック呼び出し

8. **長時間録音**
   - 24時間の録音に対応（メモリリーク確認）
