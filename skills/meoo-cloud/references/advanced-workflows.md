# Meoo Cloud 云服务开发技能

## 技能概述

Meoo Cloud 基于 Supabase 提供后端云服务（数据库、认证、文件存储、Realtime、Edge Functions、定时任务），通过 meoo-cli 命令行工具进行管理和操作。

定时任务、计划任务、周期任务、Cron、定时或定期执行都属于 Meoo Cloud 原生能力。命中这些需求后，必须直接读取 `skills/meoo-cloud/references/scheduled-jobs.md`；禁止通过租户数据库的 `pg_extension` 查询或沙箱内 CLI 帮助判断平台是否支持，因为 `pg_cron` 由平台集中部署在租户库之外。

不要用 AskUserQuestion 询问用户是否使用 Cloud、本地存储还是云端数据库；如果实现需要开通 Cloud，按本文档读取参考资料后通过 `meoo-cli cloud init` 进入 CloudEnable 确认流程。

## 快速开始

### 后续轮次的能力补齐（强制）

已有项目追加真实能力时，先识别所需技能，在开始对应工作单元前补齐加载；Cloud 已启用或本技能已加载，不代表业务技能也已加载。当前上下文已有完整技能内容时直接复用，否则必须调用 Skill 工具加载，不能只提到技能名或阅读本技能代替实际加载。后续工作单元的技能不提前成批加载。

- **真实业务数据访问**：实现或修改云端业务数据的 CRUD、列表/详情、搜索筛选、排序分页、计数统计、关联查询、写入确认，或区分接口错误、无权限与真实空数据前，必须先调用 `Skill` 工具，`command: "supabase-data-access"`，再读取对应参考文档。即使用户没有点名 Supabase，也按业务需求判断。
- **导入与查询分别加载**：Excel/CSV/SQLite 批量导入使用 `data-batch-upload`；导入后还有独立的列表、分页、筛选、搜索、导出或业务 CRUD 时，还必须加载 `supabase-data-access`，不能用导入技能替代数据访问技能。
- **保持边界**：仅静态/Mock、本地数据、认证、文件存储、批量导入或云函数部署，不因此单独加载 `supabase-data-access`；按实际业务数据访问需求补齐。
- **组合需求**：按当前行为分别加载导入、数据访问、AI 或认证技能；共享数据结构和接口约束在决策前一并核对，具体实现资料到对应行为开始时再读。沿用已有工程和 Client，不重新加载脚手架。

### 必读文档策略（BLOCKING — 不可跳过）

产品方向明确后，执行云服务操作（包括 cloud init）或编写相关代码前，必须具备当前工作单元所需的文档。工作单元指一个可实现并验证的行为，包含直接依赖的接口、数据结构和权限约束；后续功能的资料到实施时再读。

只读取当前操作需要的文档，不因文档包含链接就继续展开；已有可用内容直接复用，缺失或变化时补读。

| 当前工作单元 | 实施前必需的文档入口 | 主要CLI命令 | 适用场景 |
|----------|----------|-------------|----------|
| **数据库操作** | `skills/meoo-cloud/references/database.md` | `cloud migrate/query/tables` | 任何项目的基础数据存储 |
| **业务 CRUD / 查询闭环** | `supabase-data-access` + `skills/meoo-cloud/references/database.md` | 前端代码 + 必要的 migrate | 列表、搜索、筛选、分页、计数、聚合、关联、写入确认、RLS 数据错误 |
| **文件上传存储** | `skills/meoo-cloud/references/storage.md` | `cloud migrate` + 前端代码 | 图片、文档、媒体文件处理 |
| **实时功能聊天** | `skills/meoo-cloud/references/realtime.md` | `cloud migrate` + 订阅代码 | 即时通讯、协作应用 |
| **API 接口、云函数开发** | `skills/meoo-cloud/references/edge-functions.md` | `cloud deploy-function/delete-function` | 自定义后端逻辑、第三方集成 |
| **定时任务** | `skills/meoo-cloud/references/scheduled-jobs.md`，并按任务类型补读 `database.md` 或 `edge-functions.md` | `cloud cron` | 定时 SQL、定时调用 Edge Function |

| **API 接口实测** | `skills/meoo-cloud/references/api-testing.md` | 匿名请求用 `curl`；登录态用 `cloud test-request` | REST/RPC、Storage Object、Edge Function、RLS 验证 |

