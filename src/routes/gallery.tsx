// 图库：全部生成图、放大查看、存为画风预设、删除
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GenImage } from '@/components/GenImage';
import { useImages, usePresets } from '@/lib/nai/useData';
import { deleteImageBlob } from '@/lib/nai/storage';
import { uid } from '@/lib/nai/types';
import type { ImageMeta } from '@/lib/nai/types';
import { Palette, Trash2 } from 'lucide-react';

export const Route = createFileRoute('/gallery')({ component: GalleryPage });

function GalleryPage() {
  const { images, setImages } = useImages();
  const { presets, setPresets } = usePresets();
  const [viewing, setViewing] = useState<ImageMeta | null>(null);
  const [presetName, setPresetName] = useState('');

  async function remove(id: string) {
    setImages(images.filter((i) => i.id !== id));
    void deleteImageBlob(id);
    toast.success('已删除');
  }

  function saveAsPreset(meta: ImageMeta) {
    if (!presetName.trim()) {
      toast.error('请填写预设名称');
      return;
    }
    setPresets([
      ...presets,
      {
        id: uid(),
        name: presetName.trim(),
        group: '从图库保存',
        note: '从生成图参数创建',
        posTemplate: meta.prompt,
        negTemplate: meta.negative,
        params: {
          width: meta.params.width,
          height: meta.params.height,
          steps: meta.params.steps,
          scale: meta.params.scale,
          sampler: meta.params.sampler,
        },
      },
    ]);
    setPresetName('');
    toast.success('已存为画风预设');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">图库</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          共 {images.length} 张生成图 · 点图放大查看参数，可另存为画风预设
        </p>
      </div>

      {images.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            还没有生成图，到 <span className="text-primary">生图工坊</span> 试试
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img) => (
            <button key={img.id} className="group relative overflow-hidden rounded-lg border border-border" onClick={() => setViewing(img)}>
              <GenImage imageId={img.id} className="aspect-square w-full object-cover transition-transform group-hover:scale-105" alt="生成图" />
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">生成图详情</DialogTitle>
              </DialogHeader>
              <GenImage imageId={viewing.id} className="max-h-[55vh] w-full rounded object-contain" alt="大图" />
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p className="text-foreground">{viewing.prompt}</p>
                {viewing.negative && <p>负向：{viewing.negative}</p>}
                <p>
                  {viewing.params.width}×{viewing.params.height} · steps {viewing.params.steps} · scale {viewing.params.scale} · {viewing.params.sampler} · seed {viewing.params.seed ?? '随机'}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Input className="max-w-44" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="预设名称" />
                  <Button size="sm" variant="outline" onClick={() => saveAsPreset(viewing)}>
                    <Palette className="size-3.5" /> 存为画风预设
                  </Button>
                  <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => { void remove(viewing.id); setViewing(null); }}>
                    <Trash2 className="size-4" /> 删除
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
