# 当前任务的常用 Cloud 命令

仅查当前缺失的命令；已知接口直接使用。完整高级参考仍在 [advanced-workflows.md](advanced-workflows.md)，无需为一条常用命令展开整篇。命令失败先识别错误阶段；参数、代码、授权或租约错误按证据修复，不能反复原样重试或猜测云环境。

## 初始化与关联

```bash
meoo-cli cloud init -d "项目用途"
```

已有开通、绑定或模板回执直接复用，不重复初始化。失败不能以 Mock 替代，不能改写平台 Client 或复制其他项目凭据。

## 数据结构：migrate

DDL、RLS、触发器和策略使用 migrate。复杂 SQL 写到文件，避免 Bash 引号破坏语句。

```bash
meoo-cli cloud migrate --file /tmp/changes.sql --name "change_schema" --changes "本次变更说明"
meoo-cli cloud migrate --sql "CREATE TABLE ..." --name "change_schema" --changes "本次变更说明"
```

`--sql` 与 `--file` 二选一。迁移前确认已有表及约束，认证与所有权按对应 SOP；不把通用示例中的匿名策略应用到私有客户数据。具体数据设计查 [数据库](database.md)。

## 查询与数据修改：query

```bash
meoo-cli cloud query --sql "SELECT ..."
meoo-cli cloud query --file /tmp/query.sql
```

`--sql` 与 `--file` 二选一，仅 DML，DDL 改用 migrate。INSERT 显式写列名，确认 enum、外键、unique、identity 与 UUID 类型；不用空字符串代替 UUID，不猜约束。需要核对列时执行 `meoo-cli cloud tables`，复合约束仍以迁移或系统目录为准。

## 接口实测

```bash
meoo-cli cloud test-request --method POST --path '/rest/v1/<table>' --json '<JSON>'
```

身份、负向权限与返回值检查见 [接口实测](api-testing.md)。平台托管测试身份由该接口提供，不手写密钥 curl、不伪造登录态；工具成功也要检查实际 HTTP 状态和业务数据。

## 状态与环境恢复

`meoo-cli cloud status` 用于确认当前云服务状态，`meoo-cli cloud tables` 用于已有结构核对。只有环境文件确实缺失时才执行 `meoo-cli cloud regenerate-env`。不打印或手写 URL、密钥，业务继续复用 `src/supabase/client.ts`。

## 云函数

```bash
meoo-cli cloud deploy-function -n <function-name>
meoo-cli cloud deploy-function -n <function-name> -j false
meoo-cli cloud list-functions
```

`-j false` 仅在明确允许匿名调用且函数已实现相应权限边界时使用；要求登录的业务保留 JWT 校验。新函数读取 [Edge Functions](edge-functions.md)，AI 场景优先复用对应技能的服务端示例。部署返回“无法确认云环境”时收集错误并报告未部署，不能关闭环境校验或把反复重试当成修复。

## 已获授权的隔离测试账号

仅当前任务已明确授权预置账号或统一回放fixture明确指定时使用；其他接口测试优先托管身份。先核对真实初始化表/列，不提升角色、不重置已有账号。

```bash
meoo-cli cloud create-test-user --name unique-test --username test_user
```

仅支持 --name、--email、--phone、--username、--password、--role、--metadata、--init、--user-id；不支持 --confirm、--json、--profile 等猜测参数。metadata 是标量 JSON；profile 初始化格式为 `--init '{"profile":{"table":"profiles","userIdColumn":"id","values":{"username":"test_user"}}}'`，替换真实表/列/值。role 只有明确授权且 init.role 映射存在才传；默认不加管理员/主管。未指定密码由官方命令生成，按返回凭证安全使用；不打印Token/密钥。初始化失败按原 user-id 恢复允许的映射，不重复创建同一身份。其他参数与边界按需查 [测试账号](../../meoo-cloud-auth/references/test-accounts.md)。
