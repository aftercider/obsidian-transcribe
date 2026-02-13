// AudioRecorder モジュールのテスト

import { AudioRecorder, type RecorderState } from '../recorder/AudioRecorder';

describe('AudioRecorder', () => {
  let recorder: AudioRecorder;

  beforeEach(() => {
    recorder = new AudioRecorder();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // テスト後にクリーンアップ
    if (recorder.getState().status !== 'idle') {
      recorder.cancel();
    }
  });

  describe('初期状態', () => {
    it('status が idle', () => {
      const state = recorder.getState();
      expect(state.status).toBe('idle');
    });

    it('duration が 0', () => {
      const state = recorder.getState();
      expect(state.duration).toBe(0);
    });

    it('audioLevel が 0', () => {
      const state = recorder.getState();
      expect(state.audioLevel).toBe(0);
    });
  });

  describe('録音開始', () => {
    it('start() 後、status が recording', async () => {
      await recorder.start();
      const state = recorder.getState();
      expect(state.status).toBe('recording');
    });

    it('onStateChange コールバックが呼ばれる', async () => {
      const callback = jest.fn();
      recorder.onStateChange = callback;
      
      await recorder.start();
      
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'recording' })
      );
    });

    it('マイク権限がない場合、NotAllowedError を投げる', async () => {
      // navigator.mediaDevices.getUserMedia を拒否するようにモック
      const mockGetUserMedia = jest.fn().mockRejectedValue(
        new DOMException('Permission denied', 'NotAllowedError')
      );
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: mockGetUserMedia },
        writable: true
      });

      await expect(recorder.start()).rejects.toThrow('NotAllowedError');
    });

    it('マイクが見つからない場合、NotFoundError を投げる', async () => {
      const mockGetUserMedia = jest.fn().mockRejectedValue(
        new DOMException('No microphone found', 'NotFoundError')
      );
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: mockGetUserMedia },
        writable: true
      });

      await expect(recorder.start()).rejects.toThrow('NotFoundError');
    });

    it('その他のエラーはそのままスローされる', async () => {
      const mockGetUserMedia = jest.fn().mockRejectedValue(
        new Error('Unknown error')
      );
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: mockGetUserMedia },
        writable: true
      });

      await expect(recorder.start()).rejects.toThrow('Unknown error');
    });
  });

  describe('一時停止', () => {
    it('pause() 後、status が paused', async () => {
      await recorder.start();
      recorder.pause();
      
      const state = recorder.getState();
      expect(state.status).toBe('paused');
    });

    it('一時停止中は audioLevel が 0', async () => {
      await recorder.start();
      recorder.pause();
      
      const state = recorder.getState();
      expect(state.audioLevel).toBe(0);
    });

    it('idle状態でpause()しても何も起きない', () => {
      recorder.pause();
      expect(recorder.getState().status).toBe('idle');
    });
  });

  describe('再開', () => {
    it('resume() 後、status が recording', async () => {
      await recorder.start();
      recorder.pause();
      recorder.resume();
      
      const state = recorder.getState();
      expect(state.status).toBe('recording');
    });

    it('paused以外でresume()しても何も起きない', async () => {
      await recorder.start();
      recorder.resume();
      expect(recorder.getState().status).toBe('recording');
    });
  });

  describe('停止', () => {
    it('stop() 後、status が stopped', async () => {
      await recorder.start();
      await recorder.stop();
      
      const state = recorder.getState();
      expect(state.status).toBe('stopped');
    });

    it('stop() が Blob を返す', async () => {
      await recorder.start();
      const blob = await recorder.stop();
      
      expect(blob).toBeInstanceOf(Blob);
    });

    it('Blob の type が audio/webm;codecs=opus', async () => {
      await recorder.start();
      const blob = await recorder.stop();
      
      expect(blob.type).toBe('audio/webm;codecs=opus');
    });

    it('一時停止中からも停止できる', async () => {
      await recorder.start();
      recorder.pause();
      const blob = await recorder.stop();
      
      expect(blob).toBeInstanceOf(Blob);
      expect(recorder.getState().status).toBe('stopped');
    });
  });

  describe('キャンセル', () => {
    it('cancel() 後、status が idle', async () => {
      await recorder.start();
      recorder.cancel();
      
      const state = recorder.getState();
      expect(state.status).toBe('idle');
    });

    it('cancel() 後、duration が 0 にリセット', async () => {
      await recorder.start();
      // 少し待ってから
      await new Promise(resolve => setTimeout(resolve, 100));
      recorder.cancel();
      
      const state = recorder.getState();
      expect(state.duration).toBe(0);
    });

    it('一時停止中からもキャンセルできる', async () => {
      await recorder.start();
      recorder.pause();
      recorder.cancel();
      
      expect(recorder.getState().status).toBe('idle');
    });

    it('停止後からもキャンセルできる', async () => {
      await recorder.start();
      await recorder.stop();
      recorder.cancel();
      
      expect(recorder.getState().status).toBe('idle');
    });
  });

  describe('エラーハンドリング', () => {
    it('onError コールバックが設定できる', () => {
      const errorCallback = jest.fn();
      recorder.onError = errorCallback;
      
      expect(recorder.onError).toBe(errorCallback);
    });

    it('録音中でないときにstop()するとエラー', async () => {
      await expect(recorder.stop()).rejects.toThrow();
    });
  });

  describe('設定', () => {
    it('カスタム設定で初期化できる', () => {
      const customRecorder = new AudioRecorder({
        sampleRate: 48000,
        channelCount: 2
      });
      
      expect(customRecorder).toBeInstanceOf(AudioRecorder);
    });

    it('デフォルト設定が適用される', () => {
      const defaultRecorder = new AudioRecorder();
      const config = defaultRecorder.getConfig();
      
      expect(config.sampleRate).toBe(16000);
      expect(config.channelCount).toBe(1);
      expect(config.mimeType).toBe('audio/webm;codecs=opus');
    });
  });
});

describe('RecorderState', () => {
  it('全てのステータスが有効', () => {
    const validStatuses: RecorderState['status'][] = ['idle', 'recording', 'paused', 'stopped'];
    
    validStatuses.forEach(status => {
      expect(['idle', 'recording', 'paused', 'stopped']).toContain(status);
    });
  });
});
