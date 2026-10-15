import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/security/crypto";

const isProd = () => process.env.NODE_ENV === "production";
// Le préfixe __Host- impose Secure, Path=/ et l'absence de Domain (cookie lié à l'hôte)
export const SESSION_COOKIE = () => (isProd() ? "__Host-re_session" : "re_session");
/** Cookie de l'étape « second facteur » (5 minutes, jeton dont seule l'empreinte est stockée). */
export const MFA_COOKIE = () => (isProd() ? "__Host-re_mfa" : "re_mfa");

const maxAgeMs = () => Number(process.env.SESSION_MAX_AGE_HOURS || 10) * 3600_000;
const idleMs = () => Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES || 30) * 60_000;

/** Crée une session en base et retourne le jeton à placer dans le cookie (seule son empreinte est stockée). */
export async function createSessionRecord(userId: string, userAgent?: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + maxAgeMs());
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, userAgent: userAgent?.slice(0, 200) ?? null },
  });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE(), token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE());
}

/** Résout une session à partir d'un jeton : vérifie expiration absolue, inactivité et état du compte. */
export async function resolveSessionToken(token: string | undefined | null) {
  if (!token || token.length > 100) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { organization: true } } },
  });
  if (!session) return null;
  const now = Date.now();
  const expired = session.expiresAt.getTime() < now || now - session.lastSeenAt.getTime() > idleMs();
  const user = session.user;
  const disabled = !user.isActive || (user.organization && !user.organization.isActive);
  if (expired || disabled || session.createdAt < user.passwordChangedAt) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return session;
}

/** Session de la requête courante (mémorisée pour la durée du rendu). */
export const getCurrentSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE())?.value;
  return resolveSessionToken(token);
});

export async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim().slice(0, 64);
  return { ip, userAgent: h.get("user-agent") };
}
