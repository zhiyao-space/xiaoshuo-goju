---
name: react-design
description: React 19 + Vite + TanStack Router + shadcn/ui 脚手架的工程规范（路由、依赖、沙箱约束）。
allowed_create_modes:
  - create-desktop
---

# React Design 项目规范

> 模板文件列表与正文在 skill 加载时**首轮**注入（`shareFiles`），后续轮次靠对话历史携带，压缩后可能丢失。

## 预置组件与自动生成

| 路径 | 用法 |
|------|------|
| `src/components/ui/**` | 46 个 shadcn 已预置，直接 `import from "@/components/ui/{name}"`；日常勿 Read 全文，仅自定义源码时 Read 单个文件 |
| `src/routeTree.gen.ts` | Vite 插件自动生成，禁止手改；`pnpm run dev` / `pnpm run build` 都会更新 |

## 工程红线

- `package.json` / `index.html` 中 `meoo-app-name` 占位符勿改（用户明确要求改标题除外）
- `vite.config.ts` 锁定字段勿改：`server.port` / `strictPort` / `host` / `build.outDir` / `build.assetsDir`（细则见已注入的 vite.config.ts）
- 依赖：改 `package.json` 后 `pnpm install`；禁止 `pnpm i <pkg>` 单装；shadcn/Radix 已预置，禁止重复安装
- 动效：CSS keyframes 或 `tw-animate-css`；禁止 framer-motion 等
- 单文件软上限约 260 行；新 UI 写 `src/components/`，文件名唯一。例外：内联了紧耦合父子组件的文件（如拖拽容器+子项）可到约 320 行，不要为了压行数把耦合组件拆成多文件

## TypeScript / JSX 文件边界

- **包含 JSX 的 TypeScript 文件必须使用 `.tsx`**，无论位于哪个目录；组件返回值、render 回调、配置对象中的 `<Icon />` 和片段 `<>...</>` 都属于 JSX。`.ts` 仅用于不含 JSX 的代码；向现有 `.ts` 添加 JSX 前，先拆出 `.tsx` 组件或将文件重命名为 `.tsx`，并检查受影响的 import。
- **数据与共享 UI 分开存放**：跨组件共享的站点数据、品牌、导航、类型和交互协议统一从契约模块导出（如 `src/lib/site.ts`），组件通过 import 复用；共享 UI 放 `.tsx` 并使用具名导出，禁止把 JSX 组件塞进数据/工具 `.ts` 文件。契约文件与首页装配、独立组件任务按当前批调用规则同批提交，不需要单独一轮写完契约再开始实现。
- **交付前运行项目已有的 `pnpm run build` 并确认通过**。出现 JSX 解析错误时先检查报错文件的扩展名；修复后重新构建，不得通过修改 Vite/Babel/TypeScript 配置让 `.ts` 接受 JSX，或用 `@ts-ignore` 掩盖问题。


## API 实现验证

仅在接线完成后的最终验收阶段，主动用最小用例验证本轮新增的业务逻辑，例如新的校验、权限规则或状态流转。常规 CRUD 不主动测试，即使新建了表或接口。

代码改动、迁移或部署完成时继续实施，业务测试统一留到最终验收。用户明确要求测试时按其范围和时点执行。

- 匿名接口或公开第三方接口：使用独立的 `curl`，不要拼接命令。
- 当前项目登录态接口：加载 `meoo-cloud`，读取其 `references/api-testing.md` 后使用 `cloud test-request`。
- 默认只验证需求涉及的身份；用户没有要求游客态或 RLS 身份边界时，不要额外执行匿名请求。
- 只有预期“匿名拒绝、登录后成功”时，才分别验证匿名和托管登录态。
- 测试注册、验证码或登录 UI 本身时，托管登录态不能替代真实流程。


## 路由

新增路由全部只能接受 `"/"` 时先查 build 日志：`Conflicting configuration paths` 要修重复 URL（如 `index.tsx` 与无路径布局 `_app.index.tsx` 都是 `/`）；需要 `/app` 用 `app.tsx` / `app.index.tsx`。无冲突且生成树未更新才 build 一次再 typecheck；不手改生成树或用 `as never`。

