'use client';

import { Download, Eye, Search, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button, Card, cn } from '@iris/ui';
import { HAZARD_META } from '@iris/config';
import type { HazardClass, IrisNode, NodeHealth, RiskLevel } from '@iris/types';
import { HealthBadge, QuorumBadge, RiskBadge } from '@/components/common/badges';
import { EmptyState, PageSkeleton } from '@/components/common/states';
import { PageHeader, TableWrap, tdCls, thCls } from '@/components/common/widgets';
import { useCan, useSession } from '@/lib/session';
import { useIris } from '@/lib/store';
import { csv, download, timeAgo } from '@/lib/utils';

const sel = 'h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700';

export default function NodesPage() {
  const d = useIris((s) => s.data);
  const openTicket = useIris((s) => s.openTicket);
  const canMaint = useCan('maintenance');
  const user = useSession((s) => s.user);
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hazard, setHazard] = useState<HazardClass | 'ALL'>('ALL');
  const [health, setHealth] = useState<NodeHealth | 'ALL'>('ALL');
  const [region, setRegion] = useState('ALL');
  const [gw, setGw] = useState('ALL');
  const [risk, setRisk] = useState<RiskLevel | 'ALL'>('ALL');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState('');

  const rows = useMemo(() => {
    if (!d) return [];
    const s = q.trim().toLowerCase();
    return d.nodes.filter(
      (n) =>
        (hazard === 'ALL' || n.hazard === hazard) &&
        (health === 'ALL' || n.health_status === health) &&
        (region === 'ALL' || n.location.region === region) &&
        (gw === 'ALL' || n.gateway_id === gw) &&
        (risk === 'ALL' || n.risk_level === risk) &&
        (!s || `${n.id} ${n.code} ${n.location.site} ${n.location.district} ${n.type}`.toLowerCase().includes(s)),
    );
  }, [d, q, hazard, health, region, gw, risk]);

  if (!d) return <PageSkeleton />;
  const regions = Array.from(new Set(d.nodes.map((n) => n.location.region)));
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = d.nodes.filter((n) => picked.has(n.id));

  const exportCsv = () => {
    const list = chosen.length ? chosen : rows;
    download('iris-nodes-demo.csv', csv([['node', 'pod', 'district', 'hazard', 'health', 'battery_pct', 'signal_dbm', 'gateway', 'risk', 'confidence_pct', 'data_source'], ...list.map((n) => [n.code, n.installed_pods[0].name, n.location.district, n.hazard, n.health_status, n.battery.toFixed(0), n.signal.toFixed(0), n.gateway_id, n.risk_level, (n.confidence * 100).toFixed(0), 'SIMULATED'])]));
  };
  const bulkMaint = () => {
    chosen.forEach((n) => openTicket({ node_id: n.id, issue: 'Scheduled inspection requested from Nodes list', category: 'OTHER', priority: 'MEDIUM', by: user?.name ?? 'operator' }));
    setToast(`${chosen.length} maintenance ticket(s) created.`);
    setPicked(new Set());
    setTimeout(() => setToast(''), 3000);
  };

  return (
    <>
      <PageHeader title="Node Management" subtitle="Universal sensor nodes with replaceable pods. Health, risk and status are computed by the demo engine." />

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search nodes…" aria-label="Search nodes" className="h-9 w-48 rounded-lg border border-slate-200 pl-8 pr-2 text-sm" />
          </div>
          <select aria-label="Hazard" className={sel} value={hazard} onChange={(e) => setHazard(e.target.value as HazardClass | 'ALL')}>
            <option value="ALL">All hazards</option>
            {(['FLOOD', 'FIRE', 'AIR'] as HazardClass[]).map((h) => <option key={h} value={h}>{HAZARD_META[h].short}</option>)}
          </select>
          <select aria-label="Health" className={sel} value={health} onChange={(e) => setHealth(e.target.value as NodeHealth | 'ALL')}>
            <option value="ALL">All health</option>
            {(['HEALTHY', 'DEGRADED', 'OFFLINE', 'MAINTENANCE_REQUIRED'] as NodeHealth[]).map((h) => <option key={h} value={h}>{h.replace('_', ' ')}</option>)}
          </select>
          <select aria-label="Region" className={sel} value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="ALL">All regions</option>
            {regions.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select aria-label="Gateway" className={sel} value={gw} onChange={(e) => setGw(e.target.value)}>
            <option value="ALL">All gateways</option>
            {d.gateways.map((g) => <option key={g.id}>{g.id}</option>)}
          </select>
          <select aria-label="Risk" className={sel} value={risk} onChange={(e) => setRisk(e.target.value as RiskLevel | 'ALL')}>
            <option value="ALL">All risk</option>
            {(['NORMAL', 'WATCH', 'HIGH', 'CRITICAL'] as RiskLevel[]).map((r) => <option key={r}>{r}</option>)}
          </select>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={picked.size === 0} onClick={() => router.push(`/nodes/${chosen[0].id}`)}><Eye className="h-3.5 w-3.5" aria-hidden /> View</Button>
            <Button size="sm" variant="outline" disabled={picked.size === 0 || !canMaint} title={canMaint ? undefined : 'Requires Field Steward or Administrator'} onClick={bulkMaint}><Wrench className="h-3.5 w-3.5" aria-hidden /> Maintenance</Button>
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3.5 w-3.5" aria-hidden /> Export {picked.size ? `(${picked.size})` : ''}</Button>
          </div>
        </div>
        {toast && <p role="status" className="mt-2 text-xs font-medium text-emerald-700">{toast}</p>}
      </Card>

      {rows.length === 0 ? (
        <Card><EmptyState title="No nodes match these filters" hint="Clear a filter or search term to see more nodes." /></Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <TableWrap>
              <table className="w-full min-w-[980px]">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className={thCls}><input type="checkbox" aria-label="Select all" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
                    {['Node ID', 'Type', 'Location', 'Hazard', 'Health', 'Battery', 'Signal', 'Last seen', 'Gateway', 'Risk', 'Status'].map((h) => <th key={h} className={thCls}>{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((n) => (
                    <tr key={n.id} className="hover:bg-slate-50">
                      <td className={tdCls}><input type="checkbox" aria-label={`Select ${n.code}`} checked={picked.has(n.id)} onChange={() => toggle(n.id)} /></td>
                      <td className={cn(tdCls, 'font-semibold')}><Link className="text-navy-700 hover:underline" href={`/nodes/${n.id}`}>{n.code}</Link></td>
                      <td className={tdCls}>{n.installed_pods[0].name}</td>
                      <td className={tdCls}>{n.location.district}<span className="block text-xs text-slate-500">{n.location.region}</span></td>
                      <td className={tdCls}>{HAZARD_META[n.hazard].short}</td>
                      <td className={tdCls}><HealthBadge health={n.health_status} /></td>
                      <td className={cn(tdCls, 'tabular')}>{n.battery.toFixed(0)}%</td>
                      <td className={cn(tdCls, 'tabular')}>{n.signal.toFixed(0)} dBm</td>
                      <td className={cn(tdCls, 'text-slate-600')}>{timeAgo(n.last_seen, d.now)}</td>
                      <td className={tdCls}>{n.gateway_id}</td>
                      <td className={tdCls}><RiskBadge level={n.risk_level} /></td>
                      <td className={tdCls}><QuorumBadge status={n.quorum} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>

          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {rows.map((n) => (
              <li key={n.id}>
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={picked.has(n.id)} onChange={() => toggle(n.id)} aria-label={`Select ${n.code}`} /><Link href={`/nodes/${n.id}`} className="text-sm font-semibold text-navy-700">{n.code}</Link></label>
                    <RiskBadge level={n.risk_level} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{n.location.district} · {n.installed_pods[0].name} · {n.gateway_id}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2"><HealthBadge health={n.health_status} /><QuorumBadge status={n.quorum} /></div>
                  <p className="tabular mt-2 text-xs text-slate-600">Battery {n.battery.toFixed(0)}% · {n.signal.toFixed(0)} dBm · {timeAgo(n.last_seen, d.now)}</p>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
