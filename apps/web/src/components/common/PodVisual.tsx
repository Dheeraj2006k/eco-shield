'use client';

import { Battery, Box, Cpu, Radio, Sun, Zap, Wrench, History, CalendarCheck2 } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@iris/ui';
import type { IrisNode } from '@iris/types';
import { useCan } from '@/lib/session';
import { useIris } from '@/lib/store';
import { SensorHealthBadge } from './badges';
import { Meter } from './widgets';

export const CORE_PARTS = [
  { icon: Cpu, name: 'ESP32-S3 WROOM-1 / N16R8', role: 'Node MCU · AI-0' },
  { icon: Radio, name: 'Seeed Wio-E5', role: 'LoRa-E5 / LoRaWAN radio' },
  { icon: Battery, name: 'LiFePO4 IFR26650', role: 'Storage cell' },
  { icon: Sun, name: 'Solar 6V/9V 5–10 W', role: 'Harvesting' },
  { icon: Zap, name: 'TP5000', role: 'Charge controller' },
  { icon: Box, name: 'IP65 enclosure', role: 'Weather-proof housing' },
];

export function PodVisual({ node }: { node: IrisNode }) {
  const pod = node.installed_pods[0];
  const canService = useCan('service_nodes');
  const setMaint = useIris((s) => s.setMaintenanceMode);
  const isHydro = pod.type === 'HYDRO_FLOOD_POD';
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Universal modular sensor node</CardTitle>
          <p className="mt-0.5 text-xs text-slate-500">Replaceable sensor pod + universal core = configurable multi-hazard node</p>
        </div>
        <Button
          size="sm"
          variant={node.maintenance_mode ? 'warning' : 'outline'}
          disabled={!canService}
          title={canService ? undefined : 'Requires Field Steward or Administrator role'}
          onClick={() => setMaint(node.id, !node.maintenance_mode, 'steward')}
        >
          <Wrench className="h-3.5 w-3.5" aria-hidden />
          {node.maintenance_mode ? 'EXIT MAINTENANCE MODE' : 'ENTER MAINTENANCE MODE'}
        </Button>
      </CardHeader>
      <CardContent>
        {node.maintenance_mode && (
          <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 ring-1 ring-sky-200">
            Node is in maintenance mode: its readings are excluded from evidence fusion and no alerts are raised from this pod while it is serviced.
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-[1.1fr_auto_1fr]">
          {/* Pod */}
          <div className="rounded-xl border-2 border-dashed border-navy-300 bg-navy-50/50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-600">Current pod</p>
              <Badge tone="info">{pod.serial}</Badge>
            </div>
            <p className="mt-1 text-base font-semibold text-navy-900">{pod.name}</p>
            <ul className="mt-2 space-y-1.5">
              {node.sensors.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-xs ring-1 ring-slate-200">
                  <span><span className="font-medium text-slate-800">{s.model}</span> <span className="text-slate-500">· {s.label}</span></span>
                  <SensorHealthBadge health={s.health} />
                </li>
              ))}
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-slate-500">Pod health</p>
                <p className="tabular font-semibold text-slate-800">{pod.health}%</p>
                <Meter value={pod.health} tone={pod.health > 80 ? 'ok' : 'warn'} label="Pod health" />
              </div>
              <div>
                <p className="flex items-center gap-1 text-slate-500"><CalendarCheck2 className="h-3 w-3" aria-hidden />Calibration</p>
                <p className="font-semibold text-slate-800">{pod.last_calibration}</p>
                <p className="text-slate-500">Last service {node.last_service}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Alternative pod: {isHydro ? 'FIRE / AIR POD (Sensirion SPS30 · MQ-2 · DHT22 / SHT31)' : 'HYDRO / FLOOD POD (DFRobot A02YYUW · SEN0575 · DHT22 / SHT31)'}</p>
          </div>

          <div className="flex items-center justify-center text-2xl font-light text-slate-400" aria-hidden>+</div>

          {/* Core */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Universal core</p>
            <ul className="mt-2 space-y-1.5">
              {CORE_PARTS.map((p) => (
                <li key={p.name} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-xs ring-1 ring-slate-200">
                  <p.icon className="h-4 w-4 text-slate-500" aria-hidden />
                  <span className="font-medium text-slate-800">{p.name}</span>
                  <span className="ml-auto text-slate-500">{p.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><History className="h-3.5 w-3.5" aria-hidden />Replacement history</p>
          {pod.replacement_history.length === 0 ? (
            <p className="text-xs text-slate-500">No pod replacements recorded — original pod installed {pod.installed_at}.</p>
          ) : (
            <ul className="space-y-1 text-xs text-slate-700">
              {pod.replacement_history.map((h, i) => (
                <li key={i} className="flex gap-2"><span className="tabular font-mono text-slate-500">{h.date}</span><span>{h.reason}</span><span className="ml-auto text-slate-400">{h.by}</span></li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