- 页面放 `src/routes/`，一页一文件 + `createFileRoute`；勿把多页堆进 `index.tsx`
- 新项目将 `index.tsx` 的首页占位内容替换为实际页面；已有业务首页按需求修改。`routeTree.gen.ts` 禁止手改（`build`/`dev` 都会更新）
- 文件名中的点号和目录层级都参与路由层级匹配；`$` 表示动态段。`posts.tsx` 与 `posts/import.tsx` 或 `posts.$id.tsx` 并存时，后两者会成为前者的子路由，父组件须提供 `<Outlet />`。
- 列表、导入、详情若是互相替换的独立页面：保留 `posts.tsx`，使用 `posts_.import.tsx`、`posts_.$id.tsx`；只给独立子页面文件名中的 `posts` 段加后缀 `_`，不要把父列表一起改成 `posts_.tsx`。后缀 `_` 打断布局嵌套但不改变 URL，无需换 URL 前缀。
- 新建多页应用或调整路由结构时，先确定各页 URL、父布局及访问控制归属，再写业务正文；只创建需求涉及的页面，存量项目优先沿用已验证的结构，不为统一命名迁移现有路径。
- 共享布局是否占用 URL 段由产品路径决定：需要共同路径前缀时使用带路径布局；只共享界面、不增加路径段时才使用前缀 `_` 的无路径布局。布局文件名不能代替实际 URL 判断。
- index 页面沿用父级 URL；无路径布局不会为其 index 增加路径前缀。新建或迁移前核对最终 URL，避免多个独立页面占用同一路径；只有明确由新页面接管原路径与内容时，才移除旧入口。
- `createFileRoute` 写 route id（保留 `_layout`、`posts_` 标记）；`Link`/`navigate` 写 URL（去掉无路径布局段 `_layout` 和非嵌套后缀 `_`）+ `params`。
- 只有真正包住子路由的 layout 才放 `<Outlet />`；采用嵌套布局时，默认列表放 `posts.index.tsx`。独立页面沿用后缀 `_` 方案，无需改造父列表。

无路径布局的语法示例（按需求选用；下例 `_layout.index.tsx` 接管 `/`，不能与原 `index.tsx` 同时保留）：

```tsx
// _layout.tsx
export const Route = createFileRoute('/_layout')({
  component: () => (<div><Outlet />{/* 共享壳 */}</div>),
})
// 文件名                    → route id                  → URL
// _layout.index.tsx         → '/_layout/'               → /
// _layout.posts.tsx         → '/_layout/posts'          → /posts
// _layout.posts_.$id.tsx    → '/_layout/posts_/$id'     → /posts/$id
// _layout.posts_.import.tsx → '/_layout/posts_/import'  → /posts/import
// <Link to="/posts/$id" params={{ id }} />  // 不要 to="/_layout/..."
```

- 涉及真实认证时按 `meoo-cloud-auth` 的 [认证路由接入顺序](../meoo-cloud-auth/references/auth-route-plan.md) 确定认证页与业务布局关系、导航职责及最小链路验证；本节维护通用文件路由规则。
- 新建多页结构或改动父子关系后，先完成布局与一个最小业务页，运行项目已有的 `pnpm run build`，核对生成的 `routeTree.gen.ts` 中路径与 `getParentRoute`，再展开其他业务页。普通页面内容修改无需重复这一步；最终完整构建仍保留。
- 构建日志出现 `Conflicting configuration paths` 等路由生成错误，即使 exitCode=0 或继续输出产物也视为未通过，先修复再继续。新增路径在预览中确认目标页面标识实际出现，不以 URL 改变代替成功；认证页面的访问与跳转验证按 `meoo-cloud-auth` 执行。
- 路由冲突先修文件命名、父布局和导航引用，复用已有页面正文，避免换一套路由名就整页重写。URL 已变但页面未出现时，先核对父路由的 `<Outlet />` 与 `getParentRoute`。

## 组件

使用预置 UI 组件前，按需读取 [组件关键注意点](references/ui-components.md) 中对应组件的说明。

