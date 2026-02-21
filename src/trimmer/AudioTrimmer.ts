// 音声トリミングモジュール
// 波形分析、無音検出、トリミング処理を行う

// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
const lamejs = require('lamejs');

/**
 * 音声セグメント
 */
export interface AudioSegment {
  startTime: number;      // 開始時間（秒）
  endTime: number;        // 終了時間（秒）
  isSilence: boolean;     // 無音区間か
  avgDb: number;          // 平均dB
}

/**
 * 波形データ
 */
export interface WaveformData {
  segments: AudioSegment[];
  duration: number;        // 全体の長さ（秒）
  maxDb: number;           // 最大dB
  minDb: number;           // 最小dB
  resolution: number;      // 解像度（ms）
}

/**
 * トリミング設定
 */
export interface TrimConfig {
  thresholdDb: number;         // 無音閾値（dB）、デフォルト: -40
  minSilenceDuration: number;  // 最小無音長（秒）、デフォルト: 0.6
  silenceMargin: number;       // 音声前後マージン（秒）、デフォルト: 0.2
}

/**
 * トリミング結果
 */
export interface TrimResult {
  originalDuration: number;    // 元の長さ（秒）
  trimmedDuration: number;     // トリミング後の長さ（秒）
  removedDuration: number;     // 削除された長さ（秒）
  removedPercentage: number;   // 削除割合（%）
  removedSegments: number;     // 削除された区間数
  trimmedBlob: Blob;           // トリミング済み音声
}

/**
 * デフォルトトリミング設定
 */
export const DEFAULT_TRIM_CONFIG: TrimConfig = {
  thresholdDb: -40,
  minSilenceDuration: 0.6,
  silenceMargin: 0.2
};

/**
 * RMSからdBへの変換
 */
export function rmsToDb(rms: number): number {
  if (rms <= 0) return -Infinity;
  return 20 * Math.log10(rms);
}

/**
 * dBからRMSへの変換
 */
