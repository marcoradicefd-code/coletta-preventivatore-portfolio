import { z } from 'zod'

/**
 * Validazione del listino cucine DOPO il parsing, sul main thread (così `zod`
 * resta fuori dal worker). Stesso contratto di `validaListinoPorte`: un listino
 * non conforme fallisce con un messaggio in italiano, invece di entrare nello
 * store. Il parser ha già verificato intestazioni, unità e valori riga per riga:
 * qui si controlla l'oggetto che ne esce, che può arrivare anche da altre strade.
 */
// In Zod 4 `z.number()` rifiuta già Infinity e NaN: `.finite()` è deprecato.
const importo = z.number().nonnegative()
const frazione = z.number().min(0).max(1)

const listinoCucinaSchema = z
  .object({
    prezzi: z.array(z.object({ id: z.string().min(1), prezzo: importo }), {
      error: 'prezzi delle voci assenti',
    }),
    percentuali: z.object({
      casse: frazione.nullable(),
      ante: frazione.nullable(),
      progettazione: frazione.nullable(),
      adeguamento: frazione.nullable(),
    }),
    giornoRate: importo.nullable(),
    vascaGres: importo.nullable(),
    vociMancanti: z.array(z.string()),
    righeSconosciute: z.array(z.string()),
  })
  .superRefine((l, ctx) => {
    const segnala = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (l.prezzi.length === 0) segnala('nessuna voce con prezzo letta dal foglio CUCINA')
    const ids = l.prezzi.map((p) => p.id)
    const doppi = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))]
    if (doppi.length > 0) segnala(`voci con due prezzi: ${doppi.join(', ')}`)
  })

/** Messaggi leggibili per i campi: i numeri fuori posto dicono dove sono. */
function messaggio(issue: z.core.$ZodIssue): string {
  if (issue.code === 'custom') return issue.message
  const dove = issue.path.join('.')
  return dove ? `${dove}: valore non valido` : issue.message
}

/**
 * Valida un `ListinoCucina` parsato. `{ ok: true }` se conforme, altrimenti
 * `{ ok: false, errore }` con un messaggio IT che aggrega i problemi (deduplicati,
 * max 6), pronto per l'UI.
 */
export function validaListinoCucina(listino: unknown): { ok: true } | { ok: false; errore: string } {
  const res = listinoCucinaSchema.safeParse(listino)
  if (res.success) return { ok: true }

  const messaggi = [...new Set(res.error.issues.map(messaggio).filter(Boolean))]
  if (messaggi.length === 0) return { ok: false, errore: 'struttura del listino non riconosciuta' }
  const altri = messaggi.length > 6 ? `; …(+${messaggi.length - 6} altri problemi)` : ''
  return { ok: false, errore: messaggi.slice(0, 6).join('; ') + altri }
}
