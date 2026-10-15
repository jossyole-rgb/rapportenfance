import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, totpAt, verifyTotp, TOTP_PERIOD_S } from "@/lib/security/totp";
import { isMfaRequired } from "@/lib/auth/mfa-policy";

// Secret des vecteurs de test de la RFC 6238 (annexe B), SHA-1 : "12345678901234567890"
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("respecte les vecteurs de test officiels (6 derniers chiffres)", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    const at = (t: number) => totpAt(RFC_SECRET, Math.floor(t / TOTP_PERIOD_S));
    expect(at(59)).toBe("287082");
    expect(at(1111111109)).toBe("081804");
    expect(at(1234567890)).toBe("005924");
    expect(at(2000000000)).toBe("279037");
  });

  it("encode et décode le base32 sans perte", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it("accepte un pas d'écart d'horloge, refuse au-delà et refuse le rejeu", () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    const step = Math.floor(now / 1000 / TOTP_PERIOD_S);
    expect(verifyTotp(secret, totpAt(secret, step), null, now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 3), null, now)).toBeNull();
    // code déjà utilisé (pas <= dernier pas accepté)
    expect(verifyTotp(secret, totpAt(secret, step), step, now)).toBeNull();
    expect(verifyTotp(secret, "12345", null, now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", null, now)).toBeNull();
  });

  it("génère des codes de secours distincts et normalisables", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(normalizeRecoveryCode(` ${codes[0]!.toLowerCase()} `)).toBe(codes[0]!.replace("-", ""));
  });

  it("applique la politique de l'établissement, et l'exige par défaut pour l'administration technique", () => {
    expect(isMfaRequired({ organization: { mfaRequired: true } })).toBe(true);
    expect(isMfaRequired({ organization: { mfaRequired: false } })).toBe(false);
    const previous = process.env.PLATFORM_MFA_REQUIRED;
    delete process.env.PLATFORM_MFA_REQUIRED;
    expect(isMfaRequired({ organization: null })).toBe(true);
    process.env.PLATFORM_MFA_REQUIRED = "false";
    expect(isMfaRequired({ organization: null })).toBe(false);
    if (previous === undefined) delete process.env.PLATFORM_MFA_REQUIRED;
    else process.env.PLATFORM_MFA_REQUIRED = previous;
  });
});
