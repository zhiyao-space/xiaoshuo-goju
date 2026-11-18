# 用户认证路由

本文件负责注册登录类型路由、阻塞询问和新项目的共享用户数据基线。命中具体类型后，立即读取对应子文档作为 Auth API / 页面 / 云函数 / 测试用户的实现 SOP；已有项目的 `profiles`、业务表外键和角色权限结构以真实代码、迁移和数据库现状为准，不能仅因为本文存在模板就重构。

> **强制：** 业务前端的注册、登录、Session 和用户操作必须使用平台生成的 `supabase.auth`。禁止裸请求 `/auth/v1`，禁止重新 `createClient()` 或自建认证 Client。




## 认证方式路由（create-desktop/create-app 共用判断规则）

开始数据库设计之前，必须先完成本节的分级分类路由和最终实现 SOP 确认。不得先读取 `basic_auth.md` 或根据“用户名登录（默认方式）”生成任何数据库、RLS、Auth API、页面或云函数代码。create-app 复用本节的认证类型判断；新项目使用共享数据基线，存量项目执行兼容闸门。页面、导航和存储实现必须遵守下方 Expo 专项约束与 `expo-project` 的 RN 规则。



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

### 共享用户数据模型

完成 L1 到 L5 路由并得到 `authImplementationSop` 后，新项目或确实缺少用户模型的 Web/H5/Expo 默认使用本节的数据模型；子文档不要重建整套 `profiles` / 角色表。已有项目先执行下方兼容闸门。

#### 存量项目兼容闸门

1. 先读取现有认证 store/service、Session 恢复、路由守卫、角色查询、数据库迁移和 RLS，确认真实结构与行为。
2. 已有实现满足当前需求时直接复用，不复制模板、不统一命名、不重建表。
3. 已有实现存在局部缺口时，只修补与当前需求直接相关的缺口；允许通过适配层保持语义等价，不强制使用本文的字段名、状态类型或文件结构。
4. 若必须改变 `profiles`、角色表、外键、RLS、Auth store、Session 来源或路由体系，先列出现状、目标、必要性、数据迁移和兼容风险，并等待用户明确确认。确认前不得执行 migrate 或批量替换代码。
5. 局部登录 Bug 修复不得顺带把存量体系迁移为本文模板；禁止批量替换 Auth store、守卫和数据库模型。

#### profiles

`profiles` 承接当前用户、个人中心、头像昵称、业务表用户外键和后台用户管理。基础模板保持用户名账密的原始结构：

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own_profile ON public.profiles
FOR SELECT USING (auth.uid() = id);

CREATE POLICY users_insert_own_profile ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY users_update_own_profile ON public.profiles
FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
```

#### 自动创建 profile

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS \$\$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'username'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
\$\$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

`handle_new_user` 必须使用 `SECURITY DEFINER SET search_path = public`，避免 RLS 阻断 profile 创建。

**⚠️ 新建 trigger 的硬规则**：
- **新项目严格遵循本模板**：新建上述 `profiles` 和 trigger 时，不得自行增删字段、去掉 `ON CONFLICT` 或改写逻辑。`signUp` 的 `options.data` 只传 `{ username }`，trigger 只插 `id` 和 `username`，不要插入 `avatar_url` 等 `signUp` 未提供的字段（插入 NULL 或缺失字段会导致 trigger 异常、注册 500）。已有 trigger 不得直接覆盖；修复前先核对其字段契约，涉及结构或数据迁移时走存量项目兼容闸门。
- **username 必须非空唯一**：`profiles.username` 是 `UNIQUE NOT NULL`。注册 UI 没有用户名字段时，必须先生成可展示的唯一 username（如邮箱前缀清洗 + 短随机后缀、手机号后四位 + 短随机后缀），再写入 `options.data.username`；不得依赖 trigger 接收 `NULL`
- **`ON CONFLICT (id) DO NOTHING` 不可省略**：防止重试、并发或 Supabase 内部重放导致的 unique constraint 冲突；省略后重复触发会直接报错阻断注册
- **不要加 EXCEPTION WHEN OTHERS**：异常应向上暴露，不要在 trigger 中静默吞掉；通过确保模板正确来避免异常，而不是捕获隐藏

#### 业务表与用户关联

业务表引用用户时优先引用 `profiles.id`，并让 RLS 与 `auth.uid()` 对齐：

```sql
CREATE TABLE public.user_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.user_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own_posts ON public.user_posts
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY users_insert_own_posts ON public.user_posts
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY users_update_own_posts ON public.user_posts
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

