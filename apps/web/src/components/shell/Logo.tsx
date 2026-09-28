export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="ECO-SHIELD logo">
      <rect width="40" height="40" rx="10" fill="#0f2140" />
      <circle cx="20" cy="20" r="11" fill="none" stroke="#86a6d9" strokeWidth="2" />
      <circle cx="20" cy="20" r="6.5" fill="none" stroke="#3563a8" strokeWidth="2" />
      <circle cx="20" cy="20" r="2.6" fill="#7c3aed" />
      <path d="M20 5v4M20 31v4M5 20h4M31 20h4" stroke="#86a6d9" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ dark = false, sub = true }: { dark?: boolean; sub?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="leading-tight">
        <span className={`block text-base font-bold tracking-wide ${dark ? 'text-white' : 'text-navy-900'}`}>ECO-SHIELD</span>
        {sub && <span className={`hidden text-[10px] font-medium uppercase tracking-wider sm:block ${dark ? 'text-navy-200' : 'text-slate-500'}`}>Smart Hazard Intelligence</span>}
      </span>
    </span>
  );
}
