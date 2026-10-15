"use client";
import { useActionState } from "react";
import type { FormState } from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormFeedback } from "@/components/form-feedback";

export const PASSWORD_HINT = "12 caractères minimum, avec au moins trois types parmi minuscules, majuscules, chiffres et symboles.";

export function NewPasswordForm({
  action: serverAction,
  token,
  submitLabel,
  withCurrent = false,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  token?: string;
  submitLabel: string;
  withCurrent?: boolean;
}) {
  const [state, action] = useActionState(serverAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <FormFeedback state={state} />
      {token && <input type="hidden" name="token" value={token} />}
      {withCurrent && (
        <Field label="Mot de passe actuel" htmlFor="current" required error={state?.fieldErrors?.current}>
          <Input id="current" name="current" type="password" autoComplete="current-password" required />
        </Field>
      )}
      <Field label="Nouveau mot de passe" htmlFor="password" required hint={PASSWORD_HINT} error={state?.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} />
      </Field>
      <Field label="Confirmer le mot de passe" htmlFor="confirm" required error={state?.fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingLabel="Enregistrement…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
