// Jestテスト用のセットアップファイル

// getUserMedia のデフォルトモック実装を作成
function createGetUserMediaMock() {
  return jest.fn().mockResolvedValue({
    getTracks: () => [{ stop: jest.fn() }],
    getAudioTracks: () => [{ 
      stop: jest.fn(),
      getSettings: () => ({ sampleRate: 16000 })
    }]
  });
}

// グローバルなモック設定
beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks の後にモックを再設定
  if (global.navigator?.mediaDevices) {
     
    (global.navigator.mediaDevices as any).getUserMedia = createGetUserMediaMock();
  }
});

// console.error をテスト中にキャプチャ
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalError;
});

// MediaRecorder のグローバルモック
class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: { error: Error }) => void) | null = null;
  onpause: (() => void) | null = null;
  onresume: (() => void) | null = null;
  onstart: (() => void) | null = null;

  private chunks: Blob[] = [];
  private stream: MediaStream;

  constructor(stream: MediaStream, _options?: MediaRecorderOptions) {
    this.stream = stream;
  }

  start(_timeslice?: number): void {
    this.state = 'recording';
    this.onstart?.();
  }

  stop(): void {
    this.state = 'inactive';
    // データを生成
    const blob = new Blob(this.chunks, { type: 'audio/webm;codecs=opus' });
    this.ondataavailable?.({ data: blob });
    this.onstop?.();
  }

  pause(): void {
    this.state = 'paused';
    this.onpause?.();
  }

  resume(): void {
    this.state = 'recording';
    this.onresume?.();
  }

  // テスト用: データを追加
  _addChunk(chunk: Blob): void {
    this.chunks.push(chunk);
  }

  static isTypeSupported(mimeType: string): boolean {
    return mimeType === 'audio/webm;codecs=opus' || mimeType === 'audio/webm';
  }
}

// @ts-expect-error - グローバルにモックを設定
global.MediaRecorder = MockMediaRecorder;

// navigator.mediaDevices のモック
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: createGetUserMediaMock()
  },
  writable: true
});

// AudioContext のモック
class MockAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'running';
  sampleRate = 16000;

  createAnalyser(): MockAnalyserNode {
    return new MockAnalyserNode();
  }

  createMediaStreamSource(_stream: MediaStream): { connect: (node: AudioNode) => void } {
    return {
      connect: jest.fn()
    };
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
}

class MockAnalyserNode {
  fftSize = 256;
  frequencyBinCount = 128;

  getByteFrequencyData(array: Uint8Array): void {
    // テスト用にランダムなデータを生成
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }

  connect(_destination: AudioNode): void {
    // no-op
  }
}

// @ts-expect-error - グローバルにモックを設定
global.AudioContext = MockAudioContext;

// moment のグローバルモック（Obsidianがmomentをグローバルに提供するため）
let mockMomentLocale = 'en';

 
(global as any).moment = {
  locale: () => mockMomentLocale
};

// moment のロケールを設定するヘルパー関数（テスト用）
export function setMomentLocale(locale: string): void {
  mockMomentLocale = locale;
}

// fetch のモック
global.fetch = jest.fn();

// Blob.arrayBuffer のポリフィル（jsdom用）
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function(): Promise<ArrayBuffer> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this);
    });
  };
}
