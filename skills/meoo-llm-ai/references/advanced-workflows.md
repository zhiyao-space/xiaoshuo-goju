# Meoo LLM 文本能力集成

在 Meoo 项目中接入纯文本 AI能力的标准指南。覆盖对话、生成、总结、改写、翻译、分类、抽取等全部文本智能场景。

## 技能定位

本技能只负责 AI相关代码——把文本 AI 能力作为现有业务的一个功能点接入，而不是重建整个工程。

典型目标：

-在页面嵌入智能客服
- 增加"AI 总结""AI 改写""AI 翻译"按钮
- 给现有表单、列表、详情页增加文本 AI辅助
- 给业务流程增加文本生成或文本分析能力

本技能不用来重写整个工程、重搭脚手架或设计完整业务系统。

## 和 meoo-agent既有规范的关系

- 工程结构、技术栈、页面组织、通用前后端实现方式，优先遵循 meoo-agent 原有规范。
-本技能不替代 meoo-agent的通用工程生成能力，只补充"如何把 Meoo AI文本能力接进现有项目"。
-当 meoo-agent 已经确定项目目录、页面结构、接口风格时，本技能只负责 AI相关部分的落点、请求格式、鉴权方式、交互模式和最小实现约束。

##模态边界与能力分工

根据用户意图选择正确的技能：

|用户意图 |应使用的技能 |
|---------|------------|
|**在用户应用里接入** AI（"加个 AI""做个智能XX""写个 AI助手页面") | **llm-ai**（本技能） |
| 图片输入（"分析这张图""识别图片""图文对话") | **vision-ai** |
| **在用户应用里接入**图片生成（"做个 AI 绘画工具""页面里加个生图按钮") | **image-gen-ai** |
| **当前对话中直接生成图片**（"生成一张猫的图""画一张赛博城市") | Bash 工具 `meoo-cli image-generate`（不加载任何技能） |
| **当前对话中直接回答文本**（普通问答、解释、总结） | 直接回答（不加载任何技能，agent 自身就是 LLM） |

**不该由 llm-ai 处理的情况：**

- 用户要求"看图""分析图片""识别图中内容" → 使用 vision-ai
-用户要求"画一张图""生成图片""文生图" → 看场景：要在应用里接入用 image-gen-ai；当前对话直接出图用 Bash `meoo-cli image-generate`
-用户要求"围绕图片多轮追问""图文混合聊天" → 使用 vision-ai（多轮模式）
- 用户要求处理音频、视频等非文本媒体 →超出当前技能覆盖范围，需明确告知
- 用户只是问问题、要答复 →直接回复即可，本技能仅在"把 AI 能力嵌入用户应用"时才加载

**关键判断**：本技能的边界是"**给用户应用接入 AI 能力**"。如果只是 agent 自己跟用户对话、答疑，不加载本技能；如果只是 agent 给用户生一张图，走 Bash 不加载本技能。

##前置检查

**必须先加载 meoo-cloud 技能并确认当前项目已初始化 Cloud 功能。**

**强制：业务前端调用 Edge Function 前必须先读取当前 `client.ts`。请求 URL 只能使用其导出的 `supabaseUrl` 拼接；`supabaseUrl` 已是完整根地址，严禁再追加 `/sb-api` 或自行构造 `/sb-api` 地址。若 Client 导出 `projectUrlId`，所有新编写的裸 `fetch` / `Taro.request` 都必须导入并携带 `'OneDay-App-Id': projectUrlId`；旧版同源 `/sb-api` Client 未导出该值时，不导入、不携带、不得伪造 App ID；非 `/sb-api` Client 若缺少 `projectUrlId`，必须先通过 Cloud 初始化/关联流程重新生成 Client，禁止继续编写请求。下方示例按新版 Client 展示；仅对旧版 `/sb-api` Client 删除 `projectUrlId` import 和 `OneDay-App-Id` Header。禁止业务代码直接使用 `VITE_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL`、禁止自行 `createClient()`；也禁止读取其他前端/进程环境变量、硬编码域名或使用 `window.location.origin`。**

### 共享云服务下的 AI 云函数隔离（强制）

