'use client';

import { create } from 'zustand';
import type { MaintenanceTicket, ScenarioKind, TelemetryPoint } from '@iris/types';
import { acknowledgeIncident } from './engine/incidents';
import { restoreBackhaul, startScenario } from './engine/scenarios';
import { HISTORY_MAX, TICK_MS, createInitialData } from './engine/seed';
import { advanceTicket, createTicket, resolveTicket } from './engine/tickets';
import { tickEngine } from './engine/tick';
import type { EngineData } from './engine/types';
import { addLog } from './engine/util';
import { API_URL, ApiError, apiFetch, connectState, remoteAvailable } from './remote';

export type DataSource = 'local' | 'remote';
export type RemoteStatus = 'off' | 'connecting' | 'live' | 'error';

const SLUG: Record<ScenarioKind, string> = {
  NORMAL: 'normal', FLOOD: 'flood', FIRE: 'fire', POLLUTION: 'pollution', SENSOR_FAILURE: 'sensor-failure',
  NODE_OFFLINE: 'node-offline', BACKHAUL_OUTAGE: 'backhaul-outage', MAINTENANCE: 'maintenance-event', LANDSLIDE: 'normal',
};

interface IrisState {
  data: EngineData | null;
  ready: boolean;
  paused: boolean;
  online: boolean;
  source: DataSource;
  remoteStatus: RemoteStatus;
  remoteDetail: string;
  actionError: string;
  init: () => void;
  setSource: (s: DataSource) => void;
  clearActionError: () => void;
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
let closeRemote: (() => void) | null = null;
const PREF = 'eco.source';

function readPref(): DataSource {
  try {
    const v = localStorage.getItem(PREF);
    if (v === 'remote' || v === 'local') return v;
  } catch {}
  return process.env.NEXT_PUBLIC_DEFAULT_SOURCE === 'remote' ? 'remote' : 'local';
}

/** Merge a live delta (no history, newest point per metric) into the history we already hold. */
function mergeState(prev: EngineData | null, msg: Record<string, unknown>): EngineData {
  const tail = (msg.history_tail ?? {}) as Record<string, Record<string, TelemetryPoint>>;
  const history: EngineData['history'] = prev ? { ...prev.history } : {};
  for (const [node, metrics] of Object.entries(tail)) {
    const cur = { ...(history[node] ?? {}) };
    for (const [m, pt] of Object.entries(metrics)) {
      const arr = cur[m] ? cur[m].slice() : [];
      if (!arr.length || arr[arr.length - 1].timestamp < pt.timestamp) arr.push(pt);
      if (arr.length > HISTORY_MAX) arr.splice(0, arr.length - HISTORY_MAX);
      cur[m] = arr;
    }
    history[node] = cur;
  }
  const { history_tail: _t, ...rest } = msg;
  void _t;
  return { ...(rest as unknown as EngineData), history };
}

export const useIris = create<IrisState>((set, get) => {
  /** Apply a mutation to a cloned copy of local engine data so React selectors see fresh references. */
  const mutate = (fn: (d: EngineData) => void) => {
    const cur = get().data;
    if (!cur || get().source !== 'local') return;
    const d = structuredClone(cur);
    d.now = Date.now();
    fn(d);
    set({ data: d });
  };

  /** Run a backend action; live state arrives over the WebSocket. Errors (e.g. 403) are surfaced. */
  const remote = (path: string, body?: unknown) => {
    apiFetch(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
      .then(() => set({ actionError: '' }))
      .catch((e: unknown) => set({ actionError: e instanceof ApiError ? `Backend refused the action (${e.status}): ${e.message}` : `Backend action failed: ${(e as Error).message}` }));
  };
  const isRemote = () => get().source === 'remote';

  const startLocal = () => {
    closeRemote?.();
    closeRemote = null;
    const d = createInitialData(Date.now());
    tickEngine(d, Date.now());
    set({ data: d, ready: true, source: 'local', remoteStatus: 'off', remoteDetail: '' });
    if (!timer) timer = setInterval(() => { if (!get().paused && get().source === 'local') get().tick(); }, TICK_MS);
  };

  const startRemote = async () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    closeRemote?.();
    set({ source: 'remote', remoteStatus: 'connecting', remoteDetail: '', data: null, ready: false });
    try {
      const snap = await apiFetch<Record<string, unknown>>('/api/snapshot');
      if (get().source !== 'remote') return;
      set({ data: snap as unknown as EngineData, ready: true });
    } catch (e) {
      set({ remoteStatus: 'error', remoteDetail: (e as Error).message });
    }
    closeRemote = connectState({
      onState: (m) => set((s) => ({ data: mergeState(s.data, m as Record<string, unknown>), ready: true })),
      onStatus: (status, detail) => set({ remoteStatus: status, remoteDetail: detail ?? '' }),
    });
  };

  return {
    data: null,
    ready: false,
    paused: false,
    online: true,
    source: 'local',
    remoteStatus: 'off',
    remoteDetail: '',
    actionError: '',
    init: () => {
      if (get().data || get().remoteStatus === 'connecting') return;
      const pref = readPref();
      if (pref === 'remote' && remoteAvailable()) void startRemote();
      else startLocal();
    },
    setSource: (s) => {
      try { localStorage.setItem(PREF, s); } catch {}
      if (s === 'remote' && remoteAvailable()) void startRemote();
      else startLocal();
    },
    clearActionError: () => set({ actionError: '' }),
    tick: () => mutate((d) => tickEngine(d, Date.now())),
    setPaused: (paused) => set({ paused }),
    setOnline: (online) => set({ online }),
    runScenario: (kind) => {
      if (isRemote()) return remote(`/api/simulation/${SLUG[kind]}`);
      mutate((d) => { startScenario(d, kind); tickEngine(d, Date.now()); });
    },
    restoreBackhaul: () => (isRemote() ? remote('/api/simulation/restore-backhaul') : mutate((d) => restoreBackhaul(d))),
    acknowledge: (id, by) => (isRemote() ? remote(`/api/alerts/${encodeURIComponent(id)}/acknowledge`, {}) : mutate((d) => void acknowledgeIncident(d, id, by))),
    openTicket: (p) =>
      isRemote()
        ? remote('/api/maintenance/ticket', { node_id: p.node_id, issue: p.issue, category: p.category, priority: p.priority })
        : mutate((d) => void createTicket(d, { ...p, assigned_to: 'Unassigned' })),
    advanceTicket: (id, by) => (isRemote() ? remote(`/api/maintenance/${encodeURIComponent(id)}/advance`) : mutate((d) => void advanceTicket(d, id, by))),
    resolveTicket: (id, by) => (isRemote() ? remote(`/api/maintenance/${encodeURIComponent(id)}/resolve`) : mutate((d) => void resolveTicket(d, id, by))),
    setMaintenanceMode: (nodeId, on, by) => {
      if (isRemote()) return remote(`/api/nodes/${encodeURIComponent(nodeId)}/maintenance-mode`, { on });
      mutate((d) => {
        const n = d.nodes.find((x) => x.id === nodeId);
        if (!n) return;
        n.maintenance_mode = on;
        d.healthOverride[nodeId] = on ? 'MAINTENANCE_REQUIRED' : undefined;
        addLog(d, 'INFO', 'MAINTENANCE', `${nodeId} ${on ? 'entered' : 'left'} maintenance mode (${by}) — node evidence ${on ? 'excluded from fusion' : 'restored'}.`);
      });
    },
    markNotificationsRead: () => {
      if (isRemote()) {
        set((s) => (s.data ? { data: { ...s.data, notifications: s.data.notifications.map((n) => ({ ...n, read: true })) } } : s));
        return remote('/api/notifications/read');
      }
      mutate((d) => d.notifications.forEach((n) => (n.read = true)));
    },
  };
});

export function useData(): EngineData | null {
  return useIris((s) => s.data);
}

export { API_URL };
