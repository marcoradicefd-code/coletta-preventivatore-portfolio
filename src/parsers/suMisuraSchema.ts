import { z } from 'zod'
import type { ListinoSuMisura, VoceSuMisura, RigaMatrice } from '@/types/sumisura'
import { chiaveMatrice } from '@/engine/matriceFiniture'

/**
 * Validazione del listino Su Misura DOPO il parsing (E4 dell'audit).
 *
 * Fino a ieri su misura era l'unica categoria senza schema: l'unico controllo
 * era `fogli.length === 0`, cioè "il file ha prodotto qualcosa". Quantitativo,
 * non guardava dentro nemmeno una voce.
 *
 * Stessa forma di `marmeriaSchema`: schema leggero sui tipi base + `superRefine`
 * con le regole di dominio e i messaggi in italiano. Non modifica il listino,
 * dà solo un esito.
 *
 * ── COSA PUÒ E COSA NON PUÒ FARE ──
 *
 * `parseSuMisura` è già difensivo per costruzione: scarta le righe senza prezzo
 * numerico (`safeFloat` filtra anche NaN e Infinity) e senza unità di misura
 * riconoscibile. Quindi l'output è strutturalmente pulito quasi sempre, e uno
 * spostamento di colonne di solito si autodenuncia — le righe vengono saltate
 * tutte e il foglio sparisce.
 *
 * Quello che passava e ora non passa più:
 *   · prezzi tutti a ZERO (la colonna letta come prezzo è finita su TOTALE di un
 *     preventivo non compilato, o su una colonna vuota): l'app mostrava € 0,00
 *     su tutto, senza dire niente;
 *   · prezzi NEGATIVI (la colonna letta è uno sconto o una rettifica);
 *   · fogli senza voci, descrizioni vuote, UM fuori dall'enum.
 *
 * Quello che NON può catturare, e va detto: se la colonna letta come prezzo
 * contiene *un altro prezzo plausibile* (es. PREZZO e TOTALE invertiti, con
 * QUANTITA valorizzata), l'output è indistinguibile da uno corretto. Nessuno
 * schema sull'output può saperlo. Quella classe si chiude solo leggendo le
 * colonne per INTESTAZIONE invece che per indice (E5): per su misura è chiusa
 * da O7 (fogli standard) e O16 (RETI LETTO), `parseSuMisura` legge prezzi e
 * unità dalle colonne delle etichette, e un foglio senza intestazione non si
 * legge. Questo schema resta la seconda rete.
 */

const voceSchema = z.object({
  descrizione: z.unknown(),
  prezzoUnitario: z.unknown(),
  unitaMisura: z.unknown(),
  prezzoCliente: z.unknown().optional(),
})

const rigaMatriceSchema = z.object({
  tipo: z.unknown(),
  interno: z.unknown(),
  esterno: z.unknown(),
  prezzo: z.unknown(),
  unita: z.unknown(),
  cella: z.unknown(),
})

const foglioSchema = z.object({
  nome: z.unknown(),
  nota: z.unknown(),
  voci: z.array(voceSchema),
  matrice: z.array(rigaMatriceSchema).optional(),
})

const UM_VALIDE: ReadonlyArray<VoceSuMisura['unitaMisura']> = ['MQ', 'ML', 'PEZZO', 'VALORE']
/** La matrice FINITURE (L20) non ha la quota a VALORE: solo superfici, lunghezze e pezzi. */
const UM_MATRICE: ReadonlySet<RigaMatrice['unita']> = new Set(['MQ', 'ML', 'PEZZO'])

/**
 * Gli errori bloccanti della matrice FINITURE (L20), ognuno con la cella:
 * prezzo non positivo, unità fuori da MQ, ML, PEZZO, combinazione
 * tipo × interno × esterno doppia (confronto con `chiaveMatrice`, quindi due
 * grafie della stessa finitura sono la stessa combinazione).
 */
