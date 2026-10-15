"use client";
import { useActionState } from "react";
import { updateOrgSettingsAction } from "@/app/actions/admin";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormFeedback } from "@/components/form-feedback";

export function SettingsForm({ org }: { org: { name: string; headerLine1: string | null; headerLine2: string | null; headerLine3: string | null; validationMode: string; retentionDays: number; mfaRequired: boolean } }) {
  const [state, action] = useActionState(updateOrgSettingsAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5">
      <FormFeedback state={state} />
      <Field label="Nom de l'établissement" htmlFor="name" required error={fe.name}>
        <Input id="name" name="name" defaultValue={org.name} required maxLength={160} />
      </Field>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-700">En-tête institutionnel des exports</legend>
        <Input name="headerLine1" aria-label="Ligne 1" defaultValue={org.headerLine1 ?? ""} maxLength={160} placeholder="Ligne 1 (nom)" />
        <Input name="headerLine2" aria-label="Ligne 2" defaultValue={org.headerLine2 ?? ""} maxLength={160} placeholder="Ligne 2 (service, adresse)" />
        <Input name="headerLine3" aria-label="Ligne 3" defaultValue={org.headerLine3 ?? ""} maxLength={160} placeholder="Ligne 3 (téléphone, mention)" />
      </fieldset>
      <Field label="Mode de validation" htmlFor="validationMode" hint="Décision métier : à arrêter avec la direction de l'établissement.">
        <Select id="validationMode" name="validationMode" defaultValue={org.validationMode}>
          <option value="SUPERVISOR">Par un validateur distinct de l&apos;auteur (chef de service)</option>
          <option value="SELF">Par l&apos;auteur, après confirmation de relecture</option>
        </Select>
      </Field>
      <Field label="Durée de conservation des documents archivés (jours)" htmlFor="retentionDays" required error={fe.retentionDays} hint="À définir avec votre DPO. Au-delà, les documents archivés sont supprimés par la purge de conservation.">
        <Input id="retentionDays" name="retentionDays" type="number" min={30} max={36500} defaultValue={org.retentionDays} required />
      </Field>
      <div>
        <Checkbox name="mfaRequired" label="Exiger la double authentification pour tous les utilisateurs" defaultChecked={org.mfaRequired} />
        <p className="mt-1 text-xs text-slate-500">Fortement recommandé dès que des données réelles sont traitées. Les utilisateurs sans double authentification devront l&apos;activer à leur prochaine page.</p>
      </div>
      <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
    </form>
  );
}
