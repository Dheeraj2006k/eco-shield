'use client';

import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TelemetryPoint } from '@iris/types';
import { fmtClock } from '@/lib/utils';

export function TrendChart({
  data,
  color = '#3563a8',
  unit = '',
  warn,
  danger,
  height = 160,
  domain,
  decimals = 1,
  name = 'value',
}: {
  data: TelemetryPoint[];
  color?: string;
  unit?: string;
  warn?: number;
  danger?: number;
  height?: number;
  domain?: [number | 'auto' | 'dataMin' | 'dataMax', number | 'auto' | 'dataMin' | 'dataMax'];
  decimals?: number;
  name?: string;
}) {
  const id = `g-${name.replace(/\W/g, '')}-${color.replace('#', '')}`;
  return (
    <div style={{ height }} role="img" aria-label={`${name} trend chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.16} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="timestamp" tickFormatter={(t) => fmtClock(t as number).slice(3)} tick={{ fontSize: 10, fill: '#94a3b8' }} minTickGap={40} axisLine={false} tickLine={false} />
          <YAxis domain={domain ?? ['auto', 'auto']} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => (typeof v === 'number' ? v.toFixed(decimals > 0 && Math.abs(v) < 10 ? 1 : 0) : v)} />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(decimals)} ${unit}`, name]}
            labelFormatter={(t) => fmtClock(t as number)}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          {warn !== undefined && <ReferenceLine y={warn} stroke="#eab308" strokeDasharray="4 4" label={{ value: 'warn', fontSize: 9, fill: '#a16207', position: 'insideTopRight' }} />}
          {danger !== undefined && <ReferenceLine y={danger} stroke="#dc2626" strokeDasharray="4 4" label={{ value: 'danger', fontSize: 9, fill: '#b91c1c', position: 'insideTopRight' }} />}
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Spark({ data, color = '#3563a8', height = 28 }: { data: TelemetryPoint[]; color?: string; height?: number }) {
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.slice(-40)}>
          <YAxis hide domain={['auto', 'auto']} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
