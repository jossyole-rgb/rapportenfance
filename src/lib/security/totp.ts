import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Codes à usage unique basés sur le temps (TOTP, RFC 6238 : HMAC-SHA1, pas de 30 s, 6 chiffres),
 * compatibles avec les applications d'authentification courantes. Implémentation locale, sans service tiers.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD_S = 30;
const DIGITS = 6;
/** Tolérance d'horloge : un pas avant ou après. */
const WINDOW = 1;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Secret TOTP invalide.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Secret de 160 bits encodé en base32. */
export const generateTotpSecret = () => base32Encode(randomBytes(20));

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_PERIOD_S);

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const bin = ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Vérifie un code. Retourne le pas accepté, ou null. Un pas inférieur ou égal à `lastStep`
 * est refusé : un code déjà utilisé ne peut pas être rejoué.
 */
export function verifyTotp(secret: string, code: string, lastStep: number | null | undefined, now = Date.now()): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const step = currentStep(now);
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const s = step + d;
    if (lastStep != null && s <= lastStep) continue;
    const expected = Buffer.from(totpAt(secret, s));
    if (timingSafeEqual(expected, Buffer.from(clean))) return s;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer = "RapportEnfance IA"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_PERIOD_S}`;
}

/** Affichage du secret par groupes de 4 caractères pour la saisie manuelle. */
export const formatSecret = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();

// ---------------------------------------------------------------------------------------------
// Codes de secours (à usage unique, 50 bits d'entropie chacun, seule l'empreinte est stockée)
// ---------------------------------------------------------------------------------------------

const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const RECOVERY_CODE_COUNT = 8;

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    let c = "";
    for (let i = 0; i < 10; i++) c += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
}

export const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
