# 定时任务

定时任务只能通过 `meoo-cli cloud cron` 管理。不要让用户填写 Cron 表单，也不要直接修改 `cron.job`。

## 能力判断

- Meoo Cloud 原生支持定时 SQL 和定时调用 Edge Function。
- `pg_cron` 由平台集中部署；租户库查询不到它是正常现象。
- `cloud cron` 是服务端接管的虚拟 CLI；本地帮助未展示该命令不代表不支持，不得改用 GitHub Actions、第三方 Cron、`setInterval` 或数据库触发器。

## 任务选型

| 需求 | 实现方式 |
|---|---|
| 清理、状态更新、归档、持久化统计 | `Cron → SECURITY DEFINER 数据库函数` |
| 通知、邮件、第三方 API 等外部副作用 | `Cron → pg_net → Edge Function` |

### SQL

SQL 定时任务以 `{database_name}_authenticator` 角色在租户库执行。该角色默认没有 `public` 业务表权限，也没有终端用户 JWT。

**任何访问租户业务对象的 SQL 必须封装为受控的 `SECURITY DEFINER` 函数，任务配置只调用函数。** 禁止把 `SELECT ... FROM public.todos` 等原始业务 SQL 直接写入任务。

函数要求：

- 由有表权限的 migration 账号创建；固定 `search_path`，完整限定如 `public.todos`，禁止不受信的动态 SQL。
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC`，再给 `current_database() || '_authenticator'` 对应角色授予 `EXECUTE`。不得为解决报错而给该角色授予所有业务表权限。
- 使用条件守卫、唯一约束、`UPSERT` 或乐观锁保证幂等。
- 统计结果要幂等写入统计表；`pg_cron` 不会持久化普通 `SELECT` 的结果，不要创建没有业务效果的定时 `SELECT`。

```json
{
  "name": "refresh-todo-stats",
  "schedule": "0 2 * * *",
  "type": "SQL",
  "sql": "SELECT public.refresh_todo_stats();",
  "active": true
}
```

### EDGE_FUNCTION

适合外部副作用。必须先部署函数；平台自动生成 URL 和鉴权 Header，配置中禁止填写 URL、anon key 或 service-role key。Body 只传函数实际读取的字段，无参数时使用 `{}`。

```json
{
  "name": "send-reminders",
  "schedule": "*/10 * * * *",
  "type": "EDGE_FUNCTION",
  "functionName": "send-reminders",
  "body": { "source": "cron" },
  "timeoutMilliseconds": 10000,
  "active": true
}
```

## 创建与管理

先把 JSON 配置写入 `/tmp/cron-job.json`，然后单独执行：

```bash
meoo-cli cloud cron apply --file /tmp/cron-job.json
```

同一任务名称重复 apply 表示更新，不会重复创建。

## 查询和管理

以下命令仅供 Agent 内部执行，不是交给用户的操作指南：

```bash
meoo-cli cloud cron list --json
meoo-cli cloud cron get --job-id 123 --json
meoo-cli cloud cron runs --job-id 123 --limit 20 --json
meoo-cli cloud cron pause --job-id 123
meoo-cli cloud cron resume --job-id 123
meoo-cli cloud cron run --job-id 123
meoo-cli cloud cron delete --job-id 123
```

## 验证与失败诊断

- 使用五字段 Cron，最小粒度一分钟；按 UTC 执行，将用户本地时间换算为 UTC。
- 创建后用 `get` 验证存在。安全且幂等的 SQL 任务可手动执行验证权限，但 `run` 只能判断 SQL 是否报错，不返回 `SELECT` 结果或影响行数，也不会生成 `pg_cron` 历史。
- 手动执行未报错不等于业务结果验证成功。如果任务会写表或更新状态，再通过普通数据库查询验证目标数据；否则等待下一次真实调度记录。
- 下一调度时间后查看最新记录；在看到新的成功记录前，不得向用户声称故障已经修复。
- SQL `succeeded` 表示执行成功；Edge Function `succeeded` 只表示 HTTP 请求成功入队，不代表函数最终成功。
- `permission denied for table <table>`：改为受控函数并仅授予 `EXECUTE`；`permission denied for function <function>`：给当前租户调度角色授予 `EXECUTE`。
- `relation does not exist`：检查 schema 限定和 `search_path`；统计成功但无结果：将结果幂等写入统计表。

## 用户可见反馈（强制）

- 命令、参数、jobId、JSON 和原始返回都是内部信息，不得面向用户展示。
- 禁止告诉用户“可以通过以下命令查看/暂停/删除”；Agent 自行操作并用业务语言总结，不得让用户自己执行。
- 只告知名称、易懂的时间/频率、内容和状态，不主动展示 Cron 表达式、jobId 或技术实现。

> 定时任务已创建并启用。后续如果想查看执行记录、暂停、修改或删除，直接告诉我，我可以帮你处理。
