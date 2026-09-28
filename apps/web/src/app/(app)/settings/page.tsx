'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@iris/ui';
import { ROLES, ROLE_CAPS, ROLE_META } from '@iris/config';
import type { Capability } from '@iris/types';
import { PageSkeleton, RequireCap } from '@/components/common/states';
import { PageHeader, TableWrap, tdCls, thCls } from '@/components/common/widgets';
import { useSession } from '@/lib/session';
import { API_URL, remoteAvailable } from '@/lib/remote';
import { useIris } from '@/lib/store';

const CAPS: { c: Capability; label: string }[] = [
  { c: 'view', label: 'View data' }, { c: 'ack_alerts', label: 'Acknowledge alerts' }, { c: 'manage_nodes', label: 'Manage nodes' }, { c: 'simulate', label: 'Run simulations' },
  { c: 'maintenance', label: 'Create tickets' }, { c: 'service_nodes', label: 'Service nodes' }, { c: 'gis', label: 'GIS / regional' }, { c: 'analytics', label: 'Analytics' }, { c: 'approve_models', label: 'Approve models' }, { c: 'settings', label: 'Settings' },
];

function Inner() {
  const d = useIris((s) => s.data);
  const paused = useIris((s) => s.paused);
  const setPaused = useIris((s) => s.setPaused);
  const user = useSession((s) => s.user);
  const source = useIris((s) => s.source);
  const setSource = useIris((s) => s.setSource);
  const remoteStatus = useIris((s) => s.remoteStatus);
  const remoteDetail = useIris((s) => s.remoteDetail);
  const [api, setApi] = useState<'checking' | 'up' | 'down'>('checking');
  const [persist, setPersist] = useState('');
  const url = API_URL || undefined;
  useEffect(() => {
    if (!url) { setApi('down'); return; }
    const ctl = new AbortController();
    fetch(`${url}/api/health`, { signal: ctl.signal }).then(async (r) => { setApi(r.ok ? 'up' : 'down'); if (r.ok) setPersist((await r.json()).persistence ?? ''); }).catch(() => setApi('down'));
    return () => ctl.abort();
  }, [url]);
  if (!d) return <PageSkeleton />;

  return (
    <>
      <PageHeader title="Settings" subtitle="Administrator view: role matrix, data mode, engine control and security posture." />
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Data mode</CardTitle><Badge tone="maint">DEMO / SIMULATED</Badge></CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <p>All values are simulated. Choose where the simulation runs:</p>
            <div role="radiogroup" aria-label="Data source" className="grid gap-2">
              <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${source === 'local' ? 'border-navy-600 bg-navy-50' : 'border-slate-200'}`}>
                <input type="radio" name="source" checked={source === 'local'} onChange={() => setSource('local')} className="mt-1" />
                <span><b>Local demo engine</b> <span className="block text-xs text-slate-500">Runs in this browser. Works offline and on any static host. Resets on page reload.</span></span>
              </label>
              <label className={`flex items-start gap-2 rounded-lg border p-3 ${source === 'remote' ? 'border-navy-600 bg-navy-50' : 'border-slate-200'} ${remoteAvailable() ? 'cursor-pointer' : 'opacity-60'}`}>
                <input type="radio" name="source" disabled={!remoteAvailable()} checked={source === 'remote'} onChange={() => setSource('remote')} className="mt-1" />
                <span><b>Backend API (FastAPI)</b> <span className="block text-xs text-slate-500">{remoteAvailable() ? 'Shared state over REST + WebSocket; incidents and tickets are persisted by the server.' : 'Set NEXT_PUBLIC_API_URL to enable.'}</span></span>
              </label>
            </div>
            {source === 'remote' && (
              <p className="text-xs">Connection: {remoteStatus === 'live' ? <Badge tone="ok" icon={<CheckCircle2 className="h-3 w-3" aria-hidden />}>Live</Badge> : remoteStatus === 'connecting' ? <Badge tone="off">Connecting…</Badge> : <Badge tone="high" icon={<XCircle className="h-3 w-3" aria-hidden />}>Error</Badge>} {remoteDetail && <span className="text-slate-500">{remoteDetail}</span>}</p>
            )}
            <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={source === 'remote'} onClick={() => setPaused(!paused)}>{paused ? 'Resume engine' : 'Pause engine'}</Button><span className="text-xs text-slate-500">Tick {d.tick}</span></div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              Backend ({url ?? 'not configured'}):{' '}
              {api === 'checking' ? <Badge tone="off">Checking…</Badge> : api === 'up' ? <Badge tone="ok" icon={<CheckCircle2 className="h-3 w-3" aria-hidden />}>Reachable</Badge> : <Badge tone="off" icon={<XCircle className="h-3 w-3" aria-hidden />}>Not reachable</Badge>}
              {persist && <span className="text-slate-500">persistence: {persist}</span>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Security</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>Signed in as <b>{user?.name}</b> ({user ? ROLE_META[user.role].label : '—'}).</p>
            <ul className="list-inside list-disc text-xs text-slate-600">
              <li>Sessions are HS256 JWTs in an httpOnly cookie; secrets come from environment variables only.</li>
              <li>Routes are protected by middleware; write actions are re-checked by role in the UI and by the API.</li>
              <li>Device identity: per-node keys / LoRaWAN join credentials are designed for a secure element or provisioning service (not implemented in the demo).</li>
              <li>Login attempts are rate-limited in memory; use a shared store in production.</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <Card className="mt-4">
        <CardHeader><CardTitle>Role &amp; capability matrix</CardTitle></CardHeader>
        <CardContent>
          <TableWrap>
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-slate-200 bg-slate-50"><tr><th className={thCls}>Role</th>{CAPS.map((c) => <th key={c.c} className={thCls}>{c.label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {ROLES.map((r) => (
                  <tr key={r}>
                    <td className={tdCls}><b>{ROLE_META[r].label}</b><span className="block text-[11px] text-slate-500">{ROLE_META[r].description}</span></td>
                    {CAPS.map((c) => <td key={c.c} className={tdCls}>{ROLE_CAPS[r].includes(c.c) ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /><span className="sr-only">Yes</span></> : <span className="text-slate-300" aria-label="No">—</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </CardContent>
      </Card>
    </>
  );
}

export default function SettingsPage() {
  return <RequireCap cap="settings" fallbackLabel="Settings are available to Administrators only."><Inner /></RequireCap>;
}
