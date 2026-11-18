import { useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { SIZE_PRESETS, generateImage, loadApi, loadGallery, loadVibes, saveGallery, translateZhToEn, type GalleryItem } from '@/lib/nai';

export const Route = createFileRoute('/')({
  component: Workbench,
});

function Workbench() {
  const [zh, setZh] = useState('');
  const [prompt, setPrompt] = useState('');
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [sizeIdx, setSizeIdx] = useState(0);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gallery, setGallery] = useState<GalleryItem[]>(loadGallery);
  const abortRef = useRef<AbortController | null>(null);

  const cfg = loadApi();
  const vibes = loadVibes();
  const size = SIZE_PRESETS[sizeIdx];

  const handleTranslate = () => {
    const r = translateZhToEn(zh);
    const extra = prompt.includes('masterpiece') ? '' : ', masterpiece, best quality, extremely detailed';
    setPrompt(r.result ? r.result + extra : prompt);
    setUnmatched(r.unmatched);
  };

  const handleGenerate = async () => {
    if (!cfg.base || !cfg.key) {
      setError('请先在「API 配置」填写中转站地址与 Key');
      return;
    }
    if (!prompt.trim()) {
      setError('请先填写或转译出画面描述');
      return;
    }
    setError('');
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const uris = await generateImage(cfg, {
        prompt,
        width: size.w,
        height: size.h,
        vibes: vibes.filter((v) => selectedVibes.includes(v.id)),
      }, ac.signal);
      const items: GalleryItem[] = uris.map((dataUri, i) => ({
        id: crypto.randomUUID(),
        dataUri,
        prompt,
        zh,
        width: size.w,
        height: size.h,
        time: Date.now() + i,
      }));
      const next = [...items, ...loadGallery()].slice(0, 24);
      setGallery(next);
      saveGallery(next);
    } catch (e) {
      if ((e as Error).name === 'AbortError') setError('已取消本次生成');
      else setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const removeItem = (id: string) => {
    const next = gallery.filter((g) => g.id !== id);
    setGallery(next);
    saveGallery(next);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* 左：片段描述 + 提示词 */}
        <section className="space-y-5">
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="seal-title mb-2 text-lg font-bold">小说片段描述</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              粘贴或摘写片段的画面内容，转译为英文提示词（绘画模型不支持中文）。
            </p>
            <Textarea
              rows={5}
              placeholder="例：月光下的樱花庭院，白衣少女回眸，长发飘落的花瓣，逆光，梦幻"
              value={zh}
              onChange={(e) => setZh(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button onClick={handleTranslate}>转译为英文提示词 →</Button>
              {unmatched.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  词典未覆盖：<span className="text-accent">{unmatched.join('、')}</span>（请在下方手动补充）
                </span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="seal-title mb-2 text-lg font-bold">英文提示词</h2>
            <Textarea
              rows={4}
              className="font-mono text-sm"
              placeholder="1girl, white kimono, moonlight, cherry blossoms, ..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              负面提示词与采样参数在 <Link to="/api" className="text-primary underline underline-offset-4">API 配置</Link> 中设置。
            </p>
          </div>

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </section>

        {/* 右：尺寸 / vibe / 生成 */}
        <aside className="space-y-5">
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-medium">画面尺寸</h3>
            <div className="grid grid-cols-2 gap-2">
              {SIZE_PRESETS.map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => setSizeIdx(i)}
                  className={`rounded border px-3 py-2 text-left text-xs transition-colors ${
                    i === sizeIdx
                      ? 'border-primary bg-primary/15 text-foreground'
                      : 'border-border text-muted-foreground hover:border-muted-foreground'
                  }`}
                >
                  <span className="block font-medium">{s.label}</span>
                  <span className="font-mono">{s.w}×{s.h}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-medium">
              Vibe 画风 <Link to="/vibes" className="ml-1 text-xs text-primary underline underline-offset-4">管理 →</Link>
            </h3>
            {vibes.length === 0 ? (
              <p className="text-xs text-muted-foreground">尚未导入 vibe 编码，可不启用直接生图。</p>
            ) : (
              <div className="space-y-2">
                {vibes.map((v) => {
                  const on = selectedVibes.includes(v.id);
                  return (
                    <button
                      key={v.id}
                      onClick={() =>
                        setSelectedVibes((s) => (on ? s.filter((x) => x !== v.id) : [...s, v.id]))
                      }
                      className={`flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-xs transition-colors ${
                        on ? 'border-primary bg-primary/15' : 'border-border text-muted-foreground'
                      }`}
                    >
                      <Badge variant="outline" className="border-accent text-accent">编码</Badge>
                      <span className="truncate">{v.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" size="lg" onClick={handleGenerate} disabled={busy}>
              {busy ? '生成中…' : '生 成'}
            </Button>
            {busy && (
              <Button variant="secondary" size="lg" onClick={() => abortRef.current?.abort()}>
                停止
              </Button>
            )}
          </div>
        </aside>
      </div>

      {/* 生成历史 */}
      <section className="mt-10">
        <h2 className="seal-title mb-3 text-lg font-bold">生成结果</h2>
        {gallery.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            还没有生成记录
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.map((g) => (
              <figure key={g.id} className="group relative overflow-hidden rounded-lg border border-border bg-card">
                <img src={g.dataUri} alt={g.zh || g.prompt} className="w-full" loading="lazy" />
                <figcaption className="absolute inset-x-0 bottom-0 hidden bg-black/70 p-2 text-[10px] leading-tight text-white group-hover:block">
                  {g.prompt.slice(0, 80)}
                  <button
                    className="absolute right-2 top-2 rounded bg-destructive px-2 py-0.5 text-white"
                    onClick={() => removeItem(g.id)}
                  >
                    删除
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
