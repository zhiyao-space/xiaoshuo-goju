# 基础密码认证 SOP

只在 `auth-routing.md` 明确命中 `authImplementationSop=basic_auth`，或小程序场景直接路由到本文件时读取。本文件承接普通用户名 + 密码（包括用户明确要求将手机号仅作为用户名），以及小程序微信一键登录 + 账号密码登录。Web/H5/Expo 明确使用邮箱／手机号注册时优先走对应真实认证模式；不能仅因未提验证码而进入本文件。

不要用本文件实现邮箱验证码、短信验证码、注册验证码、登录二次校验、忘记密码、找回密码、重置密码或修改手机号。只要出现这些需求，回到 `auth-routing.md` 路由并读取 `meoo-cloud-auth` 对应子文档。

## 认证方法

### 普通账密登录（默认方式）

Web/H5/Expo 的 `basic_auth` 页面只生成“用户名 + 密码”，字段标签为“用户名”、占位符为“请输入用户名”，不生成邮箱／手机号或混合登录输入。共享动作兼容不同形状的用户名：合法邮箱直接作为 Supabase Auth 的 `email`，不加任何后缀；不含 `@` 的用户名、手机号使用 `{username}@meoo.local`。含 `@` 但格式不合法时直接报错，不能回退为虚拟邮箱。所有输入先去除首尾空白。

### 数字用户名兼容

纯数字或手机号形状的输入仍作为用户名处理，不发送短信验证码，同样生成 `{username}@meoo.local`。页面不得要求 11 位手机号，`1111` 也可通过用户名格式校验。

### 邮箱形状的用户名兼容

`basic_auth` 收到合法邮箱时直接使用该邮箱注册和密码登录，仍复用同一个基础认证动作对象。使用真实邮箱标识不等于已验证邮箱，也不自动开启验证码、邮箱确认或找回密码。需要这些能力时回到 `auth-routing.md` 命中 `auth_email_password`；注册是否需要确认须核对实际认证配置，不凭 `data.user.id` 假定已有 Session。



## 实现要点

### 1. 存储完整会话对象

```typescript
const [session, setSession] = useState<Session | null>(null);
```

### 2. 用户名认证示例

用户名输入框传原始账号。下例展示底层 SDK 调用，不依赖认证模板入口；项目已有共享认证动作时优先复用，模板未就绪时按下方“代码资产”处理。

```typescript
import { supabase } from '@/supabase/client';

// 提交前须通过下方输入校验；含 @ 不等于邮箱合法。
const account = username.trim();
const email = account.includes('@') ? account : `${account}@meoo.local`;

// 注册
await supabase.auth.signUp({
  email,
  password,
  options: { data: { username: account } },
});

// 登录：与注册复用相同的校验和标识解析规则。
await supabase.auth.signInWithPassword({ email, password });
```

内部虚拟邮箱只用于 Supabase Auth 登录，不展示给用户；不要把它写入 `profiles.email`。

- 页面直接复用 `createAuthActions('basic_auth')` 的输入解析及 [当前密码接线](../../meoo-cloud-auth/references/password-flow.md)；项目缺少共享动作时才查 `skills/meoo-cloud-auth/references/integration.md` 的“页面输入契约”。用户名校验须与共享动作一致，不能套用“仅手机号或邮箱有效”的表单校验；邮箱输入支持 ASCII 点分本地部分和域名标签，本地部分不超过 64 字符、域名标签不超过 63 字符、完整地址不超过 254 字符。多 `@`、内部空白、空域名等在发请求前拒绝。
- 校验和文案按原始输入类型区分：含 `@` 时提示“请输入正确的邮箱地址”，其他非法输入提示“请输入正确的用户名”，空输入提示“请输入用户名或邮箱”。用户名须能作为虚拟邮箱的本地部分（同上字符及长度约束）；不能把虚拟邮箱的格式问题提示成用户邮箱错误。catch 中保留本地错误 code 并调用 `resolveAuthFeedback`，不要用固定“注册失败”覆盖分类提示。
- 合法邮箱必须原样传入（去首尾空白），禁止追加 `@meoo.local` 或 `.meoo.local`，也不能删掉或替换 `@`。保留原始账号（去首尾空白）作为 `username`，注册和登录复用同一映射；不从虚拟地址反推展示账号。
- 存量项目先检查已有映射。普通用户名、手机号地址保持不变；已有自定义编码或虚拟域名邮箱账号先核对兼容方案，不能静默改变其登录地址；已有真实邮箱继续直传。此次映射修复不启用邮箱确认、短信或找回密码。
- 验收实际提交参数：普通用户名、手机号、合法邮箱、带 `+` 的邮箱，以及非法邮箱；合法邮箱不增加后缀，同一账号注册与登录地址一致，`a@b.com` 与 `a_b.com` 不碰撞。Web/Expo 均验证；模拟请求不等于线上注册成功。

