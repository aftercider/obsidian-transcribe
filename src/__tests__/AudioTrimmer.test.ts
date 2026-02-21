// AudioTrimmer モジュールのテスト

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  AudioTrimmer, 
  rmsToDb, 
  dbToRms, 
  DEFAULT_TRIM_CONFIG,
  type WaveformData,
  type AudioSegment,
  type TrimConfig
} from '../trimmer/AudioTrimmer';

describe('AudioTrimmer', () => {
  let trimmer: AudioTrimmer;

  beforeEach(() => {
    trimmer = new AudioTrimmer(200); // 200ms resolution
    vi.clearAllMocks();
  });

  describe('ユーティリティ関数', () => {
    describe('rmsToDb', () => {
      it('RMS 1.0 を 0 dB に変換', () => {
        expect(rmsToDb(1.0)).toBe(0);
      });

      it('RMS 0.1 を -20 dB に変換', () => {
        expect(rmsToDb(0.1)).toBeCloseTo(-20, 1);
      });

      it('RMS 0.01 を -40 dB に変換', () => {
        expect(rmsToDb(0.01)).toBeCloseTo(-40, 1);
      });

      it('RMS 0 を -Infinity に変換', () => {
        expect(rmsToDb(0)).toBe(-Infinity);
      });

      it('RMS 負の数を -Infinity に変換', () => {
        expect(rmsToDb(-0.1)).toBe(-Infinity);
      });
    });

    describe('dbToRms', () => {
      it('0 dB を RMS 1.0 に変換', () => {
        expect(dbToRms(0)).toBe(1);
      });

      it('-20 dB を RMS 0.1 に変換', () => {
        expect(dbToRms(-20)).toBeCloseTo(0.1, 3);
      });

      it('-40 dB を RMS 0.01 に変換', () => {
        expect(dbToRms(-40)).toBeCloseTo(0.01, 4);
      });
    });

    it('rmsToDb と dbToRms は逆関数', () => {
      const testValues = [0.001, 0.01, 0.1, 0.5, 1.0];
      for (const rms of testValues) {
        const db = rmsToDb(rms);
        const backToRms = dbToRms(db);
        expect(backToRms).toBeCloseTo(rms, 6);
      }
    });
  });

  describe('DEFAULT_TRIM_CONFIG', () => {
    it('デフォルト閾値が -40 dB', () => {
      expect(DEFAULT_TRIM_CONFIG.thresholdDb).toBe(-40);
    });

    it('最小無音長が 0.6 秒', () => {
      expect(DEFAULT_TRIM_CONFIG.minSilenceDuration).toBe(0.6);
    });

    it('マージンが 0.2 秒', () => {
      expect(DEFAULT_TRIM_CONFIG.silenceMargin).toBe(0.2);
    });
  });

  describe('calculateAutoThreshold', () => {
    it('セグメントから自動閾値を計算', () => {
      const waveformData: WaveformData = {
        segments: [
          { startTime: 0, endTime: 0.2, isSilence: false, avgDb: -50 },
          { startTime: 0.2, endTime: 0.4, isSilence: false, avgDb: -45 },
          { startTime: 0.4, endTime: 0.6, isSilence: false, avgDb: -20 },
          { startTime: 0.6, endTime: 0.8, isSilence: false, avgDb: -15 },
          { startTime: 0.8, endTime: 1.0, isSilence: false, avgDb: -10 },
        ],
        duration: 1.0,
        maxDb: -10,
        minDb: -50,
        resolution: 200
      };

      const threshold = trimmer.calculateAutoThreshold(waveformData);
      
      // 下位20%（1件）の平均は-50、+6で-44
      expect(threshold).toBeCloseTo(-44, 0);
    });

    it('空のセグメントではデフォルト値 -40 を返す', () => {
      const waveformData: WaveformData = {
        segments: [],
        duration: 0,
        maxDb: -Infinity,
        minDb: Infinity,
        resolution: 200
      };

      const threshold = trimmer.calculateAutoThreshold(waveformData);
      expect(threshold).toBe(-40);
    });

    it('閾値は -60 から -20 の範囲にクランプされる', () => {
      // すべて非常に小さい音量
      const quietData: WaveformData = {
        segments: [
          { startTime: 0, endTime: 0.2, isSilence: false, avgDb: -80 },
          { startTime: 0.2, endTime: 0.4, isSilence: false, avgDb: -75 },
        ],
        duration: 0.4,
        maxDb: -75,
        minDb: -80,
        resolution: 200
      };

      const quietThreshold = trimmer.calculateAutoThreshold(quietData);
      expect(quietThreshold).toBeGreaterThanOrEqual(-60);

      // すべて大きい音量
      const loudData: WaveformData = {
        segments: [
          { startTime: 0, endTime: 0.2, isSilence: false, avgDb: -5 },
          { startTime: 0.2, endTime: 0.4, isSilence: false, avgDb: -3 },
        ],
        duration: 0.4,
        maxDb: -3,
        minDb: -5,
        resolution: 200
      };

      const loudThreshold = trimmer.calculateAutoThreshold(loudData);
      expect(loudThreshold).toBeLessThanOrEqual(-20);
    });
  });

  describe('calculateSilenceSegments', () => {
    it('閾値以下のセグメントを無音と判定', () => {
      const waveformData: WaveformData = {
        segments: [
          { startTime: 0, endTime: 0.2, isSilence: false, avgDb: -50 },
          { startTime: 0.2, endTime: 0.4, isSilence: false, avgDb: -50 },
          { startTime: 0.4, endTime: 0.6, isSilence: false, avgDb: -50 },
          { startTime: 0.6, endTime: 0.8, isSilence: false, avgDb: -50 },
          { startTime: 0.8, endTime: 1.0, isSilence: false, avgDb: -20 },
        ],
        duration: 1.0,
        maxDb: -20,
        minDb: -50,
        resolution: 200
      };

      const config: TrimConfig = {
        thresholdDb: -40,
        minSilenceDuration: 0.6,
        silenceMargin: 0
      };

      const segments = trimmer.calculateSilenceSegments(waveformData, config);
      
      // 最初の4つ（0.8秒）は無音、最後は有音
      expect(segments[0].isSilence).toBe(true);
      expect(segments[1].isSilence).toBe(true);
      expect(segments[2].isSilence).toBe(true);
      expect(segments[3].isSilence).toBe(true);
      expect(segments[4].isSilence).toBe(false);
    });

    it('最小無音長より短い無音は無音と判定しない', () => {
      const waveformData: WaveformData = {
        segments: [
          { startTime: 0, endTime: 0.2, isSilence: false, avgDb: -20 },
          { startTime: 0.2, endTime: 0.4, isSilence: false, avgDb: -50 }, // 短い無音
          { startTime: 0.4, endTime: 0.6, isSilence: false, avgDb: -20 },
        ],
        duration: 0.6,
        maxDb: -20,
        minDb: -50,
        resolution: 200
      };

      const config: TrimConfig = {
        thresholdDb: -40,
        minSilenceDuration: 0.6, // 0.6秒以上必要
        silenceMargin: 0
      };

      const segments = trimmer.calculateSilenceSegments(waveformData, config);
      
      // 短い無音は無音と判定しない
      expect(segments[0].isSilence).toBe(false);
      expect(segments[1].isSilence).toBe(false);
      expect(segments[2].isSilence).toBe(false);
    });
  });

  describe('applyMargin', () => {
    it('音声の前後にマージンを適用', () => {
      const segments: AudioSegment[] = [
        { startTime: 0, endTime: 0.2, isSilence: true, avgDb: -50 },
        { startTime: 0.2, endTime: 0.4, isSilence: true, avgDb: -50 },
        { startTime: 0.4, endTime: 0.6, isSilence: true, avgDb: -50 },
        { startTime: 0.6, endTime: 0.8, isSilence: false, avgDb: -20 }, // 音声
        { startTime: 0.8, endTime: 1.0, isSilence: true, avgDb: -50 },
        { startTime: 1.0, endTime: 1.2, isSilence: true, avgDb: -50 },
        { startTime: 1.2, endTime: 1.4, isSilence: true, avgDb: -50 },
        { startTime: 1.4, endTime: 1.6, isSilence: true, avgDb: -50 },
      ];

      // 0.4秒のマージン = ceil(0.4/0.2) = 2セグメント
      const result = trimmer.applyMargin(segments, 0.4);

      // index 3が音声、マージン2セグメント
      // 前: index 1, 2 が保護
      // 後: index 4, 5 が保護
      // index 0, 6, 7は範囲外なので無音のまま
      const silenceStates = result.map(s => s.isSilence);
      expect(silenceStates).toEqual([true, false, false, false, false, false, true, true]);
    });

    it('マージンが元入力のみを参照し連鎖しない', () => {
      const segments: AudioSegment[] = [
        { startTime: 0, endTime: 0.2, isSilence: true, avgDb: -50 },
        { startTime: 0.2, endTime: 0.4, isSilence: true, avgDb: -50 },
        { startTime: 0.4, endTime: 0.6, isSilence: false, avgDb: -20 }, // 音声
        { startTime: 0.6, endTime: 0.8, isSilence: true, avgDb: -50 },
        { startTime: 0.8, endTime: 1.0, isSilence: true, avgDb: -50 },
      ];

      // 0.2秒 = ceil(0.2/0.2) = 1セグメント
      const result = trimmer.applyMargin(segments, 0.2);

      // index 2が音声、マージン1セグメント
      // 前: index 1 保護 / 後: index 3 保護
      // index 0, 4 は無音のまま（連鎖しない）
      const silenceStates = result.map(s => s.isSilence);
      expect(silenceStates).toEqual([true, false, false, false, true]);
    });
  });

  describe('calculateTrimStats', () => {
    it('トリミング統計を正しく計算', () => {
      const segments: AudioSegment[] = [
        { startTime: 0, endTime: 0.2, isSilence: true, avgDb: -50 },
        { startTime: 0.2, endTime: 0.4, isSilence: false, avgDb: -20 },
        { startTime: 0.4, endTime: 0.6, isSilence: false, avgDb: -20 },
        { startTime: 0.6, endTime: 0.8, isSilence: true, avgDb: -50 },
        { startTime: 0.8, endTime: 1.0, isSilence: false, avgDb: -20 },
      ];

      const stats = trimmer.calculateTrimStats(segments, 1.0);
      
      // 有効な音声: 0.2 + 0.2 + 0.2 = 0.6秒
      expect(stats.trimmedDuration).toBeCloseTo(0.6, 2);
      // 削除: 0.2 + 0.2 = 0.4秒
      expect(stats.removedDuration).toBeCloseTo(0.4, 2);
      // 削除割合: 40%
      expect(stats.removedPercentage).toBeCloseTo(40, 0);
      // 削除区間: 2箇所（先頭と中間）
      expect(stats.removedSegments).toBe(2);
    });

    it('すべて有音の場合', () => {
      const segments: AudioSegment[] = [
        { startTime: 0, endTime: 0.2, isSilence: false, avgDb: -20 },
        { startTime: 0.2, endTime: 0.4, isSilence: false, avgDb: -20 },
      ];

      const stats = trimmer.calculateTrimStats(segments, 0.4);
      
      expect(stats.trimmedDuration).toBeCloseTo(0.4, 2);
      expect(stats.removedDuration).toBeCloseTo(0, 2);
      expect(stats.removedPercentage).toBeCloseTo(0, 0);
      expect(stats.removedSegments).toBe(0);
    });
  });

  describe('calculateTrimRanges', () => {
    it('無音検出とマージン適用を組み合わせて範囲を計算', () => {
      const waveformData: WaveformData = {
        segments: [
          { startTime: 0, endTime: 0.2, isSilence: false, avgDb: -50 },
          { startTime: 0.2, endTime: 0.4, isSilence: false, avgDb: -50 },
          { startTime: 0.4, endTime: 0.6, isSilence: false, avgDb: -50 },
          { startTime: 0.6, endTime: 0.8, isSilence: false, avgDb: -50 },
          { startTime: 0.8, endTime: 1.0, isSilence: false, avgDb: -20 },
          { startTime: 1.0, endTime: 1.2, isSilence: false, avgDb: -50 },
          { startTime: 1.2, endTime: 1.4, isSilence: false, avgDb: -50 },
          { startTime: 1.4, endTime: 1.6, isSilence: false, avgDb: -50 },
          { startTime: 1.6, endTime: 1.8, isSilence: false, avgDb: -50 },
        ],
        duration: 1.8,
        maxDb: -20,
        minDb: -50,
        resolution: 200
      };

      const config: TrimConfig = {
        thresholdDb: -40,
        minSilenceDuration: 0.6,
        silenceMargin: 0.2
      };

      const segments = trimmer.calculateTrimRanges(waveformData, config);
      
      // 音声（index 4）の前後にマージンが適用される
      expect(segments[4].isSilence).toBe(false); // 音声
      expect(segments[3].isSilence).toBe(false); // マージン
      expect(segments[5].isSilence).toBe(false); // マージン
    });
  });
});
