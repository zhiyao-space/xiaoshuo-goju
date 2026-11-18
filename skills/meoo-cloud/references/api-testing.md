
# API 接口实测

本文件只规定如何为当前项目发起真实 HTTP 请求。输入、预期结果和结论由 Agent 判断；请求工具不代替断言，也不把 HTTP 4xx/5xx 自动解释为产品失败。

`migrate、deploy-function、build` 成功都不代表 HTTP 接口已经实际可调用。接线完成后的最终验收阶段，只主动测试本轮新增的业务逻辑。常规 CRUD 不主动测试，代码改动、迁移或部署完成时不单独触发实测。用户明确要求测试时按其范围和时点执行。

## 选择身份

先按应用实际调用确定身份，不按“Storage”或“上传”字样一律选择登录态测试：

- 免登录发帖、匿名上传、公开对象读取：按匿名身份验证，不为测试额外创建登录态。
- 需要登录或本人对象权限：使用托管登录态，结果仅覆盖该测试用户。
- 公开桶只说明公开读取方式，不决定上传身份；上传身份仍按应用契约与策略确认。

### 托管登录态测试的前置失败

`cloud test-request` 先准备身份/Session，再请求业务接口。返回 `AUTH_BOOTSTRAP_FAILED` 或 `agentAction=REPORT_UNTESTED_TO_USER` 时，先进入 [托管登录态未建立](#托管登录态未建立) 分支；此时返回的 `httpStatus/upstreamError` 属于前置步骤，不是目标 Storage/REST/云函数的响应。不能据此判断业务接口不可用、服务未开通或套餐不足。

### 匿名请求

公开接口、匿名 RLS、未登录访问和无需 Session 的第三方接口或 Edge Function 使用独立 `curl`。目标地址和 anon key 只取自平台管理的当前项目环境变量；不要打印变量值，不要使用 `--fail/-f` 或 `--location/-L`，以免丢失错误响应或重定向事实。

Web、Expo、Taro H5 使用项目根目录 `.env`；小程序构建才使用 `.env.miniprogram`。加载环境和发请求分成两次 Bash 调用，禁止命令拼接。

### 托管登录态请求

登录后的 REST/RPC、RLS、Storage Object 或 Edge Function 使用：

```bash
meoo-cli cloud test-request --method GET --path "/rest/v1/messages?select=*"
```

```bash
meoo-cli cloud test-request --method POST --path "/rest/v1/rpc/create_message" --json '{"content":"hello"}'
```

平台为当前项目创建或复用固定的 `default-user` 托管测试账号，在 API 进程内建立短期 Session。Agent 和 Sandbox 看不到 service role、一次性登录凭证或 refresh token。

托管登录态由平台自动建立：不调用 `/auth/v1/signup`、`/auth/v1/token` 等注册登录接口，不读取 `.env`，也不手动获取或传递 Token。直接请求需要验证的业务路径。

只允许：

- `GET`、`POST`、`PUT`、`PATCH`、`DELETE`
- `/rest/v1/*`（包含 `/rest/v1/rpc/*`）
- `/storage/v1/object/*`
- `/functions/v1/*`

禁止完整 URL、`/auth/v1/*`、自定义认证 Header 或账号凭证。REST/RPC 的 JSON 请求体必须使用 `--json`；`--data` 只用于明确接收 `text/plain` 的 Storage Object 或 Edge Function。

## 绑定当前用户 ID

如果应用已知的直接表 INSERT 契约要求 JSON 顶层显式提交当前登录用户 ID，可使用：

```bash
meoo-cli cloud test-request --method POST --path "/rest/v1/posts" --json '{"content":"test-marker"}' --bind-auth-uid owner_id
```

字段名取自应用真实契约，可以是 `user_id`、`uid`、`owner_id` 或 `created_by`；平台不会猜测字段名。当前会话已明确知道刚实现的表和请求契约时直接复用，只有不确定时才读取调用代码或表结构确认。

此参数只支持 `POST /rest/v1/<table>` 的单个 JSON 对象，不支持 RPC、Edge Function、Storage、批量数组或更新请求。请求体已有同名字段时直接拒绝。它只补请求数据，RLS 仍使用同一 Session 的 `auth.uid()` 校验。

## 默认最短验证路径

登录态写接口默认只走下面四步，不额外扩展游客态、注册流程或其他身份测试：

1. 生成本轮唯一 marker，不要把 `<unique-marker>` 原样写入数据。
2. 按应用实际契约使用 `--json` 请求业务接口。只有直接表的单个对象 INSERT（`POST /rest/v1/<table>`）需要显式用户字段，且请求体未含该字段时，才增加 `--bind-auth-uid <真实字段>`。批量数组、GET/PATCH、RPC、Storage 和云函数不能带该参数；不要将一次 INSERT 的参数沿用到后续读取或更新。
3. 使用同一 marker 发起过滤后的 GET，只读取与本轮写入相关的记录。
4. 根据两次请求的 HTTP 状态和响应体判断结果。

```bash
meoo-cli cloud test-request --method POST --path "/rest/v1/posts" --json '{"content":"api-test-20260907-001"}' --bind-auth-uid user_id
```

```bash
meoo-cli cloud test-request --method GET --path "/rest/v1/posts?content=eq.api-test-20260907-001&select=id,content,user_id"
```

REST/RPC JSON 请求只能使用 `--json`；`--data` 只用于明确接收 `text/plain` 的 Storage Object 或 Edge Function。

## 请求格式先核对

- GET 的筛选/排序/分页写在 `--path` 查询参数中，不带 `--json` 或请求体。PostgREST 精确过滤写 `region=eq.<已编码的值>`，不能只写 `region=<值>`；分页使用 `limit`/`offset`。先复用业务 SDK 的真实调用，不凭空猜协议。
- 先检查 HTTP 状态、响应体是否为空及实际 JSON 类型，再读数组、字段或计数；204 空响应不做 JSON.parse，错误对象不调用 map/filter。
- `test-request` 不支持的业务 Header/计数选项不能通过猜测参数补齐。分页数量验证必须限定本轮 marker；反复自测已写入的数据会累积，不能用全表固定行数断言。本轮 marker 数据之外不删除。
- 托管身份准备失败时，按下方未验证分支结束该用例；不改写临时登录脚本、调用 create-test-user 或用多次注册来绕过同一失败。需要第二身份的用例只有已具备独立且获授权的正常身份才能执行，否则列为未验证。

## 判断结果

### 与应用请求保持等价

本命令当前不接收业务`Prefer`请求头，也不会根据URL的`on_conflict`自动添加upsert语义。Supabase SDK的`.upsert()`会发送`Prefer: resolution=merge-duplicates`或`resolution=ignore-duplicates`；本命令的普通POST即使带相同on_conflict参数，仍不能代替该SDK调用。重复插入的409/23505不是“平台不支持upsert”的证据。

验证依赖请求头的功能时，先核对应用的方法、路径/查询、请求体、业务Header及身份范围。使用应用现有认证Client和真实调用入口验证；工具无法构造等价请求就明确该项未验证，不获取或搬运Token、不改成匿名测试、不虚构`--headers`参数，也不据此重写正确的业务适配。不要仅凭相同URL或HTTP状态认定操作等价。

HTTP 200、302、401、404、500 都是接口观察结果。是否符合预期取决于场景；例如匿名读取受保护表得到 `200 + []`，可能表示 RLS 生效，也可能不符合业务要求。必须结合用例判断响应体，不能只看命令退出状态。

目标业务接口实际执行并返回 HTTP 响应时，不能仅凭 3xx/4xx/5xx 判定 CLI 或平台基础设施故障；应结合响应体定位。路径非法、托管登录态无法建立、网络未建立、超时或响应无法读取属于测试请求失败。写请求使用本轮唯一 marker，后续读取和删除必须用同一 marker 定位。

### 托管登录态未建立

当 `cloud test-request` 返回 `AUTH_BOOTSTRAP_FAILED` 或 `agentAction=REPORT_UNTESTED_TO_USER` 时，代表托管身份或 Session 未能建立，目标业务接口没有实际执行，本次没有形成测试结论。必须读取返回的 `stage`、`reasonCode`、`httpStatus` 和 `upstreamError`，区分 Auth 前置故障与目标接口响应；向用户说明目标功能尚未验证，需要使用真实账号验证，不把原始内部错误直接转写成业务结论。

- 禁止修改 Auth、profiles、Trigger 或 Provider 来修复平台托管登录态。
- 禁止降级为匿名 `curl`、SQL 查询、截图或其他方式冒充登录态接口测试。
- 禁止重试相同命令或切换邮箱、短信、密码等登录方式试探。
- 不得把未执行描述为产品测试失败，也不得声称相关功能已经验证。

## 边界

- 托管 Session 只验证登录后的接口，不验证邮箱验证码、短信验证码、注册 UI 或登录 UI。
- 固定 `default-user` 不能模拟多角色、过期或无效 Token。
- 游客态使用匿名请求；不要用托管登录态代替。
- 默认只验证用户要求的身份；没有明确要求游客态、匿名拒绝或 RLS 身份边界时，不要额外执行匿名 `curl`。
- 只验证一个托管用户时，只能说明当前登录用户的行为已经验证；没有第二个独立身份时，不得声称跨用户隔离已经验证。
- 不要用 `cloud query` 代替接口请求；SQL 绕过 HTTP 和用户 Session。
- 只有接口异常且需定位云函数根因时，才读取 `function-logs`。

