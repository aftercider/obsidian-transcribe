// TranscriptionService モジュールのテスト

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { 
  TranscriptionService, 
  type TranscriptionConfig, 
  type TranscriptionProgress,
  type TranscriptionResult 
} from '../api/TranscriptionService';

describe('TranscriptionService', () => {
  let service: TranscriptionService;
  let mockConfig: TranscriptionConfig;

  beforeEach(() => {
    mockConfig = {
      apiKey: 'test-api-key',
      apiUrl: 'https://api.openai.com/v1/audio/transcriptions',
      model: 'whisper-1',
      language: 'ja',
      timeout: 300000,
      temperature: 0,
      initialPrompt: '',
      chunkSizeMB: 20
    };
    service = new TranscriptionService(mockConfig);
    vi.clearAllMocks();
  });

  describe('正常ケース', () => {
    it('小サイズファイルの文字起こしが成功する', async () => {
      // 10MBのモックBlob
      const mockBlob = new Blob(['x'.repeat(10 * 1024 * 1024)], { type: 'audio/webm' });
      
      // fetch をモック
      const mockResponse: TranscriptionResult = {
        text: 'こんにちは、テストです。',
        segments: [],
        duration: 10,
        language: 'ja'
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: mockResponse.text })
      });

      const result = await service.transcribe(mockBlob);
      
      expect(result.text).toBe('こんにちは、テストです。');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('進捗コールバックが呼ばれる', async () => {
      const mockBlob = new Blob(['x'.repeat(1024)], { type: 'audio/webm' });
      const progressCallback = vi.fn();
      service.onProgress = progressCallback;

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'test' })
      });

      await service.transcribe(mockBlob);
      
      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe('チャンク送信', () => {
    it('20MB以上のファイルは分割送信される', async () => {
      // 30MBのモックBlob
      const mockBlob = new Blob(['x'.repeat(30 * 1024 * 1024)], { type: 'audio/webm' });
      
      (global.fetch as Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ text: '最初のチャンク' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ text: '次のチャンク' })
        });

      const result = await service.transcribe(mockBlob);
      
      // 2回呼ばれるはず（30MB / 20MB = 2チャンク）
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.text).toContain('最初のチャンク');
      expect(result.text).toContain('次のチャンク');
    });

    it('分割結果がマージされる', async () => {
      const mockBlob = new Blob(['x'.repeat(45 * 1024 * 1024)], { type: 'audio/webm' });
      
      (global.fetch as Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ text: 'パート1' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ text: 'パート2' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ text: 'パート3' })
        });

      const result = await service.transcribe(mockBlob);
      
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result.text).toBe('パート1\nパート2\nパート3');
    });
  });

  describe('接続テスト', () => {
    it('有効なAPIキーで成功する', async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      const result = await service.testConnection();
      
      expect(result).toBe(true);
    });

    it('無効なAPIキーで失敗する', async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } })
      });

      const result = await service.testConnection();
      
      expect(result).toBe(false);
    });
  });

  describe('エラーハンドリング', () => {
    it('401エラーで認証失敗エラーを返す', async () => {
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } })
      });

      await expect(service.transcribe(mockBlob)).rejects.toThrow('認証エラー');
    });

    it('429エラーでレート制限エラーを返す', async () => {
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limit exceeded' } })
      });

      await expect(service.transcribe(mockBlob)).rejects.toThrow('レート制限');
    });

    it('タイムアウトエラーを返す', async () => {
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      
      // タイムアウトをシミュレート
      (global.fetch as Mock).mockImplementationOnce(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), 100);
        })
      );

      // 短いタイムアウトを設定
      const shortTimeoutService = new TranscriptionService({
        ...mockConfig,
        timeout: 50
      });

      await expect(shortTimeoutService.transcribe(mockBlob)).rejects.toThrow();
    });

    it('ネットワークエラーを返す', async () => {
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      
      (global.fetch as Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(service.transcribe(mockBlob)).rejects.toThrow('ネットワークエラー');
    });

    it('onErrorコールバックが呼ばれる', async () => {
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      const errorCallback = vi.fn();
      service.onError = errorCallback;
      
      (global.fetch as Mock).mockRejectedValueOnce(new Error('Test error'));

      await expect(service.transcribe(mockBlob)).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe('APIリクエスト形式', () => {
    it('正しいヘッダーでリクエストする', async () => {
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'test' })
      });

      await service.transcribe(mockBlob);
      
      expect(global.fetch).toHaveBeenCalledWith(
        mockConfig.apiUrl,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockConfig.apiKey}`
          })
        })
      );
    });

    it('FormDataにmodelとlanguageが含まれる', async () => {
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'test' })
      });

      await service.transcribe(mockBlob);
      
      const callArgs = (global.fetch as Mock).mock.calls[0];
      const body = callArgs[1].body as FormData;
      
      expect(body.get('model')).toBe(mockConfig.model);
      expect(body.get('language')).toBe(mockConfig.language);
    });

    it('initialPromptが設定されている場合、promptパラメータが含まれる', async () => {
      const serviceWithPrompt = new TranscriptionService({
        ...mockConfig,
        initialPrompt: 'テスト用語'
      });
      
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'test' })
      });

      await serviceWithPrompt.transcribe(mockBlob);
      
      const callArgs = (global.fetch as Mock).mock.calls[0];
      const body = callArgs[1].body as FormData;
      
      expect(body.get('prompt')).toBe('テスト用語');
    });
  });

  describe('進捗通知', () => {
    it('進捗が0-100%の範囲', async () => {
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      const progressValues: number[] = [];
      
      service.onProgress = (progress: TranscriptionProgress) => {
        progressValues.push(progress.percentage);
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'test' })
      });

      await service.transcribe(mockBlob);
      
      progressValues.forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      });
    });

    it('phaseが正しく遷移する', async () => {
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      const phases: string[] = [];
      
      service.onProgress = (progress: TranscriptionProgress) => {
        phases.push(progress.phase);
      };

      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'test' })
      });

      await service.transcribe(mockBlob);
      
      expect(phases).toContain('uploading');
      expect(phases[phases.length - 1]).toBe('completed');
    });
  });

  describe('updateConfig', () => {
    it('設定を部分的に更新できる', () => {
      const newService = new TranscriptionService(mockConfig);
      
      newService.updateConfig({ model: 'gpt-4o-mini-transcribe' });
      
      // 更新された設定でテスト
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'test' })
      });

      // transcribe to verify config was updated
      newService.transcribe(mockBlob);
      
      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const formData = fetchCall[1].body as FormData;
      expect(formData.get('model')).toBe('gpt-4o-mini-transcribe');
    });

    it('複数の設定を同時に更新できる', () => {
      const newService = new TranscriptionService(mockConfig);
      
      newService.updateConfig({ 
        language: 'en',
        timeout: 600000,
        temperature: 0.5
      });
      
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'test' })
      });

      newService.transcribe(mockBlob);
      
      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const formData = fetchCall[1].body as FormData;
      expect(formData.get('language')).toBe('en');
    });
  });
});
