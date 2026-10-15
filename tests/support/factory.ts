import { db } from "@/lib/db";
import { hashPassword } from "@/lib/security/password";
import type { Role } from "@prisma/client";

export const PASSWORD = "Test-Motdepasse-2026!".replace("Motdepasse", "Mot2passe");

let n = 0;
export async function makeOrg(validationMode: "SELF" | "SUPERVISOR" = "SUPERVISOR") {
  n++;
  return db.organization.create({ data: { name: `Org test ${n}`, slug: `org-test-${n}-${Date.now()}`, validationMode } });
}

const hashed = hashPassword(PASSWORD);
export async function makeUser(orgId: string | null, roles: Role[], name = "Utilisateur") {
  n++;
  const u = await db.user.create({
    data: { organizationId: orgId, email: `u${n}-${Date.now()}@test.local`, fullName: `${name} ${n}`, roles, passwordHash: await hashed },
  });
  return { id: u.id, organizationId: u.organizationId, roles: u.roles as Array<"PROFESSIONAL" | "VALIDATOR" | "ORG_ADMIN" | "TECH_ADMIN">, fullName: u.fullName, email: u.email };
}

export const NOTES =
  "Visite domicile mère. Enfant présent. Mère explique école difficile depuis rentrée. Lucas dit professeur crie beaucoup. Mère dit père appelle peu. Logement propre. Maman demande aide inscription foot. Appeler école + club le 20/10/2026. Mère informée.";

export const docInput = (caseFileId: string) => ({
  caseFileId,
  type: "VISITE_DOMICILE",
  meetingDate: "2026-10-12",
  meetingTime: "14:00",
  meetingLocation: "Domicile",
  interviewType: "Visite à domicile",
  purpose: "Point scolarité",
  attendees: "La mère, Lucas",
  notes: NOTES,
});
