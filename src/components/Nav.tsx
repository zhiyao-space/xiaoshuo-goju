import { Link, useRouterState } from '@tanstack/react-router';

const TABS = [
  { to: '/', label: '片段生图' },
  { to: '/vibes', label: 'Vibe 编码' },
  { to: '/api', label: 'API 配置' },
] as const;

export function Nav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <div className="seal-stamp flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold">
          印
        </div>
        <div className="min-w-0">
          <h1 className="seal-title truncate text-lg font-bold">墨印 · 片段生图</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">
            小说片段 → 英文提示词 → NovelAI 中转站生图
          </p>
        </div>
        <nav className="ml-auto flex gap-1">
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                pathname === t.to
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
