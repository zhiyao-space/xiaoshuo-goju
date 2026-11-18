# 当前认证方式路由

本文件保留完整的认证方式分类、阻塞询问、执行闸门和推断边界；数据模型不在本轮模式选择阶段展开。命中具体类型后，立即读取对应子文档作为 Auth API / 页面 / 云函数 / 测试用户的实现 SOP；已有项目的 `profiles`、业务表外键和角色权限结构以真实代码、迁移和数据库现状为准，不能仅因为本文存在模板就重构。

> **强制：** 业务前端的注册、登录、Session 和用户操作必须使用平台生成的 `supabase.auth`。禁止裸请求 `/auth/v1`，禁止重新 `createClient()` 或自建认证 Client。




## 认证方式路由（create-desktop/create-app 共用判断规则）

开始数据库设计之前，必须先完成本节的分级分类路由和最终实现 SOP 确认。不得先读取 `basic_auth.md` 或根据“用户名登录（默认方式）”生成任何数据库、RLS、Auth API、页面或云函数代码。create-app 复用本节的认证类型判断；新建或修改用户数据时按 [共享数据基线](auth-data-baseline.md) 执行，存量变更仍须执行该文档的兼容闸门。页面、导航和存储实现必须遵守下方 Expo 专项约束与 `expo-project` 的 RN 规则。



### 分级分类路由

按 L1 到 L5 自上而下判定；命中即停止，不继续向下归类。长需求中先抽取认证相关子句做本节判定；其他业务功能不降低注册登录澄清优先级。一个需求同时包含基础登录和更高优先级能力时，以更高优先级能力为准。

#### 前置：登录二次校验 / MFA

MFA 是第一因子之上的附加能力，不替代 L1-L5 得到的 `authImplementationSop`。需求出现“登录二次校验 / MFA / 2FA / 第二因子”时，先设置附加路由，再对剩余的第一因子需求执行 L1-L5：

- 明确 TOTP / 身份验证器：`authSecondFactorSop=mfa_totp`。
- 明确手机短信二次校验：`authSecondFactorSop=mfa_phone`，实施前必须确认当前 Meoo Cloud 实例已开放 Phone MFA 并配置消息 provider。
- 未说明第二因子：STOP，询问选择 TOTP 还是 Phone MFA。
- 明确要求邮箱验证码作为第二因子：STOP，说明 Supabase 原生 MFA 不支持邮箱 factor，询问是否改用 TOTP 或 Phone MFA。

命中二次校验后必须读取 `skills/meoo-cloud-auth/references/auth-mfa.md`。不得用邮箱 OTP、普通短信 `signInWithOtp()` 或前端布尔值冒充 MFA；完成依据是 Supabase MFA 产生的 `aal2` Session/JWT。

单独修改已登录用户手机号时，先区分业务资料修改与 Auth 身份换绑，复用当前认证模式及对应权限／验证流程；不因此重建注册、恢复或迁移第一因子。Auth 换绑不能用密码恢复代替，边界见 `skills/meoo-cloud-auth/references/auth-sms-password.md`。

#### 明确注册标识优先

- 用户明确要求“用邮箱注册 / 邮箱注册登录”时，优先选择 `auth_email_password`；明确要求“用手机号注册 / 手机号注册登录”时，优先选择 `auth_sms_password`。即使没有提到验证码或找回密码，也不能据此降级为 `basic_auth`。
- 对应模式使用真实 `auth.users.email` / `auth.users.phone`，按子文档完成注册确认与密码登录，恢复能力遵守对应子文档及用户范围；不因此追加登录二次校验或 MFA。
- 只有用户明确要求“邮箱／手机号仅作为普通用户名，不验证归属”，且不含更高优先级的验证码、确认、恢复或换绑需求时，才按 L4 使用 `basic_auth`。用户只说“不需要验证码”但仍要求真实邮箱／手机号注册时，先澄清这一能力取舍，不静默改成虚拟邮箱。
- 个人资料或客户资料中的联系方式不代表注册标识；模型在计划中自行补写的手机号／邮箱也不能当成用户明确选择。只说“注册登录”仍按 L5 处理。
- 同时提到邮箱和手机号时，先区分注册标识与资料字段；无法确定注册通道时先澄清，不按 L1/L2 的排列顺序替用户选一个，也不自行新增双通道入口。

