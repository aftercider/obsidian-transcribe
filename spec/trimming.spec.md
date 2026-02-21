# 音声トリミング機能仕様 (Trimming)

## 概要

録音停止後またはストレージ音声再送信時に、無音部分を自動検出してトリミングできる編集機能。
トリミングはAPI送信用のみ。保存される音声は常にオリジナル。

## フロー

### 新規録音時
```
録音停止 → トリミング編集画面 → 送信 → API送信
                ↓
         [スキップ] → オリジナル音声をAPI送信
```

### ストレージ音声再送信時
```
音声選択 → トリミング編集画面 → 送信 → API送信
                ↓
         [スキップ] → オリジナル音声をAPI送信
```

### 自動スキップ条件
- 録音時間が20秒以下の場合、トリミング画面をスキップ
- 設定でトリミング機能がOFFの場合

---

## モジュール

### AudioTrimmer クラス

#### 責務

- 音声データの波形分析（200ms単位）
- dBベースの無音検出
- トリミング範囲の計算
- トリミング済み音声Blobの生成

#### インターフェース

```typescript
interface AudioSegment {
  startTime: number;      // 開始時間（秒）
  endTime: number;        // 終了時間（秒）
  isSilence: boolean;     // 無音区間か
  avgDb: number;          // 平均dB
}

interface WaveformData {
  segments: AudioSegment[];
  duration: number;        // 全体の長さ（秒）
  maxDb: number;           // 最大dB
  minDb: number;           // 最小dB
  resolution: number;      // 解像度（ms）
}

interface TrimConfig {
  thresholdDb: number;         // 無音閾値（dB）、デフォルト: -40
  minSilenceDuration: number;  // 最小無音長（秒）、デフォルト: 0.6
  silenceMargin: number;       // 音声前後マージン（秒）、デフォルト: 0.2
}

interface TrimResult {
  originalDuration: number;    // 元の長さ（秒）
  trimmedDuration: number;     // トリミング後の長さ（秒）
  removedDuration: number;     // 削除された長さ（秒）
  removedPercentage: number;   // 削除割合（%）
  removedSegments: number;     // 削除された区間数
  trimmedBlob: Blob;           // トリミング済み音声
}

interface AudioTrimmer {
  // 波形分析
  analyzeWaveform(audioBlob: Blob): Promise<WaveformData>;
  
  // 自動閾値計算（音声データから推奨値を算出）
  calculateAutoThreshold(waveformData: WaveformData): number;
  
  // トリミング範囲計算
  calculateTrimRanges(waveformData: WaveformData, config: TrimConfig): AudioSegment[];
  
  // トリミング実行
  trimAudio(audioBlob: Blob, segments: AudioSegment[]): Promise<TrimResult>;
}
```

---

### TrimmerModal クラス（またはRecorderModalの拡張）

#### 責務

- 波形の複数行表示
- 閾値スライダー
- トリミング結果プレビュー
- 送信/スキップボタン

#### UI構成

```
┌─────────────────────────────────────────────────┐
│  ✂️ 音声トリミング                          [×] │
├─────────────────────────────────────────────────┤
│                                                 │
│  [波形表示 - 複数行]                            │
│  ████░░░░████████████████░░░░░░███████████████  │
│  ██████████████░░░░░░░░░░░░████████████████████ │
│  ████████████████████░░░░░░░░██████████████████ │
│  （灰色=無音として除去、青=残す部分）            │
│                                                 │
│  ─────────────────────────────────────────────  │
│  閾値: [=========●===] -35 dB   [自動検出]     │
│  最小無音長: 0.6秒                              │
│                                                 │
│  ─────────────────────────────────────────────  │
│  📊 トリミング結果                              │
│  ・元の長さ: 05:23                              │
│  ・トリミング後: 04:15                          │
│  ・削減: 1:08 (21%)                            │
│  ・除去区間: 3箇所                              │
│                                                 │
├─────────────────────────────────────────────────┤
│      [そのまま送信]              [送信]         │
└─────────────────────────────────────────────────┘
```

#### 波形表示仕様