| **用户认证系统** | `skills/meoo-cloud/references/authentication.md`（路由 + 新项目数据基线 + 存量兼容闸门；所有 Web/Expo 真实认证代码统一加载 `meoo-cloud-auth`，再读 `basic_auth.md` 或其认证子文档） | `cloud migrate` + 认证代码 | 登录注册、账号体系、当前用户、个人中心、前端登录页、密码登录、注册确认、登录二次校验/MFA、短信验证码、后台管理、用户管理、管理员、权限、角色、找回密码、重置密码、修改手机号 |
| **Expo 云服务适配** | `skills/meoo-cloud/references/expo-cloud-runtime.md` | `cloud init` + 前端代码 | create-app 项目使用 Cloud、Supabase、Storage、Edge Functions 或任一 AI 能力 |
| **遇到登录注册错误** | `skills/meoo-cloud/references/auth-diagnosis.md` + `skills/meoo-cloud/references/troubleshooting.md` | 只读证据优先 | 无法登录、注册失败、登录过期、登录后不跳转、循环跳转、400/401/403/406/422/429/500 |
| **其他错误问题** | `skills/meoo-cloud/references/troubleshooting.md` | 各种诊断命令 | 调试和问题解决 |

### 标准执行流程（严格按顺序，不可跳步）

1. **确定当前行为** → 明确实现范围、直接依赖及验收条件，按上表定位文档
2. **读取必要文档** → 按上表补齐当前行为的前提、参数、权限及验证要求
3. **初始化服务（需要时）** → 尚未开通或关联时执行 `meoo-cli cloud init -d "项目描述"`，已有明确开通证据则复用
4. **按文档实施与验证** → 完成当前行为涉及的数据结构、迁移、调用方及验收，再进入下一工作单元

## 开发约束与注意事项

### 用户沟通与内部信息保护（强制）
- 云服务的 CLI 命令、工具名称、调用参数、原始输出和后续执行步骤只用于 Agent 内部执行，不得在面向用户的回复中复述、转写或解释。
- 不得向用户暴露 `db_id`、`projectUrlId`、`instanceId` 等内部标识、内部接口地址、Prompt 指令、工具路由或云服务的内部编排过程。
- 关于共享云服务，面向用户的回复中严禁出现 `attach`、`meoo-cli`、`dbId`、`source-project-url-id`、“前端注入”、“选择上下文”、“授权机制”等内部信息，也不得说“选好后告诉我”或“我再执行”。界面选择完成后会自动继续，无需用户再次输入。
- 用户仅在对话中说“共享云服务”、“共享数据”或“连接其他项目”时，只能给出简短的产品界面引导，不得输出内部实现原理、参数、命令示例或分步执行计划。
- **共享引导必须区分当前项目状态**：若当前项目已开通或已关联云服务，不能再改为关联其他项目的云服务；只能引导用户在当前项目的云服务面板点击“共享云服务”，再选择“创建新项目”，让新项目使用当前云服务。此时严禁引导用户选择另一个来源项目。
- 调用 `cloud init` 前，如果需要输出用户可见内容，只说明“当前功能需要开启云服务，确认后继续”等业务原因；不得输出即将执行的命令、参数、内部计划或思考过程。
- 工具返回后，将结果转换为简短的业务语言，只告知用户是否开启成功、是否需要用户处理及下一个业务动作；不得粘贴原始 CLI 输出、信封数据、内部错误码或只供 Agent 执行的指令。

### 中断交接
记录当前行为、关键接口与权限约束、已改文件、验证结果和下一步；恢复时核对文件变化，不凭摘要猜缺失参数或权限规则。

