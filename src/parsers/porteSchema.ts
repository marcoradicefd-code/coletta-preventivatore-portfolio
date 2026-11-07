import { z } from 'zod'
import type { ListinoPorte } from '@/types/porte'

/**
 * Validazione del listino Porte DOPO il parsing. Se il file non è conforme
 * (struttura cambiata, foglio vuoto, prezzi non numerici) fallisce in modo
 * EVIDENTE con un messaggio in italiano leggibile nell'UI, invece di alimentare
 * il modulo porte con un listino sbagliato. Non modifica il listino.
 * Stesso pattern di `marmeriaSchema` (schema leggero + `superRefine`).
 */
const UNITA_VALIDE = new Set(['PORTA', 'MQ', 'PEZZO', 'ML', 'MANUALE'])

const listinoPorteSchema = z
  .object({
    modelli: z.array(z.unknown()),
    optional: z.array(z.unknown()),
  })
  .superRefine((raw, ctx) => {
    const l = raw as unknown as ListinoPorte
    const segnala = (message: string) => ctx.addIssue({ code: 'custom', message })

    // ── Modelli (foglio modello_porta) ──
    if (l.modelli.length === 0) {
      segnala('nessun modello letto dal foglio modello_porta')
    }
    const senzaNome = l.modelli.filter(
      (m) => !m?.nome || String(m.nome).trim() === ''
    ).length
    if (senzaNome > 0) {
      segnala(`${senzaNome} modelli senza nome`)
    }

    // Prezzi (2026/H>215/H>240): numerici e positivi dove presenti; almeno uno.
    let prezziNumerici = 0
    let prezziNonPositivi = 0
    for (const m of l.modelli) {
      for (const v of [m?.prezzo2026, m?.h215, m?.h240]) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          prezziNumerici++
          if (v <= 0) prezziNonPositivi++
        }
      }
    }
    if (l.modelli.length > 0 && prezziNumerici === 0) {
      segnala('nessun prezzo numerico nei modelli: la struttura del foglio modello_porta potrebbe essere cambiata')
    }
    if (prezziNonPositivi > 0) {
      segnala(`${prezziNonPositivi} prezzi porta non positivi`)
    }

    // ── Optional (foglio optional) ──
    if (l.optional.length === 0) {
      segnala('nessun optional letto dal foglio optional')
    }
    const unitaIgnote = l.optional.filter((o) => !UNITA_VALIDE.has(o?.unita as string)).length
    if (unitaIgnote > 0) {
      segnala(`${unitaIgnote} optional con unità non riconosciuta`)
    }
    // Gli optional NON manuali devono avere un prezzo numerico > 0.
    const prezzoMancante = l.optional.filter(
      (o) => o?.unita !== 'MANUALE' && !(typeof o?.prezzo === 'number' && (o.prezzo as number) > 0)
    ).length
    if (prezzoMancante > 0) {
      segnala(`${prezzoMancante} optional (non manuali) senza prezzo valido`)
    }
  })

/**
 * Valida un `ListinoPorte` parsato. `{ ok: true }` se conforme, altrimenti
 * `{ ok: false, errore }` con un messaggio IT che aggrega i problemi (deduplicati,
 * max 6) — pronto per l'UI. Stesso contratto di `validaListinoMarmeria`.
 */
export function validaListinoPorte(
  listino: unknown
): { ok: true } | { ok: false; errore: string } {
  const res = listinoPorteSchema.safeParse(listino)
  if (res.success) return { ok: true }

  const messaggi = [...new Set(res.error.issues.map((i) => i.message).filter(Boolean))]
  const errore = messaggi.length
    ? messaggi.slice(0, 6).join('; ') +
      (messaggi.length > 6 ? `; …(+${messaggi.length - 6} altri problemi)` : '')
    : 'struttura del listino non riconosciuta'

  return { ok: false, errore }
}
