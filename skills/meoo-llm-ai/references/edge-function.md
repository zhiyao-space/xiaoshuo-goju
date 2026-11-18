## 文本 Edge Function 接线

固定实现直接复用 `src/features/meoo-ai-runtime/server/createTextAiHandler.ts`，不从示例重写校验、凭证、fetch、SSE转发或取消。当前函数部署仅打包 `functions/<函数名>/`，必须先把该模板文件原样复制到当前函数目录，再从同目录导入；不能引用未打包的项目 src 路径。

1. 确认模板已落地且公开工厂存在。若缺文件，读取能力回执并补齐 `meoo-ai-runtime`，不能凭印象重建通用实现。
2. 用当前任务的项目 URL ID 生成稳定唯一函数名 `<projectUrlId>-ai`（local 取上下文 projectId / 当前 `/chat/<projectId>` 的本地项目标识，不取 cloud init 返回的复用来源 projectUrlId/cloudAppId）；共享云实例已有来源项目/其他项目函数不得覆盖。实际函数名必须在前端 URL、薄入口、部署和验收命令中一致。创建 `functions/<函数名>/`，将原文件复制为该目录的 `createTextAiHandler.ts`。
3. 只编写薄入口 `index.ts`，替换函数名，按当前平台环境使用下列服务 URL：

```ts
import { createTextAiHandler } from './createTextAiHandler.ts';

Deno.serve(createTextAiHandler({
  functionName: '本项目唯一函数名',
  serviceBaseUrl: 'https://api.meoo.host',
  getEnv: name => Deno.env.get(name),
}));
```

`serviceBaseUrl` 是部署时的可信平台配置，不从用户请求、表单或 query 参数获取。主预发 URL 由平台内置 Skill Renderer 按环境替换。模板不自行添加 CORS；由 Meoo Cloud 实例网关处理。

## 公共请求与结果

客户端 POST JSON `{model?,messages:[{role,content}]}`，role 只允许 system/user/assistant，content 是非空文本。默认模型 qwen3.6-plus，强制 stream=true。业务 prompt、客户字段、保存目标、角色权限在当前业务接线中处理；模板仅适用于文本消息，视觉、工具调用与同步 JSON 使用相应 skill，不把这些协议直接塞入文本 validator。

如果接口只接受客户快照等业务字段，在薄入口提供可选 `prepareInput(body, {request, signal})`（支持 async）：校验当前业务字段并返回 `{model?,messages}`，固定 handler 继续负责 JSON 读取、文本协议校验、凭证和传输。业务 callback 可以用当前 caller JWT 的 SDK 查询业务数据/RLS，所有支持信号的查询传 signal；不另写模型 fetch、不改模板、不接受客户端覆盖服务器固定 prompt。先从 request.headers 取认证字段，不 clone/json 再读请求体；body 已由固定 handler 解析一次。普通抛错返回安全 400；显式认证/权限拒绝抛同目录公开 TextAiInputError(401/403/422, code, 安全文案)，固定 handler 保留状态且不请求模型；取消会中止等待并屏蔽晚到结果，返回无效文本协议也在上游请求前拒绝。普通文本接口省略 callback。业务校验与 prompt 单独放同一函数目录的业务模块，随函数一起打包。

网关注入的项目标识决定平台项目 AK，兼容旧凭证名；不要求用户 set-secret 或在代码中填 AK。handler 保留请求 ID、上游 HTTP 状态和 Retry-After。SSE原样转发并保持背压，客户端仍需用公共 Runtime 验证有效业务输出和 [DONE]。传输断流不能补造 [DONE]；SSE响应头发出后不能再改为 JSON 错误。

返回响应前的请求取消会中止上游；响应交付后由下游流 cancel 中止上游并释放 reader，避免 Deno 正常交付响应时的 req.signal 误取消。网关能否传递断连必须实际验证，客户端停止不保证上游停止计费。

## 部署与验收

登录保护接口使用 `meoo-cli cloud deploy-function --name <函数名> --verify-jwt true`；仅需求明确允许匿名时才使用 false（CLI默认true）。平台凭证无需 set-secret。检查实际打包目录包含薄入口及原样 helper，不通过部署成功推断功能可用。

普通文本接口用实际函数名执行 `meoo-cli cloud test-request --method POST --path "/functions/v1/<函数名>" --json '{"model":"qwen3.6-plus","messages":[{"role":"user","content":"给出下一步沟通建议"}]}'`，核对 HTTP状态、有效文本、无错误事件、[DONE]。有 prepareInput 的业务接口必须改为 callback 的真实载荷（例如 customerId），不能反复用文本协议探测已明确只接业务字段的接口。前端直接使用 useAiText/streamAiText，执行实际处理器验证停止、失败后手动重试、客户/账号切换隔离。记录缺少身份或验证码的未验收项。


异步业务接线只提供一个 callback，不再外包一层 Deno.serve(async req => ...) 重新读 body/转发错误。薄入口仍 `Deno.serve(createTextAiHandler({...prepareInput}))`。业务模块用 Supabase 的当前 Authorization 建 caller client、auth.getUser 并按 RLS 读取真实客户/附件，读取失败安全拒绝，然后返回服务端固定 messages；schema/字段/归属规则/prompt 由当前业务决定。不要把客户 ID 当授权或从客户端传 ownerId 取得权限。

前端仍使用平台 Client 的当前 Session和当前项目标识，body 与 callback 的输入合同一致。代码验收独立断言 async 成功/拒绝/取消无上游；真实接口验证本人客户 HTTP200流结束和其他账号客户 HTTP403。

## 当前业务的验收边界

固定 handler、文本协议、SSE parser、Hook 互斥和计时器由模板研发回归维护。当前业务只检查自己的 prepareInput（输入白名单、当前 JWT/RLS、messages）和前端实际处理器，再检查一次真实成功流与显式停止；新业务 callback 的拒绝用代码故障注入及真实外账号客户验证。类型检查和项目构建分别执行。核心文件原样复制且公共 ABI 齐全时，不为普通接入另造 Node/V8 语法解析器、Deno SDK shim、WASM loader 或重新实现固定 runtime 测试；遇到真实部署/类型错误才按错误定位必要源码。

prompt 是业务模块，可按需求改内容；输出篇幅和单次等待预算一次确定。不要仅为缩短首字节反复部署和改 prompt；超时策略从实测请求设置有界 firstOutputMs/overallMs，不能取消总体预算，也不能自动重发已发出的 POST。
