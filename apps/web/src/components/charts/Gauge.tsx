/** Semi-circular gauge with warn/danger bands. Value text is always shown (never colour alone). */
export function Gauge({ value, min, max, warn, danger, unit, label, decimals = 0 }: { value: number; min: number; max: number; warn: number; danger: number; unit: string; label: string; decimals?: number }) {
  const R = 60;
  const C = 80;
  const pt = (f: number) => {
    const a = Math.PI * (1 - f);
    return [C + R * Math.cos(a), C - R * Math.sin(a)] as const;
  };
  const arc = (f0: number, f1: number) => {
    const [x0, y0] = pt(f0);
    const [x1, y1] = pt(f1);
    return `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`;
  };
  const f = (v: number) => Math.max(0, Math.min(1, (v - min) / (max - min)));
  const fv = f(value);
  const [nx, ny] = pt(fv);
  const level = value >= danger ? 'CRITICAL' : value >= warn ? 'ELEVATED' : 'NORMAL';
  const color = value >= danger ? '#dc2626' : value >= warn ? '#ea580c' : '#16a34a';
  return (
    <figure className="text-center" aria-label={`${label}: ${value.toFixed(decimals)} ${unit}, ${level}`}>
      <svg viewBox="0 0 160 100" className="mx-auto w-full max-w-[200px]" role="img" aria-hidden>
        <path d={arc(0, f(warn))} stroke="#bbf7d0" strokeWidth="12" fill="none" />
        <path d={arc(f(warn), f(danger))} stroke="#fed7aa" strokeWidth="12" fill="none" />
        <path d={arc(f(danger), 1)} stroke="#fecaca" strokeWidth="12" fill="none" />
        <path d={arc(0, Math.max(0.001, fv))} stroke={color} strokeWidth="12" fill="none" strokeLinecap="round" style={{ transition: 'all .6s' }} />
        <circle cx={nx} cy={ny} r="5" fill="#fff" stroke={color} strokeWidth="3" />
        <text x={C} y={C - 6} textAnchor="middle" fontSize="20" fontWeight="700" fill="#0f172a">{value.toFixed(decimals)}</text>
        <text x={C} y={C + 10} textAnchor="middle" fontSize="9" fill="#64748b">{unit}</text>
      </svg>
      <figcaption className="-mt-1 text-xs font-semibold text-slate-700">{label}</figcaption>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{level}</p>
    </figure>
  );
}