#### L1：邮箱注册 / 邮箱找回 / 邮箱确认 / 邮箱验证码

命中条件：

- 明确使用邮箱注册（含邮箱注册登录），而非仅允许邮箱形状的普通用户名。
- `邮箱 / 邮件 / email` + `忘记密码 / 找回密码 / 邮箱找回 / 重置密码`。
- `邮箱验证码 / 邮件验证码 / 邮箱验证 / 邮箱确认 / 注册邮箱校验`。

路由结果：设置 `authImplementationSop=auth_email_password`，读取 `skills/meoo-cloud-auth/references/auth-email-password.md`；本路线完全取代基础虚拟邮箱方案，不得再读取 `basic_auth.md` 作为基础实现。

Short cases:

- `用邮箱注册` / `邮箱注册、密码登录（未提验证码或找回）` => `auth_email_password`
- `忘记密码（邮箱找回）` => `auth_email_password`
- `邮箱注册、密码登录、忘记密码（邮箱找回）` => `auth_email_password`
- `邮箱验证码 + 密码用于注册校验` => `auth_email_password`
- `海外用户 + 邮箱注册 + 找回密码` => `auth_email_password`

#### L2：手机号注册 / 短信找回 / 短信验证码

命中条件：

- 明确使用手机号注册（含手机号注册登录），而非仅允许手机号形状的普通用户名。
- `短信 / SMS / 手机 / 手机号 / phone` + `忘记密码 / 找回密码 / 重置密码`。
- `短信验证码 / 手机验证码 / 阿里云短信 / 注册短信校验`。

路由结果：设置 `authImplementationSop=auth_sms_password`，读取 `skills/meoo-cloud-auth/references/auth-sms-password.md`；本路线完全取代基础虚拟邮箱方案，不得再读取 `basic_auth.md` 作为基础实现。

Short cases:

- `用手机号注册` / `手机号注册、密码登录（未提验证码或找回）` => `auth_sms_password`
- `短信验证码登录 + 密码` => `auth_sms_password`
- `手机号注册、密码登录、忘记密码` => `auth_sms_password`
- `阿里云短信验证码` => `auth_sms_password`

#### 存量虚拟邮箱升级闸门

如果现有认证代码使用虚拟邮箱（`${username}@meoo.local` 或现有自定义映射），而新增需求命中 L1（真实邮箱、邮箱确认、忘记密码、找回密码或重置密码），MUST STOP。不得在保留虚拟邮箱第一认证标识的同时，直接追加 `profiles.email`、`resetPasswordForEmail(profile.email)`、邮箱确认页面或邮箱 provider，并声称真实邮箱链路已经完成。

必须先向用户说明：Supabase 原生邮箱确认和密码恢复只认 `auth.users.email`；`profiles.email` 只是业务资料字段，不能替代 Auth 邮箱。然后让用户明确选择：

1. 将第一认证标识迁移为真实邮箱：注册、登录、确认和找回密码统一使用同一个真实邮箱，并在修改代码前列出现有账号、Session、登录入口和数据迁移方案。
2. 保留用户名 + 虚拟邮箱认证：不得提供 Supabase 原生邮箱确认或邮箱找回；若仍要求用次级邮箱找回，必须另行设计并确认服务端验证与账号恢复方案，不能用前端查询 `profiles.email` 冒充原生恢复链路。

用户未选择前不得修改认证代码、执行迁移或启用邮箱服务。选择真实邮箱迁移后，设置 `authImplementationSop=auth_email_password`，只读取邮箱密码 SOP；不得继续把 `basic_auth.md` 作为第一认证实现。选择保留虚拟邮箱后，维持 `authImplementationSop=basic_auth`，并从当前范围移除邮箱确认/找回能力。

#### L3：找回 / 重置需求存在但通道未说明

命中条件：出现 `忘记密码 / 找回密码 / 重置密码`，但没有说明邮箱还是短信。

路由结果：先检查当前项目及会话已确认的恢复通道；能够明确沿用时不重复询问。仍无法确定或用户要求更换通道时再澄清，不默认选择邮箱、短信或基础密码认证。

Short cases:

- `注册登录 + 忘记密码` 且没有既有明确通道 => 询问邮箱找回还是短信找回
- `密码登录 + 重置密码` 且没有既有明确通道 => 询问邮箱重置还是短信重置

#### L4：基础密码认证

