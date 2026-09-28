import { RECOMMENDED_ACTIONS, RISK_META } from '@iris/config';
import type { DisseminationStatus, FusionResult, HazardClass, Incident, IrisEvent, IrisNode, RiskLevel } from '@iris/types';
import type { EngineData } from './types';
import { addLog, notify } from './util';

const rank = (r: RiskLevel) => RISK_META[r].rank;
const INCIDENT_HAZARDS: HazardClass[] = ['FLOOD', 'FIRE', 'AIR'];
const CLEAR_AFTER_TICKS = 6;

function geoTarget(hazard: HazardClass, node: IrisNode): string {
  switch (hazard) {
    case 'FLOOD':
      return `Downstream flood-prone zones · ${node.location.district} · ~12 km reach (demo geofence)`;
    case 'FIRE':
      return `Settlements within 8 km of ${node.id} · ${node.location.district} (demo geofence)`;
    default:
      return `Urban wards in ${node.location.region} (demo geofence)`;
  }
}

function newDissemination(hazard: HazardClass, node: IrisNode, backhaul: boolean): DisseminationStatus {
  return {
    channels: [{ key: 'dash', label: 'Authority dashboard', status: 'PENDING' }],
    cap_sachet: 'PENDING',
    geo_target: geoTarget(hazard, node),
    local_siren: 'STANDBY',
    local_board: 'STANDBY',
    backhaul_ok: backhaul,
  };
}

function ensureChannels(diss: DisseminationStatus, sev: RiskLevel) {
  if (rank(sev) >= rank('HIGH')) {
    for (const [key, label] of [['sms', 'SMS'], ['voice', 'Voice'], ['ivr', 'IVR']] as const) {
      if (!diss.channels.find((c) => c.key === key)) diss.channels.push({ key, label, status: 'PENDING' });
    }
  }
}

function makeEvent(d: EngineData, node: IrisNode, fusion: FusionResult): IrisEvent {
  const ev: IrisEvent = {
    id: `EVT-${d.seq.event++}`,
    node_id: node.id,
    hazard: node.hazard,
    timestamp: d.now,
    severity: fusion.severity,
    confidence: fusion.confidence,
    evidence: structuredClone(fusion.evidence),
    sensor_health: Object.fromEntries(node.sensors.map((s) => [s.type, s.health])),
    model_versions: { node: node.model_version, firmware: node.firmware_version },
  };
  d.events.unshift(ev);
  if (d.events.length > 100) d.events.length = 100;
  return ev;
}

function gatewayOk(d: EngineData, node: IrisNode) {
  return d.gateways.find((g) => g.id === node.gateway_id)?.uplink_ok ?? true;
}

export function updateIncidents(d: EngineData) {
  const groups = new Map<string, IrisNode[]>();
  for (const n of d.nodes) {
    const f = d.fusion[n.id];
    if (!f || !INCIDENT_HAZARDS.includes(n.hazard)) continue;
    if (f.quorum === 'CONFIRMED' && f.severity !== 'NORMAL') {
      const key = `${n.hazard}:${n.location.region}`;
      groups.set(key, [...(groups.get(key) ?? []), n]);
    }
  }

  for (const [key, nodes] of groups) {
    const primary = nodes.reduce((a, b) => (d.fusion[b.id].E > d.fusion[a.id].E ? b : a));
    const pf = d.fusion[primary.id];
    const sev = nodes.reduce<RiskLevel>((m, n) => (rank(d.fusion[n.id].severity) > rank(m) ? d.fusion[n.id].severity : m), 'NORMAL');
    const conf = Math.max(...nodes.map((n) => d.fusion[n.id].confidence));
    d.clearTicks[key] = 0;

    const existing = d.incidents.find((i) => i.key === key && i.status !== 'RESOLVED');
    if (!existing) {
      const ev = makeEvent(d, primary, pf);
      const bh = gatewayOk(d, primary);
      const inc: Incident = {
        id: `INC-${d.seq.incident++}`,
        key,
        event_ids: [ev.id],
        hazard: primary.hazard,
        severity: sev,
        peak_severity: sev,
        confidence: conf,
        confidence_level: pf.confidence_level,
        state: sev as Incident['state'],
        location: `${primary.location.region} · ${primary.location.district}`,
        district: primary.location.district,
        lat: primary.location.lat,
        lon: primary.location.lon,
        node_ids: nodes.map((n) => n.id),
        primary_node_id: primary.id,
        status: 'ACTIVE',
        recommended_action: RECOMMENDED_ACTIONS[primary.hazard][sev as 'WATCH' | 'HIGH' | 'CRITICAL'],
        created_at: d.now,
        updated_at: d.now,
        detections: 1,
        duplicates_suppressed: 0,
        history: [{ at: d.now, state: sev as Incident['state'], note: `Quorum confirmed (${pf.quorum_sources.join(' + ')}) — incident created` }],
        fusion: structuredClone(pf),
        dissemination: newDissemination(primary.hazard, primary, bh),
        simulated: true,
      };
      ensureChannels(inc.dissemination, sev);
      d.incidents.unshift(inc);
      d.counters.alerts++;
      addLog(d, 'ALERT', 'ALERT ENGINE', `${inc.id} created · ${primary.hazard} · ${sev} · confidence ${(conf * 100).toFixed(0)}% · ${inc.location}`);
      notify(d, sev === 'CRITICAL' ? 'critical' : 'warn', `${sev} ${primary.hazard.toLowerCase()} incident`, `${inc.location} — ${inc.id}`, `/alerts/${inc.id}`);
      continue;
    }

    // Deduplication: the same hazard+region can never open a second active incident.
    existing.detections++;
    existing.updated_at = d.now;
    existing.fusion = structuredClone(pf);
    existing.confidence = conf;
    existing.confidence_level = pf.confidence_level;
    existing.primary_node_id = primary.id;
    existing.node_ids = Array.from(new Set([...existing.node_ids, ...nodes.map((n) => n.id)]));

    if (rank(sev) > rank(existing.severity)) {
      const wasAck = existing.status === 'ACKNOWLEDGED';
      existing.severity = sev;
      existing.peak_severity = sev;
      existing.status = 'ACTIVE';
      existing.state = sev as Incident['state'];
      existing.recommended_action = RECOMMENDED_ACTIONS[primary.hazard][sev as 'WATCH' | 'HIGH' | 'CRITICAL'];
      const ev = makeEvent(d, primary, pf);
      existing.event_ids.push(ev.id);
      ensureChannels(existing.dissemination, sev);
      existing.history.push({ at: d.now, state: sev as Incident['state'], note: wasAck ? 'Escalated after acknowledgement' : 'Escalated — evidence strengthened' });
      addLog(d, 'ALERT', 'ALERT ENGINE', `${existing.id} ESCALATED to ${sev}${wasAck ? ' (re-opened after ack)' : ''}`);
      notify(d, sev === 'CRITICAL' ? 'critical' : 'warn', `${existing.id} escalated to ${sev}`, existing.location, `/alerts/${existing.id}`);
    } else {
      existing.duplicates_suppressed++;
    }
  }

  // Auto-resolve when evidence has stayed clear.
  for (const inc of d.incidents) {
    if (inc.status === 'RESOLVED' || groups.has(inc.key)) continue;
    d.clearTicks[inc.key] = (d.clearTicks[inc.key] ?? 0) + 1;
    if (d.clearTicks[inc.key] >= CLEAR_AFTER_TICKS) {
      inc.status = 'RESOLVED';
      inc.state = 'RESOLVED';
      inc.resolved_at = d.now;
      inc.updated_at = d.now;
      inc.dissemination.local_siren = 'STANDBY';
      inc.dissemination.local_board = 'STANDBY';
      inc.history.push({ at: d.now, state: 'RESOLVED', note: 'Evidence returned to baseline — auto-resolved' });
      addLog(d, 'OK', 'ALERT ENGINE', `${inc.id} auto-resolved — evidence returned to baseline.`);
      notify(d, 'ok', `${inc.id} resolved`, inc.location, `/alerts/${inc.id}`);
    }
  }

  progressDissemination(d);
}

