---
name: meoo-ai-runtime
hidden: true
description: 应用内文本、视觉、生图请求共用的生命周期、取消、超时、结构化错误和 SSE 解析；配套业务 AI skill 使用。
allowed_create_modes:
  - create-desktop
  - create-app
  - miniprogram
component_keywords:
  - '(?:^|/)features/meoo-ai-runtime(?:/|$)'
  - '(?:^|/)(?:aiRuntime|sseParser|aiRequestLifecycle)\.[tj]s$'
---

# AI 请求运行时

复用项目 `src/features/meoo-ai-runtime` 公共入口；模板落地以 available-project-capability 回执及实际入口为准。已有实现不重建；只核对实际导出，不递归读全部源码或模板参考。当前上下文已有本 Skill 就复用，模板文件存在不代表当前上下文已有协议合同。

Web 文本/视觉 SSE 直接导入 `@/features/meoo-ai-runtime/web` 的 `streamAiText` 或 `useAiText`，不再复制 transport/Hook。业务只提供请求 URL、headers、body 与 scopeKey；新增页面时读 [业务接线](references/business-integration.md)。Expo/Taro 首次接平台网络层，或任意平台需要同步 JSON（如生图）时，才读 [references/usage-examples.md](references/usage-examples.md) 对应章节；公共 Runtime 不重写。

新建文本云函数时复用 `server/createTextAiHandler.ts`，原样复制进当前函数打包目录，入口仅配置可信服务 URL、函数名和 env getter；按 [服务端接线](../meoo-llm-ai/references/edge-function.md) 部署。前端不导入服务端模块；视觉、工具调用和同步 JSON 沿各自协议。

## 公共合同

- `runAiRequest({method:'POST',maxAttempts:1,signal,onChange,execute})` 管理 requestId、attempt、begin/complete 与互斥终态。execute 收到 `{requestId,attempt,signal,lifecycle}`，只负责真实传输和业务验证。
- 收到响应头 `lifecycle.connected()`；有效事件/心跳 `markActivity()`；首个可展示业务输出 `markOutput()`。调用者不能提前 complete，Promise 返回前必须确认协议完整与业务结果有效。
- 平台 SSE transport 内部用 `createOpenAiSseParser({requestId,attempt,onActivity,onText})`，逐 chunk push，读完 finish；缺少 [DONE]、非法 JSON、残缺事件算失败。Expo/Taro transport 继续负责平台网络与 UTF-8 解码，再交同一解析层。
- 非 2xx 用 `classifyAiHttpError` 保留状态、阶段、requestId、attempt；结构化文本用 `parseStructuredAiResult` 加业务 validator。同步生图按 JSON 验证，不能套 SSE。
- AbortSignal 沿 UI→service→fetch 传递；用户停止是取消，超时是 timeout 并中止 transport，不能混同。默认连接 15s、首输出 30s、空闲 30s、总计 120s。
- POST 默认不可重放；只有真实服务端幂等键且尚无输出才允许有限自动重试，401/403/参数错误不重试。首个输出后禁止自动重放。取消客户端不保证服务端停止计费。

## 页面收尾

增量、状态、成功、失败和 finally 均绑定当前请求；重复提交、切换客户/账号或卸载时旧回调不能覆盖新结果或清 loading。UI 只显示状态和调用 abort，不维护第二套解析/计时器。协议完整成功与保存成功分别表达，保存失败不能重新生成。

验证有效结果、停止、断流/缺 [DONE]、超时、失败后重试和旧回调隔离；执行类型检查和构建。只有真实请求/页面行为经过验证才说明可用。持久化用 supabase-data-access，Session 用 meoo-cloud-auth，图片输入用平台已有 Storage，不在 Runtime 中写 URL、密钥、Client 或业务 schema。
