# Web 调试

仅在用户报告或已有证据确认具体故障、需要进一步取证时阅读。普通开发与一次首页截图不需要展开调试；不能为确认“正常”遍历页面、表单、语言或存储。

先根据本轮错误、时间、最近用户操作确定待验证假设，选择最少取证动作。修改源码后按基础技能的交付要求让最新代码生效，再定点复现。不要通过修改运行中的 DOM、状态或存储伪装修复。只陈述实际验证范围，不能用编译通过代替交互/端侧实测。

优先结合最近用户操作、真实错误堆栈和相关源码定位，不凭空假设 SDK、云服务或目录结构。只有目标故障的相关复验通过，才能说“已修复”；不能以“应该可以”代替证据。Edit 失败先重新 Read 最新文件，再修改，不重复提交失败补丁。

本轮若为 diagnose_only，只诊断并给出依据与最小方案，不修改代码。多次修复未解决应重新确认根因，不重复同类补丁。错误已定位且相关复验完成即停止，不扩展回归；缺少运行环境/真实身份时如实说明未验证。

## 截图与通道

- 基础 `meoo-cli read-browser-screenshot --context "当前可见内容"` 固定优先用户当前预览 iframe，不可用时在同一次调用内自动降级沙箱浏览器首页；通道由平台选择，无需设置来源参数。
- 指定页面：`meoo-cli read-browser-screenshot --path "/dashboard" --context "具体异常"`；先尝试 iframe 的指定路由，失败后降级沙箱浏览器同一路由。
- 旧 `--source auto|preview|browser` 参数仅保留兼容，均不能跳过 iframe。iframe 截图前默认等待 1000 毫秒，可用 `--settle` 指定等待毫秒数。超过 5000 毫秒按 5000 执行；常规截图保持默认，不要逐张传最大等待值，负数按 0 执行。显式值在回退沙箱时也生效。动画定格通过 URL 指定场景、时刻和暂停状态。省略 `--h5` 时截 iframe 当前视口。显式传 `--h5=true`（手机）或 `--h5=false`（桌面）时，iframe 优先沿用对应模式；需要切换时临时调整布局，截图后恢复。回退沙箱时沿用指定模式。
- 用户 iframe 通道受平台能力开关限制；读结果中的 screenshot_source、实际 URL、fallback_reason，不假定两个通道的路由、登录态、state 相同。
- 首屏白屏/资源加载失败先看本次返回的错误，确需加载期日志时使用下方日志命令。图片已经交付而 page_state/verified 为空时直接看图，不为补齐字段追加 DOM/求值。

## 日志

日志只用于具体故障定位，不用于无故障时“确认正常”。

| 命令 | 数据源与用途 |
| --- | --- |
| `meoo-cli read-browser-logs --level error --lines 100` | 默认优先用户 iframe，拿不到自动降级；console、未捕获异常、网络错误；首屏加载问题可加 `--source browser` |
| `meoo-cli read-build-logs --level error --lines 100` | dev server 的 stdout/stderr、编译、启动、SSR，与运行日志面板同源 |

两者支持 `--grep <关键词>`、`--level error|warn|info`、`--lines N`，按问题缩小范围。已有错误足以定位时无需再读。日志不足时仅在可疑路径加最小临时日志，重新生效并复现后读取，修复后清理临时日志。

## 用户 iframe 定点取证

仅在预览通道可用时使用；不可用即停止该通道，不重试整套命令。以下命令不能操作降级后的沙箱页面。

| 命令 | 使用边界 |
| --- | --- |
| `meoo-cli read-preview-dom [--selector "CSS"] [--depth N]` | 读取相关节点摘要与源码定位；depth 默认 4，最多 200 节点；已知 selector 不必先扫 DOM |
| `meoo-cli preview-interact --action click|dblclick|hover|scroll|type|select|wait [--selector "CSS"] [--text "..."] [--delta-y N] [--index 0] [--settle-ms N] [--screenshot]` | 仅复现当前交互异常；click/dblclick/hover/type/select 必须给原生 CSS selector，不能用 :has-text()/:contains()/:text()；text 只用于 type/select；index 从 0 开始；默认沉降 300ms；需要视觉证据时加 screenshot |
| `meoo-cli preview-run-code --js "return document.title" [--await]` | 截图/DOM 无法回答时才只读求值；js 是带 return 的函数体，await 可等 Promise；禁止 value 赋值、dispatchEvent、click、location.reload、写 storage、改 DOM/样式 |

选择下拉项用 select，输入用 type，不能以点击下拉框代替选择。返回的 matched/actionApplied/mutationCount 是操作事实，不等于业务成功。修复必须改源码，build 或 reload 不替代 dev。

## 专题与测试

循环请求、429、CORS、HTML fallback 等按需读取 `skills/react-design/debug/runtime-issues.md`。用户明确要求自动化测试时使用 `meoo-auto-test`；魔法修复不自动升级为回归。
