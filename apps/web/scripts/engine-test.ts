import { createInitialData, TICK_MS } from '../src/lib/engine/seed';
import { tickEngine } from '../src/lib/engine/tick';
import { startScenario, restoreBackhaul } from '../src/lib/engine/scenarios';
import { acknowledgeIncident } from '../src/lib/engine/incidents';

function run(kind: any, seconds: number, d: any, label: string, every = 4) {
  startScenario(d, kind);
  const t0 = d.now;
  console.log(`\n=== ${label} ===`);
  for (let s = 0; s <= seconds; s += TICK_MS / 1000) {
    d.now = t0 + s * 1000;
    tickEngine(d, d.now);
    if (Math.round(s * 10) % (every * 10) < TICK_MS / 100) {
      const f = (id: string) => `${id}:${d.fusion[id].quorum[0]}/${d.nodes.find((n: any) => n.id === id).risk_level[0]}/E${d.fusion[id].E.toFixed(2)}`;
      const inc = d.incidents.filter((i: any) => i.status !== 'RESOLVED').map((i: any) => `${i.id}[${i.severity}/${i.status}/${i.confidence_level}/det${i.detections}/dup${i.duplicates_suppressed}]`);
      console.log(`t=${s.toFixed(1)}s ${['HYD-001','HYD-002','HYD-003','FIR-001','AIR-002'].map(f).join(' ')} | inc: ${inc.join(' ')}`);
    }
  }
  return d;
}

let d = createInitialData(1_800_000_000_000);
d.now = 1_800_000_000_000;
run('FLOOD', 40, d, 'FLOOD');
const inc = d.incidents.find((i: any) => i.status === 'ACTIVE')!;
console.log('dissemination', JSON.stringify(inc.dissemination.channels.map((c: any) => c.key + ':' + c.status)), inc.dissemination.cap_sachet, inc.dissemination.local_siren);
acknowledgeIncident(d, inc.id, 'test');
run('NORMAL', 20, d, 'NORMAL');
console.log('incidents active after normal:', d.incidents.filter((i: any) => i.status !== 'RESOLVED').length);
run('SENSOR_FAILURE', 16, d, 'SENSOR_FAILURE');
run('NORMAL', 8, d, 'NORMAL');
run('FIRE', 30, d, 'FIRE', 5);
run('NORMAL', 20, d, 'NORMAL');
run('BACKHAUL_OUTAGE', 6, d, 'BACKHAUL');
run('FLOOD', 30, d, 'FLOOD during outage', 6);
const i2 = d.incidents.find((i: any) => i.status !== 'RESOLVED' && i.hazard === 'FLOOD')!;
console.log('outage diss', JSON.stringify(i2.dissemination.channels.map((c: any) => c.key + ':' + c.status)), i2.dissemination.cap_sachet, 'siren', i2.dissemination.local_siren);
restoreBackhaul(d);
for (let k = 0; k < 6; k++) { d.now += TICK_MS; tickEngine(d, d.now); }
console.log('after restore', JSON.stringify(i2.dissemination.channels.map((c: any) => c.key + ':' + c.status)));
console.log('system', d.system.health, d.system.reasons);
run('MAINTENANCE', 22, d, 'MAINTENANCE', 6);
console.log(d.tickets.slice(0, 3).map((t: any) => `${t.ticket_id} ${t.node_id} ${t.status}`));
console.log(d.nodes.map((n: any) => `${n.id}:${n.health_status}`).join(' '));
