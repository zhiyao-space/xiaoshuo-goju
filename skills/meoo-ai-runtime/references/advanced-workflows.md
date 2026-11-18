# Meoo AI 公共运行时

本技能负责文本、视觉和生图能力共用的请求运行时，模板入口为 `src/features/meoo-ai-runtime/`；文件复制状态以 `available-project-capability` 回执和项目实际文件为准，不能仅凭技能内容认定模板已经落地。业务 Skill 负责请求体、模型参数和 UI，本模板负责请求生命周期。不要在页面或每个 AI service 中重新实现错误分类、计时器、重试判断和 SSE 解析。

## 如何使用

本技能是业务 AI 能力的配套依赖，无需用户单独选择。实验开启时，首次意图识别选中 `meoo-llm-ai`、`meoo-vision-ai` 或 `meoo-image-gen-ai` 后，预注入路径会补齐本技能。已有项目后续通过 Skill 工具加载业务 AI 技能时，不会自动带入本技能；若当前上下文缺少本技能完整内容，必须先调用 Skill 工具加载 `meoo-ai-runtime`。当前上下文已有完整内容时直接复用，不重复加载或重建脚手架。

加载后先读取下方参考文档，确认模板复制状态并读取项目实际文件和导出，再按以下步骤接入：

1. 先按对应业务 Skill 完成 Cloud 初始化、Edge Function、接口地址、鉴权和请求体。
2. 在前端 AI service 中从 `src/features/meoo-ai-runtime` 导入公共能力，用 `runAiRequest` 包住一次完整请求。
3. transport 在真实节点报告生命周期：收到响应头调用 `connected()`，收到有效事件调用 `markActivity()`，首次产生可展示结果调用 `markOutput()`。
4. 流式接口使用 `createOpenAiSseParser`；同步 JSON 接口使用 `classifyAiHttpError` 和业务 validator，结构化 AI 文本再交给 `parseStructuredAiResult`。
5. 页面只订阅状态、展示结果并调用 `AbortController.abort()`；不要在组件内复制协议解析、超时或重试代码。

具体接法按需读取 [references/usage-examples.md](usage-examples.md)：

- Web `fetch` + OpenAI-compatible SSE 文本/视觉流；
- Expo/Taro 已有字符串流 transport 的适配方式；
- 同步 JSON 生图响应与结构化文本结果；
- UI 取消、状态映射和重试边界。

新增 AI 页面、接通生成按钮，或修改 service／Hook 的回调与返回结构时，再读 [业务接线示例](business-integration.md)：复用上述 transport，完成 service → Hook → 页面、旧响应隔离及收尾交接。只调整协议解析时无需读取 UI 示例。

## 公共入口

优先 Read 项目中的 `src/features/meoo-ai-runtime/index.ts` 确认实际导出，再按下方文件职责读取所需实现。模板未注入或需核对标准时，才读取对应参考文件；`template-reference` 路径只读，不得 Edit/Write，也不能作为业务代码的 import 路径。读取参考源码不代表模板已落地；项目入口缺失时先搜索并复用已有等价实现，确认确实缺失且模板复制未在进行中后，再按参考补齐必要项目文件并核对导出，禁止导入不存在的模块。

### 模板文件说明

项目目录为 `src/features/meoo-ai-runtime/`；对应参考目录如下：

```text
skills/meoo-ai-runtime/template-reference/src/features/meoo-ai-runtime/
├── index.ts
└── aiRuntime.ts
```

| 文件 | 负责什么 |
| --- | --- |
| `index.ts` | 公共 API 导出清单，统一导出 aiRuntime 中的函数、类型和默认配置，不包含业务实现。 |
| `aiRuntime.ts` | AI 请求运行时核心：请求标识与尝试次数、生命周期与四类超时、取消和传输中止协作、结构化错误、有限重试及退避、SSE 分帧和 OpenAI 流解析、结构化结果解析与校验。实际网络请求由业务 transport 提供，业务字段由调用方 validator 校验；不包含接口地址、鉴权、模型参数、存储或 UI。 |

以上文件均优先读取项目实际版本，参考目录仅用于补充核对。不要沿 `index.ts` 的全部导出递归读取源码；只补读当前任务需要的实现，已读且未变化的文件无需重读。

从项目实际路径导入 `src/features/meoo-ai-runtime/index.ts`。模板不包含 URL、凭据、Supabase Client、模型名、业务表名或 UI，可用于 React、Expo 和 Taro：

