import { arrotondaEuro } from '@/engine/arrotondaEuro'
import { origineValorizzata, type ResultPorte } from '@/engine/calcPorte'
import type { ResultArticoli } from '@/engine/calcSuMisura'

// ── IVA del preventivo (L18, correzione 4 di Antonio) ──
// Puro: nessun listino, nessuno store. Riceve gli importi già calcolati dalle
// sezioni e li divide per aliquota. Il totale imponibile resta quello di oggi:
// questo modulo non tocca un euro degli importi, aggiunge solo l'imposta.

/** Le sole aliquote ammesse. Mai testo libero: un valore fuori elenco vale come assente. */
export const ALIQUOTE_IVA = [4, 10, 22] as const
export type AliquotaIva = (typeof ALIQUOTE_IVA)[number]

/** L'aliquota di una sezione che non ne ha una (blob di prima di L18 compresi). */
export const ALIQUOTA_IVA_PREDEFINITA: AliquotaIva = 22

/**
 * L'aliquota letta da un blob o da un campo: solo un valore dell'elenco vale,
 * tutto il resto (assente, 21, '22', NaN) è `undefined`, cioè «non scelta».
 */
export function aliquotaIvaValida(v: unknown): AliquotaIva | undefined {
  return ALIQUOTE_IVA.find((a) => a === v)
}

/** L'aliquota di una sezione: la sua se valida, altrimenti la predefinita. */
export function aliquotaIvaSezione(v: unknown): AliquotaIva {
  return aliquotaIvaValida(v) ?? ALIQUOTA_IVA_PREDEFINITA
}

/** Una riga venduta singolarmente: il suo importo e, se ce l'ha, la sua aliquota. */
export interface VoceIva {
  importo: number
  /** Assente o fuori elenco ⇒ quella della sezione. */
  aliquota?: unknown
}

/**
 * Quello che una sezione porta al calcolo dell'IVA. `totale` è l'imponibile che
 * entra oggi nel totale generale, intero; `righe` servono solo a dividerlo fra
 * le aliquote. Una sezione a corpo (Gres, Cucine, Progetto a valore) non ha righe.
 */
export interface SezioneIva {
  totale: number
  /** L'aliquota della sezione; assente o fuori elenco ⇒ 22. */
  aliquota?: unknown
  righe?: readonly VoceIva[]
}

export interface RigaIva {
  aliquota: AliquotaIva
  /** Quota dell'imponibile a questa aliquota, in euro interi. */
  imponibile: number
  /** Imposta in euro, coi centesimi. */
  imposta: number
}

export interface ResultIva {
  /** Una riga per aliquota con imponibile diverso da 0, in ordine di aliquota. */
  righe: RigaIva[]
  totaleImponibile: number
  totaleIva: number
  totaleIvato: number
}

/**
 * Divide il totale di una sezione fra le aliquote delle sue righe.
 *
 * Le correzioni di sezione (sconto, progettazione 8%, maggiorazioni, rilievo e
 * montaggio) non hanno un'aliquota propria: si ripartiscono in proporzione
 * all'importo delle righe. Ogni quota è all'euro intero (`arrotondaEuro`), e il
 * resto dell'arrotondamento va all'aliquota con l'importo di righe maggiore (a
 * parità, la più alta): così la somma delle quote è ESATTAMENTE il totale della
 * sezione, cioè il totale imponibile non cambia di un euro.
 *
 * Senza righe, o con righe che sommano a 0 o meno, tutto va all'aliquota di sezione.
 */
export function ripartisciSezione(sezione: SezioneIva): Map<AliquotaIva, number> {
  const diSezione = aliquotaIvaSezione(sezione.aliquota)
  const basi = new Map<AliquotaIva, number>()
  for (const r of sezione.righe ?? []) {
    const a = aliquotaIvaValida(r.aliquota) ?? diSezione
    basi.set(a, (basi.get(a) ?? 0) + r.importo)
  }
  const sommaBasi = [...basi.values()].reduce((s, b) => s + b, 0)
  if (sommaBasi <= 0) return new Map([[diSezione, sezione.totale]])

  const quote = new Map<AliquotaIva, number>()
  let assegnato = 0
  let maggiore: AliquotaIva = diSezione
  let baseMaggiore = -Infinity
  for (const a of ALIQUOTE_IVA) {
    const base = basi.get(a)
    if (base === undefined) continue
    const quota = arrotondaEuro((sezione.totale * base) / sommaBasi)
    quote.set(a, quota)
    assegnato += quota
    // `>=` sull'ordine crescente: a parità vince l'aliquota più alta.
    if (base >= baseMaggiore) {
      maggiore = a
      baseMaggiore = base
    }
  }
  quote.set(maggiore, (quote.get(maggiore) ?? 0) + sezione.totale - assegnato)
  return quote
}

