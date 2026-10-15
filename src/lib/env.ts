import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATA_ENCRYPTION_KEY: z.string().min(1, "DATA_ENCRYPTION_KEY est obligatoire"),
  DATA_ENCRYPTION_KEY_ID: z.string().regex(/^[a-z0-9]{1,8}$/).default("v1"),
  DATA_ENCRYPTION_KEYS_PREVIOUS: z.string().optional().default(""),
  SESSION_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(24).default(10),
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
  AI_PROVIDER: z.enum(["local"]).default("local"),
  SMTP_URL: z.string().optional().default(""),
  MAIL_FROM: z.string().default("RapportEnfance IA <no-reply@example.org>"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuration invalide (variables : ${fields}). Voir .env.example.`);
  }
  if (parsed.data.NODE_ENV === "production") {
    if (!parsed.data.APP_URL.startsWith("https://")) {
      throw new Error("APP_URL doit utiliser HTTPS en production.");
    }
    if (!parsed.data.SMTP_URL) {
      throw new Error("SMTP_URL est obligatoire en production.");
    }
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => process.env.NODE_ENV === "production";
