import type { MaintenanceTicket, TicketPriority, TicketStatus } from '@iris/types';
import { baselineValue } from './seed';
import type { EngineData } from './types';
import { addLog, notify } from './util';

const ORDER: TicketStatus[] = ['OPEN', 'ASSIGNED', 'IN_FIELD', 'SELF_TEST', 'RESOLVED'];

export const TICKET_FLOW: { status: TicketStatus; label: string }[] = [
  { status: 'OPEN', label: 'Ticket created' },
  { status: 'ASSIGNED', label: 'Local steward / authority assigned' },
  { status: 'IN_FIELD', label: 'Field service / pod replacement' },
  { status: 'SELF_TEST', label: 'Self-test + calibration' },
  { status: 'RESOLVED', label: 'Node back online' },
];

export function createTicket(
  d: EngineData,
  p: { node_id: string; issue: string; category: MaintenanceTicket['category']; priority: TicketPriority; assigned_to?: string; by?: string },
): MaintenanceTicket {
  const t: MaintenanceTicket = {
    ticket_id: `MT-${d.seq.ticket++}`,
    node_id: p.node_id,
    issue: p.issue,
    category: p.category,
    priority: p.priority,
    assigned_to: p.assigned_to ?? 'Unassigned',
    status: 'OPEN',
    created_at: d.now,
    service_history: [{ at: d.now, action: 'Ticket created', by: p.by ?? 'ECO-SHIELD AI-0' }],
  };
  d.tickets.unshift(t);
  addLog(d, 'WARN', 'MAINTENANCE', `Ticket ${t.ticket_id} opened for ${p.node_id}: ${p.issue}`);
  notify(d, 'warn', `Maintenance ticket ${t.ticket_id}`, `${p.node_id} — ${p.issue}`, '/maintenance');
  return t;
}

export function advanceTicket(d: EngineData, id: string, by = 'Steward'): boolean {
  const t = d.tickets.find((x) => x.ticket_id === id);
  if (!t || t.status === 'RESOLVED') return false;
  const next = ORDER[ORDER.indexOf(t.status) + 1];
  if (next === 'RESOLVED') return resolveTicket(d, id, by);
  t.status = next;
  if (next === 'ASSIGNED' && t.assigned_to === 'Unassigned') t.assigned_to = 'Local steward (demo)';
  const label = TICKET_FLOW.find((f) => f.status === next)?.label ?? next;
  t.service_history.push({ at: d.now, action: label, by });
  addLog(d, 'INFO', 'MAINTENANCE', `${t.ticket_id}: ${label}`);
  return true;
}

/** Closing a ticket applies the physical service effects to the node. */
export function resolveTicket(d: EngineData, id: string, by = 'Steward'): boolean {
  const t = d.tickets.find((x) => x.ticket_id === id);
  if (!t || t.status === 'RESOLVED') return false;
  const node = d.nodes.find((n) => n.id === t.node_id);
  const today = new Date(d.now).toISOString().slice(0, 10);
  if (node) {
    const cat = t.category;
    if (cat === 'SENSOR_REPLACEMENT' || cat === 'CALIBRATION' || cat === 'CLEANING' || cat === 'OTHER') {
      for (const s of node.sensors) {
        if (s.fault) s.last_value = baselineValue(node.id, s.type);
        s.fault = null;
        s.health = 'HEALTHY';
        s.quality_score = 0.96;
        if (cat !== 'CLEANING') s.calibration_date = today;
      }
      const f = d.forcing[node.id];
      if (f) for (const k of Object.keys(f)) delete f[k as keyof typeof f];
      for (const pod of node.installed_pods) {
        pod.health = 100;
        pod.last_calibration = today;
        if (cat === 'SENSOR_REPLACEMENT') pod.replacement_history.push({ date: today, reason: t.issue, by });
      }
    }
    if (cat === 'BATTERY') node.battery = 100;
    if (cat === 'SOLAR') {
      node.solar = 4.5;
      node.battery = Math.max(node.battery, 85);
    }
    if (cat === 'CONNECTIVITY') node.signal = -96;
    if (cat === 'TAMPER') node.storage = Math.min(node.storage, 30);
    d.healthOverride[node.id] = undefined;
    node.maintenance_mode = false;
    node.last_service = today;
    node.last_seen = d.now;
  }
  t.status = 'RESOLVED';
  t.resolved_at = d.now;
  t.service_history.push({ at: d.now, action: 'Self-test passed · calibration recorded · node back online', by });
  addLog(d, 'OK', 'MAINTENANCE', `${t.ticket_id} resolved — ${t.node_id} back online after service.`);
  notify(d, 'ok', `${t.node_id} back online`, `Ticket ${t.ticket_id} resolved.`, '/maintenance');
  return true;
}