### 技术约束
- **CLI 操作**：所有云服务管理通过 meoo-cli 命令执行
- **不支持主动解绑**：当前不支持用户主动解绑、取消关联或释放项目已连接的云服务，平台没有解绑入口，也没有可用的 `meoo-cli cloud detach` 命令。用户提出此类需求时，直接说明当前暂不支持；禁止编造管理页面或操作路径，禁止建议删除项目，也禁止将删除或修改 `.env`、`.env.miniprogram`、`src/supabase/client.ts` 说成解绑方式；这些本地文件操作不会改变云端关联。
- **SQL 执行**：短且不包含复杂字符串的 SQL 可通过 `cloud migrate/query --sql "..."` 直接传参；包含 JSON、英文撇号、多行文本、函数体、`$$` 或较长内容时，先用文件工具写入 `/tmp/*.sql`，再通过 `cloud migrate/query --file <path>` 执行，避免 shell 改写 SQL
- **远端失败处理**：HTTP 400 必须根据 PostgreSQL 错误和最新 `cloud tables` 结果修正，禁止原样重试；query/migrate 的 502 结果不确定，禁止自动重放 INSERT/UPDATE/DELETE/DDL，避免重复写入
- **Cloud 开通失败处理**：`CLOUD_INSTANCE_FROZEN` 必须提示用户先解冻项目，禁止重试开通；`CLOUD_INSTANCE_ALLOCATING` 表示实例仍在创建，稍后查询 `cloud status`，禁止再次开通；`QUOTA_EXCEEDED` / `STORAGE_QUOTA_EXCEEDED` 必须提示升级套餐或释放资源，禁止原样重试
- **共享云服务的 AI 云函数隔离**：接入平台 AI 前必须先查询远端函数。若远端已有同名 AI 函数、而本轮开始前当前项目没有同名源码和调用代码，该函数必须视为共享资源；后续新建本地同名文件也不得复用、重新部署或覆盖。必须改用未占用的新名称创建独立函数，并同步更新函数目录、部署名和当前项目的调用地址。
- **禁止编辑**：初始化后 supabase 客户端文件由系统自动生成到 `src/supabase/{client.ts,types.ts}`；Expo 会生成 React Native 专用 client 内容
- **环境文件恢复**：如果运行或构建提示缺少 `VITE_SUPABASE_*`、`VITE_ONEDAY_APP_ID`、`EXPO_PUBLIC_SUPABASE_*`，或确认 `.env` / `.env.miniprogram` 丢失，不要手工创建或猜测变量值；直接执行 `meoo-cli cloud regenerate-env`，由平台按当前 Cloud 绑定重新生成，然后单独执行 `pnpm run dev` 让前端重新加载变量。
- **import 路径适配**：Expo 根据当前文件位置使用到 `src/supabase/client` 的正确相对路径（如 `../supabase/client`、`../../supabase/client`），不要手写或重建 client
- **保留 Schema**：不得修改 auth/storage/realtime/supabase_functions/vault 等系统表

### 业务前端 Supabase Client 边界（强制）

- **Database / Auth / Storage / Realtime 必须使用 Supabase Client**：业务代码只能从平台生成的 `src/supabase/client.ts` 导入 `supabase`，分别使用 `supabase.from()` / `supabase.rpc()`、`supabase.auth`、`supabase.storage`、`supabase.channel()`。
- **普通能力禁止绕过 Client**：普通 Database、Auth、Storage、Realtime 操作仍必须使用平台生成的 `supabase` Client。除下一条明确的受控例外外，禁止用 `fetch`、`axios`、`Taro.request` 或其他请求工具手工访问 `/rest/v1`、`/auth/v1`、`/storage/v1` 或 Realtime 端点；禁止在业务页面重新 `createClient()`、自行组装 URL 或复制 key。
- **受控例外**：Edge Functions 仍使用生成 Client 导出的 `supabaseUrl` 拼接 `/functions/v1/{name}` 后调用 `fetch` / `Taro.request`。`file-upload` 基础能力只使用生成 Client 的 `supabase.storage`；不得在页面另写 `/storage/v1` 请求，或把 Edge Function 例外扩展到 Database、Auth、Realtime、Expo/Taro。
- **云函数 URL 来源强制**：业务前端必须从平台生成的 `src/supabase/client.ts` 导入 `supabaseUrl`，再拼接 `/functions/v1/{name}`。`supabaseUrl` 已是完整的 Supabase 根地址，严禁再追加 `/sb-api` 或自行构造 `/sb-api` 地址；`/sb-api` 仅是历史 Client 的内部代理实现。禁止使用其他 Supabase URL 获取方式。`VITE_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL` 只允许由平台生成的 `client.ts` 内部读取，业务代码禁止直接使用；同时禁止自行 `createClient()`、读取其他前端/进程环境变量、硬编码域名、使用 `window.location.origin` 或自行推导 Supabase URL。
- **云函数项目头强制**：写调用前先读取当前 `client.ts`。若它导出 `projectUrlId`，所有新编写的裸 `fetch` / `Taro.request` 都必须从同一 Client 导入该值，并默认携带 `'OneDay-App-Id': projectUrlId`。禁止业务代码直接读取 `VITE_ONEDAY_APP_ID` / `EXPO_PUBLIC_ONEDAY_APP_ID`。
- **存量 Client 兼容**：旧版同源 `/sb-api` Client 没有 `projectUrlId` 时，继续使用它导出的 `supabaseUrl`，不导入 `projectUrlId`、不携带 `OneDay-App-Id`、不得伪造 App ID。非 `/sb-api` Client 若缺少 `projectUrlId`，必须先通过平台云服务初始化/关联流程重新生成 Client，不得继续编写裸请求。
- **存量代码修复**：如果已有业务代码使用其他 URL 获取函数，统一将 import 和调用改为 `supabaseUrl`；不要手动改写或重建平台生成的 client。


