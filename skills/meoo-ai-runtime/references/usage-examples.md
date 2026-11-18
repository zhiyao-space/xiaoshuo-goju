# Meoo AI Runtime 使用示例

仅在实现 AI 请求 transport 或排查请求生命周期时读取本文。接口地址、请求体、Cloud Client 和鉴权头继续以当前命中的 `meoo-llm-ai`、`meoo-vision-ai` 或 `meoo-image-gen-ai` 为准；这里不重复定义业务协议。

## 1. Web 流式文本或视觉请求

直接导入已落地的 `streamAiText`，不复制 transport、SSE 解析或计时器。业务 service 只组装真实 URL、headers、body：

```ts
import { streamAiText } from '@/features/meoo-ai-runtime/web';

// url、headers 来自项目 Client/当前 Session；body 来自已部署函数的真实契约。
const text = await streamAiText({ url, headers, body, signal,
  onText: delta => appendText(delta), onState: state => setRequestState(state),
});
```

模板固定单次 POST、严格 SSE/[DONE]、非空结果验证、取消和 reader 释放。视觉请求只改变 body。可选 `validateText(text)` 检查业务结构；可选 `onReasoning(delta)` 单独展示思考，不把思考当最终答案。特殊模型的首输出时限通过 `timeouts` 传入，不修改公共默认值。React 页面直接用 [业务接线](business-integration.md) 的 `useAiText`，避免手写第二套 Hook。

## 2. Expo/Taro 字符串流 transport 适配

Expo 或 Taro 若已有平台流式工具，应让该工具继续负责网络传输和 UTF-8 解码。每次回调拿到完整的 SSE `data` 内容后，将它封装成标准事件交给公共 parser：

```ts
import { createOpenAiSseParser } from '@/features/meoo-ai-runtime';

const parser = createOpenAiSseParser({
  requestId,
  attempt,
  onActivity: () => lifecycle.markActivity(),
  onText: delta => {
    lifecycle.markOutput();
    onText(delta);
  },
});

function pushDecodedSseData(data: string) {
  const event = data
    .split('\n')
    .map(line => `data: ${line}`)
    .join('\n');
  parser.push(`${event}\n\n`);
}

// transport 回调：pushDecodedSseData(data)
// transport 正常结束：parser.finish()
```

不要把二进制 chunk 强行塞给不支持 `ReadableStream` 的运行环境，也不要在 transport 中 `try/catch` 后忽略非法 JSON。平台 transport 报错时应抛出错误，让外层 `runAiRequest` 进入 `failed`；用户取消则由同一个外层 `AbortSignal` 驱动。

## 3. 同步 JSON 生图请求

同步生图可能产生计费或重复图片，因此默认固定为一次尝试。只有服务端已经实现稳定幂等协议时，才能配置 `idempotencyKey` 和多次尝试。

```ts
import {
  AiRuntimeError,
  classifyAiHttpError,
  runAiRequest,
} from '@/features/meoo-ai-runtime';

interface ImageResult {
  imageUrl: string;
}

function validateImageResult(
  value: unknown,
  requestId: string,
  attempt: number,
): ImageResult {
  const imageUrl = (value as { imageUrl?: unknown } | null)?.imageUrl;
  if (typeof imageUrl !== 'string' || !imageUrl) {
    throw new AiRuntimeError({
      kind: 'invalid-response',
      stage: 'parse',
      message: '生图响应缺少 imageUrl',
      requestId,
      attempt,
    });
  }
  return { imageUrl };
}

export async function generateImage(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<ImageResult> {
  return runAiRequest({
    method: 'POST',
    maxAttempts: 1,
    signal,
    execute: async ({ requestId, attempt, signal: attemptSignal, lifecycle }) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'X-Meoo-AI-Request-Id': requestId,
        },
        body: JSON.stringify(body),
        signal: attemptSignal,
      });

      lifecycle.connected();
      if (!response.ok) {
        throw classifyAiHttpError({
          status: response.status,
          retryAfter: response.headers.get('Retry-After'),
          requestId,
          attempt,
        });
      }

      const result = validateImageResult(await response.json(), requestId, attempt);
      lifecycle.markActivity();
      lifecycle.markOutput();
      return result;
    },
  });
}
```

`validateImageResult` 必须按当前 Edge Function 的真实响应结构实现；上面的 `imageUrl` 只是展示 validator 应放在哪里，不是新的接口契约。

## 4. 结构化文本结果

要求模型返回 JSON 时，不要直接 `JSON.parse` 后断言类型。先由 Runtime 去掉可选 Markdown JSON fence 并解析，再由业务 validator 检查字段：

```ts
import { parseStructuredAiResult } from '@/features/meoo-ai-runtime';

interface SummaryResult {
  title: string;
  tags: string[];
}

const result = parseStructuredAiResult<SummaryResult>(rawText, value => {
  const input = value as Partial<SummaryResult> | null;
  if (
    !input
    || typeof input.title !== 'string'
    || !Array.isArray(input.tags)
    || !input.tags.every(tag => typeof tag === 'string')
  ) {
    throw new Error('invalid summary result');
  }
  return { title: input.title, tags: input.tags };
});
```

## 5. 页面取消与状态展示

```ts
import { AiRuntimeError } from '@/features/meoo-ai-runtime';

const controller = new AbortController();

const task = streamAiText({
  url,
  headers,
  body,
  signal: controller.signal,
  onText: delta => appendText(delta),
  onState: state => setRequestState(state),
});

// “停止生成”按钮只触发取消，不自行伪造成功或失败状态。
controller.abort();
void task.catch(error => {
  if (error instanceof AiRuntimeError && error.kind === 'cancelled') return;
  reportAiError(error);
});
```

UI 建议直接按 `AiRequestSnapshot.phase` 映射：`connecting` 显示“正在连接”，`waiting-first-output` 显示“正在生成”，`streaming` 展示增量内容，`failed` 根据 `error.kind` 给出可操作提示，`cancelled` 保留已展示内容但明确标记“已停止”。调用方仍需正常捕获 task 的 rejected Promise，避免未处理的 Promise rejection。

## 重试决策示例

| 场景 | 自动重试 |
|------|----------|
| GET，503，尚无输出，未超过次数 | 可以 |
| POST，无稳定幂等键 | 不可以 |
| POST，有稳定幂等键，429/503，尚无输出 | 可以有限重试 |
| 任意请求，已经出现首个 token 或图片 | 不可以 |
| 401、403、参数类 4xx | 不可以 |
| 用户主动取消 | 不可以 |
