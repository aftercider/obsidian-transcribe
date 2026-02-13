// StorageService モジュールのテスト

import { 
  StorageService, 
  type StorageConfig,
  type TranscriptMetadata,
  formatTimestamp,
  generateFrontmatter
} from '../storage/StorageService';
import type { TranscriptionResult } from '../api/TranscriptionService';

// モックVaultを作成
const createMockVault = () => ({
  adapter: {
    exists: jest.fn().mockResolvedValue(false),
    mkdir: jest.fn().mockResolvedValue(undefined),
    write: jest.fn().mockResolvedValue(undefined),
    writeBinary: jest.fn().mockResolvedValue(undefined)
  },
  getAbstractFileByPath: jest.fn().mockReturnValue(null),
  create: jest.fn().mockResolvedValue({ path: 'test.md' }),
  createBinary: jest.fn().mockResolvedValue({ path: 'test.webm' }),
  createFolder: jest.fn().mockResolvedValue(undefined)
});

describe('StorageService', () => {
  let service: StorageService;
  let mockVault: ReturnType<typeof createMockVault>;
  let mockConfig: StorageConfig;

  beforeEach(() => {
    mockVault = createMockVault();
    mockConfig = {
      audioFolder: 'recordings',
      transcriptFolder: 'transcripts'
    };
    service = new StorageService(mockVault as unknown as StorageService['vault'], mockConfig);
    jest.clearAllMocks();
  });

  describe('saveAudio', () => {
    it('音声ファイルを指定フォルダに保存する', async () => {
      const mockBlob = new Blob(['test audio'], { type: 'audio/webm;codecs=opus' });
      
      const result = await service.saveAudio(mockBlob, 120);
      
      expect(result.path).toContain('recordings/');
      expect(result.path).toContain('.webm');
    });

    it('正しいファイル名が生成される', async () => {
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      
      const result = await service.saveAudio(mockBlob, 60);
      
      // YYYY-MM-DD_HHmmss.webm 形式
      expect(result.filename).toMatch(/^\d{4}-\d{2}-\d{2}_\d{6}\.webm$/);
    });

    it('SavedAudioInfoが返却される', async () => {
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      
      const result = await service.saveAudio(mockBlob, 90);
      
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('size');
      expect(result).toHaveProperty('duration');
      expect(result.duration).toBe(90);
    });

    it('フォルダが存在しない場合は作成される', async () => {
      mockVault.adapter.exists.mockResolvedValue(false);
      const mockBlob = new Blob(['test'], { type: 'audio/webm' });
      
      await service.saveAudio(mockBlob, 60);
      
      expect(mockVault.createFolder).toHaveBeenCalled();
    });
  });

  describe('saveTranscript', () => {
    it('Markdownファイルが生成される', async () => {
      const result: TranscriptionResult = {
        text: 'こんにちは',
        segments: [{ start: 0, end: 5, text: 'こんにちは' }],
        duration: 5,
        language: 'ja'
      };
      const metadata: TranscriptMetadata = {
        date: '2026-02-10T14:30:52+09:00',
        language: 'ja',
        model: 'whisper-1',
        duration: 5,
        audioFile: 'recordings/2026-02-10_143052.webm'
      };

      const path = await service.saveTranscript(result, metadata);
      
      expect(path).toContain('transcripts/');
      expect(path).toContain('.md');
    });

    it('フロントマターが正しい形式', async () => {
      const result: TranscriptionResult = {
        text: 'テスト',
        segments: [],
        duration: 10,
        language: 'ja'
      };
      const metadata: TranscriptMetadata = {
        date: '2026-02-10T14:30:52+09:00',
        language: 'ja',
        model: 'whisper-1',
        duration: 10,
        audioFile: 'recordings/2026-02-10_143052.webm'
      };

      await service.saveTranscript(result, metadata);
      
      // create が呼ばれた際の内容を確認
      const createCall = mockVault.create.mock.calls[0];
      const content = createCall[1] as string;
      
      expect(content).toContain('---');
      expect(content).toContain('date: 2026-02-10T14:30:52+09:00');
      expect(content).toContain('language: ja');
      expect(content).toContain('model: whisper-1');
    });
  });

  describe('ensureFolder', () => {
    it('存在しないフォルダが作成される', async () => {
      mockVault.adapter.exists.mockResolvedValue(false);
      
      await service.ensureFolder('new-folder');
      
      expect(mockVault.createFolder).toHaveBeenCalledWith('new-folder');
    });

    it('既存フォルダはエラーにならない', async () => {
      mockVault.adapter.exists.mockResolvedValue(true);
      
      await expect(service.ensureFolder('existing-folder')).resolves.not.toThrow();
    });
  });

  describe('generateUniqueFilename', () => {
    it('同名ファイル存在時に連番付与', async () => {
      // 最初のファイルが存在する
      mockVault.getAbstractFileByPath
        .mockReturnValueOnce({ path: 'test.md' })  // 最初の名前は存在
        .mockReturnValueOnce(null);                  // _1 は存在しない

      const filename = await service.generateUniqueFilename('folder', '2026-02-10_143052', 'md');
      
      expect(filename).toBe('2026-02-10_143052_1.md');
    });

    it('連番が増加する', async () => {
      mockVault.getAbstractFileByPath
        .mockReturnValueOnce({ path: 'test.md' })   // 元の名前
        .mockReturnValueOnce({ path: 'test_1.md' }) // _1
        .mockReturnValueOnce({ path: 'test_2.md' }) // _2
        .mockReturnValueOnce(null);                   // _3 は存在しない

      const filename = await service.generateUniqueFilename('folder', '2026-02-10_143052', 'md');
      
      expect(filename).toBe('2026-02-10_143052_3.md');
    });
  });
});

describe('formatTimestamp', () => {
  it('0秒 → [00:00:00]', () => {
    expect(formatTimestamp(0)).toBe('[00:00:00]');
  });

  it('90秒 → [00:01:30]', () => {
    expect(formatTimestamp(90)).toBe('[00:01:30]');
  });

  it('3661秒 → [01:01:01]', () => {
    expect(formatTimestamp(3661)).toBe('[01:01:01]');
  });

  it('小数点以下は切り捨て', () => {
    expect(formatTimestamp(90.7)).toBe('[00:01:30]');
  });
});

describe('generateFrontmatter', () => {
  it('全フィールドが含まれる', () => {
    const metadata: TranscriptMetadata = {
      date: '2026-02-10T14:30:52+09:00',
      language: 'ja',
      model: 'whisper-1',
      duration: 125.4,
      audioFile: 'recordings/2026-02-10_143052.webm'
    };

    const frontmatter = generateFrontmatter(metadata);
    
    expect(frontmatter).toContain('date:');
    expect(frontmatter).toContain('language:');
    expect(frontmatter).toContain('model:');
    expect(frontmatter).toContain('duration:');
    expect(frontmatter).toContain('audio_file:');
    expect(frontmatter).toContain('tags:');
  });

  it('YAML形式として有効', () => {
    const metadata: TranscriptMetadata = {
      date: '2026-02-10T14:30:52+09:00',
      language: 'ja',
      model: 'whisper-1',
      duration: 100,
      audioFile: 'recordings/test.webm'
    };

    const frontmatter = generateFrontmatter(metadata);
    
    // YAMLの開始・終了マーカー
    expect(frontmatter.startsWith('---\n')).toBe(true);
    expect(frontmatter.endsWith('---\n')).toBe(true);
  });
});