/** Cloud channels need backhaul; the local siren / notice board are edge-triggered and do not. */
function progressDissemination(d: EngineData) {
  const schedule: Record<string, number> = { dash: 0, sms: 1500, voice: 3000, ivr: 3000 };
  for (const inc of d.incidents) {
    if (inc.status === 'RESOLVED') continue;
    const node = d.nodes.find((n) => n.id === inc.primary_node_id)!;
    const bh = gatewayOk(d, node);
    const diss = inc.dissemination;
    diss.backhaul_ok = bh;
    const age = d.now - inc.created_at;
    for (const ch of diss.channels) {
      if (ch.status === 'SENT') continue;
      if (age >= (schedule[ch.key] ?? 0)) {
        if (bh) {
          ch.status = 'SENT';
          ch.at = d.now;
          d.counters.messages++;
          addLog(d, 'INFO', 'DISSEMINATION', `${ch.label} dispatched for ${inc.id} (SIMULATED — no real message sent)`);
        } else if (ch.status !== 'QUEUED') {
          ch.status = 'QUEUED';
          addLog(d, 'WARN', 'DISSEMINATION', `${ch.label} for ${inc.id} QUEUED — backhaul unavailable`);
        }
      }
    }
    if (rank(inc.severity) >= rank('HIGH') && diss.cap_sachet !== 'HANDED_OFF' && age >= 4500) {
      if (bh) {
        diss.cap_sachet = 'HANDED_OFF';
        d.counters.messages++;
        addLog(d, 'INFO', 'DISSEMINATION', `${inc.id} handed to C-DOT CAP / SACHET for geo-targeted dissemination (SIMULATED handoff)`);
      } else diss.cap_sachet = 'QUEUED';
    }
    if (rank(inc.severity) >= rank('HIGH') && diss.local_board !== 'ACTIVE') {
      diss.local_board = 'ACTIVE';
      addLog(d, 'ALERT', 'LOCAL RESPONSE', `Local notice board ACTIVE at ${node.id} (edge-triggered, backhaul-independent)`);
    }
    if (inc.severity === 'CRITICAL' && diss.local_siren !== 'ACTIVE') {
      diss.local_siren = 'ACTIVE';
      addLog(d, 'ALERT', 'LOCAL RESPONSE', `Local siren ACTIVE at ${node.id} (edge-triggered, backhaul-independent)`);
    }
  }
}

export function acknowledgeIncident(d: EngineData, id: string, by: string): boolean {
  const inc = d.incidents.find((i) => i.id === id);
  if (!inc || inc.status !== 'ACTIVE') return false;
  inc.status = 'ACKNOWLEDGED';
  inc.state = 'ACKNOWLEDGED';
  inc.acknowledged_at = d.now;
  inc.acknowledged_by = by;
  inc.history.push({ at: d.now, state: 'ACKNOWLEDGED', note: `Acknowledged by ${by}` });
  addLog(d, 'INFO', 'ALERT ENGINE', `${id} acknowledged by ${by}`);
  return true;
}
