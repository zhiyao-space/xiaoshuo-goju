import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MODELS, SAMPLERS, testImageApi, loadApi, saveApi, type ApiConfig } from '@/lib/nai';

export const Route = createFileRoute('/api')({
  component: ApiConfigPage,
});

function ApiConfigPage() {
  const [cfg, setCfg] = useState<ApiConfig>(loadApi);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof ApiConfig>(k: K, v: ApiConfig[K]) => {
    setCfg((c) => ({ ...c, [k]: v }));
    setSaved(false);
  };

  const handleSave = () => {
    saveApi(cfg);
    setSaved(true);
  };

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    const r = await testImageApi(cfg);
    setResult(r);
    setTesting(false);
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h2 className="seal-title text-2xl font-bold">生图 API 配置</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          按中转站（OpenAI Chat 兼容）格式填写，NovelAI 原生参数通过消息体 JSON 传入。
        </p>
      </div>

      <div className="space-y-5 rounded-lg border border-border bg-card p-5">
        <div className="space-y-2">
          <Label htmlFor="base">中转站地址（Base URL）</Label>
          <Input
            id="base"
            placeholder="https://your-relay.example.com/v1"
            value={cfg.base}
            onChange={(e) => set('base', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">生图请求将发往 {cfg.base.replace(/\/+$/, '') || '<地址>'}/chat/completions</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="key">API Key</Label>
          <Input
            id="key"
            type="password"
            placeholder="sk-..."
            value={cfg.key}
            onChange={(e) => set('key', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>绘画模型</Label>
          <Select value={cfg.model} onValueChange={(v) => set('model', v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="steps">采样步数</Label>
            <Input id="steps" type="number" min={1} max={50} value={cfg.steps}
              onChange={(e) => set('steps', Math.max(1, Number(e.target.value) || 28))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scale">引导强度 (Scale)</Label>
            <Input id="scale" type="number" step="0.5" min={1} max={10} value={cfg.scale}
              onChange={(e) => set('scale', Math.max(1, Number(e.target.value) || 5))} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>采样器</Label>
          <Select value={cfg.sampler} onValueChange={(v) => set('sampler', v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SAMPLERS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="neg">默认负面提示词</Label>
          <Textarea id="neg" rows={2} value={cfg.negative} onChange={(e) => set('negative', e.target.value)} />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={handleSave}>{saved ? '已保存 ✓' : '保存配置'}</Button>
          <Button variant="secondary" onClick={handleTest} disabled={testing}>
            {testing ? '测试中…' : '测试连接'}
          </Button>
          {result && (
            <span className={`text-sm ${result.ok ? 'text-emerald-400' : 'text-destructive'}`}>
              {result.msg}
            </span>
          )}
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        配置保存后，前往{' '}
        <Link to="/vibes" className="text-primary underline underline-offset-4">Vibe 编码</Link>
        {' '}导入画风编码，再到{' '}
        <Link to="/" className="text-primary underline underline-offset-4">片段生图</Link>
        {' '}开始生成。配置保存在本地浏览器，不会上传。
      </p>
    </main>
  );
}
