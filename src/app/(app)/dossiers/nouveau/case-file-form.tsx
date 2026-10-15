"use client";
import { useActionState } from "react";
import { createCaseFileAction } from "@/app/actions/cases";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormFeedback } from "@/components/form-feedback";
import { Alert } from "@/components/ui/alert";

export function CaseFileForm({ then, defaultService }: { then?: string; defaultService?: string | null }) {
  const [state, action] = useActionState(createCaseFileAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5">
      <FormFeedback state={state} />
      <input type="hidden" name="then" value={then ?? ""} />
      <Alert tone="info" title="Minimisation des données">
        Utilisez l&apos;identifiant de dossier de votre logiciel métier ou un identifiant pseudonyme. Ne saisissez ni nom de famille ni date de naissance.
      </Alert>
      <Field label="Identifiant du dossier" htmlFor="reference" required hint="Exemple : D-2026-0042" error={fe.reference}>
        <Input id="reference" name="reference" required maxLength={40} aria-invalid={!!fe.reference} autoComplete="off" />
      </Field>
      <Field
        label="Prénom ou initiales utilisés dans vos notes"
        htmlFor="childAlias"
        hint="Facultatif. Permet d'attribuer correctement les propos de l'enfant. Stocké chiffré."
        error={fe.childAlias}
      >
        <Input id="childAlias" name="childAlias" maxLength={40} autoComplete="off" />
      </Field>
      <Field label="Service" htmlFor="serviceName" error={fe.serviceName}>
        <Input id="serviceName" name="serviceName" maxLength={120} defaultValue={defaultService ?? ""} placeholder="Exemple : Service AEMO" />
      </Field>
      <SubmitButton pendingLabel="Création…">Créer le dossier</SubmitButton>
    </form>
  );
}
