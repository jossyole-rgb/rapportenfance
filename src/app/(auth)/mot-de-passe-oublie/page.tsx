"use client";
import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction } from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormFeedback } from "@/components/form-feedback";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(forgotPasswordAction, undefined);
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Mot de passe oublié</h2>
      <p className="mt-1 text-sm text-slate-600">Saisissez votre adresse e-mail : vous recevrez un lien valable une heure.</p>
      <form action={action} className="mt-6 space-y-5">
        <FormFeedback state={state} />
        <Field label="Adresse e-mail professionnelle" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </Field>
        <SubmitButton className="w-full" size="lg" pendingLabel="Envoi…">
          Recevoir un lien de réinitialisation
        </SubmitButton>
      </form>
      <Link href="/connexion" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
        Retour à la connexion
      </Link>
    </div>
  );
}