共享云服务时，对于原项目的AI服务云函数，比如AI聊天，当前项目不得直接调用、复用、重新部署或覆盖；如有AI聊天相关需求，当前项目必须新部署一个云函数

1. 如果尚未加载 meoo-cloud 技能，必须先使用 Skill 工具加载：`skill: "meoo-cloud"`
2. 加载完成后，使用 `init` 命令检查并初始化 Cloud 功能。
3. Cloud 未初始化时，禁止继续生成 AI 接入代码。必须先让用户完成初始化。
4. 初始化失败时，明确提示用户先完成 Cloud 功能初始化。

**AI Runtime 前置加载（强制）**：实现或修改应用内 AI 请求前，若当前上下文没有完整的 `meoo-ai-runtime` 技能内容，必须先调用 `Skill` 工具，`command: "meoo-ai-runtime"`；已预注入或已加载且内容仍在上下文时直接复用。本规则同样适用于已有项目后续追加 AI 功能，加载本技能不会自动加载 Runtime。仅有历史加载记录、模板文件或文字提及不能代替技能加载。

加载后先读取 Runtime 要求的参考文档，并检查当前项目实际文件和导出，再从 `src/features/meoo-ai-runtime` 复用请求生命周期、错误分类、重试判断和 SSE 解析。不得因本轮未预注入 Runtime 就直接照搬下方手写流式示例，也不得在页面、hook 和 service 中并存多套解析器。多个 AI 能力共用同一 Runtime，保留已有工程，不重新加载脚手架。取消、超时、流中断和成功必须是不同终态，非法 JSON 或缺少 `[DONE]` 的 EOF 不得返回半截结果。



## 凭证与接口

Meoo AI域名：

```
https://api.meoo.host
```

使用 Meoo AI 时，服务 AK **不写在前端**。平台会按项目自动注入 `MEOO_PROJECT_API_KEY_<projectUrlId>`，并由网关向 Edge Function 注入可信的 `X-Meoo-Project-Url-Id` 请求头；函数必须在每次请求内根据该项目 ID 读取对应环境变量。项目级变量和兼容旧变量 `MEOO_PROJECT_API_KEY` 均属于系统保护变量，严禁 `set-secret`，严禁要求用户配置。前端通过 Edge Function 间接调用 Meoo AI，无需接触 AK。

### 凭证分流

- 默认使用 Meoo AI：根据平台注入的项目请求头优先读取 `MEOO_PROJECT_API_KEY_<projectUrlId>`，无需任何 Key 配置；项目级变量尚未补齐的老项目可回退读取旧 `MEOO_PROJECT_API_KEY`，仅用于兼容存量项目。
- 用户明确自带或提供自己的第三方 API Key、接口地址，并要求直连时：遵循用户指定的第三方通道，在 Edge Function 中直连对应接口；Key 必须保存到独立的自定义环境变量，例如百炼使用 `DASHSCOPE_API_KEY`。
- 第三方 Key 严禁写入、覆盖或冒充 `MEOO_PROJECT_API_KEY` 或 `MEOO_PROJECT_API_KEY_<projectUrlId>`，也不要把明文写进命令行、代码或对话。

Meoo AI 文本接口路径：

```
POST /meoo-ai/compatible-mode/v1/chat/completions
```

请求头（Edge Function 内部使用）：

```http
Authorization: Bearer <当前调用项目的 MEOO_PROJECT_API_KEY_projectUrlId>
Content-Type: application/json
```

不需要 Cookie。

##模型

默认：`qwen3.6-plus`

可选模型：

| 模型名 | 说明 |
|--------|------|
| `qwen3.6-plus` |默认模型，通义千问 Qwen3.6-Plus |
| `kimi-k2.5` | 综合能力强 |
| `qwen3.5-plus` |通义千问 Qwen3.5-Plus |
| `deepseek-v3.2` | DeepSeek V3.2 |
| `glm-5` | 智谱 GLM-5 |
| `MiniMax-M2.5` | MiniMax M2.5 |

除非用户明确要求切换模型，否则始终使用 `qwen3.6-plus`。模型名必须严格按上表填写，包括大小写和版本号后缀。

###模型严格限制

