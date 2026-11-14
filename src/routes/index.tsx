// 首页：小说图文混排预览（文字段落 + 配图）
import { Link, createFileRoute } from '@tanstack/react-router';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GenImage } from '@/components/GenImage';
import { useNovels } from '@/lib/nai/useData';
import { BookOpenText, Wand2 } from 'lucide-react';

export const Route = createFileRoute('/')({ component: IndexPage });

function IndexPage() {
  const { active: novel, setActiveId, novels } = useNovels();

  function selectNovel(id: string) {
    setActiveId(id);
  }

  if (novels.length === 0) {
    return (
      <div className="space-y-6 py-10 text-center">
        <h1 className="font-display text-3xl font-semibold">小说画境</h1>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
          让每一段文字都有画面。导入小说 → 切分片段 → 套用画风 → NovelAI 生成插画，
          图文混排呈现你的故事。
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild className="glow-hover">
            <Link to="/novel"><BookOpenText className="size-4" /> 导入小说</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/api-settings"><Wand2 className="size-4" /> 配置 API</Link>
          </Button>
        </div>
      </div>
    );
  }

  const withImage = novel?.fragments.filter((f) => f.selectedImageId).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{novel?.title ?? '图文工作台'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {novel?.fragments.length ?? 0} 个片段 · 已配图 {withImage} 张
          </p>
        </div>
        {novels.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {novels.map((n) => (
              <Button key={n.id} size="sm" variant={n.id === novel?.id ? 'default' : 'outline'} onClick={() => selectNovel(n.id)}>
                {n.title}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {novel?.fragments.map((f, i) => (
          <div key={f.id} className={`flex gap-4 reveal ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}>
            {f.selectedImageId && (
              <GenImage
                imageId={f.selectedImageId}
                alt={`片段 ${i + 1} 配图`}
                className="h-40 w-56 shrink-0 rounded-lg border border-border object-cover md:h-48 md:w-72"
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col justify-center rounded-lg bg-card px-5 py-4">
              {f.note && <p className="mb-1.5 text-[11px] tracking-wide text-secondary">{f.note}</p>}
              <p className="text-sm leading-7 md:text-[15px] md:leading-8">{f.text}</p>
            </div>
          </div>
        ))}
      </div>

      {novel && withImage === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            片段还没有配图，去 <Link to="/studio" className="story-link text-primary">生图工坊</Link> 生成并选一张主图
          </CardContent>
        </Card>
      )}
    </div>
  );
}
