import { hash, verify } from "@node-rs/argon2";

// Paramètres Argon2id conformes aux recommandations OWASP (m=19 Mio, t=2, p=1).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN_LENGTH = 12;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Retourne la liste des règles non respectées (vide si le mot de passe est acceptable). */
export function checkPasswordPolicy(password: string, context: { email?: string; fullName?: string } = {}): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`au moins ${PASSWORD_MIN_LENGTH} caractères`);
  if (password.length > 200) problems.push("au plus 200 caractères");
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes < 3) problems.push("au moins trois types de caractères parmi minuscules, majuscules, chiffres et symboles");
  const lower = password.toLowerCase();
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) problems.push("ne pas contenir votre identifiant de messagerie");
  if (/(.)\1{3,}/.test(password)) problems.push("pas plus de trois caractères identiques à la suite");
  if (["motdepasse", "password", "azerty", "123456", "rapportenfance"].some((w) => lower.includes(w))) {
    problems.push("ne pas contenir de mot trop courant");
  }
  return problems;
}

// Empreinte factice utilisée pour uniformiser le temps de réponse quand le compte n'existe pas.
let dummyHash: Promise<string> | null = null;
export function getDummyHash() {
  dummyHash ??= hashPassword("compte-inexistant-" + Math.random());
  return dummyHash;
}
