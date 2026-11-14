// 小说文本页：导入、切分、备注、生图次数、合并/拆分/排序
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { GenImage } from '@/components/GenImage';
import { useNovels, usePresets } from '@/lib/nai/useData';
import { uid } from '@/lib/nai/types';
import type { Fragment, Novel } from '@/lib/nai/types';
import { ChevronDown, ChevronUp, FileText, Plus, Scissors, Trash2, Upload } from 'lucide-react';

export const Route = createFileRoute('/novel')({ component: NovelPage });

function NovelPage() {
  const { novels, setNovels, active, setActiveId } = useNovels();
  const { presets } = usePresets();
  const [importText, setImportText] = useState('');
  const [importTitle, setImportTitle] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function updateActive(fn: (n: Novel) => Novel) {
    if (!active) return;
    const next = novels.map((n) => (n.id === active.id ? { ...fn(n), updatedAt: new Date().toISOString() } : n));
    setNovels(next);
  }

  function importNovel() {
    const text = importText.trim();
    if (!text) {
      toast.error('请先粘贴小说文本');
      return;
    }
    const paras = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    if (paras.length === 0) {
      toast.error('未能识别到段落（请用空行分隔段落）');
      return;
    }
    const novel: Novel = {
      id: uid(),
      title: importTitle.trim() || `小说 ${new Date().toLocaleDateString('zh-CN')}`,
      updatedAt: new Date().toISOString(),
      fragments: paras.map((t) => ({
        id: uid(), text: t, note: '', autoCount: 1, presetId: null, selectedImageId: null,
      })),
    };
    setNovels([novel, ...novels]);
    setActiveId(novel.id);
    setImportText('');
    setImportTitle('');
    toast.success(`已导入并切分为 ${paras.length} 个片段`);
  }

  function importTxtFile(file: File) {
    void file.text().then((t) => {
      setImportText(t);
      if (!importTitle) setImportTitle(file.name.replace(/\.txt$/i, ''));
      toast.success('文件已读取，确认后点击导入');
    });
  }

  function updateFragment(fid: string, patch: Partial<Fragment>) {
    updateActive((n) => ({
      ...n,
      fragments: n.fragments.map((f) => (f.id === fid ? { ...f, ...patch } : f)),
    }));
  }

  function splitFragment(fid: string) {
    const f = active?.fragments.find((x) => x.id === fid);
    if (!f) return;
    const parts = f.text.split(/(?<=[。！？！？\n])/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) {
      toast.error('该片段没有可拆分的句子边界（。！？）');
      return;
    }
    updateActive((n) => ({
      ...n,
      fragments: n.fragments.flatMap((x) =>
        x.id !== fid ? [x] : parts.map((t) => ({ ...x, id: uid(), text: t, selectedImageId: null })),
      ),
    }));
    toast.success(`已拆分为 ${parts.length} 个片段`);
  }

  function mergeWithNext(fid: string) {
    if (!active) return;
    const idx = active.fragments.findIndex((f) => f.id === fid);
    if (idx < 0 || idx === active.fragments.length - 1) {
      toast.error('已是最后一个片段');
      return;
    }
    updateActive((n) => ({
      ...n,
      fragments: n.fragments.filter((_, i) => i !== idx + 1).map((f, i) =>
        i === idx ? { ...f, text: `${f.text}${f.text.endsWith('。') ? '' : '。'}${n.fragments[idx + 1].text}` } : f,
      ),
    }));
    toast.success('已合并下一个片段');
  }

  function moveFragment(fid: string, dir: -1 | 1) {
    if (!active) return;
    const idx = active.fragments.findIndex((f) => f.id === fid);
    const to = idx + dir;
    if (to < 0 || to >= active.fragments.length) return;
    const arr = [...active.fragments];
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    updateActive((n) => ({ ...n, fragments: arr }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">小说文本</h1>
          <p className="mt-1 text-sm text-muted-foreground">导入文本并按空行段落切分为片段，为每个片段设置备注与生图次数</p>
        </div>
        {novels.length > 0 && (
          <Select value={active?.id ?? ''} onValueChange={(v) => setActiveId(v)}>
            <SelectTrigger className="w-52"><SelectValue placeholder="选择小说" /></SelectTrigger>
            <SelectContent>
              {novels.map((n) => (
                <SelectItem key={n.id} value={n.id}>{n.title}（{n.fragments.length} 段）</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* 导入区 */}
      <Card className="border-dashed">
        <CardContent className="space-y-3 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <Input className="max-w-xs" value={importTitle} onChange={(e) => setImportTitle(e.target.value)} placeholder="小说标题（可选）" />
            <Button variant="outline" onClick={() => document.getElementById('novel-txt-input')?.click()}>
              <Upload className="size-4" /> 上传 txt
            </Button>
            <input id="novel-txt-input" type="file" accept=".txt,text/plain" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importTxtFile(f); e.target.value = ''; }} />
            <Button className="glow-hover ml-auto" onClick={importNovel}>
              <Plus className="size-4" /> 导入并切分
            </Button>
          </div>
          <textarea
            className="min-h-36 w-full rounded-md border border-input bg-input p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="粘贴小说全文……段落之间用空行分隔，导入时将自动切分为片段"
          />
        </CardContent>
      </Card>

      {/* 片段列表 */}
      {active && (
        <div className="space-y-3">
          <h2 className="font-display text-lg">{active.title} · 片段列表</h2>
          {active.fragments.map((f, i) => {
            const open = expandedId === f.id;
            const preset = presets.find((p) => p.id === f.presetId);
            return (
              <Card key={f.id} className="reveal">
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-7 shrink-0 rounded bg-muted text-center text-xs leading-7 text-muted-foreground">{i + 1}</span>
                    <GenImage imageId={f.selectedImageId} className="h-14 w-20 shrink-0 rounded object-cover" alt="片段配图" />
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setExpandedId(open ? null : f.id)}>
                      <p className={`text-sm leading-relaxed ${open ? '' : 'line-clamp-2'}`}>{f.text}</p>
                      {f.note && <p className="mt-1 text-xs text-secondary">备注：{f.note}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge variant="outline" className="text-[11px]">
                        {f.autoCount > 0 ? `自动 ${f.autoCount} 张` : '不生成'}
                      </Badge>
                      {preset && <Badge variant="outline" className="text-[11px] text-gold">{preset.name}</Badge>}
                    </div>
                  </div>

                  {open && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="grid gap-1.5">
                          <Label className="text-xs">备注</Label>
                          <Input value={f.note} onChange={(e) => updateFragment(f.id, { note: e.target.value })} placeholder="如：雨夜初遇场景" />
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs">自动生图次数</Label>
                          <Input type="number" min={0} max={4} value={f.autoCount}
                            onChange={(e) => updateFragment(f.id, { autoCount: Math.max(0, Math.min(4, parseInt(e.target.value) || 0)) })} />
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs">画风预设</Label>
                          <Select value={f.presetId ?? 'none'} onValueChange={(v) => updateFragment(f.id, { presetId: v === 'none' ? null : v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">不绑定</SelectItem>
                              {presets.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <textarea
                        className="min-h-24 w-full rounded-md border border-input bg-input p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                        value={f.text}
                        onChange={(e) => updateFragment(f.id, { text: e.target.value })}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => moveFragment(f.id, -1)}><ChevronUp className="size-4" /> 上移</Button>
                        <Button size="sm" variant="outline" onClick={() => moveFragment(f.id, 1)}><ChevronDown className="size-4" /> 下移</Button>
                        <Button size="sm" variant="outline" onClick={() => splitFragment(f.id)}><Scissors className="size-4" /> 按句拆分</Button>
                        <Button size="sm" variant="outline" onClick={() => mergeWithNext(f.id)}><FileText className="size-4" /> 合并下一段</Button>
                        <Button size="sm" variant="ghost" className="text-destructive ml-auto"
                          onClick={() => updateActive((n) => ({ ...n, fragments: n.fragments.filter((x) => x.id !== f.id) }))}>
                          <Trash2 className="size-4" /> 删除片段
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {active.fragments.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">还没有片段，先导入文本</p>
          )}
        </div>
      )}

      {!active && novels.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">先在上方导入一部小说</p>
      )}
    </div>
  );
}
