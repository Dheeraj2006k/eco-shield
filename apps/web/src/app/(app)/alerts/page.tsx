'use client';

import { CheckCheck, Download } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button, Card, cn } from '@iris/ui';
import { HAZARD_META } from '@iris/config';
import type { ConfidenceLevel, HazardClass, Incident, RiskLevel } from '@iris/types';
import { ConfidenceBadge, RiskBadge, StateBadge } from '@/components/common/badges';
import { EmptyState, PageSkeleton } from '@/components/common/states';
import { PageHeader, TableWrap, tdCls, thCls } from '@/components/common/widgets';
import { useCan, useSession } from '@/lib/session';
import { useIris } from '@/lib/store';
import { csv, download, fmtDateTime } from '@/lib/utils';

const sel = 'h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700';

function evidenceSummary(i: Incident) {
  const n = i.fusion.evidence.filter((e) => e.available).length;
  return `${i.fusion.quorum_sources.length || 1} corroborating · ${n} sources`;
}

export default function AlertsPage() {
  const d = useIris((s) => s.data);
  const ack = useIris((s) => s.acknowledge);
  const canAck = useCan('ack_alerts');
  const user = useSession((s) => s.user);
  const [hazard, setHazard] = useState<HazardClass | 'ALL'>('ALL');
  const [sev, setSev] = useState<RiskLevel | 'ALL'>('ALL');
  const [conf, setConf] = useState<ConfidenceLevel | 'ALL'>('ALL');
  const [loc, setLoc] = useState('ALL');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'>('ALL');

  const rows = useMemo(() => {
    if (!d) return [];
    return d.incidents
      .filter((i) => (hazard === 'ALL' || i.hazard === hazard) && (sev === 'ALL' || i.severity === sev) && (conf === 'ALL' || i.confidence_level === conf) && (loc === 'ALL' || i.district === loc) && (status === 'ALL' || i.status === status))
      .sort((a, b) => b.created_at - a.created_at);
  }, [d, hazard, sev, conf, loc, status]);

  if (!d) return <PageSkeleton />;
  const districts = Array.from(new Set(d.incidents.map((i) => i.district)));
  const activeUnacked = d.incidents.filter((i) => i.status === 'ACTIVE').length;

  return (
    <>
      <PageHeader
        title="Alert Center"
        subtitle="Severity and confidence are separate: severity is how bad the hazard is, confidence is how well the evidence supports it. Decision support — not autonomous emergency command."
        actions={
          <Button size="sm" variant="outline" onClick={() => download('iris-incidents-demo.csv', csv([['id', 'hazard', 'severity', 'confidence', 'location', 'created', 'status', 'data_source'], ...rows.map((i) => [i.id, i.hazard, i.severity, i.confidence_level, i.location, new Date(i.created_at).toISOString(), i.status, 'SIMULATED'])]))}>
            <Download className="h-3.5 w-3.5" aria-hidden /> Export
          </Button>
        }
      />
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Hazard" className={sel} value={hazard} onChange={(e) => setHazard(e.target.value as HazardClass | 'ALL')}>
            <option value="ALL">All hazards</option>{(['FLOOD', 'FIRE', 'AIR'] as HazardClass[]).map((h) => <option key={h} value={h}>{HAZARD_META[h].short}</option>)}
          </select>
          <select aria-label="Severity" className={sel} value={sev} onChange={(e) => setSev(e.target.value as RiskLevel | 'ALL')}>
            <option value="ALL">All severity</option>{(['WATCH', 'HIGH', 'CRITICAL'] as RiskLevel[]).map((h) => <option key={h}>{h}</option>)}
          </select>
          <select aria-label="Confidence" className={sel} value={conf} onChange={(e) => setConf(e.target.value as ConfidenceLevel | 'ALL')}>
            <option value="ALL">All confidence</option>{(['LOW', 'MEDIUM', 'HIGH'] as ConfidenceLevel[]).map((h) => <option key={h}>{h}</option>)}
          </select>
          <select aria-label="Location" className={sel} value={loc} onChange={(e) => setLoc(e.target.value)}>
            <option value="ALL">All locations</option>{districts.map((h) => <option key={h}>{h}</option>)}
          </select>
          <select aria-label="Status" className={sel} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="ALL">All status</option><option value="ACTIVE">Active</option><option value="ACKNOWLEDGED">Acknowledged</option><option value="RESOLVED">Resolved</option>
          </select>
          <span className="ml-auto text-xs text-slate-500">{rows.length} incident(s) · {activeUnacked} awaiting acknowledgement</span>
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card><EmptyState title="No incidents match" hint="Change filters, or run a scenario from Demo Control to generate an incident." /></Card>
      ) : (
        <>
          <Card className="hidden md:block">
            <TableWrap>
              <table className="w-full min-w-[960px]">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>{['Alert ID', 'Hazard', 'Severity', 'Confidence', 'Location', 'Time', 'Evidence', 'Status', ''].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((i) => (
                    <tr key={i.id} className={cn('hover:bg-slate-50', i.status === 'ACTIVE' && i.severity === 'CRITICAL' && 'bg-red-50/40')}>
                      <td className={cn(tdCls, 'font-semibold')}><Link className="text-navy-700 hover:underline" href={`/alerts/${i.id}`}>{i.id}</Link></td>
                      <td className={tdCls}>{HAZARD_META[i.hazard].short}</td>
                      <td className={tdCls}><RiskBadge level={i.severity} /></td>
                      <td className={tdCls}><ConfidenceBadge level={i.confidence_level} value={i.confidence} /></td>
                      <td className={tdCls}>{i.location}</td>
                      <td className={cn(tdCls, 'whitespace-nowrap text-slate-600')}>{fmtDateTime(i.created_at)}</td>
                      <td className={cn(tdCls, 'text-xs text-slate-600')}>{evidenceSummary(i)}</td>
                      <td className={tdCls}><StateBadge state={i.state} /></td>
                      <td className={tdCls}>
                        {i.status === 'ACTIVE' && (
                          <Button size="sm" variant="outline" disabled={!canAck} title={canAck ? 'Acknowledge' : 'Requires Authority, Operator or Administrator'} onClick={() => ack(i.id, user?.name ?? 'operator')}>
                            <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Ack
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
          <ul className="space-y-2 md:hidden">
            {rows.map((i) => (
              <li key={i.id}>
                <Card className="p-3">
                  <div className="flex items-center justify-between"><Link href={`/alerts/${i.id}`} className="text-sm font-semibold text-navy-700">{i.id}</Link><StateBadge state={i.state} /></div>
                  <p className="mt-1 text-xs text-slate-600">{HAZARD_META[i.hazard].label} · {i.location}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5"><RiskBadge level={i.severity} /><ConfidenceBadge level={i.confidence_level} value={i.confidence} /></div>
                  <p className="mt-2 text-[11px] text-slate-500">{fmtDateTime(i.created_at)} · {evidenceSummary(i)}</p>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