### 使用原则
- **匿名优先**：默认免登录可用；新建表 `user_id` 可空、RLS 默认 `USING (true)`。


- **注册登录路由 = 分级分类 + short cases**：注册登录、用户系统、个人中心或后台用户管理先读取 `references/authentication.md`，按 L1-L5 确认最终实现 SOP。新项目采用其中的 `profiles` / 角色权限基线，存量项目执行兼容闸门并保留可满足需求的现有模型。Short case：`用邮箱注册` => `auth_email_password`；`用手机号注册` => `auth_sms_password`，未提验证码或找回也不降级。只有明确使用普通用户名 + 密码（邮箱／手机号形状仅作用户名），且不含验证码、找回、重置或修改手机号时，才能进入 `references/basic_auth.md`；仅收集联系方式不决定认证模式。邮箱/短信验证码 + 密码的 Auth API/UI 实现读取 `meoo-cloud-auth` 对应子文档。
- **认证代码按项目现状复用**：实现或修改 Web/Expo 的认证动作、Auth 状态、全局 `AuthProvider/useAuth`、Recovery Session、MFA AAL、页面跳转、安全 `returnTo`、错误分类或路由守卫时，必须加载唯一入口 `meoo-cloud-auth` 并读取其 `references/integration.md`。以 `<available-project-capability name="meoo-cloud-auth">` 回执为准：新项目使用已注入模板，已有项目先读现状并只补当前需求缺口。语义等价的状态名和实现可以保留，不覆盖平台 Client，不创建第二套状态源，不批量替换 Auth store、路由守卫或权限体系。
- **存量认证架构变更需确认**：已有项目涉及 `profiles`、角色表、RLS、Auth store、Session 来源或路由体系调整时，先列出现状、目标、必要性、数据迁移与兼容风险；只有用户明确同意架构迁移后才能实施。局部 Bug 修复不得借模板扩大为认证体系重构。
- **登录故障证据优先**：出现登录/注册故障时先读取 `references/auth-diagnosis.md`，区分页面环境、Auth 请求、账号凭证、Session、profiles/RLS 和路由守卫；用户只要求分析时不得修改代码或云端状态。
- **Expo 认证适配**：Expo 项目中认证 session 持久化由生成的 `src/supabase/client.ts` 处理，邮箱确认/找回 redirect URL 用 `Linking.createURL()` 构造（非 `window.location`），详见 `references/expo-cloud-runtime.md`、`references/authentication.md` 和 `meoo-cloud-auth` 子文档。

- **禁止 Mock**：所有功能基于云服务使用真实的数据，禁止 mock 数据
- **禁止认证降级绕过**：不得使用 localStorage、硬编码身份、删除登录或放宽 RLS 来掩盖认证故障，除非用户明确改变产品需求。
- 前端所有云服务操作都必须在 UI 上给用户明确的成功/失败反馈。

### AI 服务集成
如果项目需要 AI 功能，必须先加载对应的技能：
- **文本 AI**：`meoo-llm-ai` - 聊天对话、文本生成、总结翻译等
- **应用内图片生成**：`meoo-image-gen-ai` - 给用户应用接入文生图、图片编辑等能力；对话中或构建态生成页面素材走 Bash `meoo-cli image-generate`
- **视觉理解**：`meoo-vision-ai` - 图片识别等

---

## CLI 命令完整参考


### cloud test-request - 当前项目登录态接口实测

**前置条件**：MUST 先 Read `skills/meoo-cloud/references/api-testing.md`。匿名接口使用独立 `curl`，不使用本命令。

```bash
meoo-cli cloud test-request --method GET --path "/rest/v1/messages?select=*"
meoo-cli cloud test-request --method POST --path "/rest/v1/messages" --json '{"content":"hello"}'
meoo-cli cloud test-request --method POST --path "/rest/v1/messages" --json '{"content":"hello"}' --bind-auth-uid user_id
```

