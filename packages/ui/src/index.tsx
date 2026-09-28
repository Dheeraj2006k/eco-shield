import * as React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ---------------- Card ---------------- */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-slate-200 bg-white shadow-card', className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-3 px-4 pt-4 pb-2', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[13px] font-semibold uppercase tracking-wide text-slate-700', className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-0.5 text-xs text-slate-500', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pb-4', className)} {...props} />;
}

/* ---------------- Button ---------------- */
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'warning';
type ButtonSize = 'sm' | 'md' | 'lg';
const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-navy-700 text-white hover:bg-navy-800 focus-visible:ring-navy-500',
  secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 focus-visible:ring-slate-400',
  outline: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
  warning: 'bg-orange-600 text-white hover:bg-orange-700 focus-visible:ring-orange-500',
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-sm gap-2',
};
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
});

/* ---------------- Badge ---------------- */
export type Tone = 'ok' | 'warn' | 'high' | 'crit' | 'off' | 'info' | 'ai' | 'neutral' | 'maint';
const toneClasses: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  high: 'bg-orange-50 text-orange-700 ring-orange-200',
  crit: 'bg-red-50 text-red-700 ring-red-200',
  off: 'bg-slate-100 text-slate-600 ring-slate-200',
  info: 'bg-navy-50 text-navy-700 ring-navy-100',
  ai: 'bg-purple-50 text-purple-700 ring-purple-200',
  neutral: 'bg-slate-50 text-slate-700 ring-slate-200',
  maint: 'bg-sky-50 text-sky-700 ring-sky-200',
};
export function Badge({
  tone = 'neutral',
  className,
  children,
  icon,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; icon?: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

/* ---------------- Skeleton ---------------- */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} aria-hidden {...props} />;
}

/* ---------------- Tabs (controlled, accessible) ---------------- */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500',
            value === t.value ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
