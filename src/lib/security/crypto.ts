import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Chiffrement applicatif des données sensibles (notes, rapports, propos).
 * AES-256-GCM, IV aléatoire de 12 octets, tag d'authentification de 16 octets.
 * Format stocké : "<idClé>:<iv b64>:<tag b64>:<données b64>" pour permettre la rotation des clés.
 */

type KeyRing = { currentId: string; keys: Map<string, Buffer> };

let ring: KeyRing | null = null;

function decodeKey(id: string, b64: string): Buffer {
  const key = Buffer.from(b64.trim(), "base64");
  if (key.length !== 32) {
    throw new Error(`La clé de chiffrement "${id}" doit faire 32 octets (base64).`);
  }
  return key;
}

function loadKeyRing(): KeyRing {
  if (ring) return ring;
  const current = process.env.DATA_ENCRYPTION_KEY;
  if (!current) throw new Error("DATA_ENCRYPTION_KEY est absente : chiffrement impossible.");
  const currentId = process.env.DATA_ENCRYPTION_KEY_ID || "v1";
  const keys = new Map<string, Buffer>([[currentId, decodeKey(currentId, current)]]);
  for (const entry of (process.env.DATA_ENCRYPTION_KEYS_PREVIOUS || "").split(",")) {
    const [id, b64] = entry.split(":");
    if (id && b64 && !keys.has(id)) keys.set(id, decodeKey(id, b64));
  }
  ring = { currentId, keys };
  return ring;
}

/** Réservé aux tests : force le rechargement des clés. */
export function resetKeyRingForTests() {
  ring = null;
}

export function encrypt(plain: string): string {
  const { currentId, keys } = loadKeyRing();
  const key = keys.get(currentId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [currentId, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4) throw new Error("Donnée chiffrée invalide.");
  const [id, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
  const key = loadKeyRing().keys.get(id);
  if (!key) throw new Error("Clé de chiffrement inconnue pour cette donnée.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

export const encryptOptional = (v: string | null | undefined) => (v ? encrypt(v) : null);
export const decryptOptional = (v: string | null | undefined) => (v ? decrypt(v) : null);

export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T>(payload: string): T {
  return JSON.parse(decrypt(payload)) as T;
}

/** Jeton aléatoire (session, invitation, réinitialisation) : 32 octets, base64url. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Empreinte SHA-256 d'un jeton : seule l'empreinte est stockée en base. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
