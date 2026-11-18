/* Vibe 编码 ZIP 解析/打包（零依赖，store+deflate-raw）与导入逻辑 */
import type { VibeItem } from './nai';

const u16 = (v: Uint8Array, o: number) => v[o] | (v[o + 1] << 8);
const u32 = (v: Uint8Array, o: number) =>
  (v[o] | (v[o + 1] << 8) | (v[o + 2] << 16) | (v[o + 3] << 24)) >>> 0;

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

type Entry = { name: string; method: number; csize: number; dataStart: number };

function zipListEntries(bytes: Uint8Array): Entry[] {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件');
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (u32(bytes, p) !== 0x02014b50) break;
    const method = u16(bytes, p + 10);
    const csize = u32(bytes, p + 20);
    const nlen = u16(bytes, p + 28);
    const elen = u16(bytes, p + 30);
    const clen = u16(bytes, p + 32);
    const lho = u32(bytes, p + 42);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
    const lnlen = u16(bytes, lho + 26);
    const lelen = u16(bytes, lho + 28);
    entries.push({ name, method, csize, dataStart: lho + 30 + lnlen + lelen });
    p += 46 + nlen + elen + clen;
  }
  return entries;
}

async function zipReadEntry(bytes: Uint8Array, e: Entry): Promise<Uint8Array> {
  const raw = bytes.subarray(e.dataStart, e.dataStart + e.csize);
  if (e.method === 0) return raw;
  if (e.method === 8) return await inflateRaw(raw);
  throw new Error('不支持的 ZIP 压缩方法: ' + e.method);
}

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192) as unknown as number[]);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseVibeJson(text: string): { encoded: string; infoExtracted: number } | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  const data = (obj.data ?? obj.encoded ?? obj.image) as string | undefined;
  if (typeof data !== 'string' || !data) return null;
  const info = typeof obj.information_extracted === 'number' ? obj.information_extracted : 0.6;
  return { encoded: data, infoExtracted: info };
}

export type ImportResult = { added: number; names: string[] };

/** 按扩展名分流导入：zip（内含多个 .naiv4vibe）/ .naiv4vibe / .json 捆绑 */
export async function importVibeFiles(files: File[]): Promise<ImportResult> {
  const added: VibeItem[] = [];
  const names: string[] = [];
  for (const file of files) {
    const lower = file.name.toLowerCase();
    const buf = new Uint8Array(await file.arrayBuffer());
    if (lower.endsWith('.zip') || file.type.includes('zip')) {
      const entries = zipListEntries(buf);
      for (const e of entries) {
        if (!/\.(naiv4vibe|naivibe)$/i.test(e.name) && !/\.json$/i.test(e.name)) continue;
        const text = new TextDecoder().decode(await zipReadEntry(buf, e));
        const v = parseVibeJson(text);
        if (v) {
          added.push({
            id: crypto.randomUUID(),
            name: e.name.replace(/\.[^.]+$/, ''),
            encoded: v.encoded,
            infoExtracted: v.infoExtracted,
            strength: 0.6,
          });
          names.push(e.name);
        }
      }
    } else if (/\.(naiv4vibe|naivibe|json)$/.test(lower)) {
      const v = parseVibeJson(new TextDecoder().decode(buf));
      if (!v) throw new Error(`${file.name} 里没有找到编码 data 字段`);
      added.push({
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ''),
        encoded: v.encoded,
        infoExtracted: v.infoExtracted,
        strength: 0.6,
      });
      names.push(file.name);
    } else {
      throw new Error(`不支持的文件：${file.name}（请导入 .zip / .naiv4vibe / .json）`);
    }
  }
  if (!added.length) throw new Error('没有找到可用的 vibe 编码数据');
  const list = loadVibeList();
  const merged = [...list, ...added];
  saveVibeList(merged);
  return { added: added.length, names };
}

function loadVibeList(): VibeItem[] {
  try {
    return JSON.parse(localStorage.getItem('inkan.vibes.v2') ?? '[]') as VibeItem[];
  } catch {
    return [];
  }
}
function saveVibeList(v: VibeItem[]) {
  localStorage.setItem('inkan.vibes.v2', JSON.stringify(v));
}

/* ---------- 导出 ZIP（store 不压缩，每条一个 .naiv4vibe） ---------- */
function crc32(bytes: Uint8Array): number {
  let c: number;
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function exportVibesZip(vibes: VibeItem[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  vibes.forEach((v, i) => {
    const json = JSON.stringify({
      prompt: 'vibe encoding for NAIV4',
      information_extracted: v.infoExtracted,
      data: v.encoded,
    });
    const data = enc.encode(json);
    const name = `vibe_${String(i + 1).padStart(2, '0')}_${Date.now()}.naiv4vibe`;
    const nameB = enc.encode(name);
    const crc = crc32(data);
    const lh = new Uint8Array(30 + nameB.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(26, nameB.length, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    lh.set(nameB, 30);
    chunks.push(lh, data);
    const ch = new Uint8Array(46 + nameB.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true); // store
    cv.setUint32(14, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint32(42, offset, true);
    ch.set(nameB, 46);
    central.push(ch);
    offset += lh.length + data.length;
  });
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, vibes.length, true);
  ev.setUint16(10, vibes.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of [...chunks, ...central, end]) {
    out.set(c, pos);
    pos += c.length;
  }
  return new Blob([out as BlobPart], { type: 'application/zip' });
}
