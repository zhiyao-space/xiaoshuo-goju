// 生图参数表单：尺寸/步数/引导度/采样器/seed/生成次数 + PNG 元数据导入
import { useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload } from 'lucide-react';
import { SAMPLERS, SIZE_PRESETS } from '@/lib/nai/types';
import type { GenParams } from '@/lib/nai/types';
import { fileToBytes, metadataToParams, parseNovelAiMetadata } from '@/lib/nai/metadata';

export function ParamForm({
  params,
  onChange,
}: {
  params: GenParams;
  onChange: (p: GenParams) => void;
}) {
  const pngRef = useRef<HTMLInputElement>(null);

  async function importPng(file: File) {
    const meta = parseNovelAiMetadata(await fileToBytes(file));
    if (!meta) {
      toast.error('未在该 PNG 中识别到 NovelAI 参数元数据');
      return;
    }
    const patch = metadataToParams(meta);
    onChange({ ...params, ...patch });
    if (meta.prompt) {
      window.dispatchEvent(new CustomEvent('nai-import-meta', { detail: meta }));
      toast.success('已识别参数元数据并回填（提示词请查看控制台/预览区）');
    } else {
      toast.success('已回填图片参数');
    }
    // 回填提示词到提示词区（由 Studio 监听）
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">尺寸预设</Label>
          <select
            className="h-9 rounded-md border border-input bg-input px-2 text-sm"
            value={`${params.width}x${params.height}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number);
              onChange({ ...params, width: w, height: h });
            }}
          >
            {SIZE_PRESETS.map((s) => (
              <option key={s.label} value={`${s.w}x${s.h}`}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">迭代步数 Steps</Label>
          <Input type="number" min={1} max={50} value={params.steps}
            onChange={(e) => onChange({ ...params, steps: Math.max(1, parseInt(e.target.value) || 28) })} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">引导强度 Scale</Label>
          <Input type="number" min={1} max={10} step={0.5} value={params.scale}
            onChange={(e) => onChange({ ...params, scale: Math.max(1, parseFloat(e.target.value) || 5) })} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">采样器</Label>
          <select className="h-9 rounded-md border border-input bg-input px-2 text-sm"
            value={params.sampler}
            onChange={(e) => onChange({ ...params, sampler: e.target.value })}>
            {SAMPLERS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">随机种子 Seed（空=随机）</Label>
          <Input type="number" value={params.seed ?? ''}
            onChange={(e) => onChange({ ...params, seed: e.target.value === '' ? null : parseInt(e.target.value) })}
            placeholder="随机" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">单次生成张数</Label>
          <Input type="number" min={1} max={4} value={params.count}
            onChange={(e) => onChange({ ...params, count: Math.max(1, Math.min(4, parseInt(e.target.value) || 1) ) })} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => pngRef.current?.click()}>
          <Upload className="size-3.5" /> 从 NAI PNG 导入参数
        </Button>
        <input ref={pngRef} type="file" accept="image/png" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importPng(f);
            e.target.value = '';
          }} />
        <span className="text-[11px] text-muted-foreground">识别 NovelAI PNG 元数据，自动回填提示词与参数</span>
      </div>
    </div>
  );
}
