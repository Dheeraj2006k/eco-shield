import { RISK_META } from '@iris/config';
import type { HazardClass, IrisNode, Region, RiskLevel } from '@iris/types';
import { LANDSLIDE_BASELINE, REGIONS } from './engine/seed';
import type { EngineData } from './engine/types';

export function nodeStatusColorKey(n: IrisNode): RiskLevel | 'OFFLINE' {
  return n.health_status === 'OFFLINE' ? 'OFFLINE' : n.risk_level;
}

export function kpis(d: EngineData) {
  const nodes = d.nodes;
  const offline = nodes.filter((n) => n.health_status === 'OFFLINE').length;
  const degraded = nodes.filter((n) => n.health_status === 'DEGRADED' || n.health_status === 'MAINTENANCE_REQUIRED').length;
  const online = nodes.length - offline;
  const active = d.incidents.filter((i) => i.status !== 'RESOLVED');
  const critical = active.filter((i) => i.severity === 'CRITICAL').length;
  const gwOk = d.gateways.filter((g) => g.online && g.uplink_ok).length;
  const avgBattery = nodes.reduce((a, n) => a + n.battery, 0) / nodes.length;
  const sensors = nodes.flatMap((n) => n.sensors);
  const healthySensors = sensors.filter((s) => s.health === 'HEALTHY').length;
  const worst = nodes.reduce<RiskLevel>((m, n) => (RISK_META[n.risk_level].rank > RISK_META[m].rank ? n.risk_level : m), 'NORMAL');
  const rankInc = active.reduce<RiskLevel>((m, i) => (RISK_META[i.severity].rank > RISK_META[m].rank ? i.severity : m), 'NORMAL');
  return {
    total: nodes.length,
    online,
    degraded,
    offline,
    activeAlerts: active.length,
    critical,
    gwOk,
    gwTotal: d.gateways.length,
    networkAvailability: (online / nodes.length) * 100,
    avgBattery,
    sensorHealth: (healthySensors / sensors.length) * 100,
    regionalRisk: RISK_META[rankInc].rank >= RISK_META[worst].rank ? rankInc : worst,
  };
}

/** Region risk = worst live node score for that hazard in the district (+ static landslide baseline). */
export function regionRisks(d: EngineData): (Region & { nodes: number; activeAlerts: number })[] {
  return REGIONS.map((r) => {
    const districtName = r.name.split(' (')[0];
    const inDistrict = d.nodes.filter((n) => n.location.district === districtName);
    const gwNodes = d.nodes.filter((n) => d.gateways.find((g) => g.id === n.gateway_id)?.district === districtName);
    const set = new Map([...inDistrict, ...gwNodes].map((n) => [n.id, n]));
    const nodes = [...set.values()];
    const score = (h: HazardClass) => {
      const ns = nodes.filter((n) => n.hazard === h && n.health_status !== 'OFFLINE');
      if (!ns.length) return 0;
      return Math.max(...ns.map((n) => (n.quorum === 'CONFIRMED' ? n.risk_score : n.quorum === 'SUSPICIOUS' ? Math.min(n.risk_score, 0.35) : n.risk_score * 0.5)));
    };
    const flood = score('FLOOD');
    const fire = score('FIRE');
    const air = score('AIR');
    const landslide = LANDSLIDE_BASELINE[r.id] + flood * 0.3;
    const hazards = [flood, fire, air, landslide];
    const composite = Math.min(1, 0.6 * Math.max(...hazards) + 0.4 * (hazards.reduce((a, b) => a + b, 0) / hazards.length));
    const activeAlerts = d.incidents.filter((i) => i.status !== 'RESOLVED' && (i.district === districtName || nodes.some((n) => i.node_ids.includes(n.id)))).length;
    return { ...r, nodes: nodes.length, activeAlerts, risk: { FLOOD: flood, FIRE: fire, AIR: air, LANDSLIDE: landslide, COMPOSITE: composite } };
  });
}

export function riskFromScore(score: number): RiskLevel {
  return score >= 0.75 ? 'CRITICAL' : score >= 0.55 ? 'HIGH' : score >= 0.3 ? 'WATCH' : 'NORMAL';
}
