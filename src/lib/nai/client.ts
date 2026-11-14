// 空悲切 NovelAI 兼容 API 客户端（浏览器直连，OpenAI Chat 协议）
import type { ApiConfig, GenParams, ReferenceSettings, StylePreset } from './types';

export interface BuildPromptInput {
  fragmentPrompt: string;
  preset?: StylePreset | null;
  negExtra?: string;
}

/** 拼接最终提示词：画风模板 + 片段内容，负向合并去重 */
export function buildPrompts({ fragmentPrompt, preset, negExtra = '' }: BuildPromptInput): {
  prompt: string;
  negative: string;
} {
  const pos = preset?.posTemplate?.trim() || '';
  const posFinal = pos.includes('{content}')
    ? pos.replace('{content}', fragmentPrompt.trim())
    : [pos, fragmentPrompt.trim()].filter(Boolean).join(', ');
  const neg = [preset?.negTemplate?.trim() || '', negExtra.trim()].filter(Boolean).join(', ');
  return { prompt: posFinal, negative: neg };
}

export interface GenerateInput {
  prompt: string;
  negative: string;
  params: GenParams;
  /** 氛围转移 / 精准参考设置（mode=none 时不传） */
  reference?: ReferenceSettings | null;
  /** 参考图的 base64 data URI（image/png 等） */
  referenceDataUri?: string | null;
}

export function buildPayload(input: GenerateInput): Record<string, unknown> {
  const { prompt, negative, params, reference, referenceDataUri } = input;
  const payload: Record<string, unknown> = {
    prompt,
    negative_prompt: negative || undefined,
    size: [params.width, params.height],
    steps: params.steps,
    scale: params.scale,
    sampler: params.sampler,
  };
  if (params.seed != null) payload.seed = params.seed;

  // 氛围转移（Vibe Transfer）/ 精准参考（Precise Reference），两者互斥（同官方 REFERENCE 语义）
  if (reference && reference.mode !== 'none' && referenceDataUri) {
    payload.reference_image = referenceDataUri;
    if (reference.mode === 'vibe') {
      payload.reference_mode = 'vibe';
      payload.reference_strength = reference.strength;
      payload.reference_information_extracted = reference.information;
    } else {
      payload.reference_mode = 'precise';
      payload.reference_type = reference.refType;
      payload.reference_strength = reference.strength;
      payload.reference_fidelity = reference.fidelity;
    }
  }
  return payload;
}

export interface GenerateResult {
  images: Blob[];
  raw: string;
}

function extractDataUris(text: string): string[] {
  const re = /data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/g;
  return text.match(re) ?? [];
}

async function dataUriToBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return res.blob();
}

/** 调用空悲切线路生图：OpenAI Chat 兼容协议，消息体为完整参数 JSON */
export async function generateImage(
  cfg: ApiConfig,
  input: GenerateInput,
  signal?: AbortSignal,
): Promise<GenerateResult> {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const payload = buildPayload(input);
  const body = {
    model: cfg.model,
    messages: [
      { role: 'user', content: JSON.stringify(payload) },
    ],
  };

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch { /* ignore */ }
    throw new Error(`生成失败（HTTP ${res.status}）：${detail || '无返回详情'}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    data?: Array<{ url?: string; b64_json?: string }>;
  };

  // 兼容 Chat 返回（Markdown Data URI）与 Images 端点返回
  const uris: string[] = [];
  const content = data.choices?.[0]?.message?.content ?? '';
  uris.push(...extractDataUris(content));
  if (uris.length === 0 && Array.isArray(data.data)) {
    for (const d of data.data) {
      if (d.b64_json) uris.push(`data:image/png;base64,${d.b64_json}`);
      else if (d.url) uris.push(d.url);
    }
  }

  if (uris.length === 0) {
    throw new Error('接口未返回图片数据：请检查模型名与参数格式是否正确');
  }

  const images: Blob[] = [];
  for (const uri of uris) {
    if (uri.startsWith('data:')) {
      images.push(await dataUriToBlob(uri));
    } else {
      const imgRes = await fetch(uri);
      if (!imgRes.ok) throw new Error(`图片下载失败（HTTP ${imgRes.status}）`);
      images.push(await imgRes.blob());
    }
  }
  return { images, raw: content.slice(0, 500) };
}

/** 连接测试：发一个最小请求，验证 Key / 线路可用 */
export async function testConnection(cfg: ApiConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const base = cfg.baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (res.ok) {
      return { ok: true, message: `连接成功（HTTP ${res.status}），Key 有效` };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Key 无效或无权限（HTTP ${res.status}）` };
    }
    return { ok: false, message: `线路响应异常（HTTP ${res.status}）` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `连接失败：${msg}。若为 CORS/网络错误，说明该线路不支持浏览器直连，请检查线路地址是否以 /v1 结尾`,
    };
  }
}

/** 可选：通过 OpenAI 兼容文本端点做中文 → 英文整句翻译 */
export async function translateViaEndpoint(
  cfg: ApiConfig,
  text: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!cfg.translateEndpoint) throw new Error('未配置翻译端点');
  const base = cfg.translateEndpoint.replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.translateModel || cfg.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a translator for NovelAI image prompts. Translate the Chinese description into English comma-separated danbooru-style tags. Output only the translated tags, no explanation.',
        },
        { role: 'user', content: text },
      ],
    }),
    signal,
  });
  if (!res.ok) throw new Error(`翻译失败（HTTP ${res.status}）`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const out = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error('翻译端点未返回内容');
  return out;
}
