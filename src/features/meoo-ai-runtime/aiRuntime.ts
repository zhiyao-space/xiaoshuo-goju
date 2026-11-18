/**
 * Meoo AI 公共请求运行时。
 *
 * 职责边界：
 * - 本文件不主动发起 fetch/Taro.request，也不保存 URL、鉴权或业务请求体。
 * - 业务 AI service 把真正的网络调用作为 execute 传给 runAiRequest。
 * - createOpenAiSseParser 只解析 transport 返回的 SSE 数据，不创建网络连接。
 *
 * 一次典型调用的时序：
 * 用户操作 -> runAiRequest -> lifecycle.begin -> execute 发请求
 * -> connected -> markActivity/markOutput -> execute 返回 -> complete。
 */
export type AiRequestPhase =
  | 'idle'
  | 'connecting'
  | 'waiting-first-output'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AiRequestStage = 'connect' | 'first-output' | 'idle-stream' | 'overall' | 'http' | 'stream' | 'parse';

export type AiErrorKind =
  | 'cancelled'
  | 'timeout'
  | 'rate-limited'
  | 'authentication'
  | 'permission'
  | 'invalid-request'
  | 'upstream-unavailable'
  | 'stream-interrupted'
  | 'invalid-response'
  | 'unknown';

export interface AiRuntimeErrorOptions {
  kind: AiErrorKind;
  stage: AiRequestStage;
  message: string;
  status?: number;
  retryAfterMs?: number;
  requestId?: string;
  attempt?: number;
  sourceError?: unknown;
}

export class AiRuntimeError extends Error {
  readonly kind: AiErrorKind;
  readonly stage: AiRequestStage;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly requestId?: string;
  readonly attempt?: number;
  readonly sourceError?: unknown;

  constructor(options: AiRuntimeErrorOptions) {
    super(options.message);
    this.name = 'AiRuntimeError';
    this.kind = options.kind;
    this.stage = options.stage;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.requestId = options.requestId;
    this.attempt = options.attempt;
    this.sourceError = options.sourceError;
  }
}

/** 为一次用户动作生成稳定 ID；同一次动作的多次网络尝试必须复用该 ID。 */
export function createAiRequestId(now = Date.now(), random = Math.random): string {
  const randomPart = Math.floor(random() * Number.MAX_SAFE_INTEGER).toString(36).padStart(10, '0');
  return `ai_${now.toString(36)}_${randomPart}`;
}

/** 兼容 Retry-After 的秒数和 HTTP 日期格式，并统一转成毫秒。 */
export function parseRetryAfterMs(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, date - now);
}

/** 将非 2xx HTTP 状态归一化为 UI、日志和重试逻辑都能稳定识别的错误。 */
export function classifyAiHttpError(input: {
  status: number;
  message?: string;
  retryAfter?: string | null;
  requestId?: string;
  attempt?: number;
}): AiRuntimeError {
  const { status, requestId, attempt } = input;
  const retryAfterMs = parseRetryAfterMs(input.retryAfter);
  let kind: AiErrorKind = 'unknown';
  if (status === 401) kind = 'authentication';
  else if (status === 403) kind = 'permission';
  else if (status === 408 || status === 504) kind = 'timeout';
  else if (status === 429) kind = 'rate-limited';
  else if (status >= 500) kind = 'upstream-unavailable';
  else if (status >= 400) kind = 'invalid-request';
  return new AiRuntimeError({
    kind,
    stage: 'http',
    status,
    retryAfterMs,
    requestId,
    attempt,
    message: input.message || `AI 请求失败（HTTP ${status}）`,
  });
}

/** 保留已经结构化的 Runtime 错误，并为普通异常补充阶段上下文。 */
export function toAiRuntimeError(error: unknown, fallback: Omit<AiRuntimeErrorOptions, 'message'> & { message?: string }): AiRuntimeError {
  if (error instanceof AiRuntimeError) return error;
  const message = error instanceof Error ? error.message : fallback.message || 'AI 请求失败';
  return new AiRuntimeError({ ...fallback, message, sourceError: error });
}

