import { Card, cn } from '@iris/ui';
import { DemoTag } from './badges';

export function PageHeader({
  title,
  subtitle,
  actions,
  demo = true,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  demo?: boolean;
  eyebrow?: string;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-widest text-navy-500">{eyebrow}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-navy-900 sm:text-2xl">{title}</h1>
          {demo && <DemoTag />}
        </div>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Kpi({
  label,
  value,
  sub,
  icon,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'ok' | 'warn' | 'bad' | 'crit' | 'off';
}) {
  const bar = { default: 'bg-navy-500', ok: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-orange-500', crit: 'bg-red-500', off: 'bg-slate-400' }[tone];
  return (
    <Card className="relative overflow-hidden p-3 sm:p-4">
      <span className={cn('absolute inset-y-0 left-0 w-1', bar)} aria-hidden />
      <div className="flex items-start justify-between gap-2 pl-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <p className="tabular mt-1 pl-1 text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="pl-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

export function Meter({ value, max = 100, tone = 'navy', label }: { value: number; max?: number; tone?: 'navy' | 'ok' | 'warn' | 'crit' | 'ai'; label?: string }) {
  const color = { navy: 'bg-navy-500', ok: 'bg-emerald-500', warn: 'bg-amber-500', crit: 'bg-red-500', ai: 'bg-purple-500' }[tone];
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${w}%` }} />
    </div>
  );
}

export function Dl({ items, cols = 2 }: { items: [string, React.ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-2 text-sm', cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
      {items.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5">
          <dt className="text-xs text-slate-500">{k}</dt>
          <dd className="text-right font-medium text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Responsive table wrapper: horizontal scroll on small screens. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="scroll-thin overflow-x-auto">{children}</div>;
}
export const thCls = 'whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500';
export const tdCls = 'px-3 py-2.5 text-sm text-slate-800 align-middle';
