"use client";
import { useActionState } from "react";
import { createOrganizationAction } from "@/app/actions/admin";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormFeedback } from "@/components/form-feedback";
import { PASSWORD_HINT } from "@/components/password-form";

export function OrgForm() {
  const [state, action] = useActionState(createOrganizationAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <FormFeedback state={state} />
      <Field label="Nom de l'organisation" htmlFor="name" required error={fe.name}><Input id="name" name="name" required /></Field>
      <Field label="Identifiant court" htmlFor="slug" required error={fe.slug} hint="Minuscules, chiffres et tirets."><Input id="slug" name="slug" required /></Field>
      <Field label="Nom de l'administrateur" htmlFor="adminName" required error={fe.adminName}><Input id="adminName" name="adminName" required /></Field>
      <Field label="E-mail de l'administrateur" htmlFor="adminEmail" required error={fe.adminEmail}><Input id="adminEmail" name="adminEmail" type="email" required /></Field>
      <Field label="Mot de passe initial" htmlFor="adminPassword" required error={fe.adminPassword} hint={PASSWORD_HINT}><Input id="adminPassword" name="adminPassword" type="password" autoComplete="new-password" required /></Field>
      <SubmitButton pendingLabel="Création…">Créer l&apos;organisation</SubmitButton>
    </form>
  );
}
