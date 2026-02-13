# 録音モーダルUI仕様 (RecorderModal)

## 概要

録音の開始/停止、一時停止/再開、API送信を行うモーダルダイアログ。

## モジュール

### RecorderModal クラス

#### 責務

- 録音操作UI
- 経過時間表示
- 音量レベルメーター表示
- 録音状態の視覚的フィードバック
- API送信確認

#### 状態

```typescript
type ModalState = 
  | 'ready'      // 録音開始待ち
  | 'recording'  // 録音中
  | 'paused'     // 一時停止中
  | 'stopped'    // 録音停止、送信待ち
  | 'uploading'; // API送信中

interface ModalDisplayState {
  state: ModalState;
  duration: string;       // "00:05:23" 形式
  audioLevel: number;     // 0-1
  uploadProgress?: {
    percentage: number;
    uploadedMB: number;
    totalMB: number;
  };
}
```

#### UI構成

```
┌─────────────────────────────────────┐
│  🎤 録音                        [×] │
├─────────────────────────────────────┤
│                                     │
│        ⏺  00:05:23                 │
│                                     │
│   ████████████░░░░░░░░  (レベル)    │
│                                     │
├─────────────────────────────────────┤
│  [録音開始]  [一時停止]  [キャンセル] │
│              [停止] [送信]          │
└─────────────────────────────────────┘
```

#### ボタン表示ルール

| 状態 | 表示ボタン |
|------|-----------|
| ready | 録音開始 |
| recording | 一時停止, 停止 |
| paused | 再開, 停止 |
| stopped | 送信, キャンセル |
| uploading | 進捗表示のみ（ボタンなし） |

#### 一時停止アイコン

- 録音中: ⏺（赤丸）
- 一時停止中: ⏸（一時停止アイコン）

#### モーダル動作

| イベント | 動作 |
|---------|------|
| モーダル外クリック | モーダルを裏に移動、録音継続 |
| ×ボタン | キャンセル確認ダイアログ表示 |
| ESCキー | モーダルを裏に移動 |
| 送信完了 | モーダルを閉じる |

#### アップロード進捗表示

```
アップロード中: 45% (12.3MB / 27.4MB)
████████████████████░░░░░░░░░░
```

---

## i18n キー

| キー | en | ja |
|-----|----|----|
| modal.title | Recording | 録音 |
| modal.start | Start Recording | 録音開始 |
| modal.pause | Pause | 一時停止 |
| modal.resume | Resume | 再開 |
| modal.stop | Stop | 停止 |
| modal.send | Send | 送信 |
| modal.cancel | Cancel | キャンセル |
| modal.uploading | Uploading: {percentage}% ({uploaded}MB / {total}MB) | アップロード中: {percentage}% ({uploaded}MB / {total}MB) |
| modal.cancelConfirm | Discard this recording? | この録音を破棄しますか？ |

---

## テストケース

### RecorderModal

1. **初期表示**
   - state が 'ready'
   - 「録音開始」ボタンが表示

2. **録音開始**
   - 「録音開始」クリックで state が 'recording'
   - 時間表示が増加
   - レベルメーターが動作

3. **一時停止**
   - 「一時停止」クリックで state が 'paused'
   - アイコンが一時停止表示
   - 時間が停止

4. **再開**
   - 「再開」クリックで state が 'recording'
   - 時間表示が再開

5. **停止**
   - 「停止」クリックで state が 'stopped'
   - 「送信」「キャンセル」ボタンが表示

6. **送信**
   - 「送信」クリックで state が 'uploading'
   - 進捗表示が更新される

7. **キャンセル確認**
   - ×ボタンで確認ダイアログ表示
   - 確認後に録音破棄

8. **モーダル外クリック**
   - モーダルが裏に移動
   - 録音は継続