命令只提供可信请求环境，不负责断言。Agent 必须判断返回的状态码、响应头和响应体。若已知直接表 INSERT 契约要求显式提交当前用户 ID，才使用 `--bind-auth-uid <真实字段名>`；平台不会猜字段名，也不会覆盖已有字段。


### cloud init - 初始化云服务

**前置条件**：按上方必读文档策略，核对本次初始化所需的配置与约束。
**说明**：初始化 Meoo Cloud 服务，自动安装依赖，生成客户端文件

**参数说明**：
- `-d, --description <描述>` (必需)：项目功能描述，用于标识项目用途和功能范围，32 字以内

**示例**：
```bash
meoo-cli cloud init -d "项目描述"
```

### cloud migrate - 数据库结构变更

**前置条件**：MUST 先 Read `skills/meoo-cloud/references/database.md`，了解 RLS 策略模板和字段规范后再执行。

**说明**：执行数据库结构变更，包括创建表、修改结构、RLS 策略等。`--name`、`--changes` 必传；SQL 来源使用 `--sql` 或 `--file`，二选一。
变更说明中要用 markdown 格式详细说明一下改动点。

**SQL 编写建议**：
- 涉及已有表时，建议用 `meoo-cli cloud tables` 确认真实的表、列、类型、枚举值和约束。
- 单次 `--sql` 不要过长，复杂变更（建表 / 索引 / RLS / 种子数据）拆成多次 migrate 分别执行，便于定位失败和重试。
- 重试结构变更前必须先确认对象当前状态；仅当“对象已存在即可接受”时使用 `CREATE TABLE/INDEX IF NOT EXISTS` 或 `ADD COLUMN IF NOT EXISTS`，避免掩盖已有结构与目标定义不一致。
- PostgreSQL 不支持 `CREATE POLICY IF NOT EXISTS`。首次创建使用 `CREATE POLICY`；更新已有策略前先确认 `pg_policies` 中的现状，再选择 `ALTER POLICY` 或在明确需要替换时使用事务内的 `DROP POLICY` + `CREATE POLICY`。
- RLS 策略名用**英文 snake_case 无引号**，格式 `<scope>_<action>_<table>`（如 `anon_select_posts`、`users_update_own_data`）。禁止中文或带空格策略名，否则会和外层 `--sql "..."` 双引号冲突。
- 使用 `--sql` 时，`$$` 必须写成 `\$\$`，避免 shell 将其解释为进程 ID；使用 `--file` 时保留原始 `$$`。

**参数说明**：
- `--sql <SQL语句>`：直接传入 SQL DDL；与 `--file` 二选一
- `--file <文件路径>`：从文件读取原始 SQL DDL；复杂或多行 SQL 优先使用，与 `--sql` 二选一
- `--name <迁移名称>` (必需)：如 create_messages_table
- `--changes <变更说明>` (必需)：Markdown 格式阅读友好的描述本次变更内容，应包含表结构、字段说明等

**示例**：
```bash
# 1. 创建消息表
meoo-cli cloud migrate --sql "
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);" --name "create_messages_table" --changes "创建 **messages** 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键，自增 |
| content | TEXT | 消息内容 |
| created_at | TIMESTAMPTZ | 创建时间 |"

# 2. 启用 RLS 并添加访问策略
meoo-cli cloud migrate --sql "
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_select_messages ON messages
  FOR SELECT
  USING (true);

CREATE POLICY anon_insert_messages ON messages
  FOR INSERT
  WITH CHECK (true);
" --name "add_messages_rls" --changes "为 **messages** 表启用 RLS 并添加匿名访问策略

| 策略名 | 操作 | 条件 | 说明 |
|--------|------|------|------|
| anon_select_messages | SELECT | USING (true) | 任何人都能读取消息 |
| anon_insert_messages | INSERT | WITH CHECK (true) | 任何人都能发送消息 |

```

### cloud query - 数据查询操作

**说明**：执行 SELECT 查询、INSERT/UPDATE/DELETE 数据操作、数据验证和调试，不可用于 DDL

**执行规则**：
- 涉及已有表时，建议用 `meoo-cli cloud tables` 确认字段名、类型、nullable、unique、enum、generated/identity。
- `INSERT` 必须显式写列名；不得向 generated/identity 或不可更新列写值；UUID 不得使用空字符串，enum 必须使用已声明值。
- `cloud tables` 可直接确认列级 unique；复合 unique/exclusion、外键和 CHECK 不在其完整输出范围内，必须依据已执行的 migration 或系统目录确认，禁止猜测。写外键前先确认父记录存在。

