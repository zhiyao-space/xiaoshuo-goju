# AGENTS.md

## Dependencies
- 无新增第三方依赖：ZIP 解析/打包为零依赖手写实现（EOCD 中央目录解析 + DecompressionStream('deflate-raw') 解压；导出用 store 不压缩手写打包）

## Architecture
- 纯前端应用，所有配置与数据存 localStorage（`inkan.api.v2` / `inkan.vibes.v2` / `inkan.gallery.v2`），无后端
- `src/lib/nai.ts`：生图核心——API 配置模型、NovelAI 尺寸预设、中英 tag 词典转译（translateZhToEn）、生成 payload 构建（vibe 注入 `reference_image_multiple` 等平行数组）、OpenAI Chat 兼容生图请求（参数 JSON 作为 message content 发往中转站 /chat/completions，响应中正则提取 data:image dataUri）
- `src/lib/vibeZip.ts`：vibe 编码导入分流（.zip → 遍历 .naiv4vibe/.json 条目；.naiv4vibe / .json 捆绑直接解析），data 字段兼容 data/encoded/image 三种命名；导出为官方 Export as Encodings 同款 ZIP（每条一个 .naiv4vibe，store 打包）
- 路由：`/` 片段生图工作台、`/vibes` vibe 编码管理、`/api` 生图 API 配置

## Lessons
- 生成图片只能存 dataUri 于 localStorage，上限 24 张防止配额溢出
- 用户未开通 Meoo Cloud 时，中文转译用本地词典方案（继承原项目 nai.js 的 DICT），未覆盖词会回显提示手动补充