- shadcn/ui：已预置在 `src/components/ui/`，直接 `import from "@/components/ui/{name}"` 使用
- **导出形式统一**：自建组件一律具名导出 `export function Xxx`，禁止 `export default`；import 侧一律 `import { Xxx } from './Xxx'`（与预置 shadcn 组件保持一致，避免 default/具名混用导致构建报 "default is not exported"）
- **紧耦合父子组件写同一个文件**：拖拽容器与其可拖拽/可点击子项、共享 pointer 捕获/ref/focus 的组件，把子组件直接 `function Child(){...}` 内联在父文件内，事件逻辑文件内闭环；不要为它们各拆一个文件再靠 props 层层传回调
- 扩展 shadcn：用 `cva` + `cn()`（`src/lib/utils.ts`）；禁止内联条件 class 堆砌
- 图标：`lucide-react`（已内置）
- **内嵌 iframe**：面向 iOS Safari 渲染大体积 HTML 时，建议将全文转成 Blob（`text/html;charset=utf-8`），通过 `URL.createObjectURL()` 作为 iframe 的 `src`，规避 `srcDoc` 大字符串传递的潜在兼容性问题；内容替换或组件卸载时用 `URL.revokeObjectURL()` 释放旧 URL，并在 iPhone Safari 真机验证。

## 移动端点击交互

**普通点击统一使用 React `onClick`，禁止为兼容移动端叠加 Touch 事件**——浏览器会为正常触摸合成 click；额外绑定 `onTouchStart` / `onTouchEnd` 容易重复触发、产生 ghost click，或因 `preventDefault()` 抑制 click。只有连续手势确实需要原始指针序列时才使用 Pointer Events。

| 风险位置 | 禁止或必查模式 | 后果与正确实现 |
|---------|---------------|---------------|
| 普通按钮、链接 | 同一元素同时绑定 `onClick` 与 `onTouchStart` / `onTouchEnd` | 可能重复触发或互相抑制；只保留 `onClick` |
| Touch / capture 监听器 | 无必要地调用 `preventDefault()` | 可能阻止浏览器合成 click；仅在必须阻止滚动/缩放时使用 |
| `html`、`body`、`#root`、`#app` 或共同祖先 | `pointer-events: none`、`inert`、全局禁用态 | 整棵应用树不可交互；禁用范围必须收窄到实际目标 |
| overlay、Drawer、Dialog 遮罩 | 隐藏后仍以高 `z-index` 或透明 `fixed inset-0` 层覆盖页面 | 会不可见地拦截点击；关闭后卸载，或切为 `pointer-events-none` |
| 交互回调与状态锁 | 回调未执行、锁未释放、状态只更新局部副本 | 点击事件存在但业务无结果；验证回调入口和最终状态归属 |

- **多个控件同时失效先查公共链路**：依次检查 console 与初始化/hydration、全屏覆盖层与 `z-index`、共同祖先的交互属性、capture/`preventDefault()`、回调与状态锁；最后才判断特定浏览器兼容性。禁止逐个控件重复补事件。

## 多语言（运行时语言切换）

需要切换语言时用 `i18next` + `react-i18next`：往 `package.json` 加 `"i18next": "^26.4.2"`、`"react-i18next": "^17.0.13"` 后 `pnpm install`。项目已有实现就复用，不要再建第二套。

- 文案放 `src/i18n/locales/<code>.json`，各语言语义覆盖一致，允许复数形式导致 key 集合不同；译文应准确，允许中日同形词等合法同文及设计上有意留白，不要为了字符串不同而改写正确译文；组件只用 `useTranslation()` 的 `t()` 取值，不 import locale JSON
- key 用英文语义分层（`checkout.submit`）；变量用 `{{name}}` 插值不要拼接；复数按目标语言规则配置（如英文 `_one`/`_other`），不强求各语言使用相同后缀；日期数字货币用 `Intl.*` 按当前语言格式化，不写死 `zh-CN`
- 语言选择要持久化并同步 `document.documentElement.lang`，切换入口只留一处；业务组件里不直接调 `i18n.changeLanguage()`（会漏持久化，刷新后语言回退）
- 易漏位置：表单校验消息、`src/lib/**` 与 `src/constants/**` 里的选项/表头/图例、条件分支的两个分支、弹窗、空态、`toast`、`aria-label`/`alt`/`document.title`

## Theme（运行时主题切换）

