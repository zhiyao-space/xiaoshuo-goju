// 画风预设库：分组目录、正负提示词模板、默认参数、复制/排序/删除
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Copy, Plus, Save, Trash2, ChevronUp, ChevronDown, Wand2 } from 'lucide-react';
import { usePresets } from '@/lib/nai/useData';
import { SAMPLERS, SIZE_PRESETS, uid } from '@/lib/nai/types';
import type { StylePreset } from '@/lib/nai/types';
import { DEFAULT_NEGATIVE } from '@/lib/nai/translate';

const blankPreset = (): StylePreset => ({
  id: uid(),
  name: '',
  group: '默认分组',
  note: '',
  posTemplate: '{content}, masterpiece, best quality',
  negTemplate: DEFAULT_NEGATIVE,
  params: { width: 1216, height: 832, steps: 28, scale: 5, sampler: 'k_euler_ancestral' },
});

export const Route = createFileRoute('/styles')({ component: StylesPage });

function StylesPage() {
  const { presets, setPresets } = usePresets();
  const [editing, setEditing] = useState<StylePreset | null>(null);

  const groups = [...new Set(presets.map((p) => p.group || '默认分组'))];

  function save() {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error('请填写预设名称');
      return;
    }
    if (presets.some((p) => p.id === editing.id)) {
      setPresets(presets.map((p) => (p.id === editing.id ? editing : p)));
      toast.success('预设已更新');
    } else {
      setPresets([...presets, editing]);
      toast.success('预设已创建');
    }
    setEditing(null);
  }

  function move(p: StylePreset, dir: -1 | 1) {
    const idx = presets.findIndex((x) => x.id === p.id);
    const to = idx + dir;
    if (to < 0 || to >= presets.length) return;
    const arr = [...presets];
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    setPresets(arr);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">画风预设库</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            正向模板中可用 <code className="text-secondary">{'{content}'}</code> 占位片段描述；生成时与片段提示词自动拼接
          </p>
        </div>
        <Button className="glow-hover" onClick={() => setEditing(blankPreset())}>
          <Plus className="size-4" /> 新建预设
        </Button>
      </div>

      {/* 编辑器 */}
      {editing && (
        <Card className="border-primary">
          <CardContent className="space-y-4 py-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>名称</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="如：水彩轻纱" />
              </div>
              <div className="grid gap-1.5">
                <Label>分组目录</Label>
                <Input value={editing.group} onChange={(e) => setEditing({ ...editing, group: e.target.value })} placeholder="如：柔美系" list="preset-groups" />
                <datalist id="preset-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
              </div>
              <div className="grid gap-1.5">
                <Label>备注</Label>
                <Input value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} placeholder="适用场景说明" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>正向提示词模板</Label>
              <textarea className="min-h-20 rounded-md border border-input bg-input p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                value={editing.posTemplate} onChange={(e) => setEditing({ ...editing, posTemplate: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>负向提示词模板</Label>
              <textarea className="min-h-16 rounded-md border border-input bg-input p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                value={editing.negTemplate} onChange={(e) => setEditing({ ...editing, negTemplate: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-5">
              <div className="grid gap-1.5">
                <Label className="text-xs">尺寸</Label>
                <select className="h-9 rounded-md border border-input bg-input px-2 text-sm"
                  value={`${editing.params.width ?? 1216}x${editing.params.height ?? 832}`}
                  onChange={(e) => {
                    const [w, h] = e.target.value.split('x').map(Number);
                    setEditing({ ...editing, params: { ...editing.params, width: w, height: h } });
                  }}>
                  {SIZE_PRESETS.map((s) => <option key={s.label} value={`${s.w}x${s.h}`}>{s.label}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Steps</Label>
                <Input type="number" min={1} max={50} value={editing.params.steps ?? 28}
                  onChange={(e) => setEditing({ ...editing, params: { ...editing.params, steps: parseInt(e.target.value) || 28 } })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Scale</Label>
                <Input type="number" min={1} max={10} step={0.5} value={editing.params.scale ?? 5}
                  onChange={(e) => setEditing({ ...editing, params: { ...editing.params, scale: parseFloat(e.target.value) || 5 } })} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label className="text-xs">采样器</Label>
                <select className="h-9 rounded-md border border-input bg-input px-2 text-sm"
                  value={editing.params.sampler ?? 'k_euler_ancestral'}
                  onChange={(e) => setEditing({ ...editing, params: { ...editing.params, sampler: e.target.value } })}>
                  {SAMPLERS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="glow-hover" onClick={save}><Save className="size-4" /> 保存预设</Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 分组展示 */}
      {groups.map((g) => (
        <div key={g} className="space-y-3">
          <div className="flex items-center gap-2">
            <Wand2 className="size-4 text-primary" />
            <h2 className="font-display text-lg">{g}</h2>
            <Badge variant="outline" className="text-[11px]">{presets.filter((p) => (p.group || '默认分组') === g).length}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {presets.filter((p) => (p.group || '默认分组') === g).map((p) => (
              <Card key={p.id} className="reveal">
                <CardContent className="py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {p.params.width ?? '?'}×{p.params.height ?? '?'} · steps {p.params.steps ?? '—'} · scale {p.params.scale ?? '—'}
                    </span>
                  </div>
                  {p.note && <p className="mt-1 text-xs text-secondary">{p.note}</p>}
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{p.posTemplate}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>编辑</Button>
                    <Button size="sm" variant="outline" onClick={() => { setPresets([...presets, { ...p, id: uid(), name: `${p.name} 副本` }]); toast.success('已复制'); }}>
                      <Copy className="size-3.5" /> 复制
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => move(p, -1)}><ChevronUp className="size-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => move(p, 1)}><ChevronDown className="size-4" /></Button>
                    <Button size="sm" variant="ghost" className="ml-auto text-destructive"
                      onClick={() => { setPresets(presets.filter((x) => x.id !== p.id)); toast.success('已删除'); }}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {presets.length === 0 && !editing && (
        <p className="py-12 text-center text-sm text-muted-foreground">还没有画风预设，点右上角新建</p>
      )}
    </div>
  );
}