- `createAiRequestLifecycle`：区分连接、首个输出、流空闲和总超时；取消、失败、完成是互斥终态。
- `runAiRequest`：绑定 lifecycle、AbortController 和有限重试循环；业务 transport 只负责调用 `connected()`、`markActivity()`、`markOutput()` 并返回最终结果。
- `createOpenAiSseParser`：支持跨 chunk、CRLF、SSE 注释心跳、`[DONE]` 和残余 buffer；非法 JSON 或无 `[DONE]` 的 EOF 必须失败，不能静默返回半截结果。
- `classifyAiHttpError`：把 HTTP 状态转为稳定错误种类，并解析 `Retry-After`。
- `shouldRetryAiRequest` / `computeAiRetryDelayMs`：只在尚无输出、错误可重试且请求可安全重放时有限重试。
- `parseStructuredAiResult`：严格解析 JSON，并交给业务 validator 校验。

## 接入规则

1. 每次用户动作创建一个稳定 `requestId`；每次真实网络尝试递增 `attempt`。前端请求头、Edge Function 响应头、日志和持久化记录使用同一完整 ID，不截断成 8 位。
2. 使用 `runAiRequest` 时由它负责 `begin()`、`complete()` 和终态收尾，transport 不重复调用；收到响应头调用 `connected()`，每个有效 token、心跳或进度调用 `markActivity()`，真正业务输出调用 `markOutput()`。transport 必须在协议完成且业务结果校验通过后才返回；仅单独使用 lifecycle 时自行负责开始与完成。
3. 使用 `runAiRequest` 时，用户主动取消通过传入的 AbortSignal 触发，由 Runtime 收尾；仅单独管理 lifecycle 时调用 `cancel()` 并同步中止 transport。超时由 lifecycle 生成 `timeout` 错误并触发传输层 abort；不得把超时当成普通取消，也不得把已有半截文本标成成功。
4. HTTP 非 2xx 先用 `classifyAiHttpError`。401/403/4xx 参数错误不重试；429、502、503、504 也只有满足 `shouldRetryAiRequest` 时才能重试。
5. POST 默认不可自动重放。只有携带稳定幂等键、服务端能按该键确认不会重复执行时，才向 `shouldRetryAiRequest` 传 `idempotencyKey`。出现首个 token、图片或其它业务输出后禁止自动重试。
6. Taro 继续使用脚手架的 `@/lib/sse` 作为传输与 UTF-8 解码 owner，把完整 SSE data 字符串交给公共解析/错误层；不要在 Taro 中实例化 Web `ReadableStream`。

## 业务接线与跨模块收尾

- 以一个可验证的用户行为为工作单元，例如“生成摘要并支持停止”。修改前明确业务输入、service 返回类型、增量回调、完成条件和取消信号的传递方式，定位直接调用方；已有 service、Hook/store 和请求状态优先复用。
- 接口或结果结构变化后，同步完成 transport、业务 validator、Hook/store 和页面适配，再切换无关功能。按依赖分步编辑即可，不必每改一处都重读整条链路；页面不能绕过公共 Runtime 再维护一套解析、超时或重试。
- 每次生成的增量、状态、成功、失败和 finally 都必须归属同一请求。停止时传递 abort，卸载或切换会话／账号时隔离旧回调；旧请求不得覆盖新结果或清除新请求的 loading。客户端 abort 不代表服务端已停止执行或计费。
- 收尾时搜索旧回调与返回字段的残留，执行受影响模块类型检查，验证本轮涉及的成功、重复提交、取消、超时／断流和上下文切换。完整结果确认前只展示生成中或未完成状态；生成完成与持久化成功分别表达，不因保存失败自动重发生成请求。
- 中断或压缩时留下短交接：当前接口、请求状态与完成条件、已改文件、待适配调用方、验证结果和下一步。沿用现有任务记录，不存凭据或敏感输入；恢复时核对文件变化并补读缺口，不凭摘要重放可能已执行的 AI 请求。格式见业务示例末尾。

## 超时默认值

模板默认值只是安全起点，接入时可按真实接口和网关限制向下收紧：连接 15 秒、首个输出 30 秒、流空闲 30 秒、总时长 120 秒。生图接口当前为同步 JSON，不能因为有 lifecycle 就声称支持后台任务、刷新后续跑或突破 Edge Function 最大执行时长。

## 与持久化能力的边界

- 需要会话、请求历史或刷新恢复时，用 `supabase-data-access` 读写业务表；模板不猜 schema。
- 图片或 PDF 输入使用当前平台可用的 Storage owner；Web 实验态可靠上传可用时复用 `file-upload`，不得在 AI 页面创建第二套上传流程。
- 登录和 Session 使用 `meoo-cloud-auth`；本模板不创建 AuthProvider 或监听器。

## 最小验收

- 断开的 SSE、非法 JSON、缺失 `[DONE]`、首包超时和用户取消进入不同状态。
- 首个输出后不会自动重放；POST 无稳定幂等键不会自动重试。
- 401/403/429/5xx 保留结构化种类、阶段、状态码、requestId 和 attempt。
- React、Expo、Taro variant 的公共源码一致且不包含 URL、密钥、`createClient()` 或业务 UI。