模板已内置 `next-themes`，根布局 `src/routes/__root.tsx` 的唯一 `ThemeProvider` 统一管理主题；组件用 `useTheme()` 的 `resolvedTheme` / `setTheme()` 读取和切换，旧项目复用已有实现。颜色使用 `bg-background`、`text-foreground` 等语义 token，覆盖整个组件；交付前确认主题切换、刷新记忆及改动完整性。

## 页内锚点导航

导航项与页面区块必须一一对应，**禁止悬空锚点**——`<a href="#x">` 找不到 `id="x"` 时浏览器只改 URL，不滚动也不报错，表现就是「点了完全没反应」；且同一组导航里「部分能点、部分点了没反应」极易被误判为交互正常而漏测。

- 写完导航后逐项核对：每个 `href="#x"` 都有唯一 `id="x"`，且该区块真实挂在 `index.tsx` 的渲染树内
- 没有对应区块的导航项：要么补出区块，要么删掉该项，禁止留下点击无结果的入口
- i18n 的 `nav.*` 文案以实际存在的区块为准，不要先编导航文案再倒推区块
- 固定导航栏（`fixed` + 已知高度）下，锚点区块加与导航等高的 `scroll-mt-*`（如 `h-16` → `scroll-mt-16`），否则落点标题被导航压住

## 拖拽实现（看板/列表排序/跨容器移动）

**统一用浏览器原生 HTML5 拖放 API，四件套缺一不可**——最常见的失败就是漏掉 `onDrop`，导致能拖起来但松手没反应：

| 位置 | 必需属性 | 作用 |
|------|---------|------|
| 被拖元素 | `draggable` | 允许拖动，缺了拖不起来 |
| 被拖元素 | `onDragStart` | 用 `e.dataTransfer.setData()` 写入被拖 id |
| 放置容器 | `onDragOver` + **必须 `e.preventDefault()`** | 不 preventDefault 则浏览器禁止放置，`onDrop` 永不触发 |
| 放置容器 | **`onDrop`** | 读 `e.dataTransfer.getData()` 并执行移动；**漏掉它拖拽必然无效** |

- **禁止与 pointer 方案混用**：不要同时写 `setPointerCapture` / `onPointerDown` 手搓拖拽。HTML5 `dragstart` 触发后浏览器已接管指针序列，pointer capture 会与之互相打断，两套都失效。拖拽二选一，看板/排序场景一律用 HTML5 拖放。
- **跨容器移动必须由共同父级持有状态**：被拖项在容器 A、放到容器 B，只有同时拥有 A/B 数据的父级（通常是页面）能完成移动。因此容器组件必须接收一个上报回调（如 `onMoveItem(itemId, toContainerId, toIndex)`）并在 `onDrop` 里调用；容器自己 setState 改不动别人的数据。
- 同容器内排序同理：`onDrop` 时算出目标 index 并通过回调上报。

## 样式写法

本脚手架用 Tailwind v4：`src/styles.css` 是唯一 design system，组件通过 theme utility 消费 token。

**标准路径**：用 `oklch` 定义语义变量 → `@theme inline` 映射为 `--color-*` / `--font-*` / `--radius-*` → 组件写 `bg-primary`、`text-foreground`、`from-energy` 这类 utility。新增颜色走同一路径；优先复用已有 shadcn token（`--background`、`--primary` 等）。

**色值套数**：
- 保留 `:root`（浅色）和 `.dark`（深色）两套语义变量及 dark variant。
- 固定深色或浅色通过现有 ThemeProvider 的 `forcedTheme` 选择，不删除另一套变量。

```css
/* src/styles.css — 定义 + 注册 */
:root { --energy: oklch(0.7 0.18 45); }
@theme inline { --color-energy: var(--energy); }
```

```tsx
/* 组件 — 只写 theme utility */
<div className="bg-energy text-primary-foreground from-energy to-primary" />
```

滚动入场用模板 `reveal` / `reveal-up` 等 class（见 `src/lib/reveal-engine.ts`）。

## 按需调试

遇到用户报告或已有证据确认的具体故障，需要进一步取证时，先 Read `skills/react-design/debug/debug.md`。普通开发和首页截图验收无需读取；该文档不属于开工必读文档。
