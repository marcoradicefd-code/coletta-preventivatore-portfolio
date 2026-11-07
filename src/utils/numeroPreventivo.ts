import type { Preventivo } from '@/types/common'
import type { CollegamentoArchivio, StatoPreventivo } from '@/types/archivio'

/** Lo stato di un preventivo salvato, come lo legge una persona. */
export const ETICHETTA_STATO: Record<StatoPreventivo, string> = {
  bozza: 'Bozza',
  inviato: 'Inviato',
  accettato: 'Accettato',
  annullato: 'Annullato',
}

/**
 * Il numero di un preventivo salvato come lo legge una persona: `AAAA-NNN`, con
 * tre cifre che crescono oltre il 999 (`2026-1000`), e la revisione dopo, solo
 * se c'è (`2026-001 rev. 1`).
 */
export function formatNumeroPreventivo(p: { anno: number; numero: number; revisione: number }): string {
  const base = `${p.anno}-${String(p.numero).padStart(3, '0')}`
  return p.revisione > 0 ? `${base} rev. ${p.revisione}` : base
}

/**
 * Il numero che il PDF stampa: quello del database se il preventivo è salvato
 * (L21). Da L21-B «Genera» salva sempre prima di stampare, quindi il PDF ha
 * sempre quello; il numero scritto a mano resta solo come ripiego per un
 * preventivo di prima (un blob ricordato), e la scheda non lo fa più scrivere.
 */
export function numeroDaStampare(
  preventivo: Pick<Preventivo, 'numero'> | null | undefined,
  archivio: Pick<CollegamentoArchivio, 'preventivo'> | null | undefined
): string {
  const salvato = archivio?.preventivo
  if (salvato) return formatNumeroPreventivo(salvato)
  const numero: unknown = preventivo?.numero
  return typeof numero === 'string' ? numero : ''
}
