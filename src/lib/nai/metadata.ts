// PNG 参数元数据识别：解析 NovelAI 写入的 tEXt / iTXt chunk
import type { GenParams } from './types';

export interface PngMetadata {
  prompt?: string;
  negative?: string;
  steps?: number;
  scale?: number;
  sampler?: string;
  seed?: number;
  width?: number;
  height?: number;
  software?: string;
  source?: string;
}

interface TextChunk {
  keyword: string;
  text: string;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

function decodeLatin(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return decodeLatin(bytes);
  }
}

/** 从 PNG 字节流提取全部文本 chunk */
export function extractPngTextChunks(bytes: Uint8Array): TextChunk[] {
  const chunks: TextChunk[] = [];
  // PNG 签名 8 字节
  if (bytes.length < 8 || decodeLatin(bytes.slice(0, 4)) !== '\x89PNG') return chunks;
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const length = readU32(bytes, pos);
    const type = decodeLatin(bytes.slice(pos + 4, pos + 8));
    const dataStart = pos + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) break;

    if (type === 'tEXt') {
      const data = bytes.slice(dataStart, dataEnd);
      const sep = data.indexOf(0);
      if (sep > 0) {
        chunks.push({
          keyword: decodeLatin(data.slice(0, sep)),
          text: decodeLatin(data.slice(sep + 1)),
        });
      }
    } else if (type === 'iTXt') {
      const data = bytes.slice(dataStart, dataEnd);
      const kwSep = data.indexOf(0);
      if (kwSep > 0) {
        const keyword = decodeLatin(data.slice(0, kwSep));
        // compression flag(1) + compression method(1) + language tag\0 + translated keyword\0 + text
        let p = kwSep + 3;
        const langSep = data.indexOf(0, p);
        if (langSep >= 0) {
          p = langSep + 1;
          const tkSep = data.indexOf(0, p);
          if (tkSep >= 0) {
            chunks.push({ keyword, text: decodeUtf8(data.slice(tkSep + 1)) });
          }
        }
      }
    }
    if (type === 'IEND') break;
    pos = dataEnd + 4; // 跳过 CRC
  }
  return chunks;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** 解析 NovelAI 元数据（tEXt keyword 通常为 Comment / Software / Source） */
export function parseNovelAiMetadata(bytes: Uint8Array): PngMetadata | null {
  const chunks = extractPngTextChunks(bytes);
  const meta: PngMetadata = {};
  let found = false;
  for (const c of chunks) {
    if (c.keyword === 'Software' || c.keyword === 'Source') {
      meta.software = c.text;
      found = true;
    } else if (c.keyword === 'Comment' || c.keyword === 'Description') {
      try {
        const json = JSON.parse(c.text) as Record<string, unknown>;
        meta.prompt = (json.prompt as string) ?? undefined;
        meta.negative =
          (json['negative_prompt'] as string) ?? (json.uc as string) ?? undefined;
        meta.steps = num(json.steps);
        meta.scale = num(json.scale);
        meta.sampler = (json.sampler as string) ?? undefined;
        meta.seed = num(json.seed);
        meta.width = num(json.width);
        meta.height = num(json.height);
        found = true;
      } catch {
        // Description 有时是纯 prompt 文本
        meta.prompt = c.text;
        found = true;
      }
    }
  }
  return found ? meta : null;
}

export function metadataToParams(meta: PngMetadata): Partial<GenParams> {
  const p: Partial<GenParams> = {};
  if (meta.width && meta.height) {
    p.width = meta.width;
    p.height = meta.height;
  }
  if (meta.steps) p.steps = meta.steps;
  if (meta.scale) p.scale = meta.scale;
  if (meta.sampler) p.sampler = meta.sampler;
  if (meta.seed != null) p.seed = meta.seed;
  return p;
}

export async function fileToBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
