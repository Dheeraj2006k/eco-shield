'use client';

import { ArrowRight, Building2, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn } from '@iris/ui';
import type { MaintenanceTicket, TicketPriority } from '@iris/types';
import { EmptyState, PageSkeleton } from '@/components/common/states';
import { Kpi, PageHeader, TableWrap, tdCls, thCls } from '@/components/common/widgets';
import { TICKET_FLOW } from '@/lib/engine/tickets';
import { useCan, useSession } from '@/lib/session';
import { useIris } from '@/lib/store';
import { fmtDateTime } from '@/lib/utils';

const PRIO_TONE = { LOW: 'off', MEDIUM: 'info', HIGH: 'high', URGENT: 'crit' } as const;
const CATEGORIES: MaintenanceTicket['category'][] = ['SENSOR_REPLACEMENT', 'BATTERY', 'CLEANING', 'CALIBRATION', 'SOLAR', 'TAMPER', 'CONNECTIVITY', 'OTHER'];
const sel = 'h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700';

const WORKFLOW = ['NODE HEALTH / DEGRADATION', 'MAINTENANCE TICKET', 'LOCAL STEWARD / AUTHORITY', 'FIELD SERVICE', 'REPLACEABLE SENSOR POD', 'SELF-TEST + CALIBRATION', 'NODE BACK ONLINE'];

const STEWARDS = [
  { name: 'Panchayat / VWSC', where: 'where appropriate', scope: 'Village-level flood and water nodes' },
  { name: 'Forest Department', where: '', scope: 'Forest-fire / smoke nodes and cameras' },
  { name: 'Municipality / ULB', where: '', scope: 'Urban air-quality stations' },
  { name: 'Industrial site operator', where: '', scope: 'Fence-line and process-area nodes' },
  { name: 'Critical facility authority', where: '', scope: 'Hospitals, dams, substations' },
  { name: 'Trained local technician / steward', where: '', scope: 'Cleaning, pod swaps, calibration checks' },
];

const INVENTORY = [
  { item: 'HYDRO / FLOOD POD (spare)', qty: 3 },
  { item: 'FIRE / AIR POD (spare)', qty: 4 },
  { item: 'LiFePO4 IFR26650 cell', qty: 6 },
  { item: 'Solar panel 6V/9V', qty: 2 },
  { item: 'IP65 gasket kit', qty: 10 },
];

