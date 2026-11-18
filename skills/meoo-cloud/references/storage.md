# 文件存储

> **强制：** 业务前端的普通上传、下载、删除和 URL 获取必须使用平台生成的 `supabase.storage`。禁止裸 `fetch` / `axios` / `Taro.request` 请求 `/storage/v1`；始终禁止重新 `createClient()`。

## 创建存储桶

通过 SQL 迁移创建存储桶：

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES (gen_random_uuid(), 'avatars', true);
```

## Bucket ID 获取与使用

创建 bucket 后，或排查存量桶时，通过当前项目环境的只读查询取得实际 ID：

```bash
meoo-cli cloud query --sql "SELECT id, name, public FROM storage.buckets WHERE name = 'avatars'"
```

```typescript
const BUCKET_ID = '<上方查询返回的 storage.buckets.id>';
```

上传、下载、删除、签名和 `getPublicUrl()` 中的桶标识均使用 `storage.buckets.id`；平台实例通常使用 UUID，不能把显示名称 `name` 当作 ID。只有查询确认二者相同，名称字符串才恰好可用。上传和访问 URL 必须使用同一 ID；不同环境分别核对，不复制另一个实例的 ID。

前端运行时不能用 `supabase.from('storage.buckets')` 查系统表，也不能为了修复报错重建已有桶或改写生成 Client。Web 上传 service 的 `bucket` 参数同样传实际 ID。

默认 `upsert:false`；仅业务明确需要覆盖且具备对应 SELECT/UPDATE 策略时才开启。上传故障先读 [分层排查](troubleshooting.md#上传故障先确认请求阶段)，不要把所有 400 归因为上传体格式。

## 关键上传方法


### React 对象存储附件上传

附件需要真实持久化或按需访问时加载 `file-upload`。新项目使用注入的 `src/features/file-upload/index.ts`；资源/权限配置按需 Read `skills/file-upload/references/cloud-setup.md`，错误按需 Read `skills/file-upload/references/troubleshooting.md`。解析 Excel/CSV/SQLite 内容并写入业务表使用 `data-batch-upload`。

平台生成的 `src/supabase/client.ts` 是唯一 Client 来源。核心只需要 `supabase` 和 `bucket`，不要修改生成文件、读取或猜测环境变量、复制 key、硬编码域名或自行 `createClient()`。`ownership:'user'` 时核心默认生成 `users/<uid>/` 路径；Storage RLS 和业务父对象授权仍由应用/Cloud 配置负责。

- 默认保留原始字节；不大于 50 MiB 的最终字节由核心使用 `supabase.storage` SDK 和 `ArrayBuffer` 上传，使用 `upsert:false`。超过 50 MiB 的文件由核心拒绝并返回 `FILE_TOO_LARGE`，页面应展示实际产品限制。
- 浏览器启动异步上传前保存 `Array.from(event.currentTarget.files ?? [])` 快照，清空 `input.value` 后只使用快照。业务页面在 `try/catch/finally` 中恢复 busy 状态并展示 `FileUploadError`。
- 私有内容配置 `visibility:'private'` 与 `ownership:'user'`。上传返回稳定引用，访问时调用 `service.getAccessUrl(ref, { download?, expiresIn? })`；签名失败不得回退 `getPublicUrl`，也不要保存短链。
- 上传成功后由业务 API 保存完整引用并真实回读。父对象授权、业务关联、列表和关联失败重试属于应用层；关联失败只重试保存，不重新上传。`resultUnknown:true` 时保留引用并先核验，不自动重传或删除。
- 普通上传和访问继续使用生成 Client 的 `supabase.storage`；页面不得另写 `/storage/v1` 请求或实现认证和清理逻辑。

所有上传错误必须在页面中可见。文件上传保持在浏览器前端执行，不在 Edge Functions 中搬运文件字节。






## 存储 RLS 策略

以下示例按名称查询当前环境的实际 ID；需先允许对应角色读取该桶的元数据。公开桶不会自动允许上传，按业务身份选择匿名或登录上传策略，不盲目重跑到已有环境。

```sql
CREATE POLICY clients_select_avatars_bucket ON storage.buckets
FOR SELECT TO anon, authenticated
USING (name = 'avatars');

CREATE POLICY anon_select_avatars ON storage.objects
FOR SELECT TO anon, authenticated
USING (bucket_id = (SELECT id FROM storage.buckets WHERE name = 'avatars'));

-- 无登录上传场景使用此策略
CREATE POLICY anon_insert_avatars ON storage.objects
FOR INSERT TO anon
WITH CHECK (bucket_id = (SELECT id FROM storage.buckets WHERE name = 'avatars'));

-- 需要登录上传时使用此策略；仅两种身份都需要上传才同时创建
CREATE POLICY users_insert_avatars ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = (SELECT id FROM storage.buckets WHERE name = 'avatars'));
```

## Edge Functions 存储限制


**重要**：存储操作应在前端执行，而非 Edge Functions。Edge Functions 使用私有网络 URL，无法提供文件的公开访问。



## 存储模式限制

不要在 `storage` 模式中执行以下操作：
- 创建自定义表或函数
- 删除现有表或函数
- 在现有存储表上创建索引
- 对 `storage.migrations` 执行破坏性操作

管理文件访问请在 `public` 模式中创建辅助函数。
