export interface TextAiHandlerOptions {
  serviceBaseUrl: string;
  functionName: string;
  getEnv: (name: string) => string | undefined;
  /** 可信业务接线：将业务 JSON 转为文本请求；固定传输实现不改动。 */
  prepareInput?: (body: unknown, context: { request: Request; signal: AbortSignal }) => unknown | Promise<unknown>;
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

/** 业务拒绝只透出显式的安全状态/提示；SDK 原始错误不要向用户传播。 */
export class TextAiInputError extends HttpError {
  constructor(status: 400 | 401 | 403 | 404 | 422, code: string, message: string) {
    super(status, code, message);
    this.name = 'TextAiInputError';
  }
}

async function prepareBusinessInput(
  prepare: NonNullable<TextAiHandlerOptions['prepareInput']>,
  body: unknown, request: Request, signal: AbortSignal,
): Promise<unknown> {
  if (signal.aborted) throw signal.reason;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    Promise.resolve().then(() => {
      if (signal.aborted) throw signal.reason;
      return prepare(body, { request, signal });
    }).then(value => {
      cleanup();
      if (signal.aborted) reject(signal.reason);
      else resolve(value);
    }, error => { cleanup(); reject(error); });
  });
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

  try { return JSON.parse(text) as unknown; } catch {
    throw new HttpError(400, 'invalid_json', '请求体必须是有效 JSON');
  }
}

function validateTextInput(body: any) {
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

/** 固定文本协议与服务端流转发；业务只提供部署环境、函数名、env getter。 */
export function createTextAiHandler(options: TextAiHandlerOptions) {
  const { serviceBaseUrl, functionName, getEnv, prepareInput } = options;
  return async (req: Request): Promise<Response> => {
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
      const body = await readInput(req, upstream.signal);
      let prepared = body;
      if (prepareInput) {
        try { prepared = await prepareBusinessInput(prepareInput, body, req, upstream.signal); } catch (error) {
          if (upstream.signal.aborted) throw upstream.signal.reason;
          if (error instanceof TextAiInputError) throw error;
          throw new HttpError(400, 'invalid_business_input', '业务输入不符合当前接口要求');
        }
      }
      const { messages, model } = validateTextInput(prepared);
      const projectUrlId = req.headers.get('X-Meoo-Project-Url-Id')?.trim() || '';
      const projectSecretName = `MEOO_PROJECT_API_KEY_${projectUrlId}`;
      const projectServiceAK =
        (projectUrlId ? getEnv(projectSecretName) : '') ||
        getEnv('MEOO_PROJECT_API_KEY') ||
        '';
      if (!projectServiceAK) {
        throw new HttpError(503, 'credential_unavailable', '当前项目的 AI 服务凭证未就绪，请稍后重试');
      }

      const lastMessage = messages[messages.length - 1]?.content;

      console.info(`[${functionName}] request ${requestId} model=${model} messages=${messages.length} lastMessageLength=${String(lastMessage ?? '').length}`);

      // 调用 Meoo AI（强制流式）
      const response = await fetch(
        `${serviceBaseUrl}/meoo-ai/compatible-mode/v1/chat/completions`,
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
  };
}
