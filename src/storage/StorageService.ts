// ストレージサービスモジュール
// 音声ファイルと文字起こし結果ファイルの保存・管理

import type { Vault } from 'obsidian';
import type { TranscriptionResult } from '../api/TranscriptionService';

/**
 * ストレージ設定
 */
export interface StorageConfig {
  audioFolder: string;
  transcriptFolder: string;
}

/**
 * 保存した音声ファイル情報
 */
export interface SavedAudioInfo {
  path: string;           // 保存パス
  filename: string;       // ファイル名
  size: number;           // ファイルサイズ
  duration: number;       // 音声の長さ（秒）
}

/**
 * 文字起こしメタデータ
 */
export interface TranscriptMetadata {
  date: string;           // ISO 8601形式
  language: string;
  model: string;
  duration: number;
  audioFile: string;      // 音声ファイルへのリンク
}

/**
 * タイムスタンプを[HH:MM:SS]形式にフォーマット
 */
export function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `[${pad(hours)}:${pad(minutes)}:${pad(secs)}]`;
}

/**
 * フロントマターを生成
 */
export function generateFrontmatter(metadata: TranscriptMetadata): string {
  return `---
date: ${metadata.date}
language: ${metadata.language}
model: ${metadata.model}
duration: ${metadata.duration}
audio_file: "[[${metadata.audioFile}]]"
tags:
  - transcription
---
`;
}

/**
 * 現在の日時をファイル名用の形式で取得
 */
function getDateTimeString(): string {
  const now = new Date();
  const pad = (n: number): string => n.toString().padStart(2, '0');
  
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());

  return `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
}

/**
 * 現在の日時をISO 8601形式で取得
 */
function getISODateString(): string {
  return new Date().toISOString();
}

/**
 * ストレージサービスクラス
 */
export class StorageService {
  public vault: Vault;
  private config: StorageConfig;

  constructor(vault: Vault, config: StorageConfig) {
    this.vault = vault;
    this.config = config;
  }

  /**
   * 設定を更新
   */
  updateConfig(config: Partial<StorageConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 音声ファイルを保存
   */
  async saveAudio(blob: Blob, duration: number): Promise<SavedAudioInfo> {
    // フォルダを確保
    await this.ensureFolder(this.config.audioFolder);

    // ユニークなファイル名を生成
    const dateTimeStr = getDateTimeString();
    const filename = await this.generateUniqueFilename(
      this.config.audioFolder,
      dateTimeStr,
      'webm'
    );
    const path = `${this.config.audioFolder}/${filename}`;

    // Blobをバイナリデータに変換して保存
    const arrayBuffer = await blob.arrayBuffer();
    await this.vault.createBinary(path, arrayBuffer);

    return {
      path,
      filename,
      size: blob.size,
      duration
    };
  }

  /**
   * 文字起こし結果を保存
   */
  async saveTranscript(
    result: TranscriptionResult,
    metadata: TranscriptMetadata
  ): Promise<string> {
    // フォルダを確保
    await this.ensureFolder(this.config.transcriptFolder);

    // ユニークなファイル名を生成
    const dateTimeStr = getDateTimeString();
    const filename = await this.generateUniqueFilename(
      this.config.transcriptFolder,
      `${dateTimeStr}_transcription`,
      'md'
    );
    const path = `${this.config.transcriptFolder}/${filename}`;

    // Markdownコンテンツを生成
    const content = this.generateTranscriptContent(result, metadata);

    // ファイルを作成
    await this.vault.create(path, content);

    return path;
  }

  /**
   * 文字起こしMarkdownコンテンツを生成
   */
  private generateTranscriptContent(
    result: TranscriptionResult,
    metadata: TranscriptMetadata
  ): string {
    let content = generateFrontmatter(metadata);
    content += '\n';

    // セグメントがある場合はタイムスタンプ付きで出力
    if (result.segments && result.segments.length > 0) {
      for (const segment of result.segments) {
        const timestamp = formatTimestamp(segment.start);
        content += `${timestamp}(${metadata.audioFile}) ${segment.text}\n\n`;
      }
    } else {
      // セグメントがない場合はテキストのみ
      content += result.text;
    }

    return content;
  }

  /**
   * フォルダが存在することを確認、なければ作成
   */
  async ensureFolder(folderPath: string): Promise<void> {
    const exists = await this.vault.adapter.exists(folderPath);
    if (!exists) {
      await this.vault.createFolder(folderPath);
    }
  }

  /**
   * ユニークなファイル名を生成
   * 同名ファイルが存在する場合は連番を付与
   */
  async generateUniqueFilename(
    folder: string,
    prefix: string,
    extension: string
  ): Promise<string> {
    let filename = `${prefix}.${extension}`;
    let path = `${folder}/${filename}`;
    let counter = 0;

    // ファイルが存在する限り連番を増やす
    while (this.vault.getAbstractFileByPath(path) !== null) {
      counter++;
      filename = `${prefix}_${counter}.${extension}`;
      path = `${folder}/${filename}`;
    }

    return filename;
  }

  /**
   * 音声ファイルから文字起こしメタデータを生成
   */
  createMetadata(
    audioPath: string,
    language: string,
    model: string,
    duration: number
  ): TranscriptMetadata {
    return {
      date: getISODateString(),
      language,
      model,
      duration,
      audioFile: audioPath
    };
  }
}
