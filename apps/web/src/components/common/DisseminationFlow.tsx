import { ArrowDown, Bell, Megaphone, MessageSquare, MonitorSmartphone, Phone, RadioTower, ServerCrash, Siren, Volume2, ShieldCheck } from 'lucide-react';
import { Badge, cn, type Tone } from '@iris/ui';
import type { DisseminationStatus } from '@iris/types';

const CH_ICON: Record<string, React.ReactNode> = {
  sms: <MessageSquare className="h-4 w-4" aria-hidden />,
  voice: <Phone className="h-4 w-4" aria-hidden />,
  ivr: <Volume2 className="h-4 w-4" aria-hidden />,
  dash: <MonitorSmartphone className="h-4 w-4" aria-hidden />,
};

const stTone = (s: string): Tone => (s === 'SENT' || s === 'HANDED_OFF' || s === 'ACTIVE' ? 'ok' : s === 'QUEUED' ? 'warn' : s === 'PENDING' ? 'off' : 'neutral');

/** Alert engine → channels → C-DOT CAP / SACHET → geo-targeted public dissemination, plus the backhaul-independent local path. */
export function DisseminationFlow({ status, idle }: { status?: DisseminationStatus; idle?: boolean }) {
  const channels =
    status?.channels ??
    [
      { key: 'sms', label: 'SMS', status: 'PENDING' as const },
      { key: 'voice', label: 'Voice', status: 'PENDING' as const },
      { key: 'ivr', label: 'IVR', status: 'PENDING' as const },
      { key: 'dash', label: 'Authority dashboard', status: 'PENDING' as const },
    ];
  const cap = status?.cap_sachet ?? 'PENDING';
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cloud / regional path (needs backhaul)</p>
        <div className="rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm font-semibold text-navy-800">
          <Bell className="mr-2 inline h-4 w-4" aria-hidden />
          ALERT ENGINE
        </div>
        <ArrowDown className="mx-auto h-4 w-4 text-slate-400" aria-hidden />
        <div className="grid grid-cols-2 gap-2">
          {channels.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">{CH_ICON[c.key]}{c.label}</span>
              <Badge tone={stTone(idle ? 'PENDING' : c.status)}>{idle ? 'Standby' : c.status}</Badge>
            </div>
          ))}
        </div>
        <ArrowDown className="mx-auto h-4 w-4 text-slate-400" aria-hidden />
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700"><Megaphone className="h-4 w-4" aria-hidden />C-DOT CAP / SACHET</span>
          <Badge tone={stTone(idle ? 'PENDING' : cap)}>{idle ? 'Standby' : cap === 'HANDED_OFF' ? 'Handed off' : cap}</Badge>
        </div>
        <ArrowDown className="mx-auto h-4 w-4 text-slate-400" aria-hidden />
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          <RadioTower className="mr-2 inline h-4 w-4" aria-hidden />
          GEO-TARGETED PUBLIC DISSEMINATION
          {status && <p className="mt-0.5 text-xs font-normal text-emerald-700">{status.geo_target}</p>}
        </div>
      </div>

      <div className="hidden items-center lg:flex"><div className="h-full w-px bg-slate-200" /></div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Local response path (backhaul-independent)</p>
        <div className="rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm font-semibold text-navy-800">EDGE (AI-1 gateway)</div>
        <ArrowDown className="mx-auto h-4 w-4 text-slate-400" aria-hidden />
        <div className="grid grid-cols-2 gap-2">
          <div className={cn('rounded-lg border px-3 py-2', status?.local_siren === 'ACTIVE' ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white')}>
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700"><Siren className="h-4 w-4" aria-hidden />LOCAL SIREN</p>
            <Badge className="mt-1" tone={status?.local_siren === 'ACTIVE' ? 'crit' : 'off'}>{status?.local_siren ?? 'STANDBY'}</Badge>
          </div>
          <div className={cn('rounded-lg border px-3 py-2', status?.local_board === 'ACTIVE' ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white')}>
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700"><MonitorSmartphone className="h-4 w-4" aria-hidden />NOTICE BOARD</p>
            <Badge className="mt-1" tone={status?.local_board === 'ACTIVE' ? 'high' : 'off'}>{status?.local_board ?? 'STANDBY'}</Badge>
          </div>
        </div>
        <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
          {status && !status.backhaul_ok ? <ServerCrash className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" aria-hidden /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />}
          {status && !status.backhaul_ok
            ? 'Backhaul DOWN — cloud channels are queued. The local siren and notice board are edge-triggered and still work.'
            : 'Backhaul-independent local response: the gateway can trigger the siren / notice board without any cloud connectivity.'}
        </p>
        <p className="text-[11px] italic text-slate-400">Demo: dispatches are SIMULATED — no SMS, call or CAP message is actually transmitted.</p>
      </div>
    </div>
  );
}
