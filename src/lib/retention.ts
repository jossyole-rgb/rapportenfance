import type { PrismaClient } from "@prisma/client";

/**
 * Purge des documents archivés dont la durée de conservation de l'établissement est échue.
 * Utilisée par la tâche planifiée scripts/retention-purge.ts.
 */
export async function purgeExpiredDocuments(db: PrismaClient, now = new Date(), organizationId?: string): Promise<number> {
  const orgs = await db.organization.findMany({ where: organizationId ? { id: organizationId } : {} });
  let total = 0;
  for (const org of orgs) {
    const limit = new Date(now.getTime() - org.retentionDays * 86400_000);
    const expired = await db.document.findMany({ where: { organizationId: org.id, status: "ARCHIVED", archivedAt: { lt: limit } }, select: { id: true } });
    if (!expired.length) continue;
    await db.$transaction([
      db.document.deleteMany({ where: { id: { in: expired.map((d) => d.id) } } }),
      db.auditLog.create({ data: { organizationId: org.id, action: "retention.purged", metadata: { count: expired.length, retentionDays: org.retentionDays } } }),
    ]);
    total += expired.length;
  }
  return total;
}

/** Journal d'audit sans établissement (administration technique, comptes inconnus) : durée fixe. */
export const PLATFORM_AUDIT_RETENTION_DAYS = 365;

/** Supprime les entrées du journal d'audit plus anciennes que la durée fixée par chaque établissement. */
export async function purgeExpiredAuditLogs(db: PrismaClient, now = new Date()): Promise<number> {
  let total = 0;
  for (const org of await db.organization.findMany({ select: { id: true, auditRetentionDays: true } })) {
    const res = await db.auditLog.deleteMany({ where: { organizationId: org.id, createdAt: { lt: new Date(now.getTime() - org.auditRetentionDays * 86400_000) } } });
    if (res.count) {
      await db.auditLog.create({ data: { organizationId: org.id, action: "audit.purged", metadata: { count: res.count, auditRetentionDays: org.auditRetentionDays } } });
      total += res.count;
    }
  }
  const platform = await db.auditLog.deleteMany({
    where: { organizationId: null, createdAt: { lt: new Date(now.getTime() - PLATFORM_AUDIT_RETENTION_DAYS * 86400_000) } },
  });
  return total + platform.count;
}

/** Supprime les enregistrements techniques expirés (sessions, vérifications, jetons, compteurs de débit). */
export async function purgeTechnicalRecords(db: PrismaClient, now = new Date()): Promise<number> {
  const dayAgo = new Date(now.getTime() - 86400_000);
  const results = await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.mfaChallenge.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: dayAgo } }, { usedAt: { lt: dayAgo } }] } }),
    db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: dayAgo } } }),
  ]);
  return results.reduce((n, r) => n + r.count, 0);
}
