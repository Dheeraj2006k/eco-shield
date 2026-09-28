'use client';

import { create } from 'zustand';
import type { MaintenanceTicket, ScenarioKind } from '@iris/types';
import { acknowledgeIncident } from './engine/incidents';
import { restoreBackhaul, startScenario } from './engine/scenarios';
import { TICK_MS, createInitialData } from './engine/seed';
import { advanceTicket, createTicket, resolveTicket } from './engine/tickets';
import { tickEngine } from './engine/tick';
import type { EngineData } from './engine/types';
import { addLog } from './engine/util';

interface IrisState {
  data: EngineData | null;
  ready: boolean;
  paused: boolean;
  online: boolean;
  init: () => void;
  tick: () => void;
  setPaused: (p: boolean) => void;
  setOnline: (o: boolean) => void;
  runScenario: (kind: ScenarioKind) => void;
  restoreBackhaul: () => void;
  acknowledge: (id: string, by: string) => void;
  openTicket: (p: { node_id: string; issue: string; category: MaintenanceTicket['category']; priority: MaintenanceTicket['priority']; by: string }) => void;
  advanceTicket: (id: string, by: string) => void;
  resolveTicket: (id: string, by: string) => void;
  setMaintenanceMode: (nodeId: string, on: boolean, by: string) => void;
  markNotificationsRead: () => void;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Apply a mutation to a cloned copy of engine data so React selectors see fresh references. */
function mutate(get: () => IrisState, set: (p: Partial<IrisState>) => void, fn: (d: EngineData) => void) {
  const cur = get().data;
  if (!cur) return;
  const d = structuredClone(cur);
  d.now = Date.now();
  fn(d);
  set({ data: d });
}

export const useIris = create<IrisState>((set, get) => ({
  data: null,
  ready: false,
  paused: false,
  online: true,
  init: () => {
    if (get().data) return;
    const d = createInitialData(Date.now());
    tickEngine(d, Date.now());
    set({ data: d, ready: true });
    if (!timer) {
      timer = setInterval(() => {
        if (!get().paused) get().tick();
      }, TICK_MS);
    }
  },
  tick: () => mutate(get, set, (d) => tickEngine(d, Date.now())),
  setPaused: (paused) => set({ paused }),
  setOnline: (online) => set({ online }),
  runScenario: (kind) =>
    mutate(get, set, (d) => {
      startScenario(d, kind);
      tickEngine(d, Date.now());
    }),
  restoreBackhaul: () => mutate(get, set, (d) => restoreBackhaul(d)),
  acknowledge: (id, by) => mutate(get, set, (d) => void acknowledgeIncident(d, id, by)),
  openTicket: (p) =>
    mutate(get, set, (d) => {
      createTicket(d, { ...p, assigned_to: 'Unassigned' });
    }),
  advanceTicket: (id, by) => mutate(get, set, (d) => void advanceTicket(d, id, by)),
  resolveTicket: (id, by) => mutate(get, set, (d) => void resolveTicket(d, id, by)),
  setMaintenanceMode: (nodeId, on, by) =>
    mutate(get, set, (d) => {
      const n = d.nodes.find((x) => x.id === nodeId);
      if (!n) return;
      n.maintenance_mode = on;
      d.healthOverride[nodeId] = on ? 'MAINTENANCE_REQUIRED' : undefined;
      addLog(d, 'INFO', 'MAINTENANCE', `${nodeId} ${on ? 'entered' : 'left'} maintenance mode (${by}) — node evidence ${on ? 'excluded from fusion' : 'restored'}.`);
    }),
  markNotificationsRead: () => mutate(get, set, (d) => d.notifications.forEach((n) => (n.read = true))),
}));

export function useData(): EngineData | null {
  return useIris((s) => s.data);
}
