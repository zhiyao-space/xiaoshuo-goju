// API 配置页：多套空悲切线路配置、连接测试、备份导出/导入
import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Download, Plus, Trash2, Upload, XCircle } from 'lucide-react';
import { useApiConfigs } from '@/lib/nai/useData';
import { testConnection } from '@/lib/nai/client';
import type { ApiConfig } from '@/lib/nai/types';
import { uid } from '@/lib/nai/types';
import { exportAllWithImages, importAllWithImages } from '@/lib/nai/storage';

const emptyForm = { name: '', baseUrl: '', apiKey: '', model: 'nai-diffusion-4-5-full', translateEndpoint: '', translateModel: '' };

export const Route = createFileRoute('/api-settings')({ component: ApiSettingsPage });

function ApiSettingsPage() {
  const { configs, setConfigs, activeId, setActive } = useApiConfigs();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const maskKey = (k: string) => (k.length > 8 ? `${k.slice(0, 5)}••••${k.slice(-4)}` : '••••');

  function save() {
    if (!form.name.trim() || !form.baseUrl.trim() || !form.apiKey.trim()) {
      toast.error('名称、线路地址和 API Key 为必填项');
      return;
    }
    if (editingId) {
      setConfigs(configs.map((c) => (c.id === editingId ? { ...c, ...form } : c)));
      toast.success('配置已更新');
    } else {
      const cfg: ApiConfig = { id: uid(), ...form };
      setConfigs([...configs, cfg]);
      if (!activeId) setActive(cfg.id);
      toast.success('配置已保存');
    }
    setForm(emptyForm);
    setEditingId(null);
  }

  async function runTest(cfg: ApiConfig) {
    setTesting(cfg.id);
    const r = await testConnection(cfg);
    setTesting(null);
    if (r.ok) toast.success(r.message);
    else toast.error(r.message);
  }

  async function exportBackup() {
    const blob = await exportAllWithImages();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `goju-nai-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('备份已导出');
  }

  async function importBackup(file: File) {
    const r = await importAllWithImages(await file.text());
    if (r.ok) toast.success(r.message);
    else toast.error(r.message);
    setConfigs(loadSafeConfigs());
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">API 配置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          配置空悲切 NovelAI 兼容线路（Base URL 以 /v1 结尾）。Key 仅保存在本浏览器。
        </p>
      </div>

      {/* 已有配置列表 */}
      <div className="space-y-3">
        {configs.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              还没有配置，先在下方添加一个线路
            </CardContent>
          </Card>
        )}
        {configs.map((c) => (
          <Card key={c.id} className={c.id === activeId ? 'border-primary' : ''}>
            <CardContent className="flex flex-wrap items-center gap-3 py-4">
              <div className="min-w-40 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  {c.id === activeId && <Badge className="bg-primary text-primary-foreground">使用中</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {c.baseUrl} · {c.model} · Key {maskKey(c.apiKey)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={testing === c.id} onClick={() => void runTest(c)}>
                  {testing === c.id ? '测试中…' : '连接测试'}
                </Button>
                {c.id !== activeId && (
                  <Button size="sm" variant="secondary" onClick={() => setActive(c.id)}>
                    启用
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(c.id);
                    setForm({ name: c.name, baseUrl: c.baseUrl, apiKey: c.apiKey, model: c.model, translateEndpoint: c.translateEndpoint ?? '', translateModel: c.translateModel ?? '' });
                  }}
                >
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    setConfigs(configs.filter((x) => x.id !== c.id));
                    if (activeId === c.id) setActive(null);
                    toast.success('已删除');
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 新增 / 编辑表单 */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">{editingId ? '编辑配置' : '新增配置'}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>配置名称</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：空悲切主线路" />
          </div>
          <div className="grid gap-1.5">
            <Label>模型名称</Label>
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="nai-diffusion-4-5-full" />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>线路地址（Base URL）</Label>
            <Input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.blanka.cc/v1" />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>API Key（sk-...）</Label>
            <Input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-..." />
          </div>
          <div className="grid gap-1.5">
            <Label>翻译端点（可选，OpenAI 兼容）</Label>
            <Input value={form.translateEndpoint} onChange={(e) => setForm({ ...form, translateEndpoint: e.target.value })} placeholder="留空则只用内置词典翻译" />
          </div>
          <div className="grid gap-1.5">
            <Label>翻译模型（可选）</Label>
            <Input value={form.translateModel} onChange={(e) => setForm({ ...form, translateModel: e.target.value })} placeholder="qwen3.6-plus" />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button className="glow-hover" onClick={save}>{editingId ? '保存修改' : '保存配置'}</Button>
            {editingId && (
              <Button variant="ghost" onClick={() => { setEditingId(null); setForm(emptyForm); }}>
                <XCircle className="size-4" /> 取消
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 备份 */}
      <Card>
        <CardHeader><CardTitle className="font-display text-lg">数据备份</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportBackup()}>
            <Download className="size-4" /> 导出全部数据（含图片）
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> 导入备份
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importBackup(f);
              e.target.value = '';
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function loadSafeConfigs(): ApiConfig[] {
  try {
    return JSON.parse(localStorage.getItem('goju-nai:apiConfigs') ?? '[]') as ApiConfig[];
  } catch {
    return [];
  }
}
