// 生成图展示组件：从 IndexedDB 加载 Blob 并渲染
import { useEffect, useState } from 'react';
import { getImageUrl } from '@/lib/nai/storage';

export function GenImage({
  imageId,
  className,
  alt = '生成图',
}: {
  imageId: string | null;
  className?: string;
  alt?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!imageId) {
      setUrl(null);
      return;
    }
    void getImageUrl(imageId).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [imageId]);

  if (!url) {
    return (
      <div
        className={`flex items-center justify-center bg-muted text-muted-foreground text-xs ${className ?? ''}`}
      >
        无图
      </div>
    );
  }
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}
