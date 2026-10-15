import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "./cn";

type Tone = "info" | "success" | "warning" | "error";
const tones: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: "border-brand-200 bg-brand-50 text-brand-900", icon: <Info className="size-5 shrink-0 text-brand-600" aria-hidden /> },
  success: { box: "border-green-200 bg-ok-50 text-ok-700", icon: <CheckCircle2 className="size-5 shrink-0 text-ok-600" aria-hidden /> },
  warning: { box: "border-amber-200 bg-warn-50 text-amber-900", icon: <AlertTriangle className="size-5 shrink-0 text-warn-500" aria-hidden /> },
  error: { box: "border-red-200 bg-err-50 text-err-700", icon: <XCircle className="size-5 shrink-0 text-err-600" aria-hidden /> },
};

export function Alert({ tone = "info", title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", tones[tone].box, className)}>
      {tones[tone].icon}
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "leading-relaxed")}>{children}</div>}
      </div>
    </div>
  );
}
