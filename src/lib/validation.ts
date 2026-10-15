import { z } from "zod";
import { DOCUMENT_TYPES } from "@/lib/domain/document-types";
import { SECTION_KEYS } from "@/lib/domain/categories";
import { STATUSES } from "@/lib/domain/workflow";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères maximum.`)
    .optional()
    .transform((v) => (v ? v : null));

export const caseFileSchema = z.object({
  reference: z
    .string()
    .trim()
    .min(2, "Identifiant requis.")
    .max(40, "40 caractères maximum.")
    .regex(/^[A-Za-z0-9][A-Za-z0-9 _./-]*$/, "Lettres, chiffres, espaces et - _ . / uniquement."),
  childAlias: optionalText(40),
  serviceName: optionalText(120),
});

export const documentInputSchema = z.object({
  caseFileId: z.string().min(1, "Dossier requis."),
  type: z.enum(DOCUMENT_TYPES, { message: "Type d'écrit invalide." }),
  authorJobTitle: optionalText(120),
  serviceName: optionalText(120),
  meetingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.")
    .refine((d) => !Number.isNaN(Date.parse(d)), "Date invalide."),
  meetingTime: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (HH:MM).")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  meetingLocation: optionalText(200),
  interviewType: optionalText(120),
  purpose: optionalText(500),
  attendees: optionalText(500),
  recipient: optionalText(200),
  notes: z.string().trim().min(10, "Saisissez vos notes (10 caractères minimum).").max(30000, "30 000 caractères maximum."),
});

export const documentUpdateSchema = documentInputSchema.omit({ caseFileId: true, type: true });

export const saveContentSchema = z.object({
  baseVersion: z.coerce.number().int().min(0),
  changeSummary: optionalText(200),
  sections: z
    .array(z.object({ key: z.enum(SECTION_KEYS), text: z.string().max(20000, "Rubrique trop longue (20 000 caractères maximum).") }))
    .min(1),
});

export const documentFiltersSchema = z.object({
  q: z.string().trim().max(60).optional(),
  type: z.enum(DOCUMENT_TYPES).optional().catch(undefined),
  status: z.enum(STATUSES).optional().catch(undefined),
  authorId: z.string().max(40).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(1),
});

export type DocumentFilters = z.infer<typeof documentFiltersSchema>;

/** Convertit les erreurs Zod en messages par champ. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
