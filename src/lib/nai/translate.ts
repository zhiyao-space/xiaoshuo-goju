// 中文提示词 → 英文 tag 内置词典翻译（纯前端，无需外部 API）
// 规则：长句按常用词组贪心匹配词典，未命中片段保留原文并提示人工检查
const DICT: Record<string, string> = {
  // 质量词
  '杰作': 'masterpiece', '最佳质量': 'best quality', '高质量': 'high quality',
  '超清': 'ultra detailed', '精细': 'intricate details', '高清': 'highres',
  // 人物
  '女孩': '1girl', '少女': 'young girl', '男孩': '1boy', '少年': 'young boy',
  '单人': 'solo', '两个人': '2girls', '一个女孩': '1girl',
  '猫耳': 'cat ears', '兔耳': 'rabbit ears', '长发': 'long hair',
  '短发': 'short hair', '双马尾': 'twintails', '银发': 'silver hair',
  '黑发': 'black hair', '白发': 'white hair', '金发': 'blonde hair',
  '红发': 'red hair', '蓝发': 'blue hair', '紫发': 'purple hair',
  '蓝眼睛': 'blue eyes', '红眼睛': 'red eyes', '金眼睛': 'golden eyes',
  '绿眼睛': 'green eyes', '紫眼睛': 'purple eyes',
  '微笑': 'smile', '大笑': 'laughing', '哭泣': 'crying', '流泪': 'tears',
  '害羞': 'blush', '惊讶': 'surprised', '闭眼': 'closed eyes',
  '和服': 'kimono', '水手服': 'sailor uniform', '校服': 'school uniform',
  '长裙': 'long dress', '短裙': 'short skirt', '铠甲': 'armor',
  '斗篷': 'cloak', '帽子': 'hat', '眼镜': 'glasses',
  // 动作
  '站立': 'standing', '坐着': 'sitting', '行走': 'walking', '奔跑': 'running',
  '飞翔': 'flying', '睡觉': 'sleeping', '看书': 'reading', '喝茶': 'drinking tea',
  '持剑': 'holding sword', '持刀': 'holding knife', '撑伞': 'holding umbrella',
  '回头': 'looking back', '看镜头': 'looking at viewer', '仰望': 'looking up',
  '低头': 'looking down', '伸手': 'reaching out', '拥抱': 'hug',
  // 场景
  '夜景': 'night scenery', '白天': 'daytime', '黄昏': 'sunset', '黎明': 'dawn',
  '樱花': 'cherry blossoms', '雪': 'snow', '雨': 'rain', '星空': 'starry sky',
  '月亮': 'moon', '太阳': 'sun', '森林': 'forest', '海边': 'seaside',
  '城市': 'city', '古风建筑': 'chinese architecture', '庭院': 'courtyard',
  '寺庙': 'temple', '教室': 'classroom', '咖啡厅': 'cafe',
  '山': 'mountain', '河': 'river', '花田': 'flower field', '竹林': 'bamboo forest',
  '云海': 'sea of clouds', '烟花': 'fireworks', '灯笼': 'lantern',
  // 画风
  '水彩': 'watercolor', '厚涂': 'impasto', '赛璐璐': 'cel shading',
  '水墨': 'ink wash painting', '动漫风格': 'anime style', '插画风': 'illustration style',
  '国风': 'chinese style', '和风': 'japanese style', '复古': 'retro style',
  '柔和光线': 'soft lighting', '逆光': 'backlighting', '侧光': 'dramatic lighting',
  '电影感': 'cinematic lighting', '暖色调': 'warm colors', '冷色调': 'cool colors',
  '全景': 'wide shot', '特写': 'close-up', '半身': 'upper body', '全身': 'full body',
  // 负向常用
  '低画质': 'lowres', '错误解剖': 'bad anatomy', '坏手': 'bad hands',
  '文字': 'text', '水印': 'watermark', '模糊': 'blurry',
};

// 多字词组优先匹配（按长度降序）
const KEYS = Object.keys(DICT).sort((a, b) => b.length - a.length);

export function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

export interface TranslateResult {
  result: string;
  unmatched: string[]; // 未能翻译、保留原文的片段
}

/** 内置词典翻译：将中文描述转为英文逗号分隔 tag */
export function translateZhToEn(text: string): TranslateResult {
  const unmatched: string[] = [];
  const segs = text
    .split(/[，,。；;、\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];

  for (const seg of segs) {
    let rest = seg;
    const translated: string[] = [];
    while (rest.length > 0) {
      const key = KEYS.find((k) => rest.startsWith(k));
      if (key) {
        translated.push(DICT[key]);
        rest = rest.slice(key.length);
      } else {
        // 尝试匹配两字词
        const two = rest.slice(0, 2);
        if (DICT[two]) {
          translated.push(DICT[two]);
          rest = rest.slice(2);
        } else if (/^[a-zA-Z0-9\s,]+$/.test(rest)) {
          // 剩余纯英文，直接保留
          translated.push(rest.trim());
          rest = '';
        } else {
          const chunk = rest.slice(0, 1);
          unmatched.push(chunk);
          rest = rest.slice(1);
        }
      }
    }
    if (translated.length > 0) out.push(translated.join(', '));
  }

  const result = out.join(', ');
  return { result: result || text, unmatched: [...new Set(unmatched)] };
}

export const DEFAULT_NEGATIVE =
  'lowres, bad anatomy, bad hands, text, watermark, blurry, worst quality';
