import {
  AiRuntimeError, classifyAiHttpError, createOpenAiSseParser, runAiRequest,
  type AiRequestSnapshot, type AiTimeoutPolicy,
} from '../aiRuntime';

export interface StreamAiTextOptions {
  url: string;
  headers: HeadersInit;
  body: Record<string, unknown>;
  requestId?: string;
  signal?: AbortSignal;
  timeouts?: Partial<AiTimeoutPolicy>;
  onText?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  onState?: (state: AiRequestSnapshot) => void;
  validateText?: (text: string) => void;
}

/** 可直接复用的 Web SSE transport；业务只组装请求，不复制解析和计时器。 */
export function streamAiText(options: StreamAiTextOptions): Promise<string> {
  return runAiRequest({
    requestId: options.requestId, method: 'POST', maxAttempts: 1,
    signal: options.signal, timeouts: options.timeouts, onChange: options.onState,
    execute: async ({ requestId, attempt, signal, lifecycle }) => {
      if (!options.body || typeof options.body !== 'object' || Array.isArray(options.body)) {
        throw new AiRuntimeError({
          kind: 'invalid-request', stage: 'connect', requestId, attempt,
          message: 'AI request body must be a JSON object; pass the object without JSON.stringify',
        });
      }
      const headers = new Headers(options.headers);
      headers.set('Content-Type', 'application/json');
      headers.set('X-Meoo-AI-Request-Id', requestId);
      const response = await fetch(options.url, {
        method: 'POST', headers, body: JSON.stringify(options.body), signal,
      });
      lifecycle.connected();
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const error = payload?.error ?? payload;
        const message = typeof error === 'string' ? error
          : typeof error?.message === 'string' ? error.message : undefined;
        throw classifyAiHttpError({
          status: response.status, retryAfter: response.headers.get('Retry-After'), requestId, attempt,
          message,
        });
      }
      const invalid = (message: string) => new AiRuntimeError({
        kind: 'invalid-response', stage: 'parse', message, requestId, attempt,
      });
      if (!response.body) throw invalid('AI 响应缺少可读取的数据流');
      if (!response.headers.get('Content-Type')?.toLowerCase().includes('text/event-stream')) {
        await response.body.cancel().catch(() => undefined);
        throw invalid('AI 响应不是 SSE 数据流');
      }
      const parser = createOpenAiSseParser({
        requestId, attempt, onActivity: () => lifecycle.markActivity(),
        onReasoning: options.onReasoning,
        onText: delta => { lifecycle.markOutput(); options.onText?.(delta); },
      });
      const reader = response.body.getReader();
      const cancelReader = () => { void reader.cancel().catch(() => undefined); };
      signal.addEventListener('abort', cancelReader, { once: true });
      try {
        if (signal.aborted) cancelReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.push(value);
        }
        parser.finish();
        if (!parser.text.trim()) throw invalid('AI 响应没有有效文本');
        options.validateText?.(parser.text);
        return parser.text;
      } finally {
        signal.removeEventListener('abort', cancelReader);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    },
  });
}
