// 生图工坊：选片段 → 提示词（中文翻译）→ 参数/Vibe → 生成预览 → 批量生成
import { useEffect, useMemo, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GenImage } from '@/components/GenImage';
import { ParamForm } from '@/components/studio/ParamForm';
import { VibePanel } from '@/components/studio/VibePanel';
import { useApiConfigs, useImages, useNovels, usePresets } from '@/lib/nai/useData';
import { buildPrompts, generateImage, translateViaEndpoint } from '@/lib/nai/client';
import { translateZhToEn, hasChinese, DEFAULT_NEGATIVE } from '@/lib/nai/translate';
import { saveImageBlob, loadImages } from '@/lib/nai/storage';
import { uid } from '@/lib/nai/types';
import type { GenParams, ImageMeta, ReferenceSettings } from '@/lib/nai/types';
import { Languages, Sparkles, Wand2, X } from 'lucide-react';

const defaultParams: GenParams = { width: 1216, height: 832, steps: 28, scale: 5, sampler: 'k_euler_ancestral', seed: null, count: 2 };
const defaultRef: ReferenceSettings = { mode: 'none', imageId: null, strength: 0.6, information: 0.6, refType: 'character', fidelity: 0.6 };

export const Route = createFileRoute('/studio')({ component: StudioPage });

