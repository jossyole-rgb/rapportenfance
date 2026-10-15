import "server-only";
import { db } from "@/lib/db";

/**
 * Limiteur de débit partagé entre instances, stocké dans PostgreSQL (fenêtre fixe).
 * L'incrément est atomique (INSERT ... ON CONFLICT), donc fiable avec plusieurs serveurs applicatifs.
 * Les compteurs ne contiennent qu'une clé technique (ex. « login-ip:203.0.113.4 »), jamais de donnée métier.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const rows = await db.$queryRaw<Array<{ count: number; windowStart: Date }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart")
    VALUES (${key.slice(0, 200)}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" < now() - make_interval(secs => ${windowMs / 1000}) THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" < now() - make_interval(secs => ${windowMs / 1000}) THEN now() ELSE "RateLimitBucket"."windowStart" END
    RETURNING "count", "windowStart"`;
  const row = rows[0]!;
  if (row.count > limit) {
    return { allowed: false, retryAfterMs: Math.max(0, row.windowStart.getTime() + windowMs - Date.now()) };
  }
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Lecture sans incrément : permet de ne compter que les échecs (une équipe entière peut partager
 * la même adresse IP publique ; les connexions réussies ne doivent pas la bloquer).
 */
export async function isRateLimited(key: string, limit: number, windowMs: number): Promise<boolean> {
  const row = await db.rateLimitBucket.findUnique({ where: { key: key.slice(0, 200) } });
  return !!row && row.windowStart.getTime() > Date.now() - windowMs && row.count >= limit;
}

// Les compteurs expirés sont supprimés par la tâche planifiée (purgeTechnicalRecords, src/lib/retention.ts).

export async function resetRateLimits() {
  await db.rateLimitBucket.deleteMany({});
}
