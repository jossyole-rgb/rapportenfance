"use client";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormFeedback } from "@/components/form-feedback";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormFeedback state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Adresse e-mail professionnelle" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus key={state?.email} defaultValue={state?.email} />
      </Field>
      <Field label="Mot de passe" htmlFor="password" required>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex items-center justify-between">
        <Link href="/mot-de-passe-oublie" className="text-sm font-medium text-brand-700 hover:underline">
          Mot de passe oublié ?
        </Link>
      </div>
      <SubmitButton className="w-full" size="lg" pendingLabel="Connexion…">
        Se connecter
      </SubmitButton>
    </form>
  );
}