| 項目 | 仕様 |
|------|------|
| 解像度 | 200ms単位 |
| 表示形式 | 複数行（横幅に収まるよう自動折り返し） |
| 1行あたり | 約30秒分（調整可） |
| 高さ | 1行あたり40px、最大5行表示、それ以上はスクロール |
| 色分け | 有効部分: 青系(#4a9eff)、無音部分: グレー(#888) |

#### ボタン

| ボタン | 動作 |
|--------|------|
| 送信 | トリミング済み音声をAPI送信 |
| そのまま送信 | オリジナル音声をAPI送信（トリミングスキップ） |

---

## 無音検出アルゴリズム

### dB計算

```typescript
// RMSからdBへの変換
function rmsToDb(rms: number): number {
  if (rms <= 0) return -Infinity;
  return 20 * Math.log10(rms);
}
```

### 自動閾値計算

1. 全セグメントのdB値をソート
2. 下位20%の平均値を算出
3. その値 + 6dB を閾値として提案
4. 範囲: -60dB 〜 -20dB にクランプ

### 無音判定条件

1. セグメントのavgDbが閾値以下
2. 連続する無音セグメントが0.6秒（3セグメント）以上
3. 無音区間の前後に0.2秒のマージンを確保

---

## 設定項目

### プラグイン設定に追加

| 設定項目 | 型 | デフォルト | 説明 |
|---------|-----|-----------|------|
| enableTrimming | boolean | true | トリミング機能を有効化 |
| autoSkipDuration | number | 20 | この秒数以下はトリミング画面をスキップ |
| defaultThresholdDb | number | -40 | 無音閾値のデフォルト値（dB） |
| minSilenceDuration | number | 0.6 | 無音と判定する最小秒数 |
| silenceMargin | number | 0.2 | 音声前後の保護マージン（秒） |

---

## 状態遷移

### ModalState拡張

```typescript
type ModalState = 
  | 'ready'      // 録音開始待ち
  | 'recording'  // 録音中
  | 'paused'     // 一時停止中
  | 'stopped'    // 録音停止
  | 'analyzing'  // 波形分析中 ★追加
  | 'trimming'   // トリミング編集中 ★追加
  | 'uploading'; // API送信中
```

### 遷移フロー

```
stopped → analyzing → trimming → uploading
              ↓           ↓
         (20秒以下)   [そのまま送信]
              ↓           ↓
           uploading ←────┘
```

---

## 技術仕様

### 波形分析

| 項目 | 詳細 |
|------|------|
| 処理 | Web Audio API (AudioContext.decodeAudioData) |
| 非同期 | WebWorker推奨（メインスレッドブロック回避） |
| メモリ | 1時間の音声で約3,000セグメント（200ms単位） |

### トリミング処理

| 項目 | 詳細 |
|------|------|
| 方式 | 有効セグメントのPCMデータを結合 |
| 出力形式 | WebM/Opus（オリジナルと同形式） |
| 処理 | MediaRecorder + AudioBufferSource で再エンコード |

### 保存仕様

| 項目 | 詳細 |
|------|------|
| ストレージ保存 | オリジナル音声のみ |
| API送信 | トリミング済み音声（またはオリジナル） |
| メタデータ | トリミング情報は保存しない |

---

## i18n キー

| キー | en | ja |
|-----|----|----|
| trimming.title | Audio Trimming | 音声トリミング |
| trimming.analyzing | Analyzing waveform... | 波形を分析中... |
| trimming.threshold | Threshold | 閾値 |
| trimming.autoDetect | Auto Detect | 自動検出 |
| trimming.minSilence | Min Silence | 最小無音長 |
| trimming.result | Trim Result | トリミング結果 |
| trimming.original | Original | 元の長さ |
| trimming.trimmed | After trim | トリミング後 |
| trimming.reduced | Reduced | 削減 |
| trimming.segments | Removed segments | 除去区間 |
| trimming.send | Send | 送信 |
| trimming.sendOriginal | Send Original | そのまま送信 |
| trimming.skipped | Trimming skipped (short recording) | トリミングをスキップ（短い録音） |

---

## テストケース

### AudioTrimmer

1. **波形分析**
   - 200ms単位でセグメント分割される
   - 各セグメントにdB値が計算される

2. **自動閾値計算**
   - 静かな音声では低い閾値（-50dB等）
   - ノイズが多い音声では高い閾値（-30dB等）

3. **無音検出**
   - 0.6秒未満の無音は検出されない
   - 閾値以下のセグメントが正しく検出される

4. **トリミング実行**
   - 無音区間が除去される
   - マージン（0.2秒）が保持される
   - 出力Blobが有効な音声データ

### TrimmerModal

1. **自動スキップ**
   - 20秒以下の録音でトリミング画面がスキップされる

2. **波形表示**
   - 複数行で表示される
   - 無音部分がグレーで表示される

3. **閾値調整**
   - スライダーで閾値変更
   - 波形の色分けがリアルタイム更新

4. **送信**
   - 「送信」でトリミング済み音声がAPI送信される
   - 「そのまま送信」でオリジナル音声がAPI送信される
