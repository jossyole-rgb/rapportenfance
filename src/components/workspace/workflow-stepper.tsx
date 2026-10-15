import { Check } from "lucide-react";
import { STATUS_LABELS, type Status } from "@/lib/domain/workflow";
import { cn } from "@/components/ui/cn";

const STEPS: Status[] = ["DRAFT", "GENERATED", "TO_REVIEW", "REVIEWED", "VALIDATED", "EXPORTED"];

export function WorkflowStepper({ status }: { status: Status }) {
  if (status === "ARCHIVED") {
    return <p className="text-sm text-slate-500">Document archivé : consultation seule.</p>;
  }
  const current = STEPS.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-y-2 text-xs" aria-label="Étapes du workflow de validation">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex items-center">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
                done && "text-ok-700",
                active && "bg-brand-700 text-white",
                !done && !active && "text-slate-400",
              )}
              aria-current={active ? "step" : undefined}
            >
              {done ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <span className={cn("grid size-4 place-items-center rounded-full text-[10px]", active ? "bg-white/20" : "border border-slate-300")}>{i + 1}</span>
              )}
              {STATUS_LABELS[s]}
            </span>
            {i < STEPS.length - 1 && <span className={cn("mx-1 h-px w-4 sm:w-6", i < current ? "bg-ok-600" : "bg-slate-300")} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
