import { mulberry32, gaussian, clamp } from './prng';

/** Deterministic SYNTHETIC datasets for the Insights page (not real measurements). */

/** PM2.5 by hour-of-day (rows) × day (cols): morning and evening traffic peaks, weekend dip. */
export function pollutionCalendar(days = 14) {
  const rand = mulberry32(11);
  const cells: { day: number; hour: number; v: number }[] = [];
  for (let d = 0; d < days; d++) {
    const weekend = d % 7 >= 5 ? 0.75 : 1;
    const episode = d === 9 || d === 10 ? 1.6 : 1;
    for (let h = 0; h < 24; h++) {
      const peak = 38 * Math.exp(-((h - 8.5) ** 2) / 6) + 46 * Math.exp(-((h - 19.5) ** 2) / 8);
      cells.push({ day: d, hour: h, v: Math.max(12, (35 + peak) * weekend * episode + gaussian(rand) * 6) });
    }
  }
  return cells;
}

/** Rainfall (mm/h) vs river water level (cm) with saturation — 90 points. */
export function rainLevelScatter() {
  const rand = mulberry32(23);
  return Array.from({ length: 90 }, () => {
    const rain = Math.abs(gaussian(rand)) * 14;
    const level = 140 + 150 * (1 - Math.exp(-rain / 22)) + gaussian(rand) * 12;
    return { rain: +rain.toFixed(1), level: +clamp(level, 120, 380, ).toFixed(0) };
  });
}

/** Alerts per day by severity over 30 days. */
export function severityTimeline(days = 30) {
  const rand = mulberry32(37);
  return Array.from({ length: days }, (_, i) => {
    const burst = i > 18 && i < 23 ? 2.2 : 1;
    return {
      day: `D-${days - 1 - i}`,
      WATCH: Math.round(rand() * 3 * burst),
      HIGH: Math.round(rand() * 2 * burst),
      CRITICAL: rand() > 0.85 ? Math.ceil(rand() * 2 * burst) : 0,
    };
  });
}