/**
 * 判断一次失败能否安全重试。
 * POST 只有在服务端支持稳定幂等键、尚无业务输出且错误可恢复时才允许重放。
 */
export function shouldRetryAiRequest(input: {
  error: AiRuntimeError;
  attempt: number;
  maxAttempts?: number;
  hasOutput: boolean;
  method?: string;
  idempotencyKey?: string;
}): boolean {
  const maxAttempts = input.maxAttempts ?? 2;
  if (input.attempt >= maxAttempts || input.hasOutput) return false;
  if (!['timeout', 'rate-limited', 'upstream-unavailable', 'stream-interrupted'].includes(input.error.kind)) return false;
  const method = (input.method || 'POST').toUpperCase();
  const naturallyReplaySafe = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  return naturallyReplaySafe || Boolean(input.idempotencyKey?.trim());
}

/** 根据尝试次数计算带抖动的退避时间，同时尊重服务端 Retry-After。 */
export function computeAiRetryDelayMs(input: {
  attempt: number;
  retryAfterMs?: number;
  baseMs?: number;
  maxMs?: number;
  random?: () => number;
}): number {
  const baseMs = input.baseMs ?? 500;
  const maxMs = input.maxMs ?? 10_000;
  const random = input.random ?? Math.random;
  const exponential = Math.min(maxMs, baseMs * (2 ** Math.max(0, input.attempt - 1)));
  const jittered = Math.round(exponential * (0.75 + random() * 0.5));
  return Math.min(maxMs, Math.max(input.retryAfterMs ?? 0, jittered));
}

export interface SseEvent {
  data: string;
  event?: string;
  id?: string;
  retry?: number;
}

export interface SseParser {
  push(chunk: string | Uint8Array): void;
  finish(): void;
}

/**
 * 通用 SSE 分帧器：处理跨 chunk、CRLF、多行 data 和注释心跳。
 * 它只消费已经收到的字符串/字节，不负责发送请求。
 */
export function createSseParser(onEvent: (event: SseEvent) => void): SseParser {
  let decoder: TextDecoder | undefined;
  let textBuffer = '';
  let eventLines: string[] = [];

  const dispatch = () => {
    if (eventLines.length === 0) return;
    const data: string[] = [];
    let event: string | undefined;
    let id: string | undefined;
    let retry: number | undefined;
    for (const line of eventLines) {
      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'data') data.push(value);
      else if (field === 'event') event = value;
      else if (field === 'id') id = value;
      else if (field === 'retry' && /^\d+$/.test(value)) retry = Number(value);
    }
    eventLines = [];
    if (data.length > 0) onEvent({ data: data.join('\n'), event, id, retry });
  };

  const appendText = (text: string) => {
    textBuffer += text;
    while (true) {
      const newline = textBuffer.indexOf('\n');
      if (newline < 0) break;
      let line = textBuffer.slice(0, newline);
      textBuffer = textBuffer.slice(newline + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line === '') dispatch();
      else eventLines.push(line);
    }
  };

  return {
    push(chunk) {
      if (typeof chunk === 'string') {
        appendText(chunk);
        return;
      }
      if (typeof TextDecoder === 'undefined') {
        throw new AiRuntimeError({
          kind: 'invalid-response',
          stage: 'stream',
          message: '当前运行环境不能解码二进制 SSE；请由平台传输层先解码为字符串',
        });
      }
      decoder ||= new TextDecoder();
      appendText(decoder.decode(chunk, { stream: true }));
    },
    finish() {
      if (decoder) appendText(decoder.decode());
      if (textBuffer.length > 0) {
        let line = textBuffer;
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line) eventLines.push(line);
        textBuffer = '';
      }
      dispatch();
    },
  };
}

export interface OpenAiSseParser extends SseParser {
  readonly text: string;
  readonly done: boolean;
}

