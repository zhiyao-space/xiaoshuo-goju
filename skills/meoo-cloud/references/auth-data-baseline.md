# 当前流程：共享用户数据基线

仅在新建用户资料/业务外键/RLS，或实际修改这些结构时读取。认证模式已经确认时不重跑模式选择；未确认时先按 [认证路由](auth-routing.md) 完成选择。存量结构沿用真实实现，不能因为模板存在而重建。若当前上下文已包含本节，直接复用，不重复 Read。


### 共享用户数据模型

完成 L1 到 L5 路由并得到 `authImplementationSop` 后，新项目或确实缺少用户模型的 Web/H5/Expo 默认使用本节的数据模型；子文档不要重建整套 `profiles` / 角色表。已有项目先执行下方兼容闸门。

#### 存量项目兼容闸门

1. 先读取现有认证 store/service、Session 恢复、路由守卫、角色查询、数据库迁移和 RLS，确认真实结构与行为。
2. 已有实现满足当前需求时直接复用，不复制模板、不统一命名、不重建表。
3. 已有实现存在局部缺口时，只修补与当前需求直接相关的缺口；允许通过适配层保持语义等价，不强制使用本文的字段名、状态类型或文件结构。
4. 若必须改变 `profiles`、角色表、外键、RLS、Auth store、Session 来源或路由体系，先列出现状、目标、必要性、数据迁移和兼容风险，并等待用户明确确认。确认前不得执行 migrate 或批量替换代码。
5. 局部登录 Bug 修复不得顺带把存量体系迁移为本文模板；禁止批量替换 Auth store、守卫和数据库模型。

#### 执行顺序与当前需求

新建项目先串行完成下方 `profiles`、RLS 和创建资料 trigger，确认迁移结果与实际表结构后再执行引用 `profiles.id` 的业务扩展。共享基线未建成时不先创建 sales_profiles、客户外键或扩展 trigger。不要把缺表失败当成扩展 schema 需要反复改写。

存量兼容闸门针对项目已有的业务认证体系；平台刚注入的固定公共模板不是要求通读 Provider/Actions/Gate 内部的理由。只确认公共入口及回执，参数按密码公共合同接线；具体内部错误才读取失败链路。

本轮只要求登录和基础资料时，保留 `avatar_url` 字段并展示已有值/占位图即可；实际头像上传需求出现后再开 Storage 接线。不为了可选头像预先建立桶和整套上传策略。实际需要 Storage 时先读 [资源盘点](../../file-upload/references/storage-inventory.md)：local 复用预发只清空 public，既有 Storage 桶/策略保留，先查询再创建，不能盲目重放整段迁移。

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

