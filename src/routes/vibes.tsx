import { useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { loadVibes, saveVibes, type VibeItem } from '@/lib/nai';
import { exportVibesZip, importVibeFiles } from '@/lib/vibeZip';

export const Route = createFileRoute('/vibes')({
  component: VibePage,
});

function VibePage() {
  const [vibes, setVibes] = useState<VibeItem[]>(loadVibes);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const persist = (list: VibeItem[]) => {
    setVibes(list);
    saveVibes(list);
  };

  const update = (id: string, patch: Partial<VibeItem>) => {
    persist(vibes.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setMsg(null);
    try {
      const r = await importVibeFiles([...files]);
      setVibes(loadVibes());
      setMsg({ ok: true, text: `导入成功：${r.added} 条编码（${r.names.slice(0, 3).join('、')}${r.names.length > 3 ? '…' : ''}）` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '导入失败' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleExport = () => {
    if (!vibes.length) return;
    const blob = exportVibesZip(vibes);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vibe_bundle_${vibes.length}_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h2 className="seal-title text-2xl font-bold">Vibe 编码（画风风格库）</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          导入官方格式编码：打包 ZIP（内含多个 .naiv4vibe）、单个 .naiv4vibe 或 JSON 捆绑。编码直接进生成请求，导入即用、零成本。
        </p>
      </div>

      <label
        className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-card p-8 text-center transition-colors hover:border-primary"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".zip,.naiv4vibe,.naivibe,.json"
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <span className="text-3xl">📥</span>
        <span className="text-sm font-medium">点击或拖入 vibe 编码文件</span>
        <span className="text-xs text-muted-foreground">支持 .zip / .naiv4vibe / .json，可多选</span>
      </label>

      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? 'text-emerald-400' : 'text-destructive'}`}>{msg.text}</p>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          已导入 {vibes.length} 条编码
        </h3>
        {vibes.length > 0 && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleExport}>
              导出 ZIP
            </Button>
            <Button variant="destructive" size="sm" onClick={() => persist([])}>
              清空
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {vibes.length === 0 && (
          <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            还没有 vibe 编码。导入后生成时会自动注入 reference_image_multiple。
          </p>
        )}
        {vibes.map((v) => (
          <div key={v.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-accent text-accent">Vibe 编码</Badge>
              <span className="truncate text-sm font-medium">{v.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                编码 {(v.encoded.length / 1024).toFixed(0)} KB
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => persist(vibes.filter((x) => x.id !== v.id))}
              >
                删除
              </Button>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs text-muted-foreground">
                信息提取强度 {v.infoExtracted.toFixed(2)}
                <Slider
                  min={0} max={1} step={0.05}
                  value={[v.infoExtracted]}
                  onValueChange={([x]) => update(v.id, { infoExtracted: x })}
                />
              </label>
              <label className="space-y-1.5 text-xs text-muted-foreground">
                参考强度 {v.strength.toFixed(2)}
                <Slider
                  min={0} max={1} step={0.05}
                  value={[v.strength]}
                  onValueChange={([x]) => update(v.id, { strength: x })}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