#### 角色和权限

新项目的后台、管理员、会员或角色权限需求默认使用独立角色表，不要在 `profiles` 上直接塞 `role` 字段。已有项目若存在可满足当前需求的角色来源，继续复用；迁移为独立角色表前必须走存量项目兼容闸门：

```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own_roles ON public.user_roles
FOR SELECT USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS \$\$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
\$\$;
```

管理员 RLS 使用 `has_role(auth.uid(), 'admin')` 判断；不要在 `profiles` policy 内查询 `profiles` 自己，避免 RLS 无限递归。

#### 角色查询守卫（必须遵守，防重复请求）

后台入口、管理员页面等需要"先查角色再决定能不能进"的场景，守卫代码必须满足：

1. **区分"没权限"和"查不到"**：角色查询失败（网络错误、HTTP 429 并发上限、超时）只代表结论未知，禁止在失败分支把 `isAdmin` / `role` 直接置为 `false`。失败时保留上一次结论或维持"未确定"态。
2. **至少表达三种结果**：权限状态应能区分加载/未知、已授权和明确拒绝；查询错误还必须保留为未知或独立错误态。可以继续使用项目已有的枚举、联合类型或字段组合，不强制改成模板名称。加载/未确定时渲染 loading 占位，**不跳转**；只有明确拒绝才跳转。
3. **守卫 effect 不得依赖自己写入的状态**：跳转 effect 的依赖里不能包含由该 effect 链路自身写入的判定结果，否则会形成"判定失败 → 跳走 → 目标页跳回 → 组件重挂载 → 再查一次"的往复，秒级打出成百上千次请求。
4. **每次挂载只查一次**：用 ref / 缓存 / 单例 promise 保证同一会话内角色查询不会因重挂载被重复发起；查询结果在会话级缓存，不要每次渲染都查。
5. **跳转用 replace**：`navigate(path, { replace: true })` / `router.replace(path)`，避免历史堆叠导致返回时再次触发守卫。
6. **限流要退避**：遇到 429 或"超过并发调用上限"时按指数退避重试且限制最大次数（例如最多 3 次、1s/2s/4s），不得立即重试。


### 代码资产与完成门禁

- 实现或修改 Web/Expo 的注册/登录动作、认证状态、全局 `AuthProvider/useAuth`、页面跳转、安全 `returnTo`、错误分类或路由守卫前，必须加载唯一入口 `meoo-cloud-auth`，复用其公共合同与当前流程接线。合同已在上下文时直接使用；缺失时读取公共入口或 `skills/meoo-cloud-auth/references/runtime-api.md` 的对应接口。修改模板内部、迁移认证架构或具体工程兼容失败时才读取 `skills/meoo-cloud-auth/references/integration.md`，不把整篇工程约束作为普通页面接线的必读前置。新项目使用 `<available-project-capability name="meoo-cloud-auth">` 回执确认已注入的公共入口；已有等价实现时不复制，局部缺口只做最小修补或兼容适配，不强制统一状态名和文件结构。第一因子使用共享 `createAuthActions()` 时，只按已确认的 `authImplementationSop` 实例化一个模式，不得根据可选的 username/email/phone 字段动态猜测。多个页面需要认证状态时只挂载一个全局 Provider/监听器，展示字段从权威 `user` 派生。
- 存量项目如需调整 Auth store、Session 来源、路由体系、`profiles`、角色表、外键或 RLS，必须先列出差异和迁移风险并获得用户明确确认；禁止因模板存在而批量替换。
- 用户反馈无法登录、注册失败、登录过期、登录后不跳转、循环跳转、管理员进入普通页面、登录后数据为空，或出现 400/401/403/406/422/429/500 时，必须读取 `skills/meoo-cloud/references/auth-diagnosis.md`，按六层证据链定位最早失败阶段。
- 禁止通过 localStorage 模拟登录、硬编码 userId/role/Token、删除登录页或放宽 RLS 来规避认证故障；除非用户明确改变产品需求。
- 只有标准 Auth 登录、Session 恢复、profiles/角色一致性、授权与拒绝路径、登出清理均完成适用验证后，才能声称登录功能完成。存在邮箱密码恢复时必须另外验证 `verifyOtp(type: 'recovery')` 建立 Recovery Session，再到 `USER_UPDATED` 的流程；存在 MFA 时必须验证 AAL2 及 API/RLS 强制。缺少测试身份或验证码时必须标记 `BLOCKED`。
