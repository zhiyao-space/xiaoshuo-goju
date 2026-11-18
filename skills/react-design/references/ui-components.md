# UI 组件关键注意点

以项目实际组件文件和导出为准，不猜 API、不重复安装预置组件。

## Sonner

- `Toaster` 从 `@/components/ui/sonner` 导入，`toast` 从 `sonner` 导入；不要混用其他通知库的 `useToast`。
- 全应用共用的 `<Toaster />` 只挂载一次，放在登录页与业务页共用的根布局中，位于其所需的主题等 Provider 内、各认证守卫外；有组件文件不代表已挂载。
- 不放在 `AuthGate`、`AuthEntryGate` 的子树、仅登录后渲染的后台 Shell 或单个业务页面内，避免未登录时没有提示容器，或退出／切换路由时被卸载。仅移到后台布局的 Gate 外仍不够，独立登录路由也必须共享该挂载点。
- 新增守卫、拆分布局或修复提示不显示时，先搜索现有 `Toaster` 的实际挂载点，检查祖先的条件渲染和路由覆盖范围，迁移或复用已有实例；不要在登录页再补一个。公共根布局中可将 `<Outlet />` 与 `<Toaster />` 作为兄弟节点，认证守卫放在对应子路由内。
- 涉及挂载位置的修改后，验证未登录时的失败提示、登录跳转后的提示，以及退出回到登录页后的提示均可见且不重复；提示信息用受控内容验证，不依赖真实密码或验证码。
- 先检查业务结果再提示成功。`toast.promise` 不识别 resolve 返回的 `{ error }` 或 `{ success: false }`。
- `toast.loading` 必须在成功和失败时更新或关闭；需要用户修正的错误保留在表单中，toast 只作补充，不展示原始错误或敏感信息。

## Button / Dialog

- 表单内非提交按钮显式写 `type="button"`；Button 加载态用 `disabled`，没有内置 `loading` 属性。
- Trigger 包裹 Button 时用 `asChild`，避免按钮嵌套；子组件须透传 props 和 ref。
- Dialog 提供 Title；异步提交成功后再关闭，失败保留输入和提示，不让 DialogClose / AlertDialogAction 提前关闭。

## Select / Checkbox / Switch

- Select 使用 `value / onValueChange`，回调直接接收值，不是 DOM event；SelectItem 不使用空字符串 value。
- Checkbox / Switch 使用 `checked / onCheckedChange`；Checkbox 映射二态布尔值时用 `checked === true`。

## Form

- 预置 Form 是 FormProvider，仍需原生 `<form onSubmit={...}>`。
- FormLabel / FormControl / FormMessage 必须处于 Form、FormField、FormItem 的对应上下文中，不能独立使用。
