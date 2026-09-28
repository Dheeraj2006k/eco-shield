'use client';

import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@iris/ui';
import { HAZARD_META, RISK_META, THRESHOLDS } from '@iris/config';
import type { SensorType } from '@iris/types';
import { Gauge } from '@/components/charts/Gauge';
import { Spark } from '@/components/charts/TrendChart';
import { PageSkeleton } from '@/components/common/states';
import { PageHeader } from '@/components/common/widgets';
import { regionRisks, riskFromScore } from '@/lib/derive';
import { norm } from '@/lib/engine/fusion';
import { pollutionCalendar, rainLevelScatter, severityTimeline } from '@/lib/engine/insights';
import { useIris } from '@/lib/store';

const tip = { fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' } as const;
const COLS: SensorType[] = ['water_level', 'rainfall', 'pm25', 'pm10', 'smoke', 'temperature', 'humidity'];
const RAMP = ['#dcfce7', '#fef9c3', '#fed7aa', '#fca5a5', '#ef4444'];
const ramp = (x: number) => RAMP[Math.min(RAMP.length - 1, Math.floor(x * RAMP.length))];

export default function InsightsPage() {
  const d = useIris((s) => s.data);
  const cal = useMemo(() => pollutionCalendar(), []);
  const scatter = useMemo(() => rainLevelScatter(), []);
  const sev = useMemo(() => severityTimeline(), []);
  const regions = useMemo(() => (d ? regionRisks(d) : []), [d]);
  if (!d) return <PageSkeleton />;

  const val = (id: string, t: SensorType) => d.nodes.find((n) => n.id === id)?.sensors.find((s) => s.type === t)?.last_value ?? 0;
  const liveScatter = d.nodes.filter((n) => n.hazard === 'FLOOD').map((n) => ({ rain: +(n.sensors.find((s) => s.type === 'rainfall')?.last_value ?? 0).toFixed(1), level: Math.round(n.sensors.find((s) => s.type === 'water_level')?.last_value ?? 0), id: n.id }));
  const radar = ['FLOOD', 'FIRE', 'AIR', 'LANDSLIDE'].map((h) => ({ hazard: HAZARD_META[h as keyof typeof HAZARD_META].short, ...Object.fromEntries(regions.map((r) => [r.name.replace(' (demo)', ''), Math.round(r.risk[h as 'FLOOD'] * 100)])) }));
  const radarColors = ['#2563eb', '#ea580c', '#7c3aed'];
  const maxDay = Math.max(...cal.map((c) => c.v));

  return (
    <>
      <PageHeader eyebrow="Situational awareness" title="Visual insights" subtitle="Live gauges, heatmaps and radar computed from the running demo engine, alongside synthetic historical patterns. Run a scenario in Demo Control and watch these change." />

      <Card>
        <CardHeader><CardTitle>Key gauges (live)</CardTitle><Badge tone="maint">Simulated</Badge></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
            <Gauge label="HYD-001 water level" value={val('HYD-001', 'water_level')} min={100} max={400} warn={THRESHOLDS.water_level.warn} danger={THRESHOLDS.water_level.danger} unit="cm" />
            <Gauge label="HYD-001 rainfall" value={val('HYD-001', 'rainfall')} min={0} max={60} warn={THRESHOLDS.rainfall.warn} danger={THRESHOLDS.rainfall.danger} unit="mm/h" decimals={1} />
            <Gauge label="AIR-002 PM2.5" value={val('AIR-002', 'pm25')} min={0} max={350} warn={THRESHOLDS.pm25.warn} danger={THRESHOLDS.pm25.danger} unit="µg/m³" />
            <Gauge label="AIR-002 PM10" value={val('AIR-002', 'pm10')} min={0} max={550} warn={THRESHOLDS.pm10.warn} danger={THRESHOLDS.pm10.danger} unit="µg/m³" />
            <Gauge label="FIR-001 smoke" value={val('FIR-001', 'smoke')} min={0} max={800} warn={THRESHOLDS.smoke.warn} danger={THRESHOLDS.smoke.danger} unit="idx" />
            <Gauge label="FIR-001 temp" value={val('FIR-001', 'temperature')} min={15} max={65} warn={THRESHOLDS.temperature.warn} danger={THRESHOLDS.temperature.danger} unit="°C" decimals={1} />
          </div>
        </CardContent>
      </Card>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Node × sensor heatmap (live)</CardTitle><p className="text-xs text-slate-500">Each cell is the reading normalised from baseline (0) to danger (1).</p></div></CardHeader>
          <CardContent>
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[520px] border-separate border-spacing-1 text-center text-[11px]">
                <thead><tr><th className="text-left font-semibold text-slate-500">Node</th>{COLS.map((c) => <th key={c} className="font-semibold text-slate-500">{THRESHOLDS[c].label.split(' ')[0]}</th>)}</tr></thead>
                <tbody>
                  {d.nodes.map((n) => (
                    <tr key={n.id}>
                      <td className="text-left font-semibold text-slate-800">{n.id}</td>
                      {COLS.map((c) => {
                        const s = n.sensors.find((x) => x.type === c);
                        if (!s) return <td key={c} className="rounded bg-slate-100 py-1.5 text-slate-300" aria-label="not fitted">–</td>;
                        const x = norm(c, s.last_value);
                        return <td key={c} className="tabular rounded py-1.5 font-medium text-slate-800" style={{ background: ramp(x) }} title={`${s.label}: ${s.last_value.toFixed(THRESHOLDS[c].decimals)} ${s.unit}`}>{s.last_value.toFixed(THRESHOLDS[c].decimals)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-500">baseline {RAMP.map((c) => <span key={c} className="h-3 w-6 rounded-sm" style={{ background: c }} />)} danger</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Regional risk radar (live)</CardTitle><p className="text-xs text-slate-500">Score 0–100 per hazard; landslide is a static illustrative baseline.</p></div></CardHeader>
          <CardContent>
            <div className="h-72" role="img" aria-label="Radar chart of regional risk by hazard">
              <ResponsiveContainer>
                <RadarChart data={radar} outerRadius="72%">
                  <PolarGrid stroke="#e2e8f0" /><PolarAngleAxis dataKey="hazard" tick={{ fontSize: 11 }} /><PolarRadiusAxis domain={[0, (max: number) => Math.max(40, Math.ceil(max / 10) * 10)]} tick={{ fontSize: 9 }} angle={90} />
                  {regions.map((r, i) => <Radar key={r.id} name={r.name.replace(' (demo)', '')} dataKey={r.name.replace(' (demo)', '')} stroke={radarColors[i]} fill={radarColors[i]} fillOpacity={0.18} isAnimationActive={false} />)}
                  <Legend wrapperStyle={{ fontSize: 11 }} /><Tooltip contentStyle={tip} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="mt-4">
        <CardHeader><div><CardTitle>PM2.5 heat calendar — hour of day × last 14 days</CardTitle><p className="text-xs text-slate-500">Synthetic history: morning and evening peaks, weekend dip, one multi-day episode.</p></div><Badge tone="maint">Synthetic</Badge></CardHeader>
        <CardContent>
          <div className="scroll-thin overflow-x-auto">
            <div className="grid min-w-[560px] gap-[3px]" style={{ gridTemplateColumns: `36px repeat(14, 1fr)` }} role="img" aria-label="Heat calendar of PM2.5 by hour and day">
              <span />
              {Array.from({ length: 14 }, (_, i) => <span key={i} className="text-center text-[10px] text-slate-400">D-{13 - i}</span>)}
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="contents">
                  <span className="pr-1 text-right text-[10px] leading-4 text-slate-400">{String(h).padStart(2, '0')}h</span>
                  {Array.from({ length: 14 }, (_, day) => {
                    const c = cal.find((x) => x.day === day && x.hour === h)!;
                    return <span key={day} className="h-4 rounded-[3px]" style={{ background: ramp(Math.min(0.999, c.v / maxDay)) }} title={`D-${13 - day} ${h}:00 — ${c.v.toFixed(0)} µg/m³`} />;
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Rainfall vs. water level</CardTitle><p className="text-xs text-slate-500">Synthetic relationship (grey) with live flood nodes highlighted.</p></div></CardHeader>
          <CardContent>
            <div className="h-72" role="img" aria-label="Scatter of rainfall versus water level">
              <ResponsiveContainer>
                <ScatterChart margin={{ left: -10, right: 8, top: 8 }}>
                  <CartesianGrid stroke="#eef2f7" />
                  <XAxis type="number" dataKey="rain" name="Rainfall" unit=" mm/h" tick={{ fontSize: 10 }} /><YAxis type="number" dataKey="level" name="Water level" unit=" cm" tick={{ fontSize: 10 }} domain={[100, 400]} /><ZAxis range={[40, 40]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 11 }} />
                  <Scatter name="Synthetic history" data={scatter} fill="#94a3b8" fillOpacity={0.6} isAnimationActive={false} />
                  <Scatter name="Live nodes" data={liveScatter} fill="#dc2626" isAnimationActive={false} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Alerts by severity — 30 days</CardTitle><p className="text-xs text-slate-500">Synthetic history.</p></div><Badge tone="maint">Synthetic</Badge></CardHeader>
          <CardContent>
            <div className="h-72" role="img" aria-label="Stacked area of alerts by severity over 30 days">
              <ResponsiveContainer>
                <AreaChart data={sev} margin={{ left: -22, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" /><XAxis dataKey="day" tick={{ fontSize: 10 }} minTickGap={20} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="WATCH" stackId="1" stroke={RISK_META.WATCH.hex} fill={RISK_META.WATCH.hex} fillOpacity={0.5} isAnimationActive={false} />
                  <Area type="monotone" dataKey="HIGH" stackId="1" stroke={RISK_META.HIGH.hex} fill={RISK_META.HIGH.hex} fillOpacity={0.55} isAnimationActive={false} />
                  <Area type="monotone" dataKey="CRITICAL" stackId="1" stroke={RISK_META.CRITICAL.hex} fill={RISK_META.CRITICAL.hex} fillOpacity={0.65} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="mt-4">
        <CardHeader><CardTitle>All nodes at a glance (live sparklines)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {d.nodes.map((n) => {
              const key = n.sensors[0].type;
              return (
                <div key={n.id} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="flex items-center justify-between text-xs"><b>{n.id}</b><span className="font-semibold" style={{ color: RISK_META[riskFromScore(n.risk_score)].hex }}>{n.risk_level}</span></div>
                  <p className="text-[10px] text-slate-500">{n.sensors[0].label}</p>
                  <Spark data={d.history[n.id]?.[key] ?? []} color={HAZARD_META[n.hazard].hex} height={34} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