Meoo 平台只提供上表中列出的模型服务。**以下模型无法通过本技能接入，也无法通过 Meoo平台使用：**

- OpenAI 系列（GPT-4、GPT-4o、GPT-3.5 等）
- Anthropic系列（Claude3、Claude3.5、Claude 4 等）
-Google 系列（Gemini、Gemini Pro、Gemini Flash 等）
- Meta 系列（LLaMA 等）
- 其他任何不在上表中的模型

如果用户只要求使用 GPT、Claude、Gemini 或其他列表外模型，但没有明确提供第三方接口、自己的 API Key 或直连要求，必须告知：**Meoo 平台不提供这些模型的服务。**可以建议用户从上表中选择替代模型。只有用户明确提供自己的第三方凭证/接口或明确要求直连时，才按「凭证分流」使用独立自定义环境变量接入。

## Edge Function 服务端模板

文件位置：`/functions/ai-chat/index.ts`

CORS 由 Meoo Cloud 实例域名网关统一处理，函数不要处理 OPTIONS 或设置 `Access-Control-Allow-*` 响应头。

此示例接收文本消息。工具调用或多模态输入需按对应协议扩展 validator，不能直接放行任意对象。

返回 SSE 前用请求的取消信号中止工作；返回后由响应流的 `cancel()` 中止上游并释放 reader。部分 Deno 版本在请求正常结束时也会触发 `req.signal`，因此交出响应流前解除该监听，避免误取消正常响应。下游断连能否及时传到函数还依赖网关，须在实际环境验证；关闭本地连接不保证模型端停止生成或计费。SSE 响应头发出后发生断流，只能使流失败，不能再返回 JSON 错误，也不能补造 `[DONE]`。

