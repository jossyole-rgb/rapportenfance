"use client";
import { useActionState, useState } from "react";
import { Copy, Check } from "lucide-react";
import type { FormState } from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FormFeedback } from "@/components/form-feedback";

type Action = (s: FormState, fd: FormData) => Promise<FormState>;

/** Saisie d'un code à 6 chiffres (ou d'un code de secours si `allowRecovery`). */
export function MfaCodeForm({
  action: serverAction,
  submitLabel,
  withPassword = false,
  allowRecovery = false,
  variant,
  autoFocus = false,
  codesNextHref,
}: {
  action: Action;
  submitLabel: string;
  withPassword?: boolean;
  allowRecovery?: boolean;
  variant?: "primary" | "danger" | "secondary";
  autoFocus?: boolean;
  /** Si l'action renvoie des codes de secours, lien affiché après leur présentation. */
  codesNextHref?: string;
}) {
  const [state, action] = useActionState(serverAction, undefined);
  if (state?.codes) return <RecoveryCodes codes={state.codes} message={state.message} nextHref={codesNextHref} />;
  return (
    <form action={action} className="space-y-4">
      <FormFeedback state={state} />
      {withPassword && (
        <Field label="Mot de passe" htmlFor="mfa-password" required error={state?.fieldErrors?.password}>
          <Input id="mfa-password" name="password" type="password" autoComplete="current-password" required />
        </Field>
      )}
      <Field
        label={allowRecovery ? "Code de l'application ou code de secours" : "Code à 6 chiffres de l'application"}
        htmlFor="mfa-code"
        required
        error={state?.fieldErrors?.code}
        hint={allowRecovery ? "Code de secours au format XXXXX-XXXXX, utilisable une seule fois." : undefined}
      >
        <Input
          id="mfa-code"
          name="code"
          required
          autoFocus={autoFocus}
          autoComplete="one-time-code"
          inputMode={allowRecovery ? "text" : "numeric"}
          pattern={allowRecovery ? undefined : "[0-9 ]{6,7}"}
          maxLength={allowRecovery ? 11 : 7}
          className="font-mono tracking-widest"
        />
      </Field>
      <SubmitButton className="w-full" variant={variant} pendingLabel="Vérification…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

export function RecoveryCodes({ codes, message, nextHref }: { codes: string[]; message?: string; nextHref?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      {message && <Alert tone="success">{message}</Alert>}
      <Alert tone="warning" title="Codes de secours : notez-les maintenant">
        Ils ne seront plus affichés. Chaque code permet une connexion si vous n&apos;avez plus votre téléphone. Conservez-les en lieu sûr (coffre-fort de mots de passe ou papier rangé), jamais dans un dossier d&apos;usager.
      </Alert>
      <ul className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm" aria-label="Codes de secours">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            navigator.clipboard?.writeText(codes.join("\n")).then(() => setCopied(true), () => setCopied(false));
          }}
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copiés" : "Copier les codes"}
        </Button>
        {nextHref && <LinkButton href={nextHref}>J&apos;ai noté mes codes, continuer</LinkButton>}
      </div>
    </div>
  );
}
