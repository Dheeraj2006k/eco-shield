import { ArrowDown, ArrowRight, Battery, BrainCircuit, Cpu, Droplets, Factory, Flame, Layers, Mountain, RadioTower, Sparkles, Wind, Wrench } from 'lucide-react';
import Link from 'next/link';
import { MiniArch } from '@/components/landing/MiniArch';
import { Logo } from '@/components/shell/Logo';

const CHAIN = ['Sensor Node', 'LoRaWAN', 'Edge AI', 'Evidence Fusion', 'Risk', 'Alert'];

const HAZARDS = [
  { icon: Droplets, name: 'Flood', text: 'Water level, rainfall and neighbor corroboration along river corridors.', live: true },
  { icon: Flame, name: 'Fire', text: 'Smoke, heat and camera verification in forest belts.', live: true },
  { icon: Wind, name: 'Air pollution', text: 'PM2.5 / PM10 across urban airsheds.', live: true },
  { icon: Mountain, name: 'Landslide', text: 'Terrain module supported by the architecture.', live: false },
  { icon: Factory, name: 'Water quality', text: 'Additional pod type on the same universal core.', live: false },
];

const LAYERS = [
  { tag: 'AI-0', title: 'Node intelligence', text: 'EWMA / Kalman smoothing, CUSUM shift detection, TinyML anomaly checks and sensor-health scoring on the node itself — useful even with no connectivity.' },
  { tag: 'AI-1', title: 'Edge intelligence', text: 'Isolation Forest, XGBoost, GRU and vision models at the gateway, fused with reliability weights and gated by quorum.' },
  { tag: 'AI-2', title: 'Cloud / regional intelligence', text: 'Regional risk, analytics, alert engine with de-duplication, and a model registry with human approval.' },
];

const EVIDENCE = ['Sensor', 'Camera', 'Neighbor nodes', 'Weather', 'Sensor health'];
const LIFE = ['Health', 'Maintenance', 'Local service', 'Replace pod', 'Calibration', 'Online'];