/**
 * 解析 OpenAI-compatible 的 data JSON 与 [DONE]。
 * 默认要求显式 [DONE]；连接提前结束时 finish() 会抛出 stream-interrupted，
 * 防止调用方把半截内容当作成功结果。
 */
export function createOpenAiSseParser(options: {
  onText?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onActivity?: () => void;
  onDone?: () => void;
  requireDone?: boolean;
  requestId?: string;
  attempt?: number;
} = {}): OpenAiSseParser {
  let fullText = '';
  let done = false;
  const parser = createSseParser(event => {
    options.onActivity?.();
    if (event.data.trim() === '[DONE]') {
      done = true;
      options.onDone?.();
      return;
    }
    let payload: any;
    try {
      payload = JSON.parse(event.data);
    } catch (error) {
      throw new AiRuntimeError({
        kind: 'invalid-response',
        stage: 'parse',
        message: 'AI 流包含无法解析的 JSON 事件',
        requestId: options.requestId,
        attempt: options.attempt,
        sourceError: error,
      });
    }
    if (payload?.error) {
      throw new AiRuntimeError({
        kind: 'upstream-unavailable',
        stage: 'stream',
        message: typeof payload.error === 'string' ? payload.error : payload.error.message || 'AI 流返回错误事件',
        requestId: options.requestId,
        attempt: options.attempt,
      });
    }
    const reasoning = payload?.choices?.[0]?.delta?.reasoning_content;
    if (typeof reasoning === 'string' && reasoning.length > 0) options.onReasoning?.(reasoning);
    const content = payload?.choices?.[0]?.delta?.content;
    if (typeof content === 'string' && content.length > 0) {
      fullText += content;
      options.onText?.(content);
    }
  });

  return {
    push: parser.push,
    finish() {
      parser.finish();
      if ((options.requireDone ?? true) && !done) {
        throw new AiRuntimeError({
          kind: 'stream-interrupted',
          stage: 'stream',
          message: 'AI 流在完成标志前中断',
          requestId: options.requestId,
          attempt: options.attempt,
        });
      }
    },
    get text() { return fullText; },
    get done() { return done; },
  };
}

export interface AiTimeoutPolicy {
  connectMs: number;
  firstOutputMs: number;
  idleStreamMs: number;
  overallMs: number;
}

export const DEFAULT_AI_TIMEOUT_POLICY: AiTimeoutPolicy = {
  connectMs: 15_000,
  firstOutputMs: 30_000,
  idleStreamMs: 30_000,
  overallMs: 120_000,
};

export interface AiRequestSnapshot {
  requestId: string;
  attempt: number;
  phase: AiRequestPhase;
  hasOutput: boolean;
  startedAt?: number;
  updatedAt: number;
  error?: AiRuntimeError;
}

export interface AiRequestLifecycle {
  begin(): void;
  connected(): void;
  markActivity(): void;
  markOutput(): void;
  complete(): void;
  fail(error: unknown): AiRuntimeError;
  cancel(): void;
  snapshot(): AiRequestSnapshot;
  dispose(): void;
}

/**
 * 管理单次网络尝试的状态与四类超时。
 * lifecycle 只记录/约束状态，不发送请求；超时时由 onTimeout 通知外层中止 transport。
 */