命中条件：仅在用户明确只需要普通登录标识 + 密码，且没有验证码、注册校验、找回密码、重置密码或修改手机号时命中。明确邮箱／手机号注册优先按 L1/L2；不能把“未提验证码”当作“只要普通用户名”的确认。

路由结果：设置 `authImplementationSop=basic_auth`，读取 `skills/meoo-cloud/references/basic_auth.md`。

Short cases:

- `用户名 + 密码登录` => `basic_auth`
- `用户名允许邮箱形状 + 密码登录（不含邮箱确认、验证码、找回密码）` => `basic_auth`，页面仍为“用户名”
- `用户名允许纯数字／手机号形状 + 密码登录（不含短信验证码、找回密码、修改手机号）` => `basic_auth`，页面仍为“用户名”

#### L5：存在注册登录需求但认证方式不明确

命中条件：用户需求的任意位置出现 `登录 / 登陆 / 注册 / 登录注册 / 账号体系 / 当前用户 / 个人中心 / 后台管理 / 用户管理 / 用户系统`，但没有明确邮箱、短信、验证码、找回、重置、修改手机号或普通账号密码方式。

路由结果：STOP，直接发起选择；不得自行选择默认项。L5 命中后，本轮只能输出一句简短承接 + 一个认证方式选择问题；问题发出后立即停止，不得同时输出方案、计划、代码或执行动作。

```text
你希望使用哪种注册登录方式？
1. 普通登录标识 + 密码（邮箱/手机号只作为标识，不带验证码/找回）
2. 邮箱验证码 + 密码
3. 短信验证码 + 密码
```

回答映射：

- 选择 1 => `authImplementationSop=basic_auth`
- 选择 2 => `authImplementationSop=auth_email_password`
- 选择 3 => `authImplementationSop=auth_sms_password`

Short cases:

- `需要注册 / 登录和个人中心` => 询问三选一
- `后台管理用户和订单` => 询问三选一
- `用户系统` => 询问三选一
- `长需求任意位置出现注册/登录但未说明认证方式` => 询问三选一

### 执行闸门

- 开始数据库设计、云服务启用或认证代码生成前，必须已有 `authImplementationSop`: `basic_auth` | `auth_email_password` | `auth_sms_password`。
- 需求包含二次校验时，还必须有 `authSecondFactorSop`: `mfa_totp` | `mfa_phone`；不支持的邮箱第二因子或未选定的 MFA 不得进入实施。
- 命中 L3 或 L5 但用户尚未回答时，STOP；不得写任何认证相关数据库、RLS、Auth API、页面、云函数或测试用户。
- 命中“存量虚拟邮箱升级闸门”但用户尚未选择迁移或保留方案时，STOP；不得把真实邮箱只写入 `profiles.email` 后继续生成邮箱确认或找回逻辑。
- plan/todo 只能先记录“按 L1 到 L5 确认最终实现 SOP”；未完成前，不得把“设计用户表 / 实现登录页 / 实现短信验证码 / 实现重置密码 / 修改手机号”列为可执行开发任务。

### 推断边界

- 不得根据应用类型、行业、后台管理、用户管理、用户系统、海外用户、常见实现方式或“看起来需要安全”推断注册登录类型。
- 只要命中 L1 或 L2，就不得命中 `basic_auth.md`。
- 找回密码必须依赖邮箱或短信验证码/确认链路；命中 L3 时先澄清，未澄清前不得实现。
- `authImplementationSop=auth_email_password` 时，注册、登录、确认和恢复必须使用同一个真实邮箱。生成完成前检查有效认证代码中的 `signUp`、`signInWithPassword` 和 `resetPasswordForEmail`；只要身份参数仍由 `meoo.local` 虚拟域名映射派生，或恢复地址来自仅存于 `profiles.email` 的次级字段，就不得声称完成。
- 用户要求纯邮箱验证码免密登录或纯短信验证码免密登录时，明确说明当前不支持纯验证码免密链路，并询问是否接受对应的验证码 + 密码方案。用户未确认前 STOP，不得擅自改变认证方式或用自建验证码系统绕过。



模式确定后按对应 SOP 接线；新建或修改用户数据时才读 [共享数据基线](auth-data-baseline.md)。完整路由与原始数据模型仍保留在 [完整认证参考](authentication.md)，已有模式与数据结构未变时不重复展开。
