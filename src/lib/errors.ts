export type AppErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED";

/** Erreur métier dont le message peut être présenté à l'utilisateur. */
export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = "Ressource") => new AppError("NOT_FOUND", `${what} introuvable ou inaccessible.`);
export const forbidden = (message = "Vous n'avez pas les droits nécessaires pour cette action.") => new AppError("FORBIDDEN", message);
export const invalid = (message: string, fieldErrors?: Record<string, string>) => new AppError("VALIDATION", message, fieldErrors);

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Convertit une erreur en message sûr (aucun détail technique exposé). */
export function toActionError(e: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
  const ref = Math.random().toString(36).slice(2, 10).toUpperCase();
  console.error(`[erreur ${ref}]`, e instanceof Error ? `${e.name}: ${e.message}` : "erreur inconnue");
  return { ok: false, error: `Une erreur inattendue est survenue. Réessayez ; si le problème persiste, communiquez la référence ${ref} au support.` };
}