function StudioPage() {
  const { active: cfg } = useApiConfigs();
  const { active: novel, setNovels, novels } = useNovels();
  const { presets } = usePresets();
  const { images, setImages } = useImages();

  const [fragId, setFragId] = useState<string | null>(null);
  const fragment = novel?.fragments.find((f) => f.id === fragId) ?? novel?.fragments[0] ?? null;
  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState(DEFAULT_NEGATIVE);
  const [params, setParams] = useState<GenParams>(defaultParams);
  const [reference, setReference] = useState<ReferenceSettings>(defaultRef);
  const [presetId, setPresetId] = useState<string>('none');
  const [generating, setGenerating] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);

  // 切换片段时初始化提示词
  useEffect(() => {
    if (fragment) {
      setPrompt(fragment.text.slice(0, 400));
      setPresetId(fragment.presetId ?? 'none');
      setResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fragment?.id]);

  // PNG 元数据导入回填提示词
  useEffect(() => {
    const handler = (e: Event) => {
      const meta = (e as CustomEvent<{ prompt?: string; negative?: string }>).detail;
      if (meta.prompt) setPrompt(meta.prompt);
      if (meta.negative) setNegative(meta.negative);
    };
    window.addEventListener('nai-import-meta', handler);
    return () => window.removeEventListener('nai-import-meta', handler);
  }, []);

  const preset = presets.find((p) => p.id === presetId) ?? null;
  const finalPrompts = useMemo(
    () => buildPrompts({ fragmentPrompt: prompt, preset, negExtra: negative }),
    [prompt, preset, negative],
  );

  async function doTranslate() {
    if (!prompt.trim()) return;
    if (!hasChinese(prompt)) {
      toast.info('提示词已是英文，无需翻译');
      return;
    }
    if (cfg?.translateEndpoint) {
      try {
        const out = await translateViaEndpoint(cfg, prompt);
        setPrompt(out);
        setUnmatched([]);
        toast.success('已通过翻译端点转为英文');
        return;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '翻译端点调用失败，改用内置词典');
      }
    }
    const r = translateZhToEn(prompt);
    setPrompt(r.result);
    setUnmatched(r.unmatched);
    if (r.unmatched.length > 0) {
      toast.warning(`词典未覆盖 ${r.unmatched.length} 个字词，已保留原文，建议手动检查`);
    } else {
      toast.success('已用内置词典转为英文 tag');
    }
  }

  async function runOnce(fragText: string, fragId: string, usePreset: typeof preset, seedOverride: number | null): Promise<string[]> {
    if (!cfg) throw new Error('请先在「API 配置」页添加并启用一条线路');
    const prompts = buildPrompts({ fragmentPrompt: fragText, preset: usePreset, negExtra: negative });
    const ids: string[] = [];
    for (let i = 0; i < params.count; i++) {
      const genParams: GenParams = { ...params, seed: seedOverride ?? params.seed ?? Math.floor(Math.random() * 1e9) };
      const { images: blobs } = await generateImage(cfg, {
        prompt: prompts.prompt,
        negative: prompts.negative,
        params: genParams,
        reference,
        referenceDataUri: reference.mode !== 'none' ? reference.imageId : null,
      });
      for (const blob of blobs) {
        const id = uid();
        await saveImageBlob(id, blob);
        metas.push({
          id,
          novelId: novel?.id ?? '',
          fragmentId: fragId,
          prompt: prompts.prompt,
          negative: prompts.negative,
          params: genParams,
          createdAt: new Date().toISOString(),
        });
        ids.push(id);
      }
    }
    if (metas.length > 0) setImages([...loadImages(), ...metas]);
    return ids;
  }

  const metas: ImageMeta[] = [];

  async function generate() {
    if (!cfg) {
      toast.error('请先配置 API 线路');
      return;
    }
    if (!prompt.trim() && !preset?.posTemplate) {
      toast.error('请填写画面提示词');
      return;
    }
    setGenerating(true);
    try {
      const ids = await runOnce(prompt, fragment?.id ?? '', preset, null);
      setResults(ids);
      toast.success(`生成完成，共 ${ids.length} 张`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  }

  async function batchGenerate() {
    if (!novel) {
      toast.error('请先在「小说文本」导入小说');
      return;
    }
    const targets = novel.fragments.filter((f) => f.autoCount > 0);
    if (targets.length === 0) {
      toast.error('没有设置自动生图次数 > 0 的片段');
      return;
    }
    setBatchRunning(true);
    let done = 0;
    const failures: string[] = [];
    for (const f of targets) {
      for (let i = 0; i < f.autoCount; i++) {
        try {
          const p = presets.find((x) => x.id === f.presetId) ?? null;
          const ids = await runOnce(f.text, f.id, p, null);
          if (i === 0 && f.id === fragment?.id) setResults(ids);
          done++;
        } catch {
          failures.push(`片段 ${f.text.slice(0, 12)}…`);
        }
      }
    }
    setBatchRunning(false);
    if (failures.length === 0) toast.success(`批量生成完成：${done} 张`);
    else toast.error(`完成 ${done} 张，失败：${failures.join('、')}`);
  }

  function setMainImage(imageId: string) {
    if (!novel || !fragment) return;
    setNovels(
      novels.map((n) =>
        n.id === novel.id
          ? { ...n, fragments: n.fragments.map((f) => (f.id === fragment.id ? { ...f, selectedImageId: imageId } : f)) }
          : n,
      ),
    );
    toast.success('已设为该片段主图');
  }

  function removeResult(id: string) {
    setResults(results.filter((r) => r !== id));
  }

  if (novels.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          还没有小说，先到 <Link to="/novel" className="story-link text-primary">小说文本</Link> 导入一段文字
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">生图工坊</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cfg ? `当前线路：${cfg.name}` : <Link to="/api-settings" className="story-link text-primary">尚未配置 API，点击前往配置</Link>}
          </p>
        </div>
        <Button variant="secondary" disabled={batchRunning || generating} onClick={() => void batchGenerate()}>
          <Sparkles className="size-4" /> {batchRunning ? '批量生成中…' : '整篇批量生图'}
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* 左：片段 + 提示词 */}
        <div className="space-y-4 lg:col-span-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">选择片段（{novel?.title}）</Label>
            <Select value={fragment?.id ?? ''} onValueChange={setFragId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {novel?.fragments.map((f, i) => (
                  <SelectItem key={f.id} value={f.id}>{i + 1}. {f.text.slice(0, 24)}…</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fragment?.note && <p className="text-xs text-secondary">备注：{fragment.note}</p>}
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">画面提示词（正向）</Label>
              <Button size="sm" variant="outline" onClick={() => void doTranslate()}>
                <Languages className="size-3.5" /> 中文 → 英文
              </Button>
            </div>
            <textarea
              className="min-h-24 rounded-md border border-input bg-input p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述画面，如：夜色下的竹林，少女持灯笼回望，柔和月光"
            />
            {unmatched.length > 0 && (
              <p className="text-[11px] text-destructive">词典未覆盖：{unmatched.join(' ')}</p>
            )}
            {preset && (
              <p className="text-[11px] text-muted-foreground">
                拼接画风「{preset.name}」后：<span className="text-secondary">{finalPrompts.prompt.slice(0, 120)}…</span>
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">画风预设</Label>
            <Select value={presetId} onValueChange={setPresetId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不使用</SelectItem>
                {presets.map((p) => <SelectItem key={p.id} value={p.id}>{p.group} / {p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">负向提示词</Label>
            <textarea
              className="min-h-16 rounded-md border border-input bg-input p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              value={negative}
              onChange={(e) => setNegative(e.target.value)}
            />
          </div>

          <Button className="glow-hover w-full" disabled={generating || batchRunning} onClick={() => void generate()}>
            <Wand2 className="size-4" /> {generating ? '生成中…' : `生成 ${params.count} 张预览图`}
          </Button>

          {/* 预览网格 */}
          {results.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {results.map((id) => (
                <div key={id} className="group relative">
                  <GenImage imageId={id} className="aspect-[3/2] w-full rounded object-cover" alt="预览" />
                  <div className="absolute inset-x-0 bottom-0 flex justify-between p-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="sm" variant="secondary" className="h-6 text-[11px]" onClick={() => setMainImage(id)}>设为主图</Button>
                    <button className="rounded-full bg-destructive/90 p-1" onClick={() => removeResult(id)} aria-label="移除">
                      <X className="size-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右：参数 */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="py-4">
              <h3 className="mb-3 font-display text-sm font-medium">生成参数</h3>
              <ParamForm params={params} onChange={setParams} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <h3 className="mb-3 font-display text-sm font-medium">参考图（氛围转移 / 精准参考）</h3>
              <VibePanel settings={reference} onChange={setReference} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
