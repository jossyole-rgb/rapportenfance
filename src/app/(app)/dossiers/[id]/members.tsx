"use client";
import { useActionState } from "react";
import { addMemberAction } from "@/app/actions/cases";
import { Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormFeedback } from "@/components/form-feedback";

export function AddMemberForm({ caseFileId, candidates }: { caseFileId: string; candidates: Array<{ id: string; fullName: string; jobTitle: string | null }> }) {
  const [state, action] = useActionState(addMemberAction, undefined);
  if (candidates.length === 0) return <p className="text-sm text-slate-500">Tous les professionnels de l&apos;établissement sont déjà membres.</p>;
  return (
    <form action={action} className="space-y-2">
      {state?.error && <FormFeedback state={state} />}
      <input type="hidden" name="caseFileId" value={caseFileId} />
      <label htmlFor="userId" className="sr-only">Professionnel à ajouter</label>
      <div className="flex gap-2">
        <Select id="userId" name="userId" required>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
              {c.jobTitle ? ` (${c.jobTitle})` : ""}
            </option>
          ))}
        </Select>
        <SubmitButton variant="secondary">Ajouter</SubmitButton>
      </div>
    </form>
  );
}
