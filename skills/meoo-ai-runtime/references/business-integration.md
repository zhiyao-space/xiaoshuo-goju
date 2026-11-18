# Web AI 业务接线

适用于 React Web 文本/视觉 SSE。直接导入模板 `useAiText`；Expo/Taro 按 [平台 transport](usage-examples.md) 适配网络层。页面接线不复制或修改公共 Runtime、transport、Hook。

## 可直接调用的公共合同

`useAiText<Input>(buildRequest, scopeKey)` 的 buildRequest 签名是 `(input: Input, signal: AbortSignal) => AiTextRequest | Promise<AiTextRequest>`。返回 `{url: string, headers: HeadersInit, body: Record<string, unknown>}`；可选 `timeouts` 和 `validateText(text): void`。不返回 Response，也不传入 onText/onState 或自己的 reader。

`body` 必须是函数接收的 JavaScript 对象，例如 `{ model, messages }`。固定 `streamAiText` 在 HTTP 边界执行一次 `JSON.stringify(body)`；buildRequest 不能提前 stringify、传 Response 或自己 fetch。否则对象会被双重序列化成 JSON 字符串，函数校验返回 400。直接 fetch 的示例属于网络层，不能把它的字符串 body 搬进 buildRequest。

```ts
return { url, headers, body: { model, messages }, timeouts };
// 不要返回 body: JSON.stringify({ model, messages })
```

Hook 返回 `busy: boolean`、`text: string`、`reasoning: string`、`error?: unknown`、`snapshot?`，以及 `generate(input)`、`stop()`、`reset()`。snapshot 的 phase 为 idle/connecting/waiting-first-output/streaming/completed/failed/cancelled；可读 requestId、attempt、hasOutput、error。error 若为 `AiRuntimeError`，可读 kind/stage/message/status；不能假设 unknown 有这些字段，使用公共导出的类做 instanceof 窄化。

`stop()` 同时覆盖等待 Session 和读取流；保留已展示文字，generate 返回 undefined，busy 会解除。此时 snapshot 可能尚未创建，或者仍保留最后的传输状态；取消提示读取 error.kind === cancelled。`reset()` 会清空文字并隔离旧请求。错误后再次调用 generate 才发起用户请求，没有自动重放 POST。

模板已处理 SSE、reasoning 分离、超时、reader 释放、重复点击和旧请求回调。接线先按此合同与公开导出编写；只有类型错误或真实行为明确指向内部实现时，才读取对应函数。

## 业务负责的输入

在业务 service 定义请求构造函数：按当前 AI skill 的实际函数契约组装 URL、headers、body；Session 从平台 Client 取得，业务 prompt 和客户字段由应用决定。构造函数收到 AbortSignal，检查取消后再返回，不用自己的 SSE parser。若登录过期，明确抛错而非使用旧 Token。

```tsx
import { useAiText, type BuildAiTextRequest } from '@/features/meoo-ai-runtime/web';

// buildRequest 是业务 service：获取当前 Session、拼当前函数请求、校验所需字段。
function Advisor({ customerId, accountId, input, buildRequest }: {
  customerId: string; accountId: string; input: string;
  buildRequest: BuildAiTextRequest<string>;
}) {
  const ai = useAiText(buildRequest, `${accountId}:${customerId}`);
  return <section aria-busy={ai.busy}>
    <button disabled={ai.busy} onClick={() => void ai.generate(input)}>生成</button>
    <button disabled={!ai.busy} onClick={ai.stop}>停止生成</button>
    <pre>{ai.text}</pre>
    {ai.error && <p role="alert">{ai.snapshot?.phase === 'cancelled'
      || (ai.error as { kind?: string }).kind === 'cancelled'
      ? '已停止' : '生成失败，请检查错误后重试'}</p>}
  </section>;
}
```

`generate(input): Promise<string | undefined>`：完整有效答案才返回 string；失败、取消、重复点击、过期请求返回 undefined，错误在 error/snapshot。调用者只有拿到 string 才按业务规则保存。生成成功与保存失败分别提示，保存失败重试保存，不重新请求 AI。

`scopeKey` 必须包含结果归属的客户和账号；切换、reset、卸载会取消并屏蔽旧回调。模板管理 busy/text/reasoning/snapshot/error 和互斥，UI 只绑定状态。onState 由模板内部接收，不给页面重建生命周期。

按 snapshot.phase 展示 connecting/waiting-first-output/streaming/completed/failed/cancelled。reasoning 只能作为可选思考区，不能保存为业务答案。结构化结果在 buildRequest 返回的 `validateText` 内用公共 `parseStructuredAiResult` 加业务 validator。样式、路由、prompt、字段和保存接口按当前需求接线，不进入模板。

## 当前服务的等待策略

超时通过 buildRequest 返回的 `timeouts` 接线，不改固定 Runtime 默认。主预发客户建议完整请求曾约50秒；固定函数要取得上游响应头才转发HTTP头，等待Auth/SQL/模型首响应也计入connect。真实生成service的connect=15秒已复现connect超时，仅放宽firstOutput无效：本场景先采用 `{connectMs:90000,firstOutputMs:90000,idleStreamMs:30000,overallMs:120000}`，保持可停止和单次 POST，再实际测首个正文与完整答案；其他接口按各自实测选择。reasoning/心跳不是业务答案，不能当正文保存或伪造完成；有限总时长仍生效，失败需用户手动重试。

## 验证

先组合实际业务 buildRequest 与固定 transport，截获一次实际 HTTP body 并 JSON.parse，确认得到对象及完整 messages，而不是字符串；分别测试两个模块不能发现双重序列化。再验证有效结果、停止、失败后重试、切换客户/账号不串结果、卸载、双击只发一次、缺 [DONE]/非法 JSON 不保存。通过实际生成模块执行停止/重试/切换/卸载/重复点击断言，并以正常 SDK 或受支持 API 验证真实流与权限；按任务要求选择验收方式，不强制浏览器。复制或 build 不能代替这些行为证据。
