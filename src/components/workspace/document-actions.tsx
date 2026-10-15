"use client";
import { useActionState, useState } from "react";
import { Archive, Download, FileDown, Sparkles, Trash2 } from "lucide-react";
import { archiveAction, deleteAction, generateAction } from "@/app/actions/documents";
import { Button, buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormFeedback } from "@/components/form-feedback";

export function ExportMenu({ documentId, final, draft }: { documentId: string; final: boolean; draft: boolean }) {
  const [open, setOpen] = useState(false);
  if (!final && !draft) return null;
  const link = (format: "pdf" | "docx", mode: "final" | "draft") => `/api/ecrits/${documentId}/export?format=${format}&mode=${mode}`;
  return (
    <div className="relative">
      <Button type="button" variant={final ? "success" : "secondary"} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <Download className="size-4" aria-hidden /> Exporter
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {final ? (
            <>
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Export définitif (document validé)</p>
              <a role="menuitem" href={link("pdf", "final")} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"><FileDown className="size-4 text-brand-600" aria-hidden /> PDF</a>
              <a role="menuitem" href={link("docx", "final")} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"><FileDown className="size-4 text-brand-600" aria-hidden /> Word (DOCX)</a>
            </>
          ) : (
            <p className="px-3 py-2 text-xs text-slate-500">L&apos;export définitif sera disponible après validation humaine.</p>
          )}
          {draft && (
            <>
              <p className="border-t border-slate-100 px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Export de travail</p>
              <p className="px-3 pb-1 text-xs text-err-700">Chaque page porte la mention « BROUILLON NON VALIDÉ ».</p>
              <a role="menuitem" href={link("pdf", "draft")} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"><FileDown className="size-4 text-slate-500" aria-hidden /> PDF de travail</a>
              <a role="menuitem" href={link("docx", "draft")} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"><FileDown className="size-4 text-slate-500" aria-hidden /> Word de travail</a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function GenerateForm({ documentId, regenerate }: { documentId: string; regenerate: boolean }) {
  const [state, action] = useActionState(generateAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (regenerate && !window.confirm("Une nouvelle génération remplacera le contenu actuel du rapport (les versions précédentes restent consultables). Continuer ?")) e.preventDefault();
      }}
      className="space-y-2"
    >
      {state?.error && <FormFeedback state={state} />}
      <input type="hidden" name="documentId" value={documentId} />
      <SubmitButton variant={regenerate ? "secondary" : "primary"} size={regenerate ? "md" : "lg"} pendingLabel="Génération en cours…">
        <Sparkles className="size-4" aria-hidden /> {regenerate ? "Régénérer depuis les notes" : "Générer mon écrit professionnel"}
      </SubmitButton>
    </form>
  );
}

export function ArchiveDeleteActions({ documentId, canArchive, canDelete, back }: { documentId: string; canArchive: boolean; canDelete: boolean; back: string }) {
  const [aState, archive] = useActionState(archiveAction, undefined);
  const [dState, del] = useActionState(deleteAction, undefined);
  if (!canArchive && !canDelete) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {canArchive && (
        <form action={archive} onSubmit={(e) => { if (!window.confirm("Archiver ce document ? Il ne sera plus modifiable.")) e.preventDefault(); }}>
          <input type="hidden" name="documentId" value={documentId} />
          <button type="submit" className={buttonClass("ghost", "md")}><Archive className="size-4" aria-hidden /> Archiver</button>
        </form>
      )}
      {canDelete && (
        <form action={del} onSubmit={(e) => { if (!window.confirm("Supprimer définitivement ce document et toutes ses versions ? Cette action est irréversible.")) e.preventDefault(); }}>
          <input type="hidden" name="documentId" value={documentId} />
          <input type="hidden" name="back" value={back} />
          <button type="submit" className={buttonClass("ghost", "md", "text-err-700 hover:bg-red-50 hover:text-err-700")}><Trash2 className="size-4" aria-hidden /> Supprimer</button>
        </form>
      )}
      {(aState?.error || dState?.error) && <FormFeedback state={aState?.error ? aState : dState} />}
    </div>
  );
}
