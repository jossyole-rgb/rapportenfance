/**
 * Données de démonstration EXCLUSIVEMENT FICTIVES.
 * Aucun nom, aucune situation ni aucun dossier ne correspond à une personne réelle.
 */
import { PrismaClient, type Role } from "@prisma/client";
import { hashPassword } from "../src/lib/security/password";
import { encrypt } from "../src/lib/security/crypto";

const db = new PrismaClient();

export const DEMO_PASSWORD = "Demo-RapportEnfance-2026!";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("Refus : le jeu de données de démonstration ne doit pas être chargé en production.");
  }
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const org = await db.organization.upsert({
    where: { slug: "demo-aemo" },
    update: {},
    create: {
      name: "Association Fictive pour l'Enfance",
      slug: "demo-aemo",
      headerLine1: "Association Fictive pour l'Enfance",
      headerLine2: "Service d'AEMO - 1 rue de l'Exemple, 00000 Villefictive",
      headerLine3: "Données de démonstration - aucune personne réelle",
      validationMode: "SUPERVISOR",
    },
  });
  const other = await db.organization.upsert({
    where: { slug: "demo-mecs" },
    update: {},
    create: { name: "MECS Fictive des Tilleuls", slug: "demo-mecs", headerLine1: "MECS Fictive des Tilleuls", validationMode: "SELF" },
  });

  const users: Array<{ email: string; fullName: string; jobTitle: string; roles: Role[]; org: string | null; service?: string }> = [
    { email: "educatrice@demo.rapportenfance.fr", fullName: "Camille Martin", jobTitle: "Éducatrice spécialisée", roles: ["PROFESSIONAL"], org: org.id, service: "Service AEMO" },
    { email: "assistant.social@demo.rapportenfance.fr", fullName: "Karim Benali", jobTitle: "Assistant de service social", roles: ["PROFESSIONAL"], org: org.id, service: "Service AEMO" },
    { email: "cheffe.service@demo.rapportenfance.fr", fullName: "Sophie Lambert", jobTitle: "Cheffe de service", roles: ["VALIDATOR", "PROFESSIONAL"], org: org.id, service: "Service AEMO" },
    { email: "admin@demo.rapportenfance.fr", fullName: "Julien Moreau", jobTitle: "Directeur administratif", roles: ["ORG_ADMIN"], org: org.id },
    { email: "educateur@mecs.demo.rapportenfance.fr", fullName: "Léa Petit", jobTitle: "Éducatrice", roles: ["PROFESSIONAL"], org: other.id, service: "Groupe des moyens" },
    { email: "tech@demo.rapportenfance.fr", fullName: "Équipe technique", jobTitle: "Administrateur technique", roles: ["TECH_ADMIN"], org: null },
  ];
  const created: Record<string, string> = {};
  for (const u of users) {
    const row = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, fullName: u.fullName, jobTitle: u.jobTitle, roles: u.roles, organizationId: u.org, serviceName: u.service, passwordHash },
    });
    created[u.email] = row.id;
  }

  const educ = created["educatrice@demo.rapportenfance.fr"]!;
  const cf = await db.caseFile.upsert({
    where: { organizationId_reference: { organizationId: org.id, reference: "D-2026-0042" } },
    update: {},
    create: {
      organizationId: org.id,
      reference: "D-2026-0042",
      childAliasEnc: encrypt("Lucas"),
      serviceName: "Service AEMO",
      createdById: educ,
      members: { create: [{ userId: educ }] },
    },
  });
  await db.caseFile.upsert({
    where: { organizationId_reference: { organizationId: org.id, reference: "D-2026-0057" } },
    update: {},
    create: {
      organizationId: org.id,
      reference: "D-2026-0057",
      childAliasEnc: encrypt("Inès"),
      serviceName: "Service AEMO",
      createdById: created["assistant.social@demo.rapportenfance.fr"]!,
      members: { create: [{ userId: created["assistant.social@demo.rapportenfance.fr"]! }] },
    },
  });
  await db.caseFile.upsert({
    where: { organizationId_reference: { organizationId: other.id, reference: "M-001" } },
    update: {},
    create: {
      organizationId: other.id,
      reference: "M-001",
      childAliasEnc: encrypt("Noah"),
      createdById: created["educateur@mecs.demo.rapportenfance.fr"]!,
      members: { create: [{ userId: created["educateur@mecs.demo.rapportenfance.fr"]! }] },
    },
  });

  const existing = await db.document.count({ where: { caseFileId: cf.id } });
  if (existing === 0) {
    await db.document.create({
      data: {
        organizationId: org.id,
        caseFileId: cf.id,
        type: "VISITE_DOMICILE",
        status: "DRAFT",
        authorId: educ,
        authorName: "Camille Martin",
        authorJobTitle: "Éducatrice spécialisée",
        serviceName: "Service AEMO",
        meetingDate: new Date("2026-10-12T00:00:00Z"),
        meetingTime: "14:00",
        meetingLocationEnc: encrypt("Domicile de la mère"),
        interviewType: "Visite à domicile",
        purposeEnc: encrypt("Point sur la scolarité et la vie quotidienne"),
        attendeesEnc: encrypt("La mère, Lucas, l'éducatrice"),
        notesEnc: encrypt(
          "Visite domicile mère. Enfant présent. Mère explique école difficile depuis rentrée. Lucas dit professeur crie beaucoup. Mère dit père appelle peu. Lucas ne veut pas parler du père. Logement propre. Lucas a une chambre individuelle. Maman demande aide inscription foot. Appeler école + club.",
        ),
      },
    });
  }
  console.log(`Jeu de démonstration fictif chargé. Mot de passe commun : ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