function erroriMatrice(matrice: readonly RigaMatrice[]): string[] {
  const errori: string[] = []
  const viste = new Map<string, string>()
  for (const r of matrice) {
    if (!(Number.isFinite(r.prezzo) && r.prezzo > 0)) {
      errori.push(`${r.cella}: prezzo della combinazione non valido (serve un numero maggiore di zero)`)
    }
    if (!UM_MATRICE.has(r.unita)) {
      errori.push(`${r.cella}: unità «${r.unita || 'vuota'}» non ammessa nella matrice (MQ, ML o PEZZO)`)
    }
    const chiave = [r.tipo, r.interno, r.esterno].map(chiaveMatrice).join('|')
    const prima = viste.get(chiave)
    if (prima === undefined) viste.set(chiave, r.cella)
    else errori.push(`${r.cella}: combinazione doppia, è già in ${prima}`)
  }
  return errori
}

const listinoSuMisuraSchema = z
  .object({
    fogli: z.array(foglioSchema),
  })
  .superRefine((raw, ctx) => {
    const l = raw as unknown as ListinoSuMisura
    const segnala = (message: string) => ctx.addIssue({ code: 'custom', message })

    if (l.fogli.length === 0) {
      segnala('non contiene fogli riconoscibili')
      return // senza fogli le regole sotto non hanno niente da dire
    }

    // Un foglio FINITURE con le sole combinazioni non è vuoto.
    const fogliVuoti = l.fogli.filter((f) => f.voci.length === 0 && (f.matrice?.length ?? 0) === 0).length
    if (fogliVuoti > 0) {
      segnala(`${fogliVuoti} fogli senza voci leggibili`)
    }

    const senzaNome = l.fogli.filter((f) => !f.nome || String(f.nome).trim() === '').length
    if (senzaNome > 0) {
      segnala(`${senzaNome} fogli senza nome`)
    }

    const voci = l.fogli.flatMap((f) => f.voci)

    const senzaDescrizione = voci.filter(
      (v) => !v.descrizione || String(v.descrizione).trim() === ''
    ).length
    if (senzaDescrizione > 0) {
      segnala(`${senzaDescrizione} voci senza descrizione`)
    }

    const umIgnote = voci.filter((v) => !UM_VALIDE.includes(v.unitaMisura)).length
    if (umIgnote > 0) {
      segnala(`${umIgnote} voci con unità di misura non riconosciuta`)
    }

    // Prezzi: finiti e non negativi. `safeFloat` filtra già NaN/Infinity a monte,
    // ma lo schema non si fida del parser — è il suo mestiere.
    const nonFiniti = voci.filter((v) => !Number.isFinite(v.prezzoUnitario)).length
    if (nonFiniti > 0) {
      segnala(`${nonFiniti} voci con prezzo non numerico`)
    }

    const negativi = voci.filter(
      (v) => Number.isFinite(v.prezzoUnitario) && v.prezzoUnitario < 0
    ).length
    if (negativi > 0) {
      segnala(`${negativi} voci con prezzo negativo (colonna sconti letta come prezzo?)`)
    }

    // Il controllo che vale: zero prezzi positivi = la colonna letta come prezzo
    // non è la colonna dei prezzi. Stesso criterio di marmeriaSchema sui €/mq.
    const positivi = voci.filter(
      (v) => Number.isFinite(v.prezzoUnitario) && v.prezzoUnitario > 0
    ).length
    if (voci.length > 0 && positivi === 0) {
      segnala(
        'nessun prezzo maggiore di zero: la colonna dei prezzi sembra spostata ' +
          '(letti tutti zeri)'
      )
    }

    const clienteNegativo = voci.filter(
      (v) => v.prezzoCliente !== undefined && !(Number.isFinite(v.prezzoCliente) && v.prezzoCliente >= 0)
    ).length
    if (clienteNegativo > 0) {
      segnala(`${clienteNegativo} voci con prezzo cliente non valido`)
    }

    for (const errore of erroriMatrice(l.fogli.flatMap((f) => f.matrice ?? []))) segnala(errore)
  })

const MAX_MESSAGGI = 6

export function validaListinoSuMisura(
  listino: unknown
): { ok: true } | { ok: false; errore: string } {
  const res = listinoSuMisuraSchema.safeParse(listino)
  if (res.success) return { ok: true }

  const messaggi = [...new Set(res.error.issues.map((i) => i.message).filter(Boolean))]
  return { ok: false, errore: messaggi.slice(0, MAX_MESSAGGI).join('; ') }
}
