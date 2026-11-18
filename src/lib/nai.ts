/* NovelAI 中转站生图核心：API 配置存储、尺寸预设、中文转译、payload 构建、生图请求 */

export type ApiConfig = {
  base: string;
  key: string;
  model: string;
  steps: number;
  scale: number;
  sampler: string;
  negative: string;
};

export type VibeItem = {
  id: string;
  name: string;
  encoded: string; // 编码本体 base64
  infoExtracted: number;
  strength: number;
};

const LS_API = 'inkan.api.v2';
const LS_VIBES = 'inkan.vibes.v2';
const LS_GALLERY = 'inkan.gallery.v2';

export const DEFAULT_API: ApiConfig = {
  base: '',
  key: '',
  model: 'nai-diffusion-4-5-curated',
  steps: 28,
  scale: 5,
  sampler: 'k_euler_ancestral',
  negative: 'lowres, bad anatomy, bad hands, text, watermark',
};

export const MODELS = [
  'nai-diffusion-4-5-curated',
  'nai-diffusion-4-5-full',
  'nai-diffusion-4-full',
  'nai-diffusion-4-curated',
  'nai-diffusion-3',
];

export const SAMPLERS = [
  'k_euler_ancestral',
  'k_euler',
  'k_dpmpp_2m',
  'k_dpmpp_sde',
  'k_dpmpp_2s_ancestral',
  'ddim',
];

/* NovelAI 常用内置尺寸 */
export const SIZE_PRESETS = [
  { label: '竖版 Normal', w: 832, h: 1216 },
  { label: '横版 Normal', w: 1216, h: 832 },
  { label: '方形 Large', w: 1024, h: 1024 },
  { label: '竖版 Tall', w: 896, h: 1152 },
  { label: '横版 Wide', w: 1152, h: 896 },
  { label: '超宽幅', w: 1472, h: 704 },
  { label: '超长幅', w: 704, h: 1472 },
  { label: '手机壁纸', w: 768, h: 1280 },
];

/* ---------- 本地存储 ---------- */
function lsGet<T>(k: string, fb: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? '');
    return v == null ? fb : v;
  } catch {
    return fb;
  }
}
function lsSet(k: string, v: unknown) {
  localStorage.setItem(k, JSON.stringify(v));
}

export function loadApi(): ApiConfig {
  return { ...DEFAULT_API, ...lsGet<Partial<ApiConfig>>(LS_API, {}) };
}
export function saveApi(cfg: ApiConfig) {
  lsSet(LS_API, cfg);
}

export function loadVibes(): VibeItem[] {
  return lsGet<VibeItem[]>(LS_VIBES, []);
}
export function saveVibes(v: VibeItem[]) {
  lsSet(LS_VIBES, v);
}

export type GalleryItem = {
  id: string;
  dataUri: string;
  prompt: string;
  zh: string;
  width: number;
  height: number;
  time: number;
};

export function loadGallery(): GalleryItem[] {
  return lsGet<GalleryItem[]>(LS_GALLERY, []);
}
export function saveGallery(g: GalleryItem[]) {
  // 最多保留 24 张，避免 localStorage 爆掉
  lsSet(LS_GALLERY, g.slice(0, 24));
}

