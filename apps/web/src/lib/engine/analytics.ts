import type { HazardClass } from '@iris/types';
import { mulberry32 } from './prng';

export type Range = '24H' | '7D' | '30D' | '90D';

export const RANGE_META: Record<Range, { buckets: number; label: (i: number, n: number) => string; days: number }> = {
  '24H': { buckets: 24, days: 1, label: (i, n) => `${String((24 - (n - i)) % 24).padStart(2, '0')}:00` },
  '7D': { buckets: 14, days: 7, label: (i, n) => `D-${Math.ceil(((n - 1 - i) * 7) / n)}` },
  '30D': { buckets: 30, days: 30, label: (i, n) => `D-${n - 1 - i}` },
  '90D': { buckets: 30, days: 90, label: (i, n) => `D-${(n - 1 - i) * 3}` },
};

export interface SeriesPoint {
  label: string;
  FLOOD: number;
  FIRE: number;
  AIR: number;
  risk: number;
  response: number;
}

/** Deterministic SYNTHETIC history for the analytics page (not real measurements). */
export function syntheticSeries(range: Range, hazard: HazardClass | 'ALL'): SeriesPoint[] {
  const { buckets, days, label } = RANGE_META[range];
  const rand = mulberry32(range.length * 7919 + (hazard === 'ALL' ? 1 : hazard.length * 31));
  const out: SeriesPoint[] = [];
  const scale = days / buckets;
  for (let i = 0; i < buckets; i++) {
    const season = 0.6 + 0.4 * Math.sin((i / buckets) * Math.PI * 2 + 1);
    const f = Math.max(0, Math.round((rand() * 2.2 * scale + (range === '90D' ? 0.4 : 0)) * season));
    const fi = Math.max(0, Math.round(rand() * 1.5 * scale * (1.2 - season * 0.5)));
    const a = Math.max(0, Math.round(rand() * 3.1 * scale));
    out.push({
      label: label(i, buckets),
      FLOOD: hazard === 'ALL' || hazard === 'FLOOD' ? f : 0,
      FIRE: hazard === 'ALL' || hazard === 'FIRE' ? fi : 0,
      AIR: hazard === 'ALL' || hazard === 'AIR' ? a : 0,
      risk: Math.min(1, 0.12 + 0.35 * rand() * season + (hazard === 'AIR' ? 0.1 : 0)),
      response: 6 + rand() * 11 - (i / buckets) * 2.5,
    });
  }
  return out;
}

export function nodeUptime(nodeId: string, range: Range): number {
  const rand = mulberry32(nodeId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + range.length);
  return 96 + rand() * 3.9;
}