export function createAiRequestLifecycle(options: {
  requestId?: string;
  attempt?: number;
  timeouts?: Partial<AiTimeoutPolicy>;
  now?: () => number;
  onChange?: (snapshot: AiRequestSnapshot) => void;
  onTimeout?: (error: AiRuntimeError) => void;
} = {}): AiRequestLifecycle {
  const now = options.now ?? Date.now;
  const requestId = options.requestId || createAiRequestId(now());
  const attempt = options.attempt ?? 1;
  const timeouts = { ...DEFAULT_AI_TIMEOUT_POLICY, ...options.timeouts };
  const timers = new Map<AiRequestStage, ReturnType<typeof setTimeout>>();
  let state: AiRequestSnapshot = { requestId, attempt, phase: 'idle', hasOutput: false, updatedAt: now() };

  const isTerminal = () => state.phase === 'completed' || state.phase === 'failed' || state.phase === 'cancelled';
  const emit = () => options.onChange?.({ ...state });
  const clear = (stage?: AiRequestStage) => {
    if (stage) {
      const handle = timers.get(stage);
      if (handle !== undefined) clearTimeout(handle);
      timers.delete(stage);
      return;
    }
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
  };
  const transition = (phase: AiRequestPhase, error?: AiRuntimeError) => {
    state = { ...state, phase, updatedAt: now(), ...(error ? { error } : {}) };
    emit();
  };
  const arm = (stage: AiRequestStage, durationMs: number) => {
    clear(stage);
    if (!(durationMs > 0)) return;
    timers.set(stage, setTimeout(() => {
      if (isTerminal()) return;
      const error = new AiRuntimeError({
        kind: 'timeout',
        stage,
        message: `AI 请求在 ${stage} 阶段超时`,
        requestId,
        attempt,
      });
      clear();
      transition('failed', error);
      options.onTimeout?.(error);
    }, durationMs));
  };

  const api: AiRequestLifecycle = {
    begin() {
      if (state.phase !== 'idle') throw new Error('AI 请求生命周期只能开始一次');
      state = { ...state, startedAt: now(), updatedAt: now() };
      transition('connecting');
      arm('connect', timeouts.connectMs);
      arm('overall', timeouts.overallMs);
    },
    connected() {
      if (isTerminal()) return;
      clear('connect');
      transition('waiting-first-output');
      arm('first-output', timeouts.firstOutputMs);
    },
    markActivity() {
      if (isTerminal()) return;
      if (state.hasOutput) arm('idle-stream', timeouts.idleStreamMs);
      state = { ...state, updatedAt: now() };
    },
    markOutput() {
      if (isTerminal()) return;
      clear('connect');
      clear('first-output');
      state = { ...state, hasOutput: true };
      transition('streaming');
      arm('idle-stream', timeouts.idleStreamMs);
    },
    complete() {
      if (isTerminal()) return;
      clear();
      transition('completed');
    },
    fail(error) {
      const normalized = toAiRuntimeError(error, {
        kind: 'unknown', stage: state.hasOutput ? 'stream' : 'connect', requestId, attempt,
      });
      if (!isTerminal()) {
        clear();
        transition('failed', normalized);
      }
      return normalized;
    },
    cancel() {
      if (isTerminal()) return;
      clear();
      transition('cancelled', new AiRuntimeError({
        kind: 'cancelled', stage: state.hasOutput ? 'stream' : 'connect', message: '用户已取消 AI 请求', requestId, attempt,
      }));
    },
    snapshot: () => ({ ...state }),
    dispose: () => clear(),
  };
  return api;
}

export interface AiAttemptContext {
  requestId: string;
  attempt: number;
  signal: AbortSignal;
  lifecycle: AiRequestLifecycle;
}

/**
 * 编排一次用户 AI 动作及其有限重试。
 *
 * 真正的网络请求由调用方传入的 execute 发起。runAiRequest 负责：
 * 1. 为用户动作生成稳定 requestId，并为每次真实请求递增 attempt；
 * 2. 创建 AbortController 和 lifecycle，在 execute 前启动超时；
 * 3. 将 signal/lifecycle 交给 execute，由 transport 在真实节点报告状态；
 * 4. 失败后仅在 shouldRetryAiRequest 允许时再次调用 execute。
 *
 * 对普通 AI POST 应使用 maxAttempts: 1。只有服务端明确支持稳定幂等键时，
 * 才能传 idempotencyKey 并允许多次尝试。
 */
