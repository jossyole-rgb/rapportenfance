import { describe, expect, it, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, hashToken, resetKeyRingForTests } from "@/lib/security/crypto";
import { checkPasswordPolicy } from "@/lib/security/password";
import { canTransition, nextStatus } from "@/lib/domain/workflow";
import { canDeleteDocument, canEditDocument, canReadDocument, canValidateDocument, type Actor } from "@/lib/auth/permissions";
import { splitSentences } from "@/lib/ai/text";

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.DATA_ENCRYPTION_KEY_ID = "v1";
  resetKeyRingForTests();
});

describe("chiffrement", () => {
  it("chiffre de façon authentifiée et non déterministe", () => {
    const a = encrypt("Propos de l'enfant");
    expect(a).not.toBe(encrypt("Propos de l'enfant"));
    expect(decrypt(a)).toBe("Propos de l'enfant");
    const parts = a.split(":");
    parts[3] = Buffer.from("altéré").toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });
  it("déchiffre après rotation de clé", () => {
    const old = encrypt("ancien");
    process.env.DATA_ENCRYPTION_KEYS_PREVIOUS = `v1:${process.env.DATA_ENCRYPTION_KEY}`;
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.DATA_ENCRYPTION_KEY_ID = "v2";
    resetKeyRingForTests();
    expect(decrypt(old)).toBe("ancien");
    expect(encrypt("nouveau").startsWith("v2:")).toBe(true);
  });
  it("hache les jetons", () => expect(hashToken("abc")).toHaveLength(64));
});

describe("politique de mot de passe", () => {
  it("refuse les mots de passe faibles", () => {
    expect(checkPasswordPolicy("court")).not.toHaveLength(0);
    expect(checkPasswordPolicy("motdepasse123456")).not.toHaveLength(0);
    expect(checkPasswordPolicy("Ceci-Est-Solide-42")).toHaveLength(0);
  });
});

describe("workflow", () => {
  it("n'autorise la validation qu'après relecture", () => {
    expect(canTransition("TO_REVIEW", "VALIDATE")).toBe(false);
    expect(nextStatus("REVIEWED", "VALIDATE")).toBe("VALIDATED");
    expect(canTransition("TO_REVIEW", "EXPORT_FINAL")).toBe(false);
    expect(canTransition("VALIDATED", "EDIT")).toBe(false);
    expect(nextStatus("REVIEWED", "EDIT")).toBe("TO_REVIEW");
    expect(() => nextStatus("DRAFT", "VALIDATE")).toThrow();
  });
});

describe("permissions", () => {
  const pro: Actor = { id: "p", organizationId: "o1", roles: ["PROFESSIONAL"] };
  const chief: Actor = { id: "c", organizationId: "o1", roles: ["VALIDATOR"] };
  const admin: Actor = { id: "a", organizationId: "o1", roles: ["ORG_ADMIN"] };
  const other: Actor = { id: "x", organizationId: "o2", roles: ["VALIDATOR"] };
  const doc = { organizationId: "o1", authorId: "p", status: "REVIEWED" as const };
  it("applique isolation, appartenance et séparation des rôles", () => {
    expect(canReadDocument(pro, doc, { isMember: true })).toBe(true);
    expect(canReadDocument(pro, { ...doc, authorId: "z" }, { isMember: false })).toBe(false);
    expect(canReadDocument(other, doc, { isMember: false })).toBe(false);
    expect(canReadDocument(admin, doc, { isMember: true })).toBe(false);
    expect(canValidateDocument(pro, doc, { isMember: true }, "SUPERVISOR")).toBe(false);
    expect(canValidateDocument(pro, doc, { isMember: true }, "SELF")).toBe(true);
    expect(canValidateDocument(chief, doc, { isMember: false }, "SUPERVISOR")).toBe(true);
    expect(canValidateDocument({ ...chief, id: "p" }, doc, { isMember: true }, "SUPERVISOR")).toBe(false);
    expect(canEditDocument(chief, doc, { isMember: false })).toBe(true);
    expect(canDeleteDocument(admin, { ...doc, status: "ARCHIVED" }, { isMember: false })).toBe(true);
    expect(canDeleteDocument(pro, { ...doc, status: "VALIDATED" }, { isMember: true })).toBe(false);
  });
});

describe("découpage des notes", () => {
  it("découpe par phrase et ligne sans couper les dates ni « M. »", () => {
    const s = splitSentences("- RDV le 12.10 avec M. Durand. Mère présente\n* Appeler école; club");
    expect(s.map((x) => x.text)).toEqual(["RDV le 12.10 avec M. Durand.", "Mère présente", "Appeler école", "club"]);
  });
});
