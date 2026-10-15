import { Alert } from "@/components/ui/alert";
import type { FormState } from "@/app/actions/auth";

export function FormFeedback({ state }: { state: FormState }) {
  if (!state) return null;
  if (state.error) return <Alert tone="error">{state.error}</Alert>;
  if (state.ok && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}
