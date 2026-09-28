'use client';

import { ArrowLeft, Battery, HardDrive, Radio, Sun } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@iris/ui';
import { HAZARD_META, THRESHOLDS } from '@iris/config';
import type { SensorType } from '@iris/types';
import { TrendChart, Spark } from '@/components/charts/TrendChart';
import { ConfidenceBadge, HealthBadge, QuorumBadge, RiskBadge, SensorHealthBadge } from '@/components/common/badges';
import { FusionPanel } from '@/components/common/FusionPanel';
import { PodVisual } from '@/components/common/PodVisual';
import { ErrorState, PageSkeleton } from '@/components/common/states';
import { Dl, Meter, PageHeader } from '@/components/common/widgets';
import { useIris } from '@/lib/store';
import { timeAgo } from '@/lib/utils';

const CHART_COLORS: Record<string, string> = { water_level: '#2563eb', rainfall: '#0891b2', temperature: '#ea580c', humidity: '#0d9488', pm25: '#7c3aed', pm10: '#9333ea', smoke: '#b45309' };

export default function NodeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const d = useIris((s) => s.data);
  if (!d) return <PageSkeleton />;
  const node = d.nodes.find((n) => n.id === id);
  if (!node) return <ErrorState title={`Node ${id} not found`} detail="This node ID does not exist in the demo network." />;
  const hist = d.history[node.id] ?? {};
  const fusion = d.fusion[node.id];
  const gw = d.gateways.find((g) => g.id === node.gateway_id);
  const ai = node.anomaly;

  return (
    <>
      <Link href="/nodes" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-navy-700 hover:underline"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All nodes</Link>
      <PageHeader
        title={node.code}
        subtitle={`${node.location.site} · ${node.location.district} · ${node.location.region}`}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <HealthBadge health={node.health_status} />
            <RiskBadge level={node.risk_level} />
            {node.quorum !== 'NONE' && <ConfidenceBadge level={node.confidence_level} value={node.confidence} />}
            <QuorumBadge status={node.quorum} />
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Node information</CardTitle></CardHeader>
          <CardContent>
            <Dl items={[
              ['Node type', node.installed_pods[0].name],
              ['Hazard class', HAZARD_META[node.hazard].label],
              ['Location', `${node.location.lat.toFixed(3)}, ${node.location.lon.toFixed(3)} (demo site)`],
              ['Gateway', `${node.gateway_id}${gw && !gw.uplink_ok ? ' · uplink DOWN' : ''}`],
              ['Firmware', node.firmware_version],
              ['AI profile', node.ai_profile],
              ['Model version', node.model_version],
              ['Installation date', node.installed_at],
              ['Last service', node.last_service],
              ['Last seen', timeAgo(node.last_seen, d.now)],
            ]} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Edge AI indicators</CardTitle><Badge tone="ai">AI-0 · live</Badge></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Indicator label="Anomaly score" value={ai.score.toFixed(2)} bar={ai.score * 100} tone={ai.score > 0.6 ? 'crit' : ai.score > 0.3 ? 'warn' : 'ai'} />
            <div className="flex justify-between border-b border-slate-100 pb-1.5"><span className="text-xs text-slate-500">Baseline deviation</span><span className="tabular font-medium">{ai.baseline_deviation.toFixed(1)} σ</span></div>
            <div className="flex justify-between border-b border-slate-100 pb-1.5"><span className="text-xs text-slate-500">Trend</span><Badge tone={ai.trend === 'RISING' ? 'high' : ai.trend === 'FALLING' ? 'info' : 'ok'}>{ai.trend}</Badge></div>
            <Indicator label="Data quality" value={`${(ai.data_quality * 100).toFixed(0)}%`} bar={ai.data_quality * 100} tone={ai.data_quality > 0.7 ? 'ok' : 'warn'} />
            <Indicator label="Sensor reliability" value={`${(ai.sensor_reliability * 100).toFixed(0)}%`} bar={ai.sensor_reliability * 100} tone={ai.sensor_reliability > 0.6 ? 'ok' : 'warn'} />
            <p className="text-[11px] text-slate-400">EWMA smoothing · CUSUM {ai.cusum.toFixed(1)} · scores are demo-configured.</p>
          </CardContent>
        </Card>
      </section>

      <section aria-label="Live sensors" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {node.sensors.map((s) => {
          const th = THRESHOLDS[s.type];
          return (
            <Card key={s.id} className="p-3">
              <div className="flex items-start justify-between gap-1"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.label}</p><SensorHealthBadge health={s.health} /></div>
              <p className="tabular mt-1 text-2xl font-semibold text-slate-900">{s.last_value.toFixed(th.decimals)}<span className="ml-1 text-sm font-normal text-slate-500">{s.unit}</span></p>
              <Spark data={hist[s.type] ?? []} color={CHART_COLORS[s.type]} />
              <dl className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-slate-500">
                <div><dt>Quality</dt><dd className="tabular font-semibold text-slate-800">{(s.quality_score * 100).toFixed(0)}%</dd></div>
                <div><dt>Weight</dt><dd className="tabular font-semibold text-slate-800">{s.weight.toFixed(2)}</dd></div>
                <div><dt>Cal.</dt><dd className="font-semibold text-slate-800">{s.calibration_date.slice(2)}</dd></div>
              </dl>
              <p className="mt-1 truncate text-[10px] text-slate-400">{s.model}</p>
            </Card>
          );
        })}
      </section>

      <section aria-label="Trends" className="mt-4 grid gap-4 md:grid-cols-2">
        {node.sensors.map((s) => {
          const th = THRESHOLDS[s.type];
          const showThr = s.type === 'water_level' || s.type === 'rainfall' || s.type === 'pm25' || s.type === 'smoke';
          return (
            <Card key={s.id}>
              <CardHeader><CardTitle>{s.label} trend</CardTitle><span className="text-xs text-slate-400">{s.unit} · simulated</span></CardHeader>
              <CardContent>
                <TrendChart data={hist[s.type] ?? []} color={CHART_COLORS[s.type]} unit={s.unit} name={s.label} decimals={th.decimals} warn={showThr ? th.warn : undefined} danger={showThr ? th.danger : undefined} />
              </CardContent>
            </Card>
          );
        })}
        <Card>
          <CardHeader><CardTitle>Battery</CardTitle><span className="text-xs text-slate-400">% · simulated</span></CardHeader>
          <CardContent><TrendChart data={hist.battery ?? []} color="#16a34a" unit="%" name="Battery" decimals={1} domain={['auto', 'auto']} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Signal (RSSI)</CardTitle><span className="text-xs text-slate-400">dBm · simulated</span></CardHeader>
          <CardContent><TrendChart data={hist.signal ?? []} color="#475569" unit="dBm" name="Signal" decimals={0} /></CardContent>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Node health</CardTitle><HealthBadge health={node.health_status} /></CardHeader>
          <CardContent className="space-y-3">
            <Indicator icon={<Battery className="h-4 w-4" aria-hidden />} label="Battery (LiFePO4)" value={`${node.battery.toFixed(1)}%`} bar={node.battery} tone={node.battery > 50 ? 'ok' : node.battery > 25 ? 'warn' : 'crit'} />
            <Indicator icon={<Sun className="h-4 w-4" aria-hidden />} label="Solar" value={`${node.solar.toFixed(1)} W`} bar={(node.solar / 8) * 100} tone="navy" />
            <Indicator icon={<Radio className="h-4 w-4" aria-hidden />} label="Connectivity" value={`${node.signal.toFixed(0)} dBm · SNR ${node.snr.toFixed(1)} dB${node.buffered_msgs ? ` · ${node.buffered_msgs} msgs buffered` : ''}`} bar={Math.max(0, Math.min(100, ((node.signal + 125) / 45) * 100))} tone={node.signal > -105 ? 'ok' : 'warn'} />
            <Indicator icon={<HardDrive className="h-4 w-4" aria-hidden />} label="Storage" value={`${node.storage.toFixed(0)}% used`} bar={node.storage} tone={node.storage < 80 ? 'navy' : 'warn'} />
            <div>
              <p className="mb-1 text-xs text-slate-500">Sensor status</p>
              <ul className="flex flex-wrap gap-1.5">{node.sensors.map((s) => <li key={s.id} className="inline-flex items-center gap-1 text-xs text-slate-700">{s.label}: <SensorHealthBadge health={s.health} /></li>)}</ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Evidence fusion (this node)</CardTitle><Badge tone="ai">AI-1</Badge></CardHeader>
          <CardContent>{fusion ? <FusionPanel fusion={fusion} /> : null}</CardContent>
        </Card>
      </section>

      <section className="mt-4"><PodVisual node={node} /></section>
    </>
  );
}

function Indicator({ label, value, bar, tone, icon }: { label: string; value: string; bar: number; tone: 'navy' | 'ok' | 'warn' | 'crit' | 'ai'; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 text-slate-500">{icon}{label}</span><span className="tabular font-medium text-slate-800">{value}</span></div>
      <div className="mt-1"><Meter value={bar} tone={tone} label={label} /></div>
    </div>
  );
}

export type _Unused = SensorType;
