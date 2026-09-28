import type { HazardClass } from '@iris/types';
import { clamp, distanceKm } from './prng';
import { norm } from './fusion';
import { INFRASTRUCTURE } from './seed';

export type SandboxScenario = 'FLOOD' | 'FIRE' | 'POLLUTION' | 'LANDSLIDE';

export interface SandboxInput {
  scenario: SandboxScenario;
  rainfall: number; // mm/h
  waterLevel: number; // cm
  temperature: number; // °C
  humidity: number; // %
  wind: number; // km/h
  smoke: number; // MQ-2 idx
  sensorFailure: boolean;
}

export const SANDBOX_DEFAULTS: SandboxInput = { scenario: 'FLOOD', rainfall: 12, waterLevel: 190, temperature: 30, humidity: 55, wind: 12, smoke: 60, sensorFailure: false };

export const SCENARIO_HAZARD: Record<SandboxScenario, HazardClass> = { FLOOD: 'FLOOD', FIRE: 'FIRE', POLLUTION: 'AIR', LANDSLIDE: 'LANDSLIDE' };

/** Illustrative what-if scoring using the same normalisation as the live engine. Not a forecast. */
export function runSandbox(i: SandboxInput) {
  let score = 0;
  switch (i.scenario) {
    case 'FLOOD':
      score = 0.65 * norm('water_level', i.waterLevel) + 0.35 * norm('rainfall', i.rainfall);
      break;
    case 'FIRE':
      score = 0.4 * norm('smoke', i.smoke) + 0.25 * norm('temperature', i.temperature) + 0.15 * clamp((60 - i.humidity) / 45) + 0.2 * clamp((i.wind - 8) / 40);
      break;
    case 'POLLUTION': {
      const pm25 = 45 + (i.smoke / 600) * 205;
      score = 0.75 * norm('pm25', pm25) + 0.25 * clamp((14 - i.wind) / 14);
      break;
    }
    case 'LANDSLIDE':
      score = 0.6 * norm('rainfall', i.rainfall) + 0.4 * clamp((i.humidity - 60) / 40);
      break;
  }
  score = clamp(score);
  const hazard = SCENARIO_HAZARD[i.scenario];
  // Sensor failure: the failed sensor's weight collapses, so confidence falls and the score is discounted.
  const confidence = clamp((i.sensorFailure ? 0.38 : 0.82) - (i.scenario === 'LANDSLIDE' ? 0.3 : 0));
  const effective = i.sensorFailure ? score * 0.55 : score;
  const exposure = INFRASTRUCTURE.filter((c) => c.hazards.includes(hazard) && effective > 0.3).map((c) => c.name);
  const propagation: string[] = [];
  if (i.scenario === 'FLOOD' && effective > 0.3) propagation.push('HYD-002 (upstream) → HYD-001 (Haridwar reach) → downstream zones', `Estimated travel time to downstream reach: ~${Math.round(30 - effective * 12)} min (illustrative)`);
  if (i.scenario === 'FIRE' && effective > 0.3) propagation.push(`Smoke drift toward the Doon Valley airshed (wind ${i.wind} km/h)`);
  if (i.scenario === 'POLLUTION' && effective > 0.3) propagation.push('Accumulation across AIR-001 / AIR-002 / AIR-003 under low wind');
  if (i.scenario === 'LANDSLIDE') propagation.push('No landslide pod is deployed in the demo network — output is a stand-alone what-if.');
  return { score: effective, rawScore: score, confidence, exposure, propagation, hazard };
}

/* ---------------- Digital twin ---------------- */
export const TWIN_BOUNDS = { latMin: 29.88, latMax: 30.2, lonMin: 78.1, lonMax: 78.65 };
export function project(lat: number, lon: number, w: number, h: number): [number, number] {
  const b = TWIN_BOUNDS;
  return [((lon - b.lonMin) / (b.lonMax - b.lonMin)) * w, ((b.latMax - lat) / (b.latMax - b.latMin)) * h];
}

/** Given a water-level rise at the upstream node, estimate levels + travel time at downstream nodes. */
export function propagateRise(nodes: { id: string; lat: number; lon: number; level: number }[], riseCm: number) {
  const sorted = [...nodes].sort((a, b) => b.lon - a.lon); // upstream (east) → downstream (west)
  const up = sorted[0];
  return sorted.map((n, idx) => {
    const km = distanceKm(up, n);
    const attenuation = Math.exp(-km / 90);
    const newLevel = n.level + riseCm * (idx === 0 ? 1 : attenuation);
    return { id: n.id, lat: n.lat, lon: n.lon, before: n.level, after: newLevel, etaMin: Math.round((km / 9) * 60), km };
  });
}
