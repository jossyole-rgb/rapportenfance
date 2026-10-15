/** La double authentification est-elle obligatoire pour cet utilisateur ? */
export function isMfaRequired(user: { organization?: { mfaRequired: boolean } | null }): boolean {
  if (user.organization) return user.organization.mfaRequired;
  // Administrateurs techniques (sans établissement) : obligatoire sauf désactivation explicite
  return process.env.PLATFORM_MFA_REQUIRED !== "false";
}

/** Session ouverte mais double authentification à configurer avant tout accès. */
export const needsMfaSetup = (user: { totpEnabledAt: Date | null; organization?: { mfaRequired: boolean } | null }) =>
  !user.totpEnabledAt && isMfaRequired(user);
