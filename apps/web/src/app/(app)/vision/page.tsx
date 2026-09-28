'use client';

import { Ban, Cpu, Video } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn } from '@iris/ui';
import { PageSkeleton } from '@/components/common/states';
import { Dl, Meter, PageHeader } from '@/components/common/widgets';
import type { CameraState } from '@/lib/engine/types';
import { mulberry32 } from '@/lib/engine/prng';
import { useIris } from '@/lib/store';

const STATES: CameraState[] = ['NORMAL', 'WATCH', 'SUSPECTED', 'CONFIRMED'];
const STATE_TONE = { NORMAL: 'ok', WATCH: 'warn', SUSPECTED: 'high', CONFIRMED: 'crit' } as const;

/** Procedurally drawn SYNTHETIC forest scene — not a real camera frame. */
function Scene({ conf, state, fps }: { conf: number; state: CameraState; fps: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ conf, state });
  live.current = { conf, state };
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = (c.width = 640);
    const H = (c.height = 360);
    const rand = mulberry32(42);
    const trees = Array.from({ length: 46 }, () => ({ x: rand() * W, y: H * 0.55 + rand() * H * 0.4, s: 0.6 + rand() * 0.9 }));
    trees.sort((a, b) => a.y - b.y);
    let raf = 0;
    let t = 0;
    const draw = () => {
      t += 0.016;
      const { conf: cf, state: st } = live.current;
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.6);
      sky.addColorStop(0, cf > 0.55 ? '#94a3b8' : '#7dd3fc');
      sky.addColorStop(1, cf > 0.55 ? '#cbd5e1' : '#e0f2fe');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#4d7c5f';
      ctx.beginPath(); ctx.moveTo(0, H * 0.6); ctx.quadraticCurveTo(W * 0.3, H * 0.4, W * 0.55, H * 0.55); ctx.quadraticCurveTo(W * 0.8, H * 0.65, W, H * 0.5); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
      for (const tr of trees) {
        ctx.fillStyle = '#14532d';
        ctx.beginPath(); ctx.moveTo(tr.x, tr.y - 34 * tr.s); ctx.lineTo(tr.x - 12 * tr.s, tr.y); ctx.lineTo(tr.x + 12 * tr.s, tr.y); ctx.fill();
        ctx.fillStyle = '#422006'; ctx.fillRect(tr.x - 1.5, tr.y, 3, 6 * tr.s);
      }
      if (cf > 0.25) {
        const n = Math.round(6 + cf * 18);
        for (let i = 0; i < n; i++) {
          const p = (t * 0.35 + i / n) % 1;
          const x = 380 + Math.sin(i * 1.7 + t) * 22 * (p + 0.4) + p * 60;
          const y = 250 - p * 190 * (0.6 + cf * 0.6);
          const r = 14 + p * 44 * (0.6 + cf);
          ctx.fillStyle = `rgba(90,90,98,${(1 - p) * 0.32 * (0.4 + cf)})`;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (st === 'CONFIRMED') {
        const g = ctx.createRadialGradient(370, 262, 4, 370, 262, 46 + Math.sin(t * 9) * 5);
        g.addColorStop(0, 'rgba(255,200,60,0.95)'); g.addColorStop(0.5, 'rgba(249,115,22,0.6)'); g.addColorStop(1, 'rgba(220,38,38,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(370, 262, 52, 0, Math.PI * 2); ctx.fill();
      }
      // detection overlays (drawn by the edge model in a real deployment)
      if (st !== 'NORMAL') {
        const box = (x: number, y: number, w: number, h: number, label: string, color: string) => {
          ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = color; ctx.font = '600 12px system-ui'; const tw = ctx.measureText(label).width + 10;
          ctx.fillRect(x, y - 18, tw, 18); ctx.fillStyle = '#fff'; ctx.fillText(label, x + 5, y - 5);
        };
        const sw = 110 + cf * 140;
        box(360 - sw * 0.2, 250 - cf * 190 * 0.9, sw, 40 + cf * 190 * 0.9, `smoke ${(cf * 100).toFixed(0)}%`, '#7c3aed');
        if (st === 'CONFIRMED') box(330, 236, 78, 52, `fire ${(Math.min(0.99, cf) * 100).toFixed(0)}%`, '#dc2626');
      }
      ctx.fillStyle = 'rgba(15,33,64,0.75)'; ctx.fillRect(0, 0, W, 24);
      ctx.fillStyle = '#fff'; ctx.font = '600 11px system-ui';
      ctx.fillText('SYNTHETIC DEMO FRAME — not a real camera feed', 10, 16);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-900">
      <canvas ref={ref} className="block w-full" aria-label={`Synthetic demo camera frame. Event state ${state}, detector confidence ${(conf * 100).toFixed(0)} percent`} role="img" />
      <span className="absolute bottom-2 right-2 rounded bg-slate-900/70 px-2 py-0.5 font-mono text-[11px] text-white">{fps.toFixed(1)} FPS</span>
    </div>
  );
}

export default function VisionPage() {
  const d = useIris((s) => s.data);
  const run = useIris((s) => s.runScenario);
  if (!d) return <PageSkeleton />;
  const cam = d.camera['FIR-001'];
  const node = d.nodes.find((n) => n.id === 'FIR-001')!;
  const offline = node.health_status === 'OFFLINE';
  const idx = STATES.indexOf(cam.state);

  return (
    <>
      <PageHeader title="Vision AI" subtitle="Camera verification runs locally at the edge gateway. Frames never leave the gateway; only compact event metadata is used as evidence." actions={<Button size="sm" variant="outline" onClick={() => run('FIRE')}>Run fire scenario</Button>} />
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader><CardTitle><Video className="mr-1.5 inline h-4 w-4" aria-hidden />FIR-001 camera · local edge inference</CardTitle><Badge tone="maint">Demo frame</Badge></CardHeader>
          <CardContent>
            <Scene conf={cam.confidence} state={cam.state} fps={cam.fps} />
            <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Event state">
              {STATES.map((s, i) => (
                <li key={s} className={cn('rounded-lg px-2 py-2 text-center text-[11px] font-bold ring-1', i === idx ? (s === 'NORMAL' ? 'bg-emerald-600 text-white ring-emerald-600' : s === 'WATCH' ? 'bg-amber-500 text-white ring-amber-500' : s === 'SUSPECTED' ? 'bg-orange-600 text-white ring-orange-600' : 'bg-red-600 text-white ring-red-600') : i < idx ? 'bg-slate-100 text-slate-500 ring-slate-200' : 'bg-white text-slate-400 ring-slate-200')}>
                  {s}{i === idx && <span className="sr-only"> (current)</span>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Detection metrics</CardTitle><Badge tone={STATE_TONE[cam.state]}>{cam.state}</Badge></CardHeader>
            <CardContent className="space-y-3">
              <div><div className="flex justify-between text-xs"><span className="text-slate-500">Detector confidence</span><b className="tabular">{(cam.confidence * 100).toFixed(0)}%</b></div><Meter value={cam.confidence * 100} tone={cam.confidence > 0.55 ? 'crit' : cam.confidence > 0.3 ? 'warn' : 'ok'} label="Detector confidence" /></div>
              <Dl cols={1} items={[
                ['Detected', cam.state === 'NORMAL' ? 'nothing' : cam.label],
                ['Supported classes', 'smoke, fire, other objects'],
                ['Throughput', offline ? 'camera offline' : `${cam.fps.toFixed(1)} FPS (simulated)`],
                ['Contribution to fusion', `camera evidence weight ${d.fusion['FIR-001']?.evidence.find((e) => e.key === 'camera')?.weight.toFixed(2) ?? '—'}`],
              ]} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle><Cpu className="mr-1.5 inline h-4 w-4" aria-hidden />Models</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[['RTMDet', 'Detects smoke / flame candidates', 'RESEARCH'], ['MobileNetV3-Small', 'Verifies candidates to cut false positives', 'RESEARCH']].map(([n, t, s]) => (
                <div key={n} className="rounded-lg border border-slate-200 p-2.5"><div className="flex justify-between"><b>{n}</b><Badge tone="ai">{s}</Badge></div><p className="text-xs text-slate-500">{t}</p></div>
              ))}
              <p className="text-xs text-slate-500">Prototype: Raspberry Pi 5 · optional Raspberry Pi AI HAT+ · high-compute / production target: Qualcomm Dragonwing IQ-8275. These models are not trained in this demo build; the frame and detections are illustrative.</p>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-amber-50/60">
            <CardContent className="flex gap-2 pt-4 text-xs text-amber-900"><Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span><b>No raw video over LoRaWAN.</b> LoRaWAN carries only compact telemetry and event metadata. Video stays on the local edge network.</span></CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