### 3. 认证状态监听

```typescript
// 正确：同步状态更新 + 在 effect cleanup 里 unsubscribe
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    setSession(session);
    setUser(session?.user ?? null);

    // 延迟任何 Supabase 调用
    if (session?.user) {
      setTimeout(() => {
        fetchUserProfile(session.user.id);
      }, 0);
    }
  });
  return () => subscription.unsubscribe();
}, []);

// 错误：会导致死锁
supabase.auth.onAuthStateChange(async (event, session) => {
  const profile = await supabase.from('profiles').select(); // 死锁
});
```

## 用户数据表设计


Web/H5/Expo 基础密码认证复用 [共享用户数据基线](auth-data-baseline.md)，不在本文单独创建 `profiles`、业务表外键、`user_roles` 或 `has_role`。

- 用户名 + 密码：注册时把用户名写入 `raw_user_meta_data.username`，共享触发器会写入 `profiles.username`。
- 手机号 + 密码：把手机号当作用户名写入 `raw_user_meta_data.username`，不写 `profiles.phone`。
- 不要把任何 `meoo.local` 域名或其子域名下的虚拟邮箱写入 `profiles.email`。
- 业务表引用用户、后台角色和管理员权限按 [共享用户数据基线](auth-data-baseline.md) 设计。





## 创建和验证测试用户

- 仅在网页应用（Web/H5）或 App（Expo）已开启 Meoo Cloud 注册登录服务，且用户明确要求创建账号时，使用 `meoo-cli cloud create-test-user` 完成密码设置及指定的角色/profile 初始化，随后直接交付账号密码，默认不做登录验证。小程序、未开启注登服务或仅有静态/Mock 登录页的项目不得调用；云服务已开通不等于注登服务已开启。Web/H5/Expo 的完整创建说明见 `skills/meoo-cloud-auth/references/test-accounts.md`。
- 自动化测试、接口验证或回归测试不得调用 `meoo-cli cloud create-test-user` 创建账号。使用已有可用身份或对应测试工具的托管身份能力；缺少身份时说明阻塞。测试真实注册流程时按用户明确授权使用应用现有注册页或 `supabase.auth.signUp()`，后台没有注册入口时不为测试新增公开注册页。
- 禁止通过 SQL `INSERT`、`UPDATE` 或 `DELETE auth.users`，禁止自行生成、复制或修改 `encrypted_password`。直接操作 Auth 系统表会造成密码哈希、实例字段、Token 字段和 `profiles` 触发器状态不一致。
- 只有用户明确提供或授权创建隔离、可丢弃的非生产测试账号时才能执行真实注册或受控创建；不得猜测固定账号、密码或验证码。
- 用户明确要求登录验证或执行认证测试时，使用已有可用测试身份依次验证：`signInWithPassword` 成功、`getSession()` 与 `getUser()` 指向同一用户、`profiles.id` 与 Auth user id 对齐；涉及角色时继续验证 `user_roles`。
- 缺少可用测试身份或验证码时，外围验证可以继续，但最终认证结果必须标记为 `BLOCKED`，不得声称登录已完成。

## 代码资产

实现或修复 Web/Expo 基础认证时加载唯一入口 `meoo-cloud-auth`。已有公共入口及回执直接按合同与当前流程示例接线，不递归读取内部实现；入口或契约缺失、复杂迁移或实际接入故障时才补读 `skills/meoo-cloud-auth/references/integration.md`。项目公共入口已就绪时复用 `createAuthActions('basic_auth')`；入口缺失先检查已有等价实现及模板注入进度，不导入不存在的文件。确认无等价实现且模板复制未在进行后，才参考模板和上述 SDK 示例补齐必要共享动作。不要同时实例化邮箱或短信模式，不创建第二套 Auth store 或 Supabase Client。


