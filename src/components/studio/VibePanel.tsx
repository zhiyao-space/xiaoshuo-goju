// 氛围转移（Vibe Transfer）/ 精准参考 面板：上传参考图 + 强度滑条，两种模式互斥
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ImagePlus, X } from 'lucide-react';
import type { ReferenceSettings } from '@/lib/nai/types';

export function VibePanel({
  settings,
  onChange,
}: {
  settings: ReferenceSettings;
  onChange: (s: ReferenceSettings) => void;
}) {
  function upload(file: File) {
    const reader = new FileReader();
    reader.onload = () => onChange({ ...settings, imageId: reader.result as string });
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(
          [
            ['none', '不使用'],
            ['vibe', '氛围转移 Vibe'],
            ['precise', '精准参考 Precise'],
          ] as Array<[ReferenceSettings['mode'], string]>
        ).map(([mode, label]) => (
          <Button
            key={mode}
            size="sm"
            variant={settings.mode === mode ? 'default' : 'outline'}
            className={settings.mode === mode ? 'glow-hover bg-primary text-primary-foreground' : ''}
            onClick={() => onChange({ ...settings, mode })}
          >
            {label}
          </Button>
        ))}
      </div>

      {settings.mode !== 'none' && (
        <div className="space-y-3 rounded-md border border-border p-3">
          {/* 参考图 */}
          <div className="flex items-center gap-3">
            {settings.imageId ? (
              <div className="relative">
                <img src={settings.imageId} alt="参考图" className="h-16 w-16 rounded object-cover" />
                <button
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                  onClick={() => onChange({ ...settings, imageId: null })}
                  aria-label="移除参考图"
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : (
              <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded border border-dashed border-border text-muted-foreground hover:text-foreground">
                <ImagePlus className="size-5" />
                <span className="text-[10px]">上传</span>
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
              </label>
            )}
            <p className="text-xs text-muted-foreground">
              {settings.mode === 'vibe'
                ? '参考图片的风格与氛围（Vibe Transfer），可调整参考强度与信息提取'
                : '精准参考图片中的角色或风格（Precise Reference）'}
            </p>
          </div>

          {/* 强度滑条 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label className="text-xs">参考强度 {settings.strength.toFixed(2)}</Label>
              <Slider value={[settings.strength]} min={0} max={1} step={0.05}
                onValueChange={([v]) => onChange({ ...settings, strength: v })} />
            </div>
            {settings.mode === 'vibe' ? (
              <div className="grid gap-2">
                <Label className="text-xs">信息提取 {settings.information.toFixed(2)}</Label>
                <Slider value={[settings.information]} min={0} max={1} step={0.05}
                  onValueChange={([v]) => onChange({ ...settings, information: v })} />
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label className="text-xs">保真度 {settings.fidelity.toFixed(2)}</Label>
                  <Slider value={[settings.fidelity]} min={0} max={1} step={0.05}
                    onValueChange={([v]) => onChange({ ...settings, fidelity: v })} />
                </div>
              </>
            )}
          </div>

          {settings.mode === 'precise' && (
            <div className="grid gap-1.5">
              <Label className="text-xs">参考类型</Label>
              <select className="h-9 rounded-md border border-input bg-input px-2 text-sm"
                value={settings.refType}
                onChange={(e) => onChange({ ...settings, refType: e.target.value })}>
                <option value="character">角色 Character</option>
                <option value="style">画风 Style</option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
