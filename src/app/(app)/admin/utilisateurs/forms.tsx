"use client";
import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { inviteUserAction, updateUserAction } from "@/app/actions/admin";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormFeedback } from "@/components/form-feedback";
import { Alert } from "@/components/ui/alert";

const ROLE_OPTIONS = [
  { value: "PROFESSIONAL", label: "Professionnel" },
  { value: "VALIDATOR", label: "Validateur / chef de service" },
  { value: "ORG_ADMIN", label: "Administrateur établissement" },
];

export function InviteForm() {
  const [state, action] = useActionState(inviteUserAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <FormFeedback state={state} />
      {state && "link" in state && state.link && (
        <Alert tone="info" title="Lien d'invitation (à transmettre si l'e-mail n'est pas configuré)">
          <code className="break-all text-xs">{state.link}</code>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom complet" htmlFor="fullName" required error={fe.fullName}>
          <Input id="fullName" name="fullName" required maxLength={120} />
        </Field>
        <Field label="E-mail professionnel" htmlFor="email" required error={fe.email}>
          <Input id="email" name="email" type="email" required />
        </Field>
        <Field label="Fonction" htmlFor="jobTitle" error={fe.jobTitle} className="sm:col-span-2">
          <Input id="jobTitle" name="jobTitle" maxLength={120} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Rôles</legend>
        <div className="space-y-2">
          {ROLE_OPTIONS.map((r) => (
            <Checkbox key={r.value} name="roles" value={r.value} label={r.label} defaultChecked={r.value === "PROFESSIONAL"} />
          ))}
        </div>
        {fe.roles && <p className="mt-1 text-xs font-medium text-err-700">{fe.roles}</p>}
      </fieldset>
      <SubmitButton pendingLabel="Envoi…">
        <UserPlus className="size-4" aria-hidden /> Inviter
      </SubmitButton>
    </form>
  );
}

export function UserRowForm({ user, self }: { user: { id: string; roles: string[]; jobTitle: string | null; isActive: boolean }; self: boolean }) {
  const [state, action] = useActionState(updateUserAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="jobTitle" value={user.jobTitle ?? ""} />
      {ROLE_OPTIONS.map((r) => (
        <Checkbox key={r.value} name="roles" value={r.value} label={r.label.split(" /")[0]} defaultChecked={user.roles.includes(r.value)} className="text-xs" />
      ))}
      <Checkbox name="isActive" label="Actif" defaultChecked={user.isActive} disabled={self} className="text-xs" />
      {self && <input type="hidden" name="isActive" value="on" />}
      <SubmitButton size="sm" variant="secondary">Enregistrer</SubmitButton>
      {state?.error && <p className="w-full text-xs font-medium text-err-700">{state.error}</p>}
      {state?.ok && <p className="w-full text-xs text-ok-700">{state.message}</p>}
    </form>
  );
}
