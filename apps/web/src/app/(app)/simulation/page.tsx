'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Tabs } from '@iris/ui';
import { RISK_META, THRESHOLDS } from '@iris/config';
import { ConfidenceBadge, RiskBadge } from '@/components/common/badges';
import { PageSkeleton } from '@/components/common/states';
import { Dl, Meter, PageHeader } from '@/components/common/widgets';
import { confidenceLevel } from '@/lib/engine/fusion';
import { INFRASTRUCTURE, RIVER_PATH } from '@/lib/engine/seed';
import { SANDBOX_DEFAULTS, propagateRise, project, runSandbox, type SandboxInput, type SandboxScenario } from '@/lib/engine/sandbox';
import { riskFromScore } from '@/lib/derive';
import { useIris } from '@/lib/store';

function Slider({ label, unit, value, min, max, step = 1, onChange }: { label: string; unit: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const id = `sl-${label.replace(/\W/g, '')}`;
  return (
    <div>
      <div className="flex justify-between text-xs"><label htmlFor={id} className="font-medium text-slate-700">{label}</label><span className="tabular text-slate-600">{value} {unit}</span></div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-navy-700" />
    </div>
  );
}

export default function SimulationPage() {
  const d = useIris((s) => s.data);
  const [tab, setTab] = useState<'sandbox' | 'twin'>('sandbox');
  const [inp, setInp] = useState<SandboxInput>(SANDBOX_DEFAULTS);
  const [rise, setRise] = useState(20);
  const out = useMemo(() => runSandbox(inp), [inp]);
  if (!d) return <PageSkeleton />;
  const set = <K extends keyof SandboxInput>(k: K, v: SandboxInput[K]) => setInp((p) => ({ ...p, [k]: v }));
  const level = riskFromScore(out.score);
  const affected = d.nodes.filter((n) => n.hazard === out.hazard);

  return (
    <>
      <PageHeader title="Simulation" subtitle="Decision-support what-if simulation. It illustrates how evidence would be scored — it does not predict outcomes and does not change the live demo state." />
      <Tabs tabs={[{ value: 'sandbox', label: 'What-if sandbox' }, { value: 'twin', label: 'Digital twin (advanced / research)' }]} value={tab} onChange={setTab} className="mb-4" />

      {tab === 'sandbox' && (
        <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader><CardTitle>Scenario &amp; controls</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div role="group" aria-label="Scenario" className="grid grid-cols-2 gap-1.5">
                {(['FLOOD', 'FIRE', 'POLLUTION', 'LANDSLIDE'] as SandboxScenario[]).map((s) => (
                  <Button key={s} size="sm" variant={inp.scenario === s ? 'primary' : 'outline'} aria-pressed={inp.scenario === s} onClick={() => set('scenario', s)}>{s}</Button>
                ))}
              </div>
              <Slider label="Rainfall" unit="mm/h" value={inp.rainfall} min={0} max={60} onChange={(v) => set('rainfall', v)} />
              <Slider label="Water level" unit="cm" value={inp.waterLevel} min={100} max={400} onChange={(v) => set('waterLevel', v)} />
              <Slider label="Temperature" unit="°C" value={inp.temperature} min={15} max={60} onChange={(v) => set('temperature', v)} />
              <Slider label="Humidity" unit="%" value={inp.humidity} min={10} max={100} onChange={(v) => set('humidity', v)} />
              <Slider label="Wind" unit="km/h" value={inp.wind} min={0} max={60} onChange={(v) => set('wind', v)} />
              <Slider label="Smoke / particulate index" unit="idx" value={inp.smoke} min={0} max={700} step={10} onChange={(v) => set('smoke', v)} />
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={inp.sensorFailure} onChange={(e) => set('sensorFailure', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />Sensor failure (primary sensor down-weighted)</label>
              <Button variant="ghost" size="sm" onClick={() => setInp(SANDBOX_DEFAULTS)}>Reset controls</Button>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Current state &amp; risk</CardTitle><Badge tone="maint">What-if · not a prediction</Badge></CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Severity</p><div className="mt-1"><RiskBadge level={level} /></div></div>
                  <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Confidence</p><div className="mt-1"><ConfidenceBadge level={confidenceLevel(out.confidence)} value={out.confidence} /></div></div>
                  <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Evidence score</p><p className="tabular text-xl font-semibold">{out.score.toFixed(2)}</p></div>
                </div>
                <div className="mt-3"><Meter value={out.score * 100} tone={level === 'CRITICAL' ? 'crit' : level === 'HIGH' || level === 'WATCH' ? 'warn' : 'ok'} label="Evidence score" /></div>
                {inp.sensorFailure && <p className="mt-2 rounded-lg bg-sky-50 p-2 text-xs text-sky-800">With the primary sensor failed, its weight collapses: the score is discounted and confidence falls, matching the live quorum logic.</p>}
                <Dl cols={1} items={[
                  ['Water level', `${inp.waterLevel} cm (warn ${THRESHOLDS.water_level.warn} · danger ${THRESHOLDS.water_level.danger})`],
                  ['Rainfall', `${inp.rainfall} mm/h`],
                  ['Temp / humidity / wind', `${inp.temperature} °C · ${inp.humidity}% · ${inp.wind} km/h`],
                ]} />
              </CardContent>
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Affected nodes</CardTitle></CardHeader>
                <CardContent>
                  {affected.length === 0 ? <p className="text-sm text-slate-500">No {inp.scenario.toLowerCase()} nodes are deployed in the demo network.</p> : (
                    <ul className="space-y-1.5 text-sm">{affected.map((n) => <li key={n.id} className="flex justify-between"><span>{n.code}</span><span className="text-xs text-slate-500">{out.score > 0.3 ? 'in scope' : 'below threshold'}</span></li>)}</ul>
                  )}
                  <h4 className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Propagation</h4>
                  {out.propagation.length ? <ul className="list-inside list-disc text-xs text-slate-600">{out.propagation.map((p) => <li key={p}>{p}</li>)}</ul> : <p className="text-xs text-slate-500">No propagation at this level.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Critical infrastructure exposure</CardTitle></CardHeader>
                <CardContent>
                  {out.exposure.length === 0 ? <p className="text-sm text-slate-500">No facilities flagged at this level.</p> : <ul className="space-y-1 text-sm">{out.exposure.map((e) => <li key={e} className="rounded bg-orange-50 px-2 py-1 text-orange-800">{e}</li>)}</ul>}
                  <p className="mt-2 text-[11px] text-slate-400">Facility names and locations are demo placeholders.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      )}

      {tab === 'twin' && <Twin rise={rise} setRise={setRise} />}
    </>
  );
}

function Twin({ rise, setRise }: { rise: number; setRise: (n: number) => void }) {
  const d = useIris((s) => s.data)!;
  const W = 760;
  const H = 420;
  const hyd = d.nodes.filter((n) => n.hazard === 'FLOOD');
  const prop = useMemo(() => propagateRise(hyd.map((n) => ({ id: n.id, lat: n.location.lat, lon: n.location.lon, level: n.sensors.find((s) => s.type === 'water_level')!.last_value })), rise), [hyd, rise]);
  const river = RIVER_PATH.map(([la, lo]) => project(la, lo, W, H).join(',')).join(' ');
  const warn = THRESHOLDS.water_level.warn;
  const danger = THRESHOLDS.water_level.danger;
  const exposedInfra = INFRASTRUCTURE.filter((c) => c.hazards.includes('FLOOD')).map((c) => {
    const nearest = prop.reduce((a, b) => (Math.hypot(a.lat - c.lat, a.lon - c.lon) < Math.hypot(b.lat - c.lat, b.lon - c.lon) ? a : b));
    return { ...c, level: nearest.after, near: nearest.id };
  });

  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader>
          <div><CardTitle>What happens if the water level rises by +{rise} cm?</CardTitle><p className="text-xs text-slate-500">Schematic twin of the flood corridor: upstream → downstream → affected zones.</p></div>
          <Badge tone="ai">Advanced / research</Badge>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {[10, 20, 40, 60].map((v) => <Button key={v} size="sm" variant={rise === v ? 'primary' : 'outline'} onClick={() => setRise(v)}>+{v} cm</Button>)}
            <input aria-label="Water level rise (cm)" type="range" min={0} max={80} value={rise} onChange={(e) => setRise(Number(e.target.value))} className="w-40 accent-navy-700" />
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-slate-50 ring-1 ring-slate-200" role="img" aria-label="Digital twin schematic of river, nodes, infrastructure and hazard zones">
            {/* population blocks */}
            {[[30.0, 78.2], [30.06, 78.28], [29.93, 78.16], [30.13, 78.52]].map(([la, lo], i) => { const [x, y] = project(la, lo, W, H); return <rect key={i} x={x - 26} y={y - 16} width={52} height={32} rx={5} fill="#cbd5e1" opacity={0.5} />; })}
            <text x={20} y={H - 14} fontSize="10" fill="#94a3b8">population blocks (demo) · roads · river · nodes · gateways</text>
            {/* roads */}
            <polyline points={`${project(29.9, 78.12, W, H).join(',')} ${project(30.0, 78.22, W, H).join(',')} ${project(30.12, 78.33, W, H).join(',')} ${project(30.15, 78.6, W, H).join(',')}`} fill="none" stroke="#94a3b8" strokeWidth="3" strokeDasharray="8 4" />
            {/* hazard zones along river (widen with rise) */}
            <polyline points={river} fill="none" stroke="#3b82f6" strokeOpacity={0.18} strokeWidth={22 + rise * 0.9} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={river} fill="none" stroke="#2563eb" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
            {/* flow direction */}
            <polyline points={river} fill="none" stroke="#bfdbfe" strokeWidth={2} strokeDasharray="6 10" className="animate-flow" />
            {/* gateways */}
            {d.gateways.map((g) => { const [x, y] = project(g.lat, g.lon, W, H); return <g key={g.id}><rect x={x - 9} y={y - 9} width={18} height={18} rx={4} fill="#1f3f70" /><text x={x} y={y + 3} fontSize="8" fill="#fff" textAnchor="middle">GW</text><text x={x} y={y + 22} fontSize="9" fill="#475569" textAnchor="middle">{g.id}</text></g>; })}
            {/* infrastructure */}
            {exposedInfra.map((c) => { const [x, y] = project(c.lat, c.lon, W, H); const hot = c.level >= warn; return <g key={c.id}><rect x={x - 6} y={y - 6} width={12} height={12} transform={`rotate(45 ${x} ${y})`} fill={hot ? '#ea580c' : '#64748b'} stroke="#fff" strokeWidth={1.5} /><title>{c.name}{hot ? ' — exposed' : ''}</title></g>; })}
            {/* nodes */}
            {prop.map((p) => { const [x, y] = project(p.lat, p.lon, W, H); const lvl = p.after >= danger ? 'CRITICAL' : p.after >= warn ? 'HIGH' : 'NORMAL'; return (
              <g key={p.id}><circle cx={x} cy={y} r={11} fill={RISK_META[lvl].hex} stroke="#fff" strokeWidth={3} /><text x={x} y={y + 3.5} fontSize="9" fill="#fff" fontWeight="700" textAnchor="middle">W</text><text x={x} y={y - 16} fontSize="10" fontWeight="600" fill="#0f2140" textAnchor="middle">{p.id}</text><text x={x} y={y + 26} fontSize="9" fill="#475569" textAnchor="middle">{p.after.toFixed(0)} cm</text></g>
            ); })}
            <text x={W - 20} y={24} fontSize="11" fill="#2563eb" textAnchor="end">UPSTREAM →</text>
            <text x={20} y={24} fontSize="11" fill="#2563eb">← DOWNSTREAM</text>
          </svg>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Upstream → downstream</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {prop.map((p, i) => (
                <li key={p.id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
                  <div className="flex items-center justify-between"><b>{p.id}</b><RiskBadge level={p.after >= danger ? 'CRITICAL' : p.after >= warn ? 'HIGH' : 'NORMAL'} /></div>
                  <p className="tabular text-xs text-slate-600">{p.before.toFixed(0)} → {p.after.toFixed(0)} cm{i > 0 ? ` · arrives in ~${p.etaMin} min (${p.km.toFixed(0)} km at ~9 km/h)` : ' · rise applied here'}</p>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[11px] text-slate-400">Attenuation and travel speed are illustrative constants, not a hydraulic model.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Affected zones &amp; facilities</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {exposedInfra.map((c) => <li key={c.id} className="flex justify-between gap-2"><span className="text-slate-700">{c.name}</span><Badge tone={c.level >= danger ? 'crit' : c.level >= warn ? 'high' : 'ok'}>{c.level >= warn ? 'Exposed' : 'Clear'}</Badge></li>)}
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
