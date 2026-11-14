# AGENTS.md

## Dependencies
- sonner：Toast 提示（表单校验、生成结果反馈）

## Architecture
- 纯前端本地应用，无后端：数据存 localStorage（`goju-nai:` 前缀，元数据），生成图 Blob 存 IndexedDB（库 `goju-nai-images`）
- 核心库 `src/lib/nai/`：types（共享契约）、storage（localStorage + IndexedDB + 备份导入导出）、client（空悲切 OpenAI Chat 兼容生图协议，消息体为参数 JSON，从响应解析 Markdown Data URI 图片）、translate（内置中文→英文 tag 词典）、metadata（PNG tEXt/iTXt chunk 解析 NovelAI 参数）、useData（页面级 Hook）
- 页面 `src/routes/`：/ 图文流、/novel 片段管理、/studio 生图工坊、/styles 画风预设、/gallery 图库、/api-settings API 配置
- 生图子组件 `src/components/studio/`（ParamForm、VibePanel），PNG 元数据导入通过 window CustomEvent `nai-import-meta` 回填提示词

## Lessons
- 云服务 init 被用户取消后按纯前端交付：删除了平台预拷贝的 features 模板（引用不存在的 @/supabase/client，会破坏 typecheck）
- TanStack Router 路由文件必须导出 `Route = createFileRoute(...)`，仅导出组件不会被纳入路由树（build 有 warning）
- 空悲切线路的生图走 OpenAI Chat 兼容端点：浏览器直连依赖线路 CORS，连接测试需对 CORS 失败给出明确提示
