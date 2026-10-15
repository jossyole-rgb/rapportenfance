import { STATUS_LABELS, type Status } from "@/lib/domain/workflow";
import { cn } from "./cn";

const STATUS_STYLES: Record<Status, string> = {
  DRAFT: "bg-slate-100 text-slate-700 ring-slate-200",
  GENERATED: "bg-violet-50 text-violet-700 ring-violet-200",
  TO_REVIEW: "bg-amber-50 text-amber-800 ring-amber-200",
  REVIEWED: "bg-sky-50 text-sky-800 ring-sky-200",
  VALIDATED: "bg-green-50 text-green-800 ring-green-200",
  EXPORTED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  ARCHIVED: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_STYLES[status], className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Badge({ children, tone = "slate", className }: { children: React.ReactNode; tone?: "slate" | "brand" | "green" | "amber" | "red"; className?: string }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    brand: "bg-brand-50 text-brand-700",
    green: "bg-green-50 text-green-800",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-700",
  };
  return <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export const LEVEL_STYLES = {
  GREEN: { label: "Étayé", dot: "bg-ok-600", text: "text-ok-700", bg: "bg-ok-50", ring: "ring-green-200" },
  ORANGE: { label: "À vérifier", dot: "bg-warn-500", text: "text-warn-700", bg: "bg-warn-50", ring: "ring-amber-200" },
  RED: { label: "Non retrouvé", dot: "bg-err-600", text: "text-err-700", bg: "bg-err-50", ring: "ring-red-200" },
} as const;