export default function MaintenancePage() {
  const d = useIris((s) => s.data);
  const open = useIris((s) => s.openTicket);
  const advance = useIris((s) => s.advanceTicket);
  const resolve = useIris((s) => s.resolveTicket);
  const canCreate = useCan('maintenance');
  const canService = useCan('service_nodes');
  const user = useSession((s) => s.user);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ node: '', issue: '', category: 'CLEANING' as MaintenanceTicket['category'], priority: 'MEDIUM' as TicketPriority });
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState('');
  if (!d) return <PageSkeleton />;

  const cnt = (h: string) => d.nodes.filter((n) => n.health_status === h).length;
  const by = user?.name ?? 'steward';
  const submit = () => {
    if (!form.node || form.issue.trim().length < 5) {
      setErr('Choose a node and describe the issue (at least 5 characters).');
      return;
    }
    open({ node_id: form.node, issue: form.issue.trim().slice(0, 200), category: form.category, priority: form.priority, by });
    setForm({ ...form, issue: '' });
    setErr('');
    setShowForm(false);
  };
  const catCount = (c: string) => d.tickets.filter((t) => t.category === c).length;

  return (
    <>
      <PageHeader eyebrow="Lifecycle & community operations" title="Maintenance" subtitle="From node health to a local steward, a swapped pod, calibration and back online. Tickets here drive real state changes on the nodes." />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Healthy" value={cnt('HEALTHY')} tone="ok" />
        <Kpi label="Maintenance required" value={cnt('MAINTENANCE_REQUIRED')} tone={cnt('MAINTENANCE_REQUIRED') ? 'warn' : 'ok'} />
        <Kpi label="Degraded" value={cnt('DEGRADED')} tone={cnt('DEGRADED') ? 'warn' : 'ok'} />
        <Kpi label="Offline" value={cnt('OFFLINE')} tone={cnt('OFFLINE') ? 'off' : 'ok'} />
      </section>

      <Card className="mt-4">
        <CardHeader><CardTitle>Lifecycle workflow</CardTitle></CardHeader>
        <CardContent>
          <ol className="flex flex-wrap items-stretch gap-1.5">
            {WORKFLOW.map((w, i) => (
              <li key={w} className="flex items-center gap-1.5">
                <span className="rounded-lg border border-navy-100 bg-navy-50 px-2.5 py-2 text-[11px] font-semibold text-navy-800">{w}</span>
                {i < WORKFLOW.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Maintenance tickets</CardTitle>
          <Button size="sm" disabled={!canCreate} title={canCreate ? undefined : 'Requires Field Steward or Administrator'} onClick={() => setShowForm((s) => !s)}><Plus className="h-3.5 w-3.5" aria-hidden /> New ticket</Button>
        </CardHeader>
        <CardContent>
          {showForm && (
            <form className="mb-4 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
              <select aria-label="Node" className={sel} value={form.node} onChange={(e) => setForm({ ...form, node: e.target.value })}><option value="">Node…</option>{d.nodes.map((n) => <option key={n.id} value={n.id}>{n.code}</option>)}</select>
              <select aria-label="Category" className={sel} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as MaintenanceTicket['category'] })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}</select>
              <select aria-label="Priority" className={sel} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })}>{(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TicketPriority[]).map((p) => <option key={p}>{p}</option>)}</select>
              <input aria-label="Issue" maxLength={200} placeholder="Describe the issue" className="h-9 rounded-lg border border-slate-200 px-2 text-sm sm:col-span-2 lg:col-span-1" value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} />
              <Button type="submit" size="md">Create</Button>
              {err && <p role="alert" className="text-xs text-red-600 sm:col-span-2 lg:col-span-5">{err}</p>}
            </form>
          )}
          {d.tickets.length === 0 ? <EmptyState title="No tickets" hint="Tickets appear when nodes degrade or when you create one." /> : (
            <TableWrap>
              <table className="w-full min-w-[900px]">
                <thead className="border-b border-slate-200 bg-slate-50"><tr>{['', 'Ticket ID', 'Node', 'Issue', 'Priority', 'Steward', 'Created', 'Status', 'Actions'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {d.tickets.map((t) => (
                    <TicketRows key={t.ticket_id} t={t} expanded={expanded === t.ticket_id} onToggle={() => setExpanded(expanded === t.ticket_id ? null : t.ticket_id)} canService={canService} onAdvance={() => advance(t.ticket_id, by)} onResolve={() => resolve(t.ticket_id, by)} />
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Tracked service categories</CardTitle></CardHeader>
          <CardContent>
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {[['Sensor replacement', 'SENSOR_REPLACEMENT'], ['Battery replacement', 'BATTERY'], ['Cleaning', 'CLEANING'], ['Calibration', 'CALIBRATION'], ['Solar inspection', 'SOLAR'], ['Tamper events', 'TAMPER'], ['Connectivity', 'CONNECTIVITY']].map(([l, c]) => (
                <li key={c} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span className="text-slate-600">{l}</span><b className="tabular">{catCount(c)}</b></li>
              ))}
            </ul>
            <h3 className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Spare inventory (demo)</h3>
            <ul className="space-y-1 text-sm">{INVENTORY.map((i) => <li key={i.item} className="flex justify-between"><span className="text-slate-600">{i.item}</span><b className="tabular">{i.qty}</b></li>)}</ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><Building2 className="mr-1.5 inline h-4 w-4" aria-hidden />Local / institutional stewardship</CardTitle><Badge tone="info">Proposed model</Badge></CardHeader>
          <CardContent>
            <p className="mb-3 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">Proposed Community / Institutional O&amp;M model. It does not assume automatic government ownership or funding — each deployment would agree its own steward, budget and agreements.</p>
            <ul className="space-y-2">{STEWARDS.map((s) => <li key={s.name} className="rounded-lg border border-slate-200 px-3 py-2"><p className="text-sm font-medium text-slate-800">{s.name}{s.where && <span className="font-normal text-slate-500"> — {s.where}</span>}</p><p className="text-xs text-slate-500">{s.scope}</p></li>)}</ul>
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function TicketRows({ t, expanded, onToggle, canService, onAdvance, onResolve }: { t: MaintenanceTicket; expanded: boolean; onToggle: () => void; canService: boolean; onAdvance: () => void; onResolve: () => void }) {
  const idx = TICKET_FLOW.findIndex((f) => f.status === t.status);
  const next = TICKET_FLOW[idx + 1];
  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className={tdCls}><button aria-label={expanded ? 'Hide history' : 'Show history'} aria-expanded={expanded} onClick={onToggle}>{expanded ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}</button></td>
        <td className={cn(tdCls, 'font-mono text-xs font-semibold')}>{t.ticket_id}</td>
        <td className={tdCls}><Link href={`/nodes/${t.node_id}`} className="font-medium text-navy-700 hover:underline">{t.node_id}</Link></td>
        <td className={cn(tdCls, 'max-w-xs')}>{t.issue}<span className="block text-[11px] text-slate-400">{t.category.replace('_', ' ')}</span></td>
        <td className={tdCls}><Badge tone={PRIO_TONE[t.priority]}>{t.priority}</Badge></td>
        <td className={cn(tdCls, 'text-xs')}>{t.assigned_to}</td>
        <td className={cn(tdCls, 'whitespace-nowrap text-xs text-slate-600')}>{fmtDateTime(t.created_at)}</td>
        <td className={tdCls}><Badge tone={t.status === 'RESOLVED' ? 'ok' : t.status === 'OPEN' ? 'warn' : 'info'}>{t.status.replace('_', ' ')}</Badge></td>
        <td className={tdCls}>
          {t.status !== 'RESOLVED' && (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={!canService} title={canService ? undefined : 'Requires Field Steward or Administrator'} onClick={onAdvance}>{next ? next.label.split(' /')[0].slice(0, 22) : 'Advance'}</Button>
              <Button size="sm" variant="ghost" disabled={!canService} onClick={onResolve}>Resolve</Button>
            </div>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/70"><td /><td colSpan={8} className="px-3 py-2">
          <ol className="space-y-1 text-xs text-slate-600">{t.service_history.map((h, i) => <li key={i}><span className="tabular font-mono text-slate-400">{fmtDateTime(h.at)}</span> — {h.action} <span className="text-slate-400">({h.by})</span></li>)}</ol>
        </td></tr>
      )}
    </>
  );
}