```ts
const MEOO_AI_BASE_URL = 'https://api.meoo.host';

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

async function readInput(req: Request, signal: AbortSignal) {
  if (!req.body) throw new HttpError(400, 'invalid_json', '请求体必须是 JSON 对象');
  const reader = req.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder();
  let text = '';
  try {
    if (signal.aborted) throw signal.reason;
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw signal.reason;
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }

  let body: any;
  try { body = JSON.parse(text); } catch {
    throw new HttpError(400, 'invalid_json', '请求体必须是有效 JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !Array.isArray(body.messages) || body.messages.length === 0
    || body.messages.some((message: any) => !message
      || !['system', 'user', 'assistant'].includes(message.role)
      || typeof message.content !== 'string' || !message.content.trim())) {
    throw new HttpError(400, 'invalid_messages', 'messages 必须是非空的有效文本消息数组');
  }
  const model = body.model === undefined ? 'qwen3.6-plus' : body.model;
  if (typeof model !== 'string' || !model.trim() || model.length > 128) {
    throw new HttpError(400, 'invalid_model', 'model 必须是非空字符串且不超过 128 字符');
  }
  return {
    model,
    messages: body.messages.map(({ role, content }: { role: string; content: string }) => ({ role, content })),
  };
}

Deno.serve(async (req) => {
  const functionName = 'ai-chat';
  const incomingRequestId = req.headers.get('X-Meoo-AI-Request-Id') || '';
  const requestId = /^[A-Za-z0-9_-]{8,128}$/.test(incomingRequestId) ? incomingRequestId : crypto.randomUUID();
  const startTime = Date.now();
  const jsonError = (status: number, code: string, message: string, headers = {}) => new Response(
    JSON.stringify({ error: message, code, requestId }),
    { status, headers: { 'Content-Type': 'application/json', 'X-Meoo-AI-Request-Id': requestId, ...headers } },
  );
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed', '仅支持 POST', { Allow: 'POST' });

  const upstream = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let finished = false;
  const onDisconnect = () => upstream.abort(new HttpError(499, 'client_cancelled', '请求已取消'));
  const cleanup = async (cancelReader = false) => {
    if (finished) return;
    finished = true;
    req.signal.removeEventListener('abort', onDisconnect);
    if (reader) {
      try {
        if (cancelReader) await reader.cancel();
      } catch { /* 上游可能已中止 */ } finally { reader.releaseLock(); }
    }
  };
  req.signal.addEventListener('abort', onDisconnect, { once: true });
  if (req.signal.aborted) onDisconnect();

  try {
    const { messages, model } = await readInput(req, upstream.signal);
    const projectUrlId = req.headers.get('X-Meoo-Project-Url-Id')?.trim() || '';
    const projectSecretName = `MEOO_PROJECT_API_KEY_${projectUrlId}`;
    const projectServiceAK =
      (projectUrlId ? Deno.env.get(projectSecretName) : '') ||
      Deno.env.get('MEOO_PROJECT_API_KEY') ||
      '';
    if (!projectServiceAK) {
      throw new HttpError(503, 'credential_unavailable', '当前项目的 AI 服务凭证未就绪，请稍后重试');
    }

    const lastMessage = messages[messages.length - 1]?.content;

    console.info(`[${functionName}] request ${requestId} model=${model} messages=${messages.length} lastMessageLength=${String(lastMessage ?? '').length}`);

    // 调用 Meoo AI（强制流式）
    const response = await fetch(
      `${MEOO_AI_BASE_URL}/meoo-ai/compatible-mode/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${projectServiceAK}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, stream: true }),
        signal: upstream.signal,
        redirect: 'error',
      }
    );
    const upstreamDuration = Date.now() - startTime;
    console.info(`[${functionName}] upstream ${requestId} status=${response.status} durationMs=${upstreamDuration}`);

    // 转发上游 HTTP 状态码，不吞掉 4xx/5xx
    if (!response.ok) {
      console.error(`[${functionName}] upstream failed ${requestId} status=${response.status}`);
      // 保留平台结构化业务错误，避免积分不足等原因被通用提示覆盖。
      const payload = await response.json().catch(() => null);
      const upstreamError = payload?.error ?? payload;
      const code = typeof upstreamError?.code === 'string' ? upstreamError.code
        : typeof payload?.code === 'string' ? payload.code : 'upstream_http_error';
      const message = typeof upstreamError === 'string' ? upstreamError
        : typeof upstreamError?.message === 'string' ? upstreamError.message : 'AI 服务请求失败';
      await cleanup();
      const retryAfter = response.headers.get('Retry-After');
      return jsonError(response.status, code, message,
        retryAfter ? { 'Retry-After': retryAfter } : {});
    }

    const contentType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
    if (!response.body || contentType !== 'text/event-stream') {
      void response.body?.cancel().catch(() => {});
      throw new HttpError(502, 'invalid_upstream_response', 'AI 服务未返回有效数据流');
    }
    if (upstream.signal.aborted) {
      void response.body.cancel().catch(() => {});
      throw upstream.signal.reason;
    }
    reader = response.body.getReader();
    let chunkCount = 0;
    let totalBytes = 0;
    const readable = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader!.read();
          if (finished) return;
          if (done) {
            await cleanup();
            controller.close();
            console.info(`[${functionName}] transport closed ${requestId} chunks=${chunkCount} bytes=${totalBytes} durationMs=${Date.now() - startTime}`);
            return;
          }
          chunkCount++;
          totalBytes += value.byteLength;
          controller.enqueue(value);
        } catch (err) {
          if (finished) return;
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[${functionName}] stream failed ${requestId}: ${message}`);
          controller.error(err);
          upstream.abort(err);
          await cleanup(true);
        }
      },
      async cancel(reason) {
        upstream.abort(reason);
        await cleanup(true);
      },
    }, { highWaterMark: 0 });

    // 此后由 cancel() 处理下游断连，避免 Deno 在正常交付响应时触发 req.signal 导致误中止。
    req.signal.removeEventListener('abort', onDisconnect);
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Meoo-AI-Request-Id': requestId,
      },
    });
  } catch (err) {
    const cause = upstream.signal.aborted ? upstream.signal.reason : err;
    const error = cause instanceof HttpError ? cause : new HttpError(500, 'internal_error', 'AI 请求失败');
    console.error(`[${functionName}] failed ${requestId} code=${error.code}`);
    upstream.abort(error);
    await cleanup(true);
    return jsonError(error.status, error.code, error.message);
  }
});
```

部署：

- 需要登录的项目：`CloudDeployFunction({ functionName: "ai-chat", verify_jwt: true })`
- 不需要登录的项目：`CloudDeployFunction({ functionName: "ai-chat", verify_jwt: false })`（即 `meoo-cli cloud deploy-function -n ai-chat -j false`）

## 请求格式

```json
{
  "model": "qwen3.6-plus",
  "messages": [
    { "role": "system", "content": "你是一个专业助手" },
    { "role": "user", "content": "请总结下面这段文本" }
  ]
}
```

## 前端调用方式


### Web/H5 Fetch 流式调用

统一使用流式调用，避免长文本生成时 HTTP 超时。

```ts
import { projectUrlId, supabase, supabaseUrl } from 'src/supabase/client';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function requestLLMStream(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  options?: {
    model?: string;
    signal?: AbortSignal;
  }
) {
  const { model = 'qwen3.6-plus', signal } = options ?? {};
  const session = (await supabase.auth.getSession()).data.session;
  const authHeaders = session ? { Authorization: `Bearer ${session.access_token}` } : {};

  const response = await fetch(
    `${supabaseUrl}/functions/v1/ai-chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OneDay-App-Id': projectUrlId,
        ...authHeaders,
      },
      body: JSON.stringify({ messages, model, stream: true }),
      signal,
    }
  );
  if (!response.ok) throw new Error(`请求失败: ${response.status}`);
  if (!response.body) throw new Error('当前环境不支持流式响应');

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice(6);
        if (payload === '[DONE]') return fullText;

        try {
          const json = JSON.parse(payload);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk(content);
          }
        } catch {
          throw new Error('AI 流包含无法解析的 JSON 事件');
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw err;
  }

  throw new Error('AI 流在完成标志前中断');
}
```

**调用示例：**

```ts
// 基础流式调用
let result = '';
await requestLLMStream(
  [{ role: 'user', content: '你好' }],
  (chunk) => { result += chunk; updateUI(result); }
);

