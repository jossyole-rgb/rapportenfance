"use client";
import { useActionState, useMemo, useState } from "react";
import { Sparkles, Save, Info } from "lucide-react";
import type { FormState } from "@/app/actions/auth";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormFeedback } from "@/components/form-feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DOCUMENT_TEMPLATES, DOCUMENT_TYPES, type DocumentTypeKey } from "@/lib/domain/document-types";

export type DocumentFormDefaults = {
  caseFileId?: string;
  type?: DocumentTypeKey;
  authorName: string;
  authorJobTitle?: string | null;
  serviceName?: string | null;
  meetingDate: string;
  meetingTime?: string | null;
  meetingLocation?: string | null;
  interviewType?: string | null;
  purpose?: string | null;
  attendees?: string | null;
  recipient?: string | null;
  notes?: string;
};

const EXAMPLE =
  "Visite domicile mère. Enfant présent. Mère explique école difficile depuis rentrée. Lucas dit professeur crie beaucoup. Mère dit père appelle peu. Lucas ne veut pas parler du père. Logement propre. Lucas a une chambre individuelle. Maman demande aide inscription foot. Appeler école + club.";

export function DocumentForm({
  action: serverAction,
  defaults,
  caseFiles,
  documentId,
  mode,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  defaults: DocumentFormDefaults;
  caseFiles?: Array<{ id: string; reference: string; childAlias: string | null }>;
  documentId?: string;
  mode: "create" | "edit";
}) {
  const [state, action] = useActionState(serverAction, undefined);
  const [type, setType] = useState<DocumentTypeKey>(defaults.type ?? "NOTE_ENTRETIEN");
  const [notes, setNotes] = useState(defaults.notes ?? "");
  const template = DOCUMENT_TEMPLATES[type];
  const fe = state?.fieldErrors ?? {};
  const words = useMemo(() => (notes.trim() ? notes.trim().split(/\s+/).length : 0), [notes]);

  return (
    <form action={action} className="space-y-6">
      <FormFeedback state={state} />
      {documentId && <input type="hidden" name="documentId" value={documentId} />}
      <div className="grid gap-6 xl:grid-cols-[1fr_1.25fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="1. Type d'écrit" description="La structure du document s'adapte au type choisi." />
            <CardBody className="space-y-4">
              {mode === "create" ? (
                <>
                  <Field label="Dossier" htmlFor="caseFileId" required error={fe.caseFileId}>
                    <Select id="caseFileId" name="caseFileId" defaultValue={defaults.caseFileId} required>
                      <option value="">Choisir un dossier…</option>
                      {caseFiles?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.reference}
                          {c.childAlias ? ` (${c.childAlias})` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Type d'écrit" htmlFor="type" required error={fe.type}>
                    <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as DocumentTypeKey)}>
                      {DOCUMENT_TYPES.map((t) => (
                        <option key={t} value={t}>{DOCUMENT_TEMPLATES[t].label}</option>
                      ))}
                    </Select>
                  </Field>
                </>
              ) : (
                <p className="text-sm font-medium text-slate-800">{template.label}</p>
              )}
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                <p>{template.description}</p>
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">Rubriques proposées</p>
                <p className="mt-1 text-xs leading-relaxed">
                  {template.sections.map((s) => s.title + (s.required ? " *" : "")).join(" · ")}
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="2. Professionnel et rendez-vous" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Rédacteur" htmlFor="authorName" className="sm:col-span-2">
                <Input id="authorName" value={defaults.authorName} disabled readOnly />
              </Field>
              <Field label="Fonction" htmlFor="authorJobTitle" error={fe.authorJobTitle}>
                <Input id="authorJobTitle" name="authorJobTitle" defaultValue={defaults.authorJobTitle ?? ""} maxLength={120} />
              </Field>
              <Field label="Service ou établissement" htmlFor="serviceName" error={fe.serviceName}>
                <Input id="serviceName" name="serviceName" defaultValue={defaults.serviceName ?? ""} maxLength={120} />
              </Field>
              <Field label="Date" htmlFor="meetingDate" required error={fe.meetingDate}>
                <Input id="meetingDate" name="meetingDate" type="date" defaultValue={defaults.meetingDate} required />
              </Field>
              <Field label="Heure" htmlFor="meetingTime" error={fe.meetingTime}>
                <Input id="meetingTime" name="meetingTime" type="time" defaultValue={defaults.meetingTime ?? ""} />
              </Field>
              <Field label="Lieu" htmlFor="meetingLocation" error={fe.meetingLocation} className="sm:col-span-2">
                <Input id="meetingLocation" name="meetingLocation" defaultValue={defaults.meetingLocation ?? ""} maxLength={200} placeholder="Exemple : domicile de la mère" />
              </Field>
              <Field label="Type d'entretien" htmlFor="interviewType" error={fe.interviewType}>
                <Input id="interviewType" name="interviewType" defaultValue={defaults.interviewType ?? ""} maxLength={120} placeholder="Exemple : visite à domicile" />
              </Field>
              <Field label="Destinataire" htmlFor="recipient" error={fe.recipient}>
                <Input id="recipient" name="recipient" defaultValue={defaults.recipient ?? template.defaultRecipient ?? ""} maxLength={200} />
              </Field>
              <Field label="Objet du rendez-vous" htmlFor="purpose" error={fe.purpose} className="sm:col-span-2">
                <Input id="purpose" name="purpose" defaultValue={defaults.purpose ?? ""} maxLength={500} />
              </Field>
              <Field label="Personnes présentes" htmlFor="attendees" error={fe.attendees} hint="Qualité ou prénom : « la mère, Lucas, l'éducatrice »." className="sm:col-span-2">
                <Input id="attendees" name="attendees" defaultValue={defaults.attendees ?? ""} maxLength={500} />
              </Field>
            </CardBody>
          </Card>
        </div>

        <Card className="flex flex-col">
          <CardHeader
            title="3. Vos notes"
            description="Collez ou rédigez vos notes telles quelles, même en style télégraphique."
            actions={
              !notes && (
                <button type="button" onClick={() => setNotes(EXAMPLE)} className="text-sm font-medium text-brand-700 hover:underline">
                  Insérer l&apos;exemple fictif
                </button>
              )
            }
          />
          <CardBody className="flex flex-1 flex-col gap-3">
            <Field label="Notes professionnelles" htmlFor="notes" required error={fe.notes} className="flex flex-1 flex-col">
              <Textarea
                id="notes"
                name="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required
                maxLength={30000}
                className="min-h-[340px] flex-1 font-mono text-[13px] xl:min-h-[480px]"
                placeholder="Visite domicile mère. Enfant présent. Mère explique…"
                aria-describedby="notes-help"
              />
            </Field>
            <div id="notes-help" className="flex flex-wrap items-start justify-between gap-2 text-xs text-slate-500">
              <p className="flex max-w-lg gap-1.5">
                <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                Astuce : préfixez « Vigilance : », « Ressource : », « Analyse : » ou « Hypothèse : » pour classer explicitement un élément. Les citations entre guillemets ne sont reprises que si elles figurent mot pour mot dans vos notes.
              </p>
              <span className="tabular-nums">{words} mots</span>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <p className="mr-auto text-xs text-slate-500">Aucune donnée n&apos;est transmise à un service extérieur : la structuration est réalisée sur le serveur de l&apos;application.</p>
        <SubmitButton name="intent" value="save" variant="secondary" pendingLabel="Enregistrement…">
          <Save className="size-4" aria-hidden /> Enregistrer le brouillon
        </SubmitButton>
        <SubmitButton name="intent" value="generate" size="lg" pendingLabel="Génération en cours…">
          <Sparkles className="size-4" aria-hidden /> Générer mon écrit professionnel
        </SubmitButton>
      </div>
    </form>
  );
}
