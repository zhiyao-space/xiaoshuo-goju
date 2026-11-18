import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AiRuntimeError, type AiRequestSnapshot } from '../aiRuntime';
import { streamAiText, type StreamAiTextOptions } from './streamAiText';

export type AiTextRequest = Omit<StreamAiTextOptions,
  'requestId' | 'signal' | 'onText' | 'onState' | 'onReasoning'>;
export type BuildAiTextRequest<Input> = (input: Input, signal: AbortSignal) =>
  AiTextRequest | Promise<AiTextRequest>;
interface AiTextState {
  busy: boolean;
  text: string;
  reasoning: string;
  snapshot?: AiRequestSnapshot;
  error?: unknown;
}
const emptyState: AiTextState = { busy: false, text: '', reasoning: '' };

/** scopeKey 为客户/账号等结果归属标识；切换、reset、卸载均隔离旧回调。 */
export function useAiText<Input>(buildRequest: BuildAiTextRequest<Input>, scopeKey: string) {
  const [state, setState] = useState<AiTextState>(emptyState);
  const latest = useRef({ buildRequest, scopeKey });
  // Abandoned renders must not replace the committed request owner or builder.
  useLayoutEffect(() => { latest.current = { buildRequest, scopeKey }; });
  const active = useRef<{ controller: AbortController; scopeKey: string } | null>(null);
  const mounted = useRef(false);
  const reset = useCallback(() => {
    const previous = active.current;
    active.current = null;
    previous?.controller.abort();
    if (mounted.current) setState(emptyState);
  }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    reset();
    return () => { mounted.current = false; reset(); };
  }, [scopeKey, reset]);
  const stop = useCallback(() => { active.current?.controller.abort(); }, []);
  const generate = useCallback(async (input: Input): Promise<string | undefined> => {
    if (!mounted.current || active.current) return undefined;
    const run = { controller: new AbortController(), scopeKey: latest.current.scopeKey };
    active.current = run; // 在异步鉴权前互斥，避免双击重复计费。
    const current = () => mounted.current && active.current === run
      && latest.current.scopeKey === run.scopeKey;
    const update = (patch: Partial<AiTextState>) => {
      if (current()) setState(previous => ({ ...previous, ...patch }));
    };
    setState({ ...emptyState, busy: true });
    try {
      const signal = run.controller.signal;
      const request = await new Promise<AiTextRequest>((resolve, reject) => {
        const abort = () => reject(new AiRuntimeError({
          kind: 'cancelled', stage: 'connect', message: '用户已取消 AI 请求',
        }));
        signal.addEventListener('abort', abort, { once: true });
        const remove = () => signal.removeEventListener('abort', abort);
        try {
          Promise.resolve(latest.current.buildRequest(input, signal))
            .then(value => { remove(); resolve(value); }, error => { remove(); reject(error); });
        } catch (error) { remove(); reject(error); }
      });
      if (!current() || run.controller.signal.aborted) {
        throw new AiRuntimeError({ kind: 'cancelled', stage: 'connect', message: '用户已取消 AI 请求' });
      }
      const text = await streamAiText({ ...request, signal: run.controller.signal,
        onState: snapshot => update({ snapshot }),
        onText: delta => { if (current()) setState(prev => ({ ...prev, text: prev.text + delta })); },
        onReasoning: delta => { if (current()) setState(prev => ({ ...prev, reasoning: prev.reasoning + delta })); },
      });
      update({ text });
      return current() ? text : undefined;
    } catch (error) {
      update({ error });
      return undefined;
    } finally {
      if (active.current === run) {
        active.current = null;
        if (mounted.current) setState(prev => ({ ...prev, busy: false }));
      }
    }
  }, []);
  return { ...state, generate, stop, reset };
}