// 带中止控制
const controller = new AbortController();
await requestLLMStream(
  messages,
  (chunk) => { result += chunk; updateUI(result); },
  { signal: controller.signal }
);
// 需要取消时
controller.abort();
```






## SSE 流式协议要点

响应 Content-Type 为 `text/event-stream`。每条数据以 `data: ` 前缀开头，以双换行 `\n\n` 结尾。`data` 内容是 JSON 对象，结构与非流式一致，但用 `choices[0].delta` 替代 `choices[0].message`，`delta.content` 为本次增量文本片段。流结束标志为 `data: [DONE]`。


### SSE 关键注意事项

**buffer 拼接是必须的。** 网络传输可能将一条完整的 `data:` 行切割到两个 chunk 中。必须用 buffer 做行级拼接，不能逐 chunk 直接按行解析，否则会丢失被截断的消息。

**错误处理分层。** HTTP 错误、连接/首包/空闲/总超时、协议错误、用户取消必须分别进入结构化状态。用户主动取消不作为服务异常上报，但也不能把已有半截文本标成成功；流结束必须观察到 `[DONE]`。

**不要用 EventSource。** Edge Function 需要 POST + 自定义 Authorization Header，而浏览器原生 `EventSource` 只支持 GET 请求，无法满足需求。必须用 `fetch` + `ReadableStream` 手动解析 SSE。

**中止流的正确方式：** 通过 `AbortController` 传入 `requestLLMStream` 的 `signal` 参数。`AbortController` 可以从请求发起端干净地终止连接，覆盖面最广，能同时取消 fetch 本身和流读取。





##集成优先级

默认按下面优先级集成：

1. 默认通过 Edge Function 调用 Meoo AI，根据 `X-Meoo-Project-Url-Id` 读取平台自动注入的 `MEOO_PROJECT_API_KEY_<projectUrlId>`；用户明确要求自带第三方通道时，改用独立自定义环境变量。
2. 如果项目已有统一请求封装（如 supabase client），优先复用它。
3.如果项目已有现成页面，只在该页面上嵌入 AI能力，不要新造一整套无关页面。
4. 只有 AI 功能点本身需要的代码才产出，不扩展无关系统。

不要默认做这些事：

-不要重建整个工程目录
- 不要默认创建独立聊天站点或完整 AI子系统
- 不要默认创建完整 `/server`项目模板
-不要默认补 Swagger、脚手架说明、额外管理接口
-不要默认加数据库、登录、权限、工作流，除非用户明确要求
- 不要因为一个 AI 功能点就新建与需求无关的全局状态、路由层或页面骨架

##优先产出的代码

通常只需要产出和这个 AI功能点直接相关的代码。按需选择，不要求每次都全做：

-一个 Edge Function文件（`/functions/ai-chat/index.ts`）
- 一个前端 AI 请求封装文件
- 一个前端 AI 功能组件
- 必要的状态处理，例如 loading、error、result

常见落地路径：


- `/functions/ai-chat/index.ts`（Edge Function）
- `src/services/meooAI.ts`（前端请求封装）
- `src/components/ai/...`（AI 功能组件）


-现有页面中的一个 AI 面板 / AI 按钮 / AI抽屉

如果现有工程已经有对应位置，就直接修改原文件或在原目录补最小文件，不要为了"结构完整"额外造目录。

##执行步骤

1. 确认用户需求属于纯文本 AI能力。
2.定位现有项目中最合适的落点——优先复用已有页面、组件、请求封装。
3. 检查 Cloud 功能是否已初始化（未初始化则停止）。
4. 按上述隔离规则创建或复用 Edge Function（非共享场景默认为 `ai-chat`），优先按当前请求项目读取 `MEOO_PROJECT_API_KEY_<projectUrlId>`，缺失时回退旧 `MEOO_PROJECT_API_KEY` 兼容存量项目。用户自带第三方 Key 使用独立自定义变量。
5. 部署 Edge Function：需要登录用 `verify_jwt: true`，不需要登录用 `verify_jwt: false`（`-j false`）。

6. 前端通过 fetch 流式调用 Edge Function。



7. 默认使用流式调用，仅极短文本场景可选非流式。
8.完成请求接入、结果处理、错误处理和 loading状态。
9.自查：没有因接 AI 引入无关的大规模工程改造。

## 提示词建议

虽然接口是 `chat/completions`，但不只能做聊天。通过 system / user消息明确任务目标：

- 总结：`请总结下面文本，输出 3条要点`
- 改写：`请把下面内容改写成更正式的公告语气`
- 抽取：`请从下面文本中提取姓名、电话、邮箱，输出 JSON`
- 分类：`请判断下面工单属于售前、售后还是财务`
- 翻译：`请把下面中文翻译成英文，保留术语`

除非用户要求通用聊天助手，否则提示词应围绕具体业务动作来写。

##典型场景

###场景一：智能客服

优先交付：

-一个 Edge Function（`ai-chat`）处理对话请求
- 一个可嵌入页面的聊天组件
-一个前端请求封装调用 Edge Function
-基础会话渲染、发送中状态和报错提示

###场景二：总结 / 改写 / 翻译 /抽取

优先交付：

- 在非共享场景或已确认函数归属当前项目时，复用已有 Edge Function（默认 `ai-chat`），通过不同 system prompt 区分任务
- 页面上的触发入口（按钮 / 面板）
- 输入内容到 AI请求体的映射
- 结果展示区域
- 重试、空态和错误提示

###场景三：表单 /列表 AI 辅助

优先交付：

-在现有表单旁增加"AI 建议"按钮
- 调用 Edge Function获取建议结果
- 将结果回填到表单字段或展示在辅助面板中

## UI集成建议

把 AI能力当成"现有页面的一个功能块"去实现，而不是当成一个独立产品去重做。

优先采用下面这些嵌入方式：

-页面中的 AI 按钮
- 页面侧边抽屉
-表单旁边的 AI 辅助面板
- 列表页上的批量 AI处理入口
- 详情页里的 AI 分析区域
- 客服对话框 /智能助手浮层

如果用户没有要求复杂交互，默认做最小闭环：

1. 输入区
2. 触发按钮
3. 结果展示区
4. loading状态
5. error 状态

## 默认策略

- 使用 Meoo AI 时默认模型 `qwen3.6-plus`，统一流式输出；第三方通道使用用户指定或该接口支持的模型
- 默认通过 Edge Function 调用，AK 不暴露在前端；Meoo AI 使用平台自动注入的 AK，第三方自带 Key 使用独立自定义变量
- 默认复用现有页面和接口层
- 默认只实现当前 AI 功能点，不扩展成完整聊天产品

## 强约束

-必须先确认 Cloud 已初始化
- AK 必须存放在 Edge Function 环境变量中，禁止硬编码在前端；第三方 Key 不得写入 `MEOO_PROJECT_API_KEY` 或其项目级变量
- 使用 Meoo AI 时只使用文本接口 `POST /meoo-ai/compatible-mode/v1/chat/completions`
- 默认模型 `qwen3.6-plus`，模型名必须严格按模型表填写（含版本号后缀和大小写）
- 使用 Meoo AI 时只允许模型表中的模型（kimi-k2.5、qwen3.5-plus、qwen3.6-plus、deepseek-v3.2、glm-5、MiniMax-M2.5）；用户明确自带第三方通道时按其接口和模型要求执行
- CORS 预检和 `Access-Control-Allow-*` 响应头由 Meoo Cloud 实例网关处理，Edge Function 不重复处理 OPTIONS 或设置 CORS 响应头
- Edge Function 必须区分方法错误（405）、非法输入（400）和上游 HTTP 错误（保留上游状态码）；未分类的内部错误才返回 `{ error: string }` + 500。SSE 已开始后以流错误终止，不改写 HTTP 状态或补造完成标志。
- 上游成功响应必须有 body 且为 `text/event-stream`；转发使用按需读取与取消清理。
- Edge Function 必须转发上游 HTTP状态码，不得吞掉 4xx/5xx
- 当前上下文已注入 `meoo-ai-runtime` 时必须复用其阶段超时、结构化错误和重试边界；无论是否命中模板，POST 无稳定幂等键、已经出现首个 token 或结果时都禁止自动重放
- Edge Function 可以记录请求摘要、上游状态、耗时和异常，便于排查问题；日志级别只使用 `console.info` / `console.warn` / `console.error` 表达，不使用 `console.debug`；message 里不要再写 `[INFO]`、`[ERROR]` 等重复级别，也不要记录 AK、token、完整用户输入或隐私内容
- 部署后生效——代码修改必须重新 `CloudDeployFunction`
- 部署 Edge Function时使用 `CloudDeployFunction`
-不因接入 AI而切换框架、路由方案、构建工具或目录结构
- 不为一个 AI功能点重建整站或扩展无关系统能力

##异常处理

遇到下面情况时，按固定策略处理：

- 如果 Cloud 功能尚未初始化，立即停止当前 AI集成实现，明确告知用户"必须先初始化 Cloud 功能，否则禁止使用该能力"。
- 如果需求已经变成图片、音频、视频、多模态能力，不继续沿用本技能，明确说明超出范围，引导使用对应的 vision-ai或 image-gen-ai 技能。
- 使用 Meoo AI 且用户没有指定模型时，默认使用 `qwen3.6-plus`；第三方通道不得擅自套用 Meoo 默认模型。
- 如果用户要求接入 GPT、Claude、Gemini 或其他列表外模型但没有明确提供第三方接口/凭证，告知 Meoo 平台不提供并建议替代模型；明确自带第三方通道时按「凭证分流」执行。
- 如果 Meoo AI Edge Function 部署失败，检查 Cloud 初始化和项目级 AK 自动注入是否成功；不要对 `MEOO_PROJECT_API_KEY` 或其项目级变量执行 `set-secret`。
- 如果请求返回 401，检查 Edge Function中的 AK是否正确读取。

##完成标准

- 已确认 Cloud 功能初始化
- Edge Function已创建并部署，AK 从环境变量读取
- 前端通过调用 Edge Function
- 只改动与 AI 功能点直接相关的代码
- Meoo AI 的接口路径、请求头、请求体符合 Meoo 文本服务要求；第三方通道符合用户指定接口要求
- 具备 connecting、waiting-first-output、streaming、completed、failed、cancelled 状态，超时与用户取消可区分
-没有因集成 AI无故扩展出整套聊天系统或无关基础设施