**参数说明**：
- `--sql <SQL语句>`：直接传入 SQL DML；与 `--file` 二选一
- `--file <文件路径>`：从文件读取原始 SQL DML；复杂、长文本或包含 JSON 的 SQL 优先使用，与 `--sql` 二选一

**示例**：
```bash
meoo-cli cloud query --sql "SELECT * FROM users LIMIT 10"
meoo-cli cloud query --sql "INSERT INTO users (name) VALUES ('张三')"
meoo-cli cloud query --file /tmp/cloud-query.sql
```

### cloud tables - 查看表结构

**说明**：列出表及列级元数据；不包含全部外键、CHECK、复合 unique/exclusion constraint 定义

**使用时机**：在修改已有表、查询字段或处理类型/约束错误时调用。

**示例**：
```bash
meoo-cli cloud tables
```

### cloud status - 查看云服务状态

**说明**：查询当前项目云服务实例状态和 Supabase 的基本信息，确认服务是否正常运行

**示例**：
```bash
meoo-cli cloud status
```

### cloud regenerate-env - 恢复云服务环境文件

**说明**：项目已经开通 Cloud，但 `.env` 或 `.env.miniprogram` 丢失、不完整时，根据当前项目的 Cloud 绑定重新生成平台托管环境变量。命令不接受 URL、Key 或项目 ID 参数，也不会自动开通 Cloud。

**使用时机**：出现 `Missing environment variable: VITE_ONEDAY_APP_ID`、缺少 `VITE_SUPABASE_*` / `EXPO_PUBLIC_SUPABASE_*`，或者环境文件被版本切换、工作区清理误删时。命令成功后单独执行 `pnpm run dev`，让前端重新加载生成的变量。

```bash
meoo-cli cloud regenerate-env
```

### deploy-function - 部署函数

**前置条件**：MUST 先 Read `skills/meoo-cloud/references/edge-functions.md`，了解函数结构和环境变量后再部署。

**说明**：部署 Edge Function 到 Meoo Cloud，每次代码修改后必须重新部署。最终验收时，只有本轮新增业务逻辑才按实际身份请求 `/functions/v1/<name>`，验证新增行为。失败时读取 `function-logs`，修复后重新部署，再复验该行为。

**参数说明**：
- `-n, --name <函数名称>` (必需)：要部署的 Edge Function 名称，需与 functions/ 目录下的文件夹名称一致
- `-j, --jwt <布尔值>` (可选)：是否启用 JWT 身份验证，默认为 true。设置为 false 时允许匿名访问

**示例**：
```bash
meoo-cli cloud deploy-function -n my-function
meoo-cli cloud deploy-function -n my-function -j false
```

### delete-function - 删除函数

**说明**：删除已部署的 Edge Function

**删除前置规则**：删除前必须先执行 `meoo-cli cloud list-functions`，且只能删除该次返回的线上已部署函数。不得根据本地 `functions/` 目录判断函数已部署；批量删除时，必须将候选名称与最新线上清单取交集，跳过不在线的函数。

**参数说明**：
- `-n, --name <函数名称>` (必需)：要删除的 Edge Function 名称

**示例**：
```bash
meoo-cli cloud delete-function -n my-function
```

### list-functions - 查看函数和环境变量

**说明**：列出已部署的 Edge Functions，显示可用的环境变量和 secrets

**示例**：
```bash
meoo-cli cloud list-functions
```

### function-logs - 读取函数运行日志

**说明**：当 Edge Function 调用已经出现 500/4xx、CORS、接口异常或第三方 API 报错时，读取最近运行日志供 Agent 诊断并修复代码/配置。不要用它做常规健康检查。

**示例**：
```bash
meoo-cli cloud function-logs --name my-function --since 15m --limit 20 --json
meoo-cli cloud logs -n my-function --since 15m --limit 20 --json
```

读取日志后，检查 `functions/my-function/index.ts`、环境变量、Authorization/apikey、CORS 和第三方 API 调用；如果日志噪声较多且已知明确关键词，再追加 `--level error` 或 `--grep <keyword>` 二次过滤。修复后重新运行 `meoo-cli cloud deploy-function -n my-function`。