export default function Landing() {
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-40 border-b border-navy-800 bg-navy-950/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo dark />
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/architecture" className="hidden text-navy-200 hover:text-white sm:block">Architecture</Link>
            <Link href="/hardware" className="hidden text-navy-200 hover:text-white sm:block">Hardware</Link>
            <Link href="/dashboard" className="rounded-lg bg-white px-3 py-1.5 font-medium text-navy-900 hover:bg-navy-50">Sign in</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-navy-950 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-[1.2fr_1fr] lg:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-navy-300">ECO-SHIELD</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-5xl">AI-powered multi-hazard environmental monitoring &amp; early warning</h1>
            <p className="mt-2 text-sm font-medium text-navy-300">ECO — Ecological · SHIELD — Smart Hazard Intelligence &amp; Environmental Local Detection</p>
            <p className="mt-4 max-w-xl text-lg text-navy-200">From distributed sensing to validated risk and actionable warning.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-navy-900 hover:bg-navy-50">LAUNCH LIVE DASHBOARD <ArrowRight className="h-4 w-4" aria-hidden /></Link>
              <Link href="/architecture" className="inline-flex items-center gap-2 rounded-lg border border-navy-500 px-5 py-3 text-sm font-semibold text-white hover:bg-navy-800">EXPLORE ARCHITECTURE</Link>
            </div>
            <p className="mt-4 text-xs text-navy-300">Demonstration build — all readings, sites and alerts are simulated. No live field data is shown.</p>
          </div>
          <ol className="mx-auto w-full max-w-xs space-y-1.5" aria-label="Signal chain">
            {CHAIN.map((c, i) => (
              <li key={c}>
                <div className="rounded-lg border border-navy-700 bg-navy-900 px-4 py-2.5 text-center text-sm font-semibold">{c}</div>
                {i < CHAIN.length - 1 && <ArrowDown className="mx-auto mt-1.5 h-4 w-4 text-navy-400" aria-hidden />}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* A */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold text-navy-900">Multi-hazard monitoring</h2>
        <p className="mt-1 text-slate-600">Three hazards run in the demo network; further hazards are additional pods on the same core.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {HAZARDS.map((h) => (
            <div key={h.name} className="rounded-xl border border-slate-200 p-4">
              <h.icon className="h-6 w-6 text-navy-600" aria-hidden />
              <p className="mt-2 font-semibold text-navy-900">{h.name}</p>
              <p className="mt-1 text-xs text-slate-600">{h.text}</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">{h.live ? 'In demo network' : 'Architecture-ready'}</p>
            </div>
          ))}
        </div>
      </section>

      {/* B */}
      <section className="bg-slate-50 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold text-navy-900">Universal modular sensing</h2>
          <div className="mt-6 grid items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
            <div className="rounded-xl border-2 border-dashed border-navy-300 bg-white p-4 text-center"><Layers className="mx-auto h-6 w-6 text-navy-600" aria-hidden /><p className="mt-1 font-semibold">REPLACEABLE SENSOR PODS</p><p className="text-xs text-slate-600">Hydro / Flood · Fire / Air</p></div>
            <span className="text-center text-2xl text-slate-400" aria-hidden>+</span>
            <div className="rounded-xl border border-slate-300 bg-white p-4 text-center"><Cpu className="mx-auto h-6 w-6 text-navy-600" aria-hidden /><p className="mt-1 font-semibold">UNIVERSAL CORE</p><p className="text-xs text-slate-600">ESP32-S3 · Wio-E5 · LiFePO4 · Solar · IP65</p></div>
            <span className="text-center text-2xl text-slate-400" aria-hidden>=</span>
            <div className="rounded-xl bg-navy-800 p-4 text-center text-white"><Battery className="mx-auto h-6 w-6" aria-hidden /><p className="mt-1 font-semibold">CONFIGURABLE MULTI-HAZARD NODE</p><p className="text-xs text-navy-200">Swap a pod, keep the core</p></div>
          </div>
        </div>
      </section>

      {/* C */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold text-navy-900">Three intelligence layers</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {LAYERS.map((l) => (
            <div key={l.tag} className="rounded-xl border border-purple-200 bg-purple-50/40 p-5">
              <BrainCircuit className="h-6 w-6 text-purple-600" aria-hidden />
              <p className="mt-2 text-xs font-bold tracking-widest text-purple-700">{l.tag}</p>
              <p className="font-semibold text-navy-900">{l.title}</p>
              <p className="mt-1 text-sm text-slate-600">{l.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* D */}
      <section className="bg-slate-50 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold text-navy-900">Evidence-based alerting</h2>
          <p className="mt-1 text-slate-600">Severity and confidence are separate. One abnormal source is only <b>suspicious</b>; corroboration <b>confirms</b>; a faulty sensor is <b>down-weighted</b>.</p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {EVIDENCE.map((e, i) => <span key={e} className="flex items-center gap-2"><span className="rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-slate-200">{e}</span>{i < EVIDENCE.length - 1 && <span className="text-slate-400">+</span>}</span>)}
            {['Evidence Fusion', 'Quorum', 'Risk'].map((s) => <span key={s} className="flex items-center gap-2"><ArrowRight className="h-4 w-4 text-navy-500" aria-hidden /><span className="rounded-lg bg-navy-800 px-3 py-2 text-sm font-semibold text-white">{s}</span></span>)}
          </div>
        </div>
      </section>

      {/* E */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-navy-900"><Wrench className="h-6 w-6 text-navy-600" aria-hidden />Lifecycle deployment</h2>
        <ol className="mt-5 flex flex-wrap items-center gap-2">
          {LIFE.map((l, i) => <li key={l} className="flex items-center gap-2"><span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{l}</span>{i < LIFE.length - 1 && <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden />}</li>)}
        </ol>
        <p className="mt-3 text-sm text-slate-600">Stewardship is a proposed community / institutional O&amp;M model — no automatic government ownership or funding is assumed.</p>
      </section>

      {/* F */}
      <section className="bg-slate-50 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-navy-900"><RadioTower className="h-6 w-6 text-navy-600" aria-hidden />Technical architecture</h2>
          <p className="mb-5 mt-1 text-slate-600">Select a stage to see its modules.</p>
          <MiniArch />
        </div>
      </section>

      {/* G */}
      <section className="bg-navy-950 py-16 text-center text-white">
        <Sparkles className="mx-auto h-7 w-7 text-navy-300" aria-hidden />
        <h2 className="mt-2 text-2xl font-bold">Ready to see it work?</h2>
        <Link href="/dashboard" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-navy-900 hover:bg-navy-50">OPEN OPERATIONS COMMAND CENTER <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        <p className="mx-auto mt-6 max-w-xl px-4 text-xs text-navy-300">ECO-SHIELD is decision support, not an autonomous emergency command. Demonstration data is simulated.</p>
      </section>
    </div>
  );
}
