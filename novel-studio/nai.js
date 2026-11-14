'use strict';
/* nai.js — NovelAI 生图核心库（空悲切 OpenAI Chat 兼容协议）
 * 依赖：无。挂载 window.NAI，由 app.js 调用。
 * 能力：IndexedDB 图片存储、PNG 元数据解析、中文→英文词典翻译、生图 API 客户端（含 Vibe/精准参考）。
 */

const NAI = (() => {
  /* ---------- 存储键 ---------- */
  const LSK = {
    imgApi: 'inkan.imgapi.v1',
    imgStyles: 'inkan.imgstyles.v1',
    gallery: 'inkan.gallery.v1'
  };

  /* ---------- 采样器 / 尺寸 ---------- */
  const SAMPLERS = ['k_euler_ancestral', 'k_euler', 'k_dpmpp_2m', 'k_dpmpp_sde', 'k_dpmpp_2s_ancestral', 'ddim'];
  const SIZE_PRESETS = [
    { label: '竖版 832×1216', w: 832, h: 1216 },
    { label: '方形 1024×1024', w: 1024, h: 1024 },
    { label: '横版 1216×832', w: 1216, h: 832 },
    { label: '宽幅 1280×768', w: 1280, h: 768 },
    { label: '手机 768×1280', w: 768, h: 1280 }
  ];

  /* ---------- 中文→英文 tag 词典（NovelAI 不识别中文） ---------- */
  const DICT = {
    '少女': '1girl', '女孩': '1girl', '女生': '1girl', '少年': '1boy', '男孩': '1boy', '男生': '1boy',
    '女人': '1woman', '男人': '1man', '孩子': 'child', '小孩': 'child', '公主': 'princess', '王子': 'prince',
    '骑士': 'knight', '武士': 'samurai', '剑士': 'swordsman', '法师': 'mage', '魔法师': 'mage', '巫女': 'shrine maiden',
    '女仆': 'maid', '天使': 'angel', '恶魔': 'demon', '精灵': 'elf', '狐狸': 'fox', '猫': 'cat', '猫耳': 'cat ears',
    '兔耳': 'rabbit ears', '龙': 'dragon', '怪物': 'monster', '幽灵': 'ghost', '机器人': 'robot',
    '长发': 'long hair', '短发': 'short hair', '白发': 'white hair', '黑发': 'black hair', '金发': 'blonde hair',
    '银发': 'silver hair', '红发': 'red hair', '蓝发': 'blue hair', '双马尾': 'twintails', '马尾': 'ponytail',
    '辫子': 'braid', '卷发': 'curly hair', '刘海': 'bangs',
    '红眼': 'red eyes', '蓝眼': 'blue eyes', '金瞳': 'golden eyes', '绿眼': 'green eyes', '紫眼': 'purple eyes',
    '微笑': 'smile', '大笑': 'laughing', '哭泣': 'crying', '流泪': 'tears', '生气': 'angry', '害羞': 'blush',
    '惊讶': 'surprised', '闭眼': 'closed eyes', '害怕': 'scared', '认真': 'serious', '冷酷': 'cold expression',
    '裙子': 'dress', '长裙': 'long dress', '短裙': 'short skirt', '校服': 'school uniform', '制服': 'uniform',
    '和服': 'kimono', '浴衣': 'yukata', '旗袍': 'china dress', '铠甲': 'armor', '盔甲': 'armor',
    '长袍': 'robe', '斗篷': 'cloak', '披风': 'cape', '婚纱': 'wedding dress', '泳装': 'swimsuit',
    '帽子': 'hat', '发饰': 'hair ornament', '耳环': 'earrings', '项链': 'necklace', '眼镜': 'glasses',
    '剑': 'sword', '长剑': 'longsword', '刀': 'katana', '弓': 'bow', '法杖': 'staff', '魔杖': 'wand',
    '雨伞': 'umbrella', '伞': 'umbrella', '花': 'flower', '樱花': 'cherry blossoms', '玫瑰': 'rose',
    '夜晚': 'night', '白天': 'daytime', '黄昏': 'dusk', '黎明': 'dawn', '星空': 'starry sky', '月亮': 'moon',
    '太阳': 'sun', '雪': 'snow', '雨': 'rain', '风': 'wind', '云': 'clouds', '雷': 'lightning',
    '森林': 'forest', '树林': 'forest', '山': 'mountain', '海': 'sea', '大海': 'ocean', '海边': 'seaside',
    '天空': 'sky', '城市': 'city', '街道': 'street', '教室': 'classroom', '房间': 'room', '卧室': 'bedroom',
    '花园': 'garden', '庭院': 'courtyard', '城堡': 'castle', '宫殿': 'palace', '神社': 'shrine',
    '废墟': 'ruins', '战场': 'battlefield', '篝火': 'bonfire', '灯笼': 'lantern', '蜡烛': 'candle',
    '古风': 'ancient chinese style', '国风': 'chinese style', '二次元': 'anime style', '动漫': 'anime style',
    '水彩': 'watercolor', '油画': 'oil painting', '厚涂': 'impasto', '赛璐璐': 'cel shading',
    '可爱': 'cute', '美丽': 'beautiful', '帅气': 'handsome', '温柔': 'gentle', '孤独': 'lonely',
    '悲伤': 'sad', '幸福': 'happy', '梦幻': 'dreamy', '神秘': 'mysterious', '宁静': 'tranquil',
    '战斗': 'battle', '决斗': 'duel', '奔跑': 'running', '站立': 'standing', '坐': 'sitting',
    '回眸': 'looking back', '仰望': 'looking up', '特写': 'close-up', '全身': 'full body', '半身': 'upper body',
    '逆光': 'backlighting', '侧脸': 'profile', '光效': 'light effects', '光斑': 'dappled sunlight',
    '飞舞': 'fluttering', '飘落': 'falling', '飘落的花瓣': 'falling petals', '花瓣': 'petals',
    '蝴蝶': 'butterfly', '鸟': 'bird', '萤火虫': 'fireflies', '鹿': 'deer', '狼': 'wolf',
    '大师之作': 'masterpiece', '杰作': 'masterpiece', '最佳画质': 'best quality', '高清': 'high resolution',
    '精致': 'extremely detailed', '细节丰富': 'intricate details'
  };

  function translateZhToEn(text) {
    if (!text) return { result: '', unmatched: [] };
    let result = text;
    const unmatched = [];
    // 先整句短语（3字以上优先），再两字词
    const keys = Object.keys(DICT).sort((a, b) => b.length - a.length);
    const consumed = new Set();
    for (const k of keys) {
      let idx = 0;
      while ((idx = result.indexOf(k, idx)) !== -1) {
        // 粗略判断该区间尚未被替换成英文
        const before = result.slice(Math.max(0, idx - 1), idx);
        if (/^[a-zA-Z_, ]$/.test(before)) { idx += 1; continue; }
        consumed.add(idx);
        idx += k.length;
      }
    }
    // 贪婪替换
    result = result.replace(/[\u4e00-\u9fff，。、；：！？（）·—]+|[\u4e00-\u9fff]{2,}/g, (seg) => {
      let out = seg;
      for (const k of keys) {
        if (out.includes(k)) out = out.split(k).join(', ' + DICT[k] + ', ');
      }
      const leftover = out.replace(/[\s,]+/g, '');
      if (/[\u4e00-\u9fff]/.test(leftover)) {
        const zh = seg.replace(/[，。、；：！？（）·—\s]/g, '');
        if (zh) unmatched.push(zh);
      }
      return out;
    });
    result = result.replace(/(,\s*)+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/^[\s,]+|[\s,]+$/g, '');
    return { result, unmatched: [...new Set(unmatched)] };
  }

  /* ---------- IndexedDB 图片存储 ---------- */
  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('inkan-images', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('imgs');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function putImageBlob(id, blob) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('imgs', 'readwrite');
      tx.objectStore('imgs').put(blob, id);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  }
  async function getImageBlob(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('imgs', 'readonly');
      const req = tx.objectStore('imgs').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function deleteImageBlob(id) {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction('imgs', 'readwrite');
      tx.objectStore('imgs').delete(id);
      tx.oncomplete = resolve;
    });
  }
  const urlCache = new Map();
  async function getImageUrl(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const blob = await getImageBlob(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(id, url);
    return url;
  }

  /* ---------- PNG 元数据解析（tEXt / iTXt chunk） ---------- */
  async function parsePngMetadata(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
    let off = 8;
    const texts = {};
    const dec = new TextDecoder('utf-8');
    while (off + 12 <= buf.length) {
      const len = (buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3];
      const type = dec.decode(buf.slice(off + 4, off + 8));
      const data = buf.slice(off + 8, off + 8 + len);
      if (type === 'tEXt') {
        const sep = data.indexOf(0);
        texts[dec.decode(data.slice(0, sep))] = dec.decode(data.slice(sep + 1));
      } else if (type === 'iTXt') {
        const sep = data.indexOf(0);
        const key = dec.decode(data.slice(0, sep));
        let p = sep + 1 + 2; // compression flag + method
        const termLang = data.indexOf(0, p); p = termLang + 1;
        const termTrans = data.indexOf(0, p); p = termTrans + 1;
        texts[key] = dec.decode(data.slice(p));
      }
      if (type === 'IEND') break;
      off += 12 + len;
    }
    const comment = texts.Comment || texts.comment || texts.Description;
    if (!comment) return Object.keys(texts).length ? { raw: texts } : null;
    try {
      const j = JSON.parse(comment);
      return {
        prompt: j.prompt || '',
        negative: j.uc || '',
        seed: j.seed,
        steps: j.steps,
        scale: j.scale,
        sampler: j.sampler,
        width: j.width ?? (Array.isArray(j.size) ? j.size[0] : undefined),
        height: j.height ?? (Array.isArray(j.size) ? j.size[1] : undefined)
      };
    } catch { return { raw: texts }; }
  }

  /* ---------- 生图参数 payload ---------- */
  function buildPayload(cfg) {
    const payload = {
      prompt: cfg.prompt || '',
      negative_prompt: cfg.negative || '',
      size: [cfg.width || 832, cfg.height || 1216],
      steps: cfg.steps || 28,
      scale: cfg.scale ?? 5,
      sampler: cfg.sampler || 'k_euler_ancestral',
      seed: cfg.seed != null && cfg.seed !== '' ? Number(cfg.seed) : Math.floor(Math.random() * 2 ** 32)
    };
    if (cfg.reference && cfg.reference.dataUri) {
      if (cfg.reference.mode === 'vibe') {
        payload.reference_image = cfg.reference.dataUri;
        payload.reference_strength = cfg.reference.strength ?? 0.6;
        payload.reference_information_extracted = cfg.reference.information ?? 0.8;
      } else {
        payload.reference_image = cfg.reference.dataUri;
        payload.reference_mode = cfg.reference.refType || 'character';
        payload.reference_fidelity = cfg.reference.fidelity ?? 0.8;
      }
    }
    return payload;
  }

  function extractDataUris(text) {
    const out = [];
    const re = /data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+/g;
    let m;
    while ((m = re.exec(text || ''))) out.push(m[0]);
    return out;
  }

  /* ---------- 生图 API（OpenAI Chat 兼容：消息体为参数 JSON） ---------- */
  async function generateImage(api, cfg, onLabel, signal) {
    if (!api || !api.base || !api.key) throw new Error('请先在「设置 → 生图接入」填写生图 API 地址与 Key');
    const payload = buildPayload(cfg);
    const url = api.base.replace(/\/+$/, '') + '/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.key },
      body: JSON.stringify({
        model: api.model || 'nai-diffusion-4-5-full',
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        stream: false
      })
    });
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); msg = j.error?.message || msg; } catch {}
      throw new Error(msg);
    }
    const text = await res.text();
    let uris = extractDataUris(text);
    if (!uris.length) {
      try {
        const j = JSON.parse(text);
        const c = j.choices?.[0]?.message?.content || '';
        uris = extractDataUris(typeof c === 'string' ? c : JSON.stringify(c));
      } catch {}
    }
    if (!uris.length) throw new Error('响应中没有图片数据');
    return uris;
  }

  async function testImageApi(api) {
    const url = api.base.replace(/\/+$/, '') + '/models';
    try {
      const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + api.key } });
      if (res.status === 401 || res.status === 403) return { ok: false, msg: 'Key 无效或无权限' };
      if (!res.ok) return { ok: false, msg: 'HTTP ' + res.status };
      return { ok: true, msg: '连接成功' };
    } catch (e) {
      return { ok: false, msg: '连接失败（多为浏览器 CORS 被线路拦截），请换线路或本地使用' };
    }
  }

  /* ---------- 数据读写 ---------- */
  function lsGet(k, fb) {
    try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch { return fb; }
  }
  function lsSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  function loadImgApis() {
    let list = lsGet(LSK.imgApi, []);
    if (!list.length) list = [{ id: uid2(), name: '空悲切', base: 'https://api.blanka.cc/v1', key: '', model: 'nai-diffusion-4-5-full' }];
    return list;
  }
  function loadImgStyles() { return lsGet(LSK.imgStyles, []); }
  function loadGallery() { return lsGet(LSK.gallery, []); }
  function uid2() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  return {
    LSK, SAMPLERS, SIZE_PRESETS,
    translateZhToEn,
    putImageBlob, getImageBlob, deleteImageBlob, getImageUrl,
    parsePngMetadata, buildPayload, generateImage, testImageApi,
    lsGet, lsSet, uid2,
    loadImgApis, loadImgStyles, loadGallery
  };
})();
window.NAI = NAI;
