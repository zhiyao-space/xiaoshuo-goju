// 全局导航壳：桌面左侧栏 + 移动端顶部横滚导航
import { Link, useRouterState } from '@tanstack/react-router';
import { BookOpenText, Images, Palette, Settings, Sparkles, Wand2 } from 'lucide-react';

const NAV = [
  { to: '/', label: '图文工作台', icon: BookOpenText },
  { to: '/novel', label: '小说文本', icon: BookOpenText },
  { to: '/studio', label: '生图工坊', icon: Wand2 },
  { to: '/styles', label: '画风预设', icon: Palette },
  { to: '/gallery', label: '图库', icon: Images },
  { to: '/api-settings', label: 'API 配置', icon: Settings },
] as const;

function NavLinks({ vertical }: { vertical: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className={
        vertical
          ? 'flex flex-col gap-1 px-3'
          : 'flex items-center gap-1 overflow-x-auto px-3 py-1'
      }
    >
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors ${
              active
                ? 'bg-accent text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-card'
            }`}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen ink-texture">
      {/* 移动端顶栏 */}
      <header className="md:hidden sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Sparkles className="size-5 text-primary" />
          <span className="font-display text-base font-semibold">小说画境</span>
        </div>
        <NavLinks vertical={false} />
      </header>

      <div className="md:flex">
        {/* 桌面侧栏 */}
        <aside className="hidden md:flex fixed inset-y-0 left-0 w-56 flex-col border-r border-border bg-panel">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <Sparkles className="size-6 text-primary" />
            <div>
              <div className="font-display text-lg font-semibold leading-tight">小说画境</div>
              <div className="text-[11px] text-muted-foreground">NovelAI 配图工作台</div>
            </div>
          </div>
          <div className="mt-2 flex-1">
            <NavLinks vertical={true} />
          </div>
          <div className="px-5 py-4 text-[11px] text-muted-foreground border-t border-border">
            数据保存在本浏览器 · 可在设置页导出备份
          </div>
        </aside>

        <main className="md:pl-56 flex-1 min-w-0">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