/* ---------- 中文 → 英文 tag 转译（NovelAI 不识别中文） ---------- */
const DICT: Record<string, string> = {
  少女: '1girl', 女孩: '1girl', 女生: '1girl', 少年: '1boy', 男孩: '1boy', 男生: '1boy',
  女人: '1woman', 男人: '1man', 孩子: 'child', 公主: 'princess', 王子: 'prince',
  骑士: 'knight', 武士: 'samurai', 剑士: 'swordsman', 法师: 'mage', 巫女: 'shrine maiden',
  女仆: 'maid', 天使: 'angel', 恶魔: 'demon', 精灵: 'elf', 狐狸: 'fox', 猫: 'cat', 猫耳: 'cat ears',
  兔耳: 'rabbit ears', 龙: 'dragon', 怪物: 'monster', 幽灵: 'ghost', 机器人: 'robot',
  长发: 'long hair', 短发: 'short hair', 白发: 'white hair', 黑发: 'black hair', 金发: 'blonde hair',
  银发: 'silver hair', 红发: 'red hair', 蓝发: 'blue hair', 双马尾: 'twintails', 马尾: 'ponytail',
  辫子: 'braid', 卷发: 'curly hair', 刘海: 'bangs',
  红眼: 'red eyes', 蓝眼: 'blue eyes', 金瞳: 'golden eyes', 绿眼: 'green eyes', 紫眼: 'purple eyes',
  微笑: 'smile', 大笑: 'laughing', 哭泣: 'crying', 流泪: 'tears', 生气: 'angry', 害羞: 'blush',
  惊讶: 'surprised', 闭眼: 'closed eyes', 害怕: 'scared', 认真: 'serious', 冷酷: 'cold expression',
  裙子: 'dress', 长裙: 'long dress', 短裙: 'short skirt', 校服: 'school uniform', 制服: 'uniform',
  和服: 'kimono', 浴衣: 'yukata', 旗袍: 'china dress', 铠甲: 'armor', 长袍: 'robe', 斗篷: 'cloak',
  披风: 'cape', 婚纱: 'wedding dress', 泳装: 'swimsuit',
  帽子: 'hat', 发饰: 'hair ornament', 耳环: 'earrings', 项链: 'necklace', 眼镜: 'glasses',
  剑: 'sword', 长剑: 'longsword', 刀: 'katana', 弓: 'bow', 法杖: 'staff', 魔杖: 'wand',
  雨伞: 'umbrella', 伞: 'umbrella', 花: 'flower', 樱花: 'cherry blossoms', 玫瑰: 'rose',
  夜晚: 'night', 白天: 'daytime', 黄昏: 'dusk', 黎明: 'dawn', 星空: 'starry sky', 月亮: 'moon',
  太阳: 'sun', 雪: 'snow', 雨: 'rain', 风: 'wind', 云: 'clouds', 雷: 'lightning',
  森林: 'forest', 山: 'mountain', 海: 'sea', 大海: 'ocean', 海边: 'seaside',
  天空: 'sky', 城市: 'city', 街道: 'street', 教室: 'classroom', 房间: 'room', 卧室: 'bedroom',
  花园: 'garden', 庭院: 'courtyard', 城堡: 'castle', 宫殿: 'palace', 神社: 'shrine',
  废墟: 'ruins', 战场: 'battlefield', 篝火: 'bonfire', 灯笼: 'lantern', 蜡烛: 'candle',
  古风: 'ancient chinese style', 国风: 'chinese style', 二次元: 'anime style',
  水彩: 'watercolor', 油画: 'oil painting', 厚涂: 'impasto', 赛璐璐: 'cel shading',
  可爱: 'cute', 美丽: 'beautiful', 帅气: 'handsome', 温柔: 'gentle', 孤独: 'lonely',
  悲伤: 'sad', 幸福: 'happy', 梦幻: 'dreamy', 神秘: 'mysterious', 宁静: 'tranquil',
  战斗: 'battle', 决斗: 'duel', 奔跑: 'running', 站立: 'standing', 坐: 'sitting',
  回眸: 'looking back', 仰望: 'looking up', 特写: 'close-up', 全身: 'full body', 半身: 'upper body',
  逆光: 'backlighting', 侧脸: 'profile', 光效: 'light effects', 光斑: 'dappled sunlight',
  飞舞: 'fluttering', 飘落: 'falling', 花瓣: 'petals', 飘落的花瓣: 'falling petals',
  蝴蝶: 'butterfly', 鸟: 'bird', 萤火虫: 'fireflies', 鹿: 'deer', 狼: 'wolf',
  大师之作: 'masterpiece', 杰作: 'masterpiece', 最佳画质: 'best quality', 高清: 'high resolution',
  精致: 'extremely detailed', 细节丰富: 'intricate details',
};

const KEYS = Object.keys(DICT).sort((a, b) => b.length - a.length);