/**
 * IVA del preventivo: imponibile per aliquota (somma delle quote di ogni
 * sezione), imposta, totale IVA e totale IVA compresa.
 *
 * L'imposta si calcola sull'imponibile COMPLESSIVO di ogni aliquota, non riga per
 * riga, ed è in centesimi: l'imponibile è in euro interi, quindi
 * `imponibile × aliquota` sono già centesimi (1.234 € al 22% = 27.148 cent), e
 * `Math.round` tiene la regola anche se un giorno l'imponibile avesse decimali.
 * Totale IVA e totale ivato si sommano in centesimi interi, senza errore.
 *
 * Con sezioni «da definire» il chiamante passa solo quello che il totale
 * contiene: l'IVA è quella del parziale, e il PDF lo dice.
 */
export function calcIva(sezioni: readonly SezioneIva[]): ResultIva {
  const perAliquota = new Map<AliquotaIva, number>()
  for (const s of sezioni) {
    for (const [a, quota] of ripartisciSezione(s)) perAliquota.set(a, (perAliquota.get(a) ?? 0) + quota)
  }
  let ivaCent = 0
  const righe: RigaIva[] = []
  for (const aliquota of ALIQUOTE_IVA) {
    const imponibile = perAliquota.get(aliquota) ?? 0
    if (imponibile === 0) continue
    const impostaCent = Math.round(imponibile * aliquota)
    ivaCent += impostaCent
    righe.push({ aliquota, imponibile, imposta: impostaCent / 100 })
  }
  const totaleImponibile = sezioni.reduce((s, x) => s + x.totale, 0)
  return {
    righe,
    totaleImponibile,
    totaleIva: ivaCent / 100,
    totaleIvato: (totaleImponibile * 100 + ivaCent) / 100,
  }
}

/** Una riga con l'aliquota propria: forma minima, per non legare l'engine ai tipi del preventivo. */
interface ConAliquota {
  aliquotaIva?: unknown
}

/**
 * La sezione Arredi per `calcIva`: una riga per articolo (il suo totale, con le
 * maggiorazioni), il totale di sezione dopo sconto e progettazione.
 * `result` è `calcSuMisuraArticoli` degli stessi articoli, nello stesso ordine.
 */
export function sezioneIvaArredi(
  sezione: ConAliquota & { articoli: readonly ConAliquota[] },
  result: Pick<ResultArticoli, 'articoli' | 'totale'>
): SezioneIva {
  return {
    totale: result.totale,
    aliquota: sezione.aliquotaIva,
    righe: result.articoli.map((c, i) => ({ importo: c.totale, aliquota: sezione.articoli[i]?.aliquotaIva })),
  }
}

/**
 * La sezione Porte per `calcIva`: righe porta e battiscopa valorizzate, ognuna
 * con la sua aliquota; quelle da definire sono già fuori dal totale e qui non
 * pesano. `result` è `calcPorte` della stessa sezione.
 */
export function sezioneIvaPorte(
  sezione: ConAliquota & { righe: readonly ConAliquota[]; battiscopa?: readonly ConAliquota[] },
  result: Pick<ResultPorte, 'righe' | 'battiscopa' | 'totale'>
): SezioneIva {
  const porte = result.righe.flatMap((r, i) =>
    origineValorizzata(r.origine) ? [{ importo: r.totale, aliquota: sezione.righe[i]?.aliquotaIva }] : []
  )
  const battiscopa = result.battiscopa.flatMap((b, i) =>
    origineValorizzata(b.origine) ? [{ importo: b.totale, aliquota: sezione.battiscopa?.[i]?.aliquotaIva }] : []
  )
  return { totale: result.totale, aliquota: sezione.aliquotaIva, righe: [...porte, ...battiscopa] }
}
