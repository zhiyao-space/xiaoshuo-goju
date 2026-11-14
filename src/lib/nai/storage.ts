// 本地持久化：localStorage 元数据 + IndexedDB 图片 Blob
import type { ApiConfig, ImageMeta, Novel, StylePreset } from './types';

const LS_PREFIX = 'goju-nai:';
const DB_NAME = 'goju-nai-images';
const STORE = 'images';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('[storage] localStorage 写入失败', e);
  }
}

// ---- API 配置 ----
export function loadApiConfigs(): ApiConfig[] {
  return read<ApiConfig[]>('apiConfigs', []);
}
export function saveApiConfigs(list: ApiConfig[]): void {
  write('apiConfigs', list);
}
export function loadActiveApiId(): string | null {
  return read<string | null>('activeApiId', null);
}
export function saveActiveApiId(id: string | null): void {
  write('activeApiId', id);
}

// ---- 画风预设 ----
export function loadPresets(): StylePreset[] {
  return read<StylePreset[]>('presets', []);
}
export function savePresets(list: StylePreset[]): void {
  write('presets', list);
}

// ---- 小说 ----
export function loadNovels(): Novel[] {
  return read<Novel[]>('novels', []);
}
export function saveNovels(list: Novel[]): void {
  write('novels', list);
}
export function loadActiveNovelId(): string | null {
  return read<string | null>('activeNovelId', null);
}
export function saveActiveNovelId(id: string | null): void {
  write('activeNovelId', id);
}

// ---- 生成图元数据 ----
export function loadImages(): ImageMeta[] {
  return read<ImageMeta[]>('images', []);
}
export function saveImages(list: ImageMeta[]): void {
  write('images', list);
}

// ---- IndexedDB 图片 Blob ----
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'));
    });
  }
  return dbPromise;
}

export async function putImageBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('图片写入失败'));
  });
}

export async function getImageBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error ?? new Error('图片读取失败'));
  });
}

export async function deleteImageBlob(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('图片删除失败'));
  });
}

// 图片 URL 缓存（Blob → objectURL），应用会话内复用
const urlCache = new Map<string, string>();

export async function getImageUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await getImageBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export async function saveImageBlob(id: string, blob: Blob): Promise<void> {
  await putImageBlob(id, blob);
}

// ---- 备份导出 / 导入 ----
export function exportAllMeta(): string {
  const payload = {
    version: 1,
    apiConfigs: loadApiConfigs(),
    activeApiId: loadActiveApiId(),
    presets: loadPresets(),
    novels: loadNovels(),
    images: loadImages(),
  };
  return JSON.stringify(payload, null, 2);
}

export async function exportAllWithImages(): Promise<Blob> {
  const meta = JSON.parse(exportAllMeta()) as { images: ImageMeta[] };
  const blobs: Record<string, string> = {};
  for (const img of meta.images) {
    const b = await getImageBlob(img.id);
    if (b) blobs[img.id] = await blobToDataUrl(b);
  }
  return new Blob([JSON.stringify({ ...meta, blobs })], { type: 'application/json' });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error('读取失败'));
    r.readAsDataURL(blob);
  });
}

export function importAllMeta(json: string): { ok: boolean; message: string } {
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    if (Array.isArray(data.apiConfigs)) saveApiConfigs(data.apiConfigs as ApiConfig[]);
    if (Array.isArray(data.presets)) savePresets(data.presets as StylePreset[]);
    if (Array.isArray(data.novels)) saveNovels(data.novels as Novel[]);
    if (Array.isArray(data.images)) saveImages(data.images as ImageMeta[]);
    return { ok: true, message: '元数据导入成功（图片需带 blobs 字段才会恢复）' };
  } catch {
    return { ok: false, message: '备份文件解析失败' };
  }
}

export async function importAllWithImages(json: string): Promise<{ ok: boolean; message: string }> {
  const base = importAllMeta(json);
  if (!base.ok) return base;
  try {
    const data = JSON.parse(json) as { blobs?: Record<string, string> };
    if (data.blobs) {
      for (const [id, dataUrl] of Object.entries(data.blobs)) {
        await putImageBlob(id, await (await fetch(dataUrl)).blob());
      }
    }
    return { ok: true, message: '备份导入成功' };
  } catch {
    return { ok: false, message: '图片恢复失败，元数据已导入' };
  }
}
