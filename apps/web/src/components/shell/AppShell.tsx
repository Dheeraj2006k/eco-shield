'use client';

import { Bell, ChevronsLeft, ChevronsRight, LogOut, Menu, Search, User, X, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, cn } from '@iris/ui';
import { ROLE_META } from '@iris/config';
import { OfflineBanner, PageSkeleton } from '@/components/common/states';
import { SystemBadge } from '@/components/common/badges';
import { useCan, useSession } from '@/lib/session';
import { useIris } from '@/lib/store';
import { fmtClock, timeAgo } from '@/lib/utils';
import { Logo } from './Logo';
import { DEMO_NAV, NAV, type NavItem } from './nav';

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed?: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const allowed = useCan(item.cap ?? 'view');
  const active = path === item.href || path.startsWith(item.href + '/');
  if (item.cap && !allowed) return null;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-navy-700 text-white' : 'text-navy-100 hover:bg-navy-800 hover:text-white',
        collapsed && 'justify-center px-2',
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
      <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
    </Link>
  );
}

function SidebarBody({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
      {NAV.map((i) => (
        <NavLink key={i.href} item={i} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
      <div className="my-2 border-t border-navy-800" />
      <NavLink item={DEMO_NAV} collapsed={collapsed} onNavigate={onNavigate} />
    </nav>
  );
}

function Notifications() {
  const data = useIris((s) => s.data);
  const markRead = useIris((s) => s.markNotificationsRead);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const items = data?.notifications ?? [];
  const unread = items.filter((n) => !n.read).length;
  return (
    <div className="relative" ref={ref}>
      <button
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unread) setTimeout(markRead, 1200);
        }}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-pop animate-slideIn">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Notifications</div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No notifications yet. Run a demo scenario to see alerts appear here.</li>}
            {items.slice(0, 10).map((n) => (
              <li key={n.id} className="border-b border-slate-50 last:border-0">
                <Link href={n.href ?? '#'} onClick={() => setOpen(false)} className="block px-3 py-2 hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', n.level === 'critical' ? 'bg-red-600' : n.level === 'warn' ? 'bg-amber-500' : n.level === 'ok' ? 'bg-emerald-500' : 'bg-navy-500')} aria-hidden />
                    <span className="text-sm font-medium text-slate-800">{n.title}</span>
                    <span className="ml-auto text-[10px] text-slate-400">{data ? timeAgo(n.at, data.now) : ''}</span>
                  </div>
                  <p className="pl-4 text-xs text-slate-500">{n.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GlobalSearch() {
  const data = useIris((s) => s.data);
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!data || s.length < 1) return [];
    const nodes = data.nodes
      .filter((n) => `${n.id} ${n.code} ${n.location.site} ${n.location.district} ${n.hazard}`.toLowerCase().includes(s))
      .map((n) => ({ href: `/nodes/${n.id}`, title: n.code, sub: `${n.location.district} · ${n.hazard}` }));
    const inc = data.incidents
      .filter((i) => `${i.id} ${i.hazard} ${i.location}`.toLowerCase().includes(s))
      .map((i) => ({ href: `/alerts/${i.id}`, title: i.id, sub: `${i.hazard} · ${i.severity} · ${i.location}` }));
    return [...nodes, ...inc].slice(0, 8);
  }, [q, data]);
  return (
    <div className="relative hidden md:block" ref={ref}>
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) {
            router.push(results[0].href);
            setOpen(false);
            setQ('');
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Search nodes, incidents…"
        aria-label="Search nodes and incidents"
        className="h-9 w-56 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm placeholder:text-slate-400 focus:bg-white lg:w-72"
      />
      {open && q && (
        <ul className="absolute right-0 z-50 mt-1 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop">
          {results.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No matches.</li>}
          {results.map((r) => (
            <li key={r.href}>
              <Link
                href={r.href}
                onClick={() => {
                  setOpen(false);
                  setQ('');
                }}
                className="block px-3 py-2 hover:bg-slate-50"
              >
                <span className="text-sm font-medium text-slate-800">{r.title}</span>
                <span className="block text-xs text-slate-500">{r.sub}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UserMenu() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="User menu" className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-100 text-navy-700">
          <User className="h-4 w-4" aria-hidden />
        </span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-xs font-semibold text-slate-800">{user?.name ?? '…'}</span>
          <span className="block text-[10px] uppercase tracking-wide text-slate-500">{user ? ROLE_META[user.role].label : ''}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-pop">
          <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
          <p className="text-xs text-slate-500">{user ? ROLE_META[user.role].description : ''}</p>
          <button onClick={logout} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const data = useIris((s) => s.data);
  const paused = useIris((s) => s.paused);
  const [clock, setClock] = useState('');
  useEffect(() => {
    const t = setInterval(() => setClock(fmtClock(Date.now())), 1000);
    setClock(fmtClock(Date.now()));
    return () => clearInterval(t);
  }, []);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:px-4">
      <button onClick={onMenu} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open navigation">
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      <Link href="/" className="lg:hidden" aria-label="ECO-SHIELD home">
        <Logo sub={false} />
      </Link>
      <div className="ml-1 hidden items-center gap-2 sm:flex">
        <span className="hidden text-[11px] font-semibold uppercase tracking-wide text-slate-500 xl:inline">System status</span>
        {data ? <SystemBadge health={data.system.health} /> : <Badge tone="off">Loading</Badge>}
        <Link href="/demo" title="All data is simulated. Open Demo Control." className="hidden md:inline-flex">
          <Badge tone="maint" className="cursor-pointer">Demo mode · simulated data</Badge>
        </Link>
        {paused && <Badge tone="warn">Paused</Badge>}
      </div>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <span className="hidden text-xs text-slate-500 xl:block">
          Last sync <span className="tabular font-medium text-slate-700">{data ? fmtClock(data.system.last_sync) : '—'}</span>
        </span>
        <span className="tabular hidden rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 sm:block" aria-hidden>
          {clock}
        </span>
        <GlobalSearch />
        <Notifications />
        <UserMenu />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const init = useIris((s) => s.init);
  const ready = useIris((s) => s.ready);
  const setOnline = useIris((s) => s.setOnline);
  const data = useIris((s) => s.data);
  const loadSession = useSession((s) => s.load);
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    init();
    loadSession();
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    try {
      setCollapsed(localStorage.getItem('iris.sidebar') === '1');
    } catch {}
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [init, loadSession, setOnline]);

  useEffect(() => setDrawer(false), [path]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('iris.sidebar', c ? '0' : '1');
      } catch {}
      return !c;
    });
  };

  const critical = data?.incidents.filter((i) => i.status === 'ACTIVE' && i.severity === 'CRITICAL').length ?? 0;

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>

      {/* Desktop / tablet sidebar */}
      <aside className={cn('fixed inset-y-0 left-0 z-40 hidden flex-col bg-navy-900 transition-[width] lg:flex', collapsed ? 'w-16' : 'w-60')}>
        <div className={cn('flex h-14 items-center border-b border-navy-800 px-3', collapsed && 'justify-center')}>
          <Link href="/" aria-label="ECO-SHIELD home">
            {collapsed ? <Logo sub={false} dark /> : <Logo dark />}
          </Link>
        </div>
        <SidebarBody collapsed={collapsed} />
        <button onClick={toggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="m-2 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-navy-200 hover:bg-navy-800">
          {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden /> : <><ChevronsLeft className="h-4 w-4" aria-hidden /> Collapse</>}
        </button>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawer(false)} aria-label="Close navigation" />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-navy-900 animate-slideIn">
            <div className="flex h-14 items-center justify-between border-b border-navy-800 px-3">
              <Logo dark />
              <button onClick={() => setDrawer(false)} className="rounded-lg p-2 text-navy-200 hover:bg-navy-800" aria-label="Close">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <SidebarBody onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className={cn('transition-[padding] lg:pl-60', collapsed && 'lg:pl-16')}>
        <Topbar onMenu={() => setDrawer(true)} />
        <OfflineBanner />
        {data && data.incidents.some((i) => i.status === 'ACTIVE') && (
          <Link
            href="/alerts"
            className={cn('flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-white', critical ? 'bg-red-600' : 'bg-orange-600')}
            role="status"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />
            {data.incidents.filter((i) => i.status === 'ACTIVE').length} active incident(s){critical ? ` · ${critical} CRITICAL` : ''} — decision support, not an autonomous command. Open Alert Center →
          </Link>
        )}
        <main id="main" className="mx-auto max-w-[1600px] px-3 pb-24 pt-4 sm:px-5 lg:pb-8">
          {ready ? children : <PageSkeleton />}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white lg:hidden">
        {NAV.filter((n) => n.mobile).map((n) => {
          const active = path === n.href || path.startsWith(n.href + '/');
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={cn('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium', active ? 'text-navy-700' : 'text-slate-500')}>
              <Icon className="h-5 w-5" aria-hidden />
              {n.label === 'Overview' ? 'Home' : n.label}
            </Link>
          );
        })}
        <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-slate-500">
          <MoreHorizontal className="h-5 w-5" aria-hidden />
          More
        </button>
      </nav>
    </div>
  );
}
