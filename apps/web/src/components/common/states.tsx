'use client';

import { AlertTriangle, Inbox, Lock, RotateCcw, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, Skeleton } from '@iris/ui';
import type { Capability } from '@iris/types';
import { useCan } from '@/lib/session';
import { useIris } from '@/lib/store';

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-48" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <Inbox className="h-8 w-8 text-slate-300" aria-hidden />
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="max-w-sm text-xs text-slate-500">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', detail, onRetry }: { title?: string; detail?: string; onRetry?: () => void }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg p-6 text-center" role="alert">
      <AlertTriangle className="mx-auto h-8 w-8 text-orange-500" aria-hidden />
      <h2 className="mt-2 text-base font-semibold text-slate-900">{title}</h2>
      {detail && <p className="mt-1 text-sm text-slate-600">{detail}</p>}
      {onRetry && (
        <Button className="mt-4" variant="outline" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" aria-hidden /> Retry
        </Button>
      )}
    </Card>
  );
}

/** Shows the offline banner when the browser loses connectivity (demo engine keeps running locally). */
export function OfflineBanner() {
  const online = useIris((s) => s.online);
  if (online) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      Browser is offline — showing the local demo engine only; backend sync and map tiles are unavailable.
    </div>
  );
}

/** Wraps a section/page so users without the capability see an explanation, not a broken screen. */
export function RequireCap({ cap, children, fallbackLabel }: { cap: Capability; children: React.ReactNode; fallbackLabel?: string }) {
  const ok = useCan(cap);
  if (ok) return <>{children}</>;
  return (
    <Card className="mx-auto mt-10 max-w-lg p-6 text-center">
      <Lock className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
      <h2 className="mt-2 text-base font-semibold text-slate-900">Access restricted</h2>
      <p className="mt-1 text-sm text-slate-600">{fallbackLabel ?? 'Your role does not include this capability.'}</p>
      <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-navy-700 underline">
        Back to dashboard
      </Link>
    </Card>
  );
}