/** 把中文片段描述转译成英文 tag 串，返回结果与未匹配中文 */
export function translateZhToEn(text: string): { result: string; unmatched: string[] } {
  if (!text) return { result: '', unmatched: [] };
  const unmatched: string[] = [];
  const result = text.replace(/[\u4e00-\u9fff，。、；：！？（）·—]+/g, (seg) => {
    let out = seg;
    for (const k of KEYS) {
      if (out.includes(k)) out = out.split(k).join(', ' + DICT[k] + ', ');
    }
    const leftover = out.replace(/[\s,]+/g, '');
    if (/[\u4e00-\u9fff]/.test(leftover)) {
      const zh = seg.replace(/[，。、；：！？（）·—\s]/g, '');
      if (zh) unmatched.push(zh);
    }
    return out;
  });
  return {
    result: result.replace(/(,\s*)+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/^[\s,]+|[\s,]+$/g, ''),
    unmatched: [...new Set(unmatched)],
  };
}

/* ---------- 生成 payload 与请求 ---------- */
export type GenParams = {
  prompt: string;
  width: number;
  height: number;
  seed?: number | null;
  vibes: VibeItem[]; // 已启用的 vibe
};

export function buildPayload(cfg: ApiConfig, p: GenParams): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    prompt: p.prompt,
    negative_prompt: cfg.negative,
    size: [p.width, p.height],
    steps: cfg.steps,
    scale: cfg.scale,
    sampler: cfg.sampler,
    seed: p.seed != null ? p.seed : Math.floor(Math.random() * 2 ** 32),
  };
  const v = p.vibes.filter((x) => x.encoded);
  if (v.length) {
    payload.use_reference_image = true;
    payload.reference_image_multiple = v.map((x) => x.encoded);
    payload.reference_information_extracted_multiple = v.map((x) => x.infoExtracted);
    payload.reference_strength_multiple = v.map((x) => x.strength);
    payload.normalize_reference_strength_multiple = true;
  }
  return payload;
}

function extractDataUris(text: string): string[] {
  const re = /data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+/g;
  return text.match(re) ?? [];
}

export function genEndpoint(cfg: ApiConfig): string {
  return cfg.base.replace(/\/+$/, '') + '/chat/completions';
}

/** 通过中转站 OpenAI Chat 兼容端点生图，返回图片 dataUri 列表 */
export async function generateImage(
  cfg: ApiConfig,
  p: GenParams,
  signal: AbortSignal,
): Promise<string[]> {
  if (!cfg.base || !cfg.key) throw new Error('请先在「API 配置」填写中转站地址与 Key');
  const payload = buildPayload(cfg, p);
  const res = await fetch(genEndpoint(cfg), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
    body: JSON.stringify({
      model: cfg.model || 'nai-diffusion-4-5-curated',
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
      stream: false,
    }),
  });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try {
      const j = await res.json();
      msg = j?.error?.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const text = await res.text();
  let uris = extractDataUris(text);
  if (!uris.length) {
    try {
      const j = JSON.parse(text);
      const c = j?.choices?.[0]?.message?.content ?? '';
      uris = extractDataUris(typeof c === 'string' ? c : JSON.stringify(c));
    } catch {
      /* ignore */
    }
  }
  if (!uris.length) throw new Error('响应中没有图片数据，请检查中转站返回');
  return uris;
}

export async function testImageApi(cfg: ApiConfig): Promise<{ ok: boolean; msg: string }> {
  if (!cfg.base) return { ok: false, msg: '请先填写中转站地址' };
  try {
    const res = await fetch(cfg.base.replace(/\/+$/, '') + '/models', {
      headers: cfg.key ? { Authorization: 'Bearer ' + cfg.key } : {},
    });
    if (res.status === 401 || res.status === 403) return { ok: false, msg: 'Key 无效或无权限' };
    if (!res.ok) return { ok: false, msg: 'HTTP ' + res.status };
    return { ok: true, msg: '连接成功' };
  } catch {
    return { ok: false, msg: '连接失败（多为 CORS 被线路拦截），请换线路或浏览器直连测试' };
  }
}
