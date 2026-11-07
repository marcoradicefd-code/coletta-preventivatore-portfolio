import { z } from 'zod';

/**
 * Dati finiture (sola lettura, statici nel bundle).
 * Colori: RAL Classic, NCS, Sikkens. Laminati: ABET (disponibili Amorelli).
 * Generato dai listini Excel di Antonio. Non modificare a mano: rigenerare.
 */

export const sistemaColoreSchema = z.enum(['RAL', 'NCS', 'Sikkens']);
export type SistemaColore = z.infer<typeof sistemaColoreSchema>;

export const coloreFinituraSchema = z.object({
  sistema: sistemaColoreSchema,
  codice: z.string().min(1),
  nome: z.string().min(1),
  hex: z.string().regex(/^#[0-9A-F]{6}$/, 'hex non valido (atteso #RRGGBB)'),
  rgb: z.tuple([z.number().int().min(0).max(255),
                z.number().int().min(0).max(255),
                z.number().int().min(0).max(255)]),
  famiglia: z.string().nullable(),
});
export type ColoreFinitura = z.infer<typeof coloreFinituraSchema>;

export const laminatoAbetSchema = z.object({
  codice: z.string().min(1),
  descrizione: z.string().min(1),
  azienda: z.string().min(1),
  dimensioni: z.string().nullable(),
  note: z.string().nullable(),
});
export type LaminatoAbet = z.infer<typeof laminatoAbetSchema>;
