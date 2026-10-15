export function Logo({ className = "", inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className={`grid size-9 place-items-center rounded-lg ${inverted ? "bg-white/10 text-white" : "bg-brand-700 text-white"}`} aria-hidden>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M9 13l2 2 4-4" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className={`block text-[15px] font-semibold ${inverted ? "text-white" : "text-slate-900"}`}>RapportEnfance IA</span>
        <span className={`block text-[11px] ${inverted ? "text-brand-100/80" : "text-slate-500"}`}>Assistant de rédaction professionnelle</span>
      </span>
    </span>
  );
}