export async function runAiRequest<T>(options: {
  /** 业务 transport：这里编写 fetch/Taro.request，并读取 SSE 或 JSON 响应。 */
  execute: (context: AiAttemptContext) => Promise<T>;
  requestId?: string;
  method?: string;
  idempotencyKey?: string;
  maxAttempts?: number;
  timeouts?: Partial<AiTimeoutPolicy>;
  signal?: AbortSignal;
  onChange?: (snapshot: AiRequestSnapshot) => void;
  onRetry?: (input: { error: AiRuntimeError; nextAttempt: number; delayMs: number }) => void;
  sleep?: (durationMs: number, signal?: AbortSignal) => Promise<void>;
}): Promise<T> {
  const requestId = options.requestId || createAiRequestId();
  if (options.signal?.aborted) {
    throw new AiRuntimeError({ kind: 'cancelled', stage: 'connect', message: '用户已取消 AI 请求', requestId });
  }
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const sleep = options.sleep ?? ((durationMs, signal) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AiRuntimeError({ kind: 'cancelled', stage: 'connect', message: '用户已取消 AI 请求', requestId }));
      return;
    }
    const onAbort = () => {
      clearTimeout(handle);
      reject(new AiRuntimeError({ kind: 'cancelled', stage: 'connect', message: '用户已取消 AI 请求', requestId }));
    };
    const handle = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, durationMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  }));
  let lastError: AiRuntimeError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(new AiRuntimeError({
      kind: 'cancelled', stage: 'connect', message: '用户已取消 AI 请求', requestId, attempt,
    }));
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    const lifecycle = createAiRequestLifecycle({
      requestId,
      attempt,
      timeouts: options.timeouts,
      onChange: options.onChange,
      onTimeout: error => controller.abort(error),
    });
    // 先启动连接/总时长计时，再进入真正发送网络请求的 execute。
    lifecycle.begin();

    try {
      // 网络请求在这一行发生；本 Runtime 不知道具体 URL、headers 或 body。
      const result = await options.execute({ requestId, attempt, signal: controller.signal, lifecycle });
      if (options.signal?.aborted) lifecycle.cancel();
      const snapshot = lifecycle.snapshot();
      if (snapshot.phase === 'failed' && snapshot.error) throw snapshot.error;
      if (snapshot.phase === 'cancelled' && snapshot.error) throw snapshot.error;
      lifecycle.complete();
      return result;
    } catch (error) {
      if (options.signal?.aborted) {
        lifecycle.cancel();
        throw lifecycle.snapshot().error;
      }
      const snapshot = lifecycle.snapshot();
      lastError = snapshot.phase === 'failed' && snapshot.error
        ? snapshot.error
        : lifecycle.fail(error);
      if (!shouldRetryAiRequest({
        error: lastError,
        attempt,
        maxAttempts,
        hasOutput: lifecycle.snapshot().hasOutput,
        method: options.method,
        idempotencyKey: options.idempotencyKey,
      })) {
        throw lastError;
      }
      const delayMs = computeAiRetryDelayMs({ attempt, retryAfterMs: lastError.retryAfterMs });
      options.onRetry?.({ error: lastError, nextAttempt: attempt + 1, delayMs });
      await sleep(delayMs, options.signal);
    } finally {
      options.signal?.removeEventListener('abort', abortFromCaller);
      lifecycle.dispose();
    }
  }

  throw lastError || new AiRuntimeError({
    kind: 'unknown', stage: 'connect', message: 'AI 请求未完成', requestId,
  });
}

/** 严格解析结构化 AI 文本，并由业务 validator 校验字段和类型。 */
export function parseStructuredAiResult<T>(text: string, validate: (value: unknown) => T): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new AiRuntimeError({
      kind: 'invalid-response', stage: 'parse', message: 'AI 返回内容不是合法 JSON', sourceError: error,
    });
  }
  try {
    return validate(parsed);
  } catch (error) {
    throw new AiRuntimeError({
      kind: 'invalid-response', stage: 'parse', message: 'AI 返回 JSON 不符合业务结构', sourceError: error,
    });
  }
}
