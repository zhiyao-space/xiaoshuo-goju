# 登录注册故障诊断

用户反馈无法登录、注册失败、登录过期、登录后不跳转、循环跳转、管理员进入普通页面、登录后数据为空，或出现 400/401/403/406/422/429/500 时读取本文件。

诊断与修复必须分开：用户只要求分析时保持只读；用户明确要求修复后，才修改代码、迁移或认证配置。

## 六层证据链

按顺序找到最早失败的一层；不得从页面现象直接猜根因。

1. **页面与运行环境**：确认页面实际加载、当前访问的是预期项目和环境；区分构建错误、沙箱映射、代理和 Auth 请求失败。
2. **Auth 请求**：复现一次，记录请求类型、Supabase `error.code`、HTTP 状态、消息和响应类型；先按精确 `error.code` 判断，再用 HTTP 状态和消息兜底，不要只看 UI 文案。
3. **账号与凭证**：确认账号通过标准 Auth API 创建、存在于当前实例，用户名到邮箱/手机号的映射与注册时一致。
4. **Session 与 Token**：分别检查 `signIn` 返回值、`getSession()`、`getUser()` 和刷新后的恢复结果。邮箱密码恢复另查 `verifyOtp({ type: 'recovery' })` 是否成功、是否取得 Session，以及全局 Provider 是否进入 `password_recovery`；MFA 另查 `currentLevel` / `nextLevel` 和 JWT `aal`。
5. **用户档案、角色与 RLS**：确认项目当前用户档案主键对齐 Auth user id，权威角色来源中的记录存在，当前 Session 下查询结果符合策略；新项目默认检查 `profiles` / `user_roles`，存量项目以真实模型为准。
6. **路由和界面**：确认守卫等待身份及角色查询完成；检查硬编码入口、互相重定向、重复 effect 和错误状态降级。

## 错误信号路由

路由优先级为：精确 `error.code` → HTTP 状态 → 消息关键词。相同 HTTP 状态可能代表完全不同的账号或配置问题，不能让通用状态规则覆盖已知错误码。

| 信号 | 优先检查 | 禁止直接下结论 |
| --- | --- | --- |
| `user_already_exists` / `email_exists` / `phone_exists` | 账号已存在；根据用户意图进入登录、找回密码或重新发送确认流程 | 因为是 422 就判断 provider 配置错误、重复 `signUp()` 或删除账号 |
| `invalid_credentials` / `user_not_found` | 当前实例账号、标识映射和凭证 | 因为是 400/401 就判断 Session 过期 |
| 400 / Invalid credentials | 当前实例账号、创建方式、标识映射、密码是否由标准 Auth 流程产生 | 一定是用户输错密码 |
| 401 | Session、Token、Authorization、刷新流程 | 一定是 RLS |
| 403 / 406 | profiles、user_roles、RLS、`auth.uid()` | 登录失败 |
| 422 且没有已识别 `error.code` | 保留未知结论，继续检查注册确认语义、OTP type、字段格式和原始响应 | 直接归因为 provider、盲目重试或自建发码函数 |
| 429 | 重复请求闭环、守卫重挂载、短信配额 | 立即循环重试 |
| 500 | Auth trigger、Edge Function、平台配置 | 只修改前端提示 |
| HTML / JSON 解析失败 | 接口路径、代理 fallback、服务是否实际启动 | 修改账号或密码 |
| 登录成功但未跳转 | Auth 初始化、角色查询、路由守卫竞态 | 重建测试账号 |
| Recovery 验证码通过却没有新密码页 | 恢复入口的 `AuthEntryGate(mode="recovery")`、`usePasswordRecoveryFlow` 的 verify/checkingIdentity/password 步骤及身份核对结果 | 把任意已登录 Session 当成恢复资格，或页面额外用 authFlow 过滤步骤 |
| 密码登录后未进入二次校验 | `listFactors()`、`currentLevel/nextLevel`、challenge/verify 和 Phone MFA 能力 | 用邮箱/普通短信 OTP 或前端布尔值补成 MFA |

## 硬性禁区

- 禁止通过 SQL `INSERT`、`UPDATE` 或 `DELETE auth.users`，禁止自行生成 `encrypted_password`。
- 禁止用 localStorage、硬编码 userId/role/Token 或删除登录功能来绕过故障。
- 禁止修改平台生成的 Supabase Client 或猜测 `.env` 值。
- 禁止把网络/限流失败当成无权限，也禁止把 403/RLS 错误说成账号密码错误。
- 禁止在没有真实端到端证据时声称“登录已修复”。
- 禁止因参考模板存在而批量替换存量 Auth store、守卫、`profiles`、角色表或 RLS；若诊断结论确实要求架构迁移，先列出差异和风险并获得用户明确确认。

## 修复后的完成门禁

只有以下适用项均有结果时才能声称完成：

1. 通过标准 Auth API 创建或确认一个隔离、可丢弃的测试账号；缺少条件时标记 `BLOCKED`。
2. 退出后重新登录成功，`getSession()` 与 `getUser()` 指向同一用户。
3. 页面刷新后 Session 正确恢复。
4. 用户档案主键与 Auth user id 对齐；需要角色时，项目当前权威角色来源中的记录正确。新项目使用 `profiles` / `user_roles`，存量项目按已确认的数据模型验证。
5. 授权用户进入正确页面，未授权用户被明确拒绝。
6. 网络、限流或角色查询失败进入错误态，不被重定向为“无权限”。
7. 登录、角色请求不会因 effect 或路由重挂载持续增长。
8. 登出后 Session、用户展示信息和角色缓存全部清除。
9. 邮箱密码恢复场景中，Recovery 验证码通过并确认 Session 后显示重置页，`USER_UPDATED` / 登出后退出 recovery flow。
10. MFA 场景中，challenge 成功后为 AAL2，AAL1 不能直接访问受保护 API/数据。

## 结论格式

最终按以下字段报告，证据不足的字段写“尚未确认”：

```text
故障阶段：
直接证据：
排除项：
根因：
修复内容：
验证结果：
仍然受阻：
```
