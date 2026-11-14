// NovelAI 配图工作台 · 共享类型契约
export interface ApiConfig {
  id: string;
  name: string;
  baseUrl: string; // 例如 https://api.blanka.cc/v1
  apiKey: string;
  model: string; // 例如 nai-diffusion-4-5-full
  translateEndpoint?: string; // 可选 OpenAI 兼容文本端点（用于整句翻译）
  translateModel?: string;
}

export interface GenParams {
  width: number;
  height: number;
  steps: number;
  scale: number;
  sampler: string;
  seed: number | null; // null = 随机
  count: number; // 单次生成张数 1-4
}

export type ReferenceMode = 'none' | 'vibe' | 'precise';

export interface ReferenceSettings {
  mode: ReferenceMode;
  imageId: string | null; // IndexedDB 图片 id
  /** vibe transfer */
  strength: number; // 参考强度 0-1
  information: number; // 信息提取 0-1
  /** precise reference */
  refType: string; // character / style
  fidelity: number; // 保真度 0-1
}

export interface StylePreset {
  id: string;
  name: string;
  group: string; // 目录/分组名
  note: string;
  posTemplate: string; // 可含 {content} 占位符
  negTemplate: string;
  params: Partial<GenParams>;
}

export interface Fragment {
  id: string;
  text: string;
  note: string;
  autoCount: number; // 自动生图次数 0=不生成
  presetId: string | null;
  selectedImageId: string | null; // 主图
}

export interface Novel {
  id: string;
  title: string;
  fragments: Fragment[];
  updatedAt: string;
}

export interface ImageMeta {
  id: string;
  novelId: string;
  fragmentId: string | null;
  prompt: string;
  negative: string;
  params: GenParams;
  createdAt: string;
}

export const SAMPLERS = [
  'k_euler_ancestral',
  'k_euler',
  'k_dpmpp_2m',
  'k_dpmpp_2s_ancestral',
  'k_dpmpp_sde',
  'ddim',
] as const;

export const SIZE_PRESETS = [
  { label: '横版 1216×832', w: 1216, h: 832 },
  { label: '竖版 832×1216', w: 832, h: 1216 },
  { label: '方形 1024×1024', w: 1024, h: 1024 },
  { label: '宽幅 1520×640', w: 1520, h: 640 },
] as const;

export function uid(): string {
  return crypto.randomUUID();
}

export function cn2(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(' ');
}
