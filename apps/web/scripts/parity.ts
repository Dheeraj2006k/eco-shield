/** Structural parity check: Python API snapshot vs. the TypeScript engine state the UI consumes. */
import fs from 'node:fs';
import { createInitialData } from '../src/lib/engine/seed';
import { tickEngine } from '../src/lib/engine/tick';
import { startScenario } from '../src/lib/engine/scenarios';

const snap = JSON.parse(fs.readFileSync(new URL('./.snapshot.json', import.meta.url), 'utf8'));
const d: any = createInitialData(1_800_000_000_000);
tickEngine(d, d.now + 1500);
startScenario(d, 'FIRE');
for (let i = 0; i < 60; i++) tickEngine(d, d.now + 1500);
startScenario(d, 'FLOOD');
for (let i = 0; i < 60; i++) tickEngine(d, d.now + 1500);

const UI_KEYS = ['now', 'tick', 'nodes', 'gateways', 'history', 'fusion', 'events', 'incidents', 'tickets', 'log', 'notifications', 'external', 'camera', 'pipeline', 'riskTrend', 'counters', 'system', 'scenario'];
const RECORD_KEYS = new Set(['fusion', 'camera', 'history']);
const problems: string[] = [];
const typeOf = (v: any) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function cmp(a: any, b: any, path: string) {
  // a = TS (expected), b = python
  if (a === undefined || a === null || b === undefined || b === null) return; // optional / absent-by-state values
  const ta = typeOf(a), tb = typeOf(b);
  if (ta !== tb) { problems.push(`${path}: type ${ta} (ts) vs ${tb} (py)`); return; }
  if (ta === 'array') { if (a.length && b.length) cmp(a[0], b[0], path + '[0]'); return; }
  if (ta === 'object') {
    if (RECORD_KEYS.has(path.split('.').pop()!)) { const ka = Object.keys(a)[0], kb = Object.keys(b)[0]; if (ka && kb) cmp(a[ka], b[kb], path + '{*}'); return; }
    for (const k of Object.keys(a)) { if (!(k in b)) problems.push(`${path}.${k}: missing in python snapshot`); else cmp(a[k], b[k], `${path}.${k}`); }
    for (const k of Object.keys(b)) if (!(k in a)) problems.push(`${path}.${k}: extra in python snapshot (harmless if unused)`);
  }
}
for (const k of UI_KEYS) { if (!(k in snap)) problems.push(`${k}: missing top-level`); else cmp(d[k], snap[k], k); }
// history metric sets per node must match
for (const id of Object.keys(d.history)) if (JSON.stringify(Object.keys(d.history[id]).sort()) !== JSON.stringify(Object.keys(snap.history[id] ?? {}).sort())) problems.push(`history.${id}: metric set differs`);
// incident: compare an active one and a seeded one
const tsInc = d.incidents.find((i: any) => i.status !== 'RESOLVED'), pyInc = snap.incidents.find((i: any) => i.status !== 'RESOLVED');
if (tsInc && pyInc) cmp(tsInc, pyInc, 'activeIncident'); else problems.push('no active incident to compare');
console.log(problems.length ? problems.join('\n') : 'PARITY OK');
process.exit(problems.some((p) => !p.includes('extra in python')) ? 1 : 0);
