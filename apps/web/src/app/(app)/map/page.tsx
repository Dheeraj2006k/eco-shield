'use client';

import { Layers } from 'lucide-react';
import { useState } from 'react';
import { Badge, Card, cn } from '@iris/ui';
import { HAZARD_META, OFFLINE_HEX, RISK_META } from '@iris/config';
import type { HazardClass } from '@iris/types';
import { PageSkeleton } from '@/components/common/states';
import { PageHeader } from '@/components/common/widgets';
import IrisMap, { type MapLayer } from '@/components/map/IrisMap';
import { NodeDrawer } from '@/components/map/NodeDrawer';
import { useIris } from '@/lib/store';

const FILTERS: { v: HazardClass | 'ALL'; label: string }[] = [
  { v: 'ALL', label: 'All' },
  { v: 'FLOOD', label: 'Flood' },
  { v: 'FIRE', label: 'Fire' },
  { v: 'AIR', label: 'Air' },
  { v: 'LANDSLIDE', label: 'Landslide' },
  { v: 'WATER_QUALITY', label: 'Water Quality' },
];

const LAYERS: { v: MapLayer; label: string }[] = [
  { v: 'health', label: 'Node health' },
  { v: 'risk', label: 'Risk heatmap' },
  { v: 'rainfall', label: 'Rainfall' },
  { v: 'water', label: 'Water level' },
  { v: 'air', label: 'Air quality' },
  { v: 'fire', label: 'Fire risk' },
  { v: 'population', label: 'Population exposure' },
  { v: 'infra', label: 'Critical infrastructure' },
];

export default function MapPage() {
  const d = useIris((s) => s.data);
  const [filter, setFilter] = useState<HazardClass | 'ALL'>('ALL');
  const [layers, setLayers] = useState<Set<MapLayer>>(new Set<MapLayer>(['health', 'risk']));
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  if (!d) return <PageSkeleton />;

  const toggle = (l: MapLayer) =>
    setLayers((prev) => {
      const n = new Set(prev);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });
  const node = d.nodes.find((n) => n.id === selected) ?? null;
  const count = (h: HazardClass | 'ALL') => (h === 'ALL' ? d.nodes.length : d.nodes.filter((n) => n.hazard === h).length);
  const empty = filter !== 'ALL' && count(filter) === 0;

  return (
    <>
      <PageHeader title="Live GIS Map" subtitle="Demo network of sensor nodes and edge gateways. Hover a marker for a summary, click for the detail drawer." />
      <Card className="relative overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-2.5">
          <div role="group" aria-label="Hazard filter" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button key={f.v} onClick={() => setFilter(f.v)} aria-pressed={filter === f.v} className={cn('rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors', filter === f.v ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50')}>
                {f.label} <span className="opacity-70">({count(f.v)})</span>
              </button>
            ))}
          </div>
          <button onClick={() => setPanel((p) => !p)} aria-expanded={panel} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
            <Layers className="h-3.5 w-3.5" aria-hidden /> Layers ({layers.size})
          </button>
        </div>
        {panel && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-b border-slate-100 bg-slate-50 p-3 sm:grid-cols-4">
            {LAYERS.map((l) => (
              <label key={l.v} className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={layers.has(l.v)} onChange={() => toggle(l.v)} className="h-4 w-4 rounded border-slate-300 text-navy-700" />
                {l.label}
              </label>
            ))}
          </div>
        )}

        <div className="relative">
          <IrisMap className="h-[calc(100dvh-15rem)] min-h-[440px]" nodes={d.nodes} gateways={d.gateways} incidents={d.incidents} now={d.now} layers={layers} hazardFilter={filter} selectedId={selected} onSelect={setSelected} />
          {empty && (
            <div className="absolute left-1/2 top-4 z-[500] -translate-x-1/2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700 shadow-pop ring-1 ring-slate-200">
              No {HAZARD_META[filter as HazardClass].short.toLowerCase()} pods are deployed in the demo network — this hazard module is supported by the architecture but has no simulated nodes.
            </div>
          )}
          {node && <NodeDrawer node={node} now={d.now} onClose={() => setSelected(null)} />}
          <div className="absolute bottom-3 left-3 z-[500] rounded-lg bg-white/95 p-2.5 text-[11px] shadow-card ring-1 ring-slate-200" aria-label="Legend">
            <p className="mb-1 font-semibold uppercase tracking-wide text-slate-500">Node status</p>
            <ul className="space-y-0.5">
              {(['NORMAL', 'WATCH', 'HIGH', 'CRITICAL'] as const).map((r) => (
                <li key={r} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: RISK_META[r].hex }} />{r === 'NORMAL' ? 'Normal (green)' : r === 'WATCH' ? 'Watch (yellow)' : r === 'HIGH' ? 'High (orange)' : 'Critical (red)'}</li>
              ))}
              <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: OFFLINE_HEX }} />Offline (gray)</li>
              <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-navy-700" />Gateway</li>
            </ul>
          </div>
          <Badge tone="maint" className="absolute left-1/2 top-3 z-[500] -translate-x-1/2">Demo / simulated data</Badge>
        </div>
      </Card>
    </>
  );
}
