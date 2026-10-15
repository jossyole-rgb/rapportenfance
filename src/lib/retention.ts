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
