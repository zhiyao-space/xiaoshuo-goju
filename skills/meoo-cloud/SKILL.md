---
name: meoo-cloud
description: Meoo 应用的数据库、认证、Storage、云函数、Realtime 和定时任务入口；需要真实后端时加载。
---

# Meoo Cloud

当前项目尚未启用云服务时执行 `meoo-cli cloud init -d "项目描述"`；已有开通/关联证据就复用，不重复 init 或反复查询状态。失败按实际错误修复，不能用 Mock 冒充云能力。无需额外询问是否使用 Cloud。

## 当前任务只加载对应契约

| 工作 | 技能与参考 |
| --- | --- |
| 注册登录、Session、个人中心 | `meoo-cloud-auth`；模式未确认先读 [认证路由](references/auth-routing.md)，已确认模式直接复用对应 SOP；新建/修改用户数据时读取 [共享数据基线](references/auth-data-baseline.md)，已有内容直接复用 |
| 业务 CRUD、分页筛选、导出 | `supabase-data-access`；建表/迁移才读 [数据库](references/database.md) |
| 真实附件上传 | Web 用 `file-upload`；资源/权限配置读 [Storage](references/storage.md) |
| Storage 上传故障、Bucket not found、开发正常但线上异常 | 先读 [上传故障排查](references/troubleshooting.md#上传故障先确认请求阶段)，按错误补读 Storage；发起验证前读取身份测试规则 |
| Excel/CSV/SQLite 导入 | `data-batch-upload`；查询列表另外用 `supabase-data-access` |
| 文本、视觉、生图 | 对应 `meoo-llm-ai` / `meoo-vision-ai` / `meoo-image-gen-ai` 配套 `meoo-ai-runtime` |
| 自定义服务端逻辑 | [Edge Functions](references/edge-functions.md) |
| 定时/周期执行 | [定时任务](references/scheduled-jobs.md)；平台原生支持，不查租户 pg_extension 推断是否支持 |
| 实时订阅 | [Realtime](references/realtime.md) |

正文已在当前上下文就复用；后续需求只补当前缺口，不成批加载未来技能，不因参考里的链接继续展开。只在改动契约、跨压缩后缺失或实际失败时补读相关章节，普通接线不递归读模板内部源码。

## Client 与数据边界

**公开数据交付提醒**：应用实现完成后，若应用数据允许匿名读取，必须在面向用户的最终完成回复中明确提示：“当前应用的数据允许公开访问，如需保护这些数据，可以开启应用的注册登录功能来进行身份验证”。不因展示此提示自动开启注册登录或改变现有权限；用户后续要求保护数据时，必须同时配置相应 RLS 访问策略，不能只增加登录页面。

复用平台生成的 `src/supabase/client.ts`，先核对实际导出，不改 Client、不另建 createClient、不读取前端 env、不写死 URL/密钥。裸 fetch 的根地址用完整 supabaseUrl；新版 Client 带 `OneDay-App-Id: projectUrlId`，旧版同源 /sb-api Client 缺少该导出时省略。其他情况缺少 projectUrlId 先恢复关联，不能猜 ID。

业务数据库使用 public，真实用户身份来自 Auth；SQL 执行位置为数据库，不能把 UUID 放进整数 id 字段。RLS 按当前身份和业务父对象授权，不能用前端筛选代替权限。变更先核对现状，不删除已有表或覆盖其他项目资源。共享能力新增本项目函数、bucket/路径命名空间，不覆盖原项目。

常用命令：`meoo-cli cloud migrate --sql "<SQL>" --name "change_schema" --changes "变更说明"`（DDL/策略）、`cloud query --sql <SQL>`（数据）、`cloud tables`、`cloud status`。精确参数与复杂命令查 [当前常用命令](references/cli-basics.md)，使用前不通读所有命令。


发起 API 验证前先按 [接口实测](references/api-testing.md) 选择实际业务身份：匿名接口用匿名请求，需要登录才用 `meoo-cli cloud test-request --method <METHOD> --path <PATH>`；JSON 写请求使用 `--json '<JSON>'`。不搬运用户 Token、不伪造身份。


**实测数据清理**：实测结束后，无论通过或失败，都要按返回的记录 ID 或本轮唯一标记，仅清理本轮为测试创建的临时数据并回读确认，无法安全清理时说明残留。



真实错误优先收集请求阶段、状态与错误码；认证故障读 [认证诊断](references/auth-diagnosis.md)，其他错误读 [排障](references/troubleshooting.md)。不把 empty、权限拒绝和请求失败合并成空列表。面向产品用户说明功能、验证及未完成项，不展示内部凭据、实例标识和编排。