export function dbToRms(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * 音声トリミングクラス
 */
export class AudioTrimmer {
  private resolution: number; // 解像度（ms）

  constructor(resolution: number = 200) {
    this.resolution = resolution;
  }

  /**
   * 波形分析
   * 音声Blobから波形データを生成
   */
  async analyzeWaveform(audioBlob: Blob): Promise<WaveformData> {
    const audioContext = new AudioContext();
    
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const sampleRate = audioBuffer.sampleRate;
      const samplesPerSegment = Math.floor((this.resolution / 1000) * sampleRate);
      const channelData = audioBuffer.getChannelData(0); // モノラル前提
      
      const segments: AudioSegment[] = [];
      let maxDb = -Infinity;
      let minDb = Infinity;
      
      for (let i = 0; i < channelData.length; i += samplesPerSegment) {
        const startTime = i / sampleRate;
        const endTime = Math.min((i + samplesPerSegment) / sampleRate, audioBuffer.duration);
        
        // RMS計算
        let sumSquares = 0;
        const end = Math.min(i + samplesPerSegment, channelData.length);
        for (let j = i; j < end; j++) {
          sumSquares += channelData[j] * channelData[j];
        }
        const rms = Math.sqrt(sumSquares / (end - i));
        const avgDb = rmsToDb(rms);
        
        if (avgDb > maxDb) maxDb = avgDb;
        if (avgDb < minDb && avgDb !== -Infinity) minDb = avgDb;
        
        segments.push({
          startTime,
          endTime,
          isSilence: false, // 後で計算
          avgDb
        });
      }
      
      // minDbが-Infinityの場合のフォールバック
      if (minDb === Infinity) minDb = -60;
      if (maxDb === -Infinity) maxDb = 0;
      
      return {
        segments,
        duration: audioBuffer.duration,
        maxDb,
        minDb,
        resolution: this.resolution
      };
    } finally {
      await audioContext.close();
    }
  }

  /**
   * 自動閾値計算
   * 音声データから推奨閾値を算出
   */
  calculateAutoThreshold(waveformData: WaveformData): number {
    const dbValues = waveformData.segments
      .map(s => s.avgDb)
      .filter(db => db !== -Infinity)
      .sort((a, b) => a - b);
    
    if (dbValues.length === 0) {
      return -40; // デフォルト値
    }
    
    // 下位20%の平均値を算出
    const lowerCount = Math.max(1, Math.floor(dbValues.length * 0.2));
    const lowerSum = dbValues.slice(0, lowerCount).reduce((a, b) => a + b, 0);
    const lowerAvg = lowerSum / lowerCount;
    
    // その値 + 6dB を閾値として提案
    const threshold = lowerAvg + 6;
    
    // 範囲: -60dB 〜 -20dB にクランプ
    return Math.max(-60, Math.min(-20, threshold));
  }

  /**
   * 無音区間を計算
   * 閾値に基づいて各セグメントのisSilenceを更新
   */
  calculateSilenceSegments(
    waveformData: WaveformData,
    config: TrimConfig
  ): AudioSegment[] {
    const segmentDuration = this.resolution / 1000; // セグメントの長さ（秒）
    const minSilenceSegments = Math.ceil(config.minSilenceDuration / segmentDuration);
    
    // まずは閾値でisSilenceを設定
    const segments = waveformData.segments.map(s => ({
      ...s,
      isSilence: s.avgDb <= config.thresholdDb || s.avgDb === -Infinity
    }));
    
    // 連続する無音セグメントがminSilenceSegments未満の場合は無音としない
    let silenceStartIndex: number | null = null;
    
    for (let i = 0; i <= segments.length; i++) {
      const isSilence = i < segments.length && segments[i].isSilence;
      
      if (isSilence && silenceStartIndex === null) {
        silenceStartIndex = i;
      } else if (!isSilence && silenceStartIndex !== null) {
        const silenceLength = i - silenceStartIndex;
        if (silenceLength < minSilenceSegments) {
          // 短い無音は無音としない
          for (let j = silenceStartIndex; j < i; j++) {
            segments[j].isSilence = false;
          }
        }
        silenceStartIndex = null;
      }
    }
    
    return segments;
  }

  /**
   * マージンを適用
   * 音声と無音の境界にマージンを追加
   */
  applyMargin(segments: AudioSegment[], marginSeconds: number): AudioSegment[] {
    const segmentDuration = this.resolution / 1000;
    const marginSegments = Math.ceil(marginSeconds / segmentDuration);
    
    const result = segments.map(s => ({ ...s }));
    
    // 元の入力を基準にして、音声セグメントの前後にマージンを適用
    // （resultを参照すると連鎖的にマージンが広がるため）
    for (let i = 0; i < segments.length; i++) {
      if (!segments[i].isSilence) {
        // この音声セグメントの前後にマージンを適用
        for (let j = Math.max(0, i - marginSegments); j < i; j++) {
          result[j].isSilence = false;
        }
        for (let j = i + 1; j < Math.min(result.length, i + marginSegments + 1); j++) {
          result[j].isSilence = false;
        }
      }
    }
    
    return result;
  }

  /**
   * トリミング範囲計算
   */
  calculateTrimRanges(
    waveformData: WaveformData,
    config: TrimConfig
  ): AudioSegment[] {
    const silenceSegments = this.calculateSilenceSegments(waveformData, config);
    return this.applyMargin(silenceSegments, config.silenceMargin);
  }

  /**
   * トリミング統計を計算
   */
  calculateTrimStats(
    segments: AudioSegment[],
    originalDuration: number
  ): { trimmedDuration: number; removedDuration: number; removedPercentage: number; removedSegments: number } {
    let trimmedDuration = 0;
    let removedSegmentsCount = 0;
    let inSilence = false;
    
    for (const segment of segments) {
      if (!segment.isSilence) {
        trimmedDuration += segment.endTime - segment.startTime;
      }
      
      if (segment.isSilence && !inSilence) {
        removedSegmentsCount++;
        inSilence = true;
      } else if (!segment.isSilence) {
        inSilence = false;
      }
    }
    
    const removedDuration = originalDuration - trimmedDuration;
    const removedPercentage = originalDuration > 0 
      ? (removedDuration / originalDuration) * 100 
      : 0;
    
    return {
      trimmedDuration,
      removedDuration,
      removedPercentage,
      removedSegments: removedSegmentsCount
    };
  }

  /**
   * トリミング実行
   * 無音区間を除去した音声Blobを生成
   */
  async trimAudio(
    audioBlob: Blob,
    segments: AudioSegment[]
  ): Promise<TrimResult> {
    const audioContext = new AudioContext();
    
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // 保持するセグメントの総時間を計算
      const keepRanges: { start: number; end: number }[] = [];
      let currentRange: { start: number; end: number } | null = null;
      
      for (const segment of segments) {
        if (!segment.isSilence) {
          if (currentRange && currentRange.end >= segment.startTime - 0.001) {
            // 連続するセグメントをマージ
            currentRange.end = segment.endTime;
          } else {
            if (currentRange) {
              keepRanges.push(currentRange);
            }
            currentRange = { start: segment.startTime, end: segment.endTime };
          }
        } else {
          if (currentRange) {
            keepRanges.push(currentRange);
            currentRange = null;
          }
        }
      }
      if (currentRange) {
        keepRanges.push(currentRange);
      }
      
      // トリミング後の長さを計算
      const trimmedDuration = keepRanges.reduce(
        (sum, range) => sum + (range.end - range.start),
        0
      );
      
      // 新しいAudioBufferを作成
      const sampleRate = audioBuffer.sampleRate;
      const trimmedBuffer = audioContext.createBuffer(
        audioBuffer.numberOfChannels,
        Math.ceil(trimmedDuration * sampleRate),
        sampleRate
      );
      
      // 各範囲のサンプルをコピー
      let writeOffset = 0;
      for (const range of keepRanges) {
        const startSample = Math.floor(range.start * sampleRate);
        const endSample = Math.min(
          Math.ceil(range.end * sampleRate),
          audioBuffer.length
        );
        const length = endSample - startSample;
        
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
          const sourceData = audioBuffer.getChannelData(channel);
          const destData = trimmedBuffer.getChannelData(channel);
          
          for (let i = 0; i < length && writeOffset + i < destData.length; i++) {
            destData[writeOffset + i] = sourceData[startSample + i];
          }
        }
        writeOffset += length;
      }
      
      // AudioBufferをMP3 Blobに変換（lamejs使用、即座に完了）
      const trimmedBlob = this.audioBufferToMp3Blob(trimmedBuffer);
      
      const stats = this.calculateTrimStats(segments, audioBuffer.duration);
      
      return {
        originalDuration: audioBuffer.duration,
        trimmedDuration: stats.trimmedDuration,
        removedDuration: stats.removedDuration,
        removedPercentage: stats.removedPercentage,
        removedSegments: stats.removedSegments,
        trimmedBlob
      };
    } finally {
      await audioContext.close();
    }
  }

  /**
   * AudioBufferをMP3 Blobに変換（lamejs使用、即座に完了）
   */
  private audioBufferToMp3Blob(audioBuffer: AudioBuffer): Blob {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const kbps = 128;
    const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);

    const numFrames = audioBuffer.length;
    const sampleBlockSize = 1152; // MP3フレームサイズ
    const mp3Data: Uint8Array[] = [];

    // Float32 → Int16 変換
    const floatTo16BitPCM = (float32: Float32Array): Int16Array => {
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return int16;
    };

    const leftData = floatTo16BitPCM(audioBuffer.getChannelData(0));
    const rightData = numChannels > 1 
      ? floatTo16BitPCM(audioBuffer.getChannelData(1)) 
      : undefined;

    for (let i = 0; i < numFrames; i += sampleBlockSize) {
      const leftChunk = leftData.subarray(i, i + sampleBlockSize);
      const rightChunk = rightData?.subarray(i, i + sampleBlockSize);

      let mp3buf: Uint8Array;
      if (rightChunk) {
        mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      } else {
        mp3buf = mp3encoder.encodeBuffer(leftChunk);
      }

      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }

    const end: Uint8Array = mp3encoder.flush();
    if (end.length > 0) {
      mp3Data.push(end);
    }

    return new Blob(mp3Data as BlobPart[], { type: 'audio/mpeg' });
  }
}
