'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@iris/ui';
import { HAZARD_META, THRESHOLDS } from '@iris/config';
import type { IrisNode } from '@iris/types';
import { ConfidenceBadge, HealthBadge, QuorumBadge, RiskBadge } from '@/components/common/badges';
import { Dl, Meter } from '@/components/common/widgets';
import { timeAgo } from '@/lib/utils';

export function NodeDrawer({ node, now, onClose }: { node: IrisNode; now: number; onClose: () => void }) {
  return (
    <aside className="absolute inset-x-0 bottom-0 z-[600] max-h-[70%] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-4 shadow-pop sm:inset-y-2 sm:bottom-2 sm:left-auto sm:right-2 sm:max-h-none sm:w-[360px] sm:rounded-xl animate-slideIn" aria-label={`Details for ${node.code}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-navy-900">{node.code}</h2>
          <p className="text-xs text-slate-500">{node.location.site} · {node.location.district}</p>
        </div>
        <button onClick={onClose} aria-label="Close details" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" aria-hidden /></button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <HealthBadge health={node.health_status} />
        <RiskBadge level={node.risk_level} />
        {node.quorum !== 'NONE' && <ConfidenceBadge level={node.confidence_level} value={node.confidence} />}
        <QuorumBadge status={node.quorum} />
      </div>

      <div className="mt-4">
        <Dl cols={1} items={[
          ['Hazard class', HAZARD_META[node.hazard].label],
          ['Installed pod', node.installed_pods.map((p) => p.name).join(', ')],
          ['Gateway', node.gateway_id],
          ['Battery', `${node.battery.toFixed(0)}%`],
          ['Signal', `${node.signal.toFixed(0)} dBm · SNR ${node.snr.toFixed(1)} dB`],
          ['Last seen', timeAgo(node.last_seen, now)],
          ['Fused evidence E', node.risk_score.toFixed(2)],
        ]} />
      </div>

      <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Live sensors</h3>
      <ul className="mt-2 space-y-2">
        {node.sensors.map((s) => (
          <li key={s.id}>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">{s.label}</span>
              <span className="tabular font-semibold text-slate-900">{s.last_value.toFixed(THRESHOLDS[s.type].decimals)} {s.unit}</span>
            </div>
            <Meter value={s.quality_score * 100} tone={s.quality_score > 0.7 ? 'ok' : 'warn'} label={`${s.label} data quality`} />
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[10px] text-slate-400">Bars show data quality. Values are simulated.</p>

      <div className="mt-4 flex gap-2">
        <Link href={`/nodes/${node.id}`} className="flex-1"><Button className="w-full" size="sm">Open node detail</Button></Link>
        <Link href="/maintenance" className="flex-1"><Button className="w-full" size="sm" variant="outline">Maintenance</Button></Link>
      </div>
    </aside>
  );
}
