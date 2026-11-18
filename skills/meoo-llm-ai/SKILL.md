---
name: meoo-llm-ai
description: 给 Meoo 应用接入文本生成、聊天、摘要、翻译或分类，包括 SSE 流式展示与停止；普通对话答复不加载。
---

# 文本 AI 接入

Cloud 已启用时复用，不重复初始化。先补齐 `meoo-cloud` 和 `meoo-ai-runtime`；当前上下文已有正文就直接复用。只修改本轮 AI service、页面和必要云函数，不重建工程。

前端复用 `src/supabase/client.ts` 的实际导出：URL 用完整 `supabaseUrl` 加 `/functions/v1/<函数名>`，不能再加 `/sb-api`。新版 Client 裸 fetch 必须携带 `OneDay-App-Id: projectUrlId`；旧版同源 `/sb-api` 未导出 projectUrlId 时省略，其他情况缺少该导出先修复 Cloud 关联。匿名 key 来自 Client，登录 token 来自当前 Session；不读取 env、不硬编码域名/密钥、不另建 Client。

服务 AK 只在 Edge Function 内读取。网关注入的 `X-Meoo-Project-Url-Id` 决定 `MEOO_PROJECT_API_KEY_<id>`，兼容旧 `MEOO_PROJECT_API_KEY`；两者不能 set-secret 或要求用户配置。用户明确自带第三方服务时使用独立 secret 名，不覆盖平台凭证。**共享实例：函数名用上下文的逻辑 projectId；平台 Client 导出的 projectUrlId 是云来源路由标识，只用于 OneDay-App-Id，不能据它命名函数**。在前端和部署中复用同一个逻辑函数名常量，不覆盖来源项目函数。CORS 由 Meoo Cloud 实例网关处理，函数不自行添加 CORS/OPTIONS。

只读当前行为所需参考，不展开整个源码树：核对项目公共入口/实际导出一次，按契约接线；类型检查或真实错误指向内部实现时才读取相关函数。已读且未变的文件不重读。

## 最短实现路径

1. 新建文本 Edge Function 时只读 [服务端接线](references/edge-function.md)，把 `src/features/meoo-ai-runtime/server/createTextAiHandler.ts` 原样复制到 `functions/<本项目函数名>/`，薄入口导入同目录工厂。不从零生成校验、凭证、fetch 或流转发，不改固定 helper；使用 `meoo-cli cloud deploy-function --name <函数名> --verify-jwt true`；仅确实允许匿名的接口改为 false，显式表达接口的鉴权意图（CLI 默认 true）。
2. Web 页面直接导入 `@/features/meoo-ai-runtime/web` 的 `useAiText`；纯 service 用 `streamAiText`。业务只构造 URL、headers、body；按 [业务接线](../meoo-ai-runtime/references/business-integration.md) 的公共合同及当前接口实测等待策略使用，无需展开 Runtime/Hook 内部源码。不要重写 parser、计时器、取消或互斥。
3. 请求体 `{model:'qwen3.6-plus',messages:[{role:'user',content:业务输入}]}`，服务端强制 `stream:true`。模型默认 qwen3.6-plus；其他平台模型或自带服务见 [模型与凭证](references/advanced-workflows.md#凭证与接口)，不猜可用模型。
4. 当前 Session 的 access_token 作为 Authorization Bearer；anon key 用于 apikey，不能用 anon key 伪装登录身份。服务端收到响应头前后完整保留错误状态，不能把错误当空文本。
5. 页面展示增量、生成中/失败/取消，停止沿同一 AbortSignal 传到底层；模板会验证 [DONE] 与有效文本，`generate` 只有成功才返回 string。新增 UI/Hook 时按 [业务接线](../meoo-ai-runtime/references/business-integration.md) 处理旧回调隔离，不重复生成 Runtime。

## 验证

用 `meoo-cli cloud test-request --method POST --path "/functions/v1/<函数名>" --json '{"model":"qwen3.6-plus","messages":[{"role":"user","content":"测试下一步沟通建议"}]}'` 验证一条有效文本流；停止和失败后重试须在页面验证。[DONE] 缺失或非法事件算失败。首个输出之后不自动重放 POST。执行类型检查和构建，记录真实验证与未验证项；仅按钮、函数部署或 build 成功不代表 AI 可用。


小程序使用脚手架已有 SSE transport。仅处理相关平台差异时查 [平台接法](references/advanced-workflows.md)，Web 不加载 Expo/Taro 全部示例。
