import type { ArticoloSuMisura, Arredo } from '@/types/sumisura'
import { safeFin } from '@/utils/format'
import { arrotondaEuro } from '@/engine/arrotondaEuro'

// ── Engine "per singolo articolo" (refactor 2026) ──
// Puro: nessun listino richiesto (l'articolo porta il proprio prezzoUnitario,
// fissato al momento dell'aggiunta). I totali sono SEMPRE derivati, mai
// persistiti: si ricalcolano da dimensioni + prezzo ad ogni render.
// Importi all'euro intero (D4): base, +20% e +15% si arrotondano ciascuno, il
// totale dell'articolo è la loro somma, e così subtotale, sconto e progettazione:
// ogni importo visibile è intero e ogni totale è la somma di quello che si vede.

export interface ArticoloCalcolato {
  id: string
  descrizione: string
  um: ArticoloSuMisura['um']
  /** Quantità derivata dalla UM: mq (L×A/10000), ml o pezzi. */
  quantitaCalcolata: number
  prezzoUnitario: number
  base: number
  applica20: boolean
  maggiorazione20: number
  applica15: boolean
  maggiorazione15: number
  /** Profondità < 40cm (L20): −10% della base. */
  applica10: boolean
  /** Importo della riduzione, positivo: il totale lo sottrae. */
  riduzione10: number
  totale: number
}

export interface ResultArticoli {
  articoli: ArticoloCalcolato[]
  subtotale: number
  /** Sconto sezione applicato sul lordo (subtotale). 0 se nessuno. */
  sconto: number
  /** subtotale − sconto. */
  scontato: number
  quotaProgettazione: number
  totale: number
}

/** Quantità nell'unità di misura scelta. MQ = larghezza×altezza in cm /10000. */
export function quantitaArticolo(a: ArticoloSuMisura): number {
  switch (a.um) {
    case 'MQ':
      return safeFin(((a.larghezzaCm ?? 0) * (a.altezzaCm ?? 0)) / 10000)
    case 'ML':
      return safeFin(a.lunghezzaMl ?? 0)
    case 'PZ':
      return safeFin(a.quantita ?? 0)
  }
}

/**
 * Calcola un singolo articolo. Maggiorazioni per-voce, additive sulla base:
 * +20% se UM=MQ e mq<3, +15% se profondità>65cm, −10% se profondità<40cm
 * (L20). Il +20% coesiste con le altre due; +15% e −10% si escludono per
 * costruzione: con entrambi i flag (stato che la UI non produce) vale solo il
 * +15%, mai uno sconto su uno stato incoerente.
 */
export function calcArticolo(a: ArticoloSuMisura): ArticoloCalcolato {
  const quantitaCalcolata = quantitaArticolo(a)
  const base = arrotondaEuro(a.prezzoUnitario * quantitaCalcolata)
  const applica20 = a.um === 'MQ' && quantitaCalcolata > 0 && quantitaCalcolata < 3
  const maggiorazione20 = applica20 ? arrotondaEuro(base * 0.2) : 0
  const applica15 = a.profonditaOltre65
  const maggiorazione15 = applica15 ? arrotondaEuro(base * 0.15) : 0
  const applica10 = a.profonditaSotto40 === true && !applica15
  const riduzione10 = applica10 ? arrotondaEuro(base * 0.1) : 0
  const totale = base + maggiorazione20 + maggiorazione15 - riduzione10
  return {
    id: a.id,
    descrizione: a.descrizione,
    um: a.um,
    quantitaCalcolata,
    prezzoUnitario: a.prezzoUnitario,
    base,
    applica20,
    maggiorazione20,
    applica15,
    maggiorazione15,
    applica10,
    riduzione10,
    totale,
  }
}

/**
 * Aggrega gli articoli. Sconto sezione sul LORDO (subtotale); quota progettazione
 * +8% (flag globale). Lo `scontoFrac` opzionale [0,1] è clampato (difensivo).
 */
export function calcSuMisuraArticoli(
  articoli: ArticoloSuMisura[],
  quotaProgettazioneFlag: boolean,
  scontoFrac = 0
): ResultArticoli {
  const calcolati = articoli.map(calcArticolo)
  const subtotale = calcolati.reduce((s, a) => s + a.totale, 0)
  // Sconto sezione: % sul LORDO. Clamp [0,1] come calcMarmeria (NaN/∞ → 0).
  const scontoClamp = Number.isFinite(scontoFrac) ? Math.max(0, Math.min(1, scontoFrac)) : 0
  const sconto = arrotondaEuro(subtotale * scontoClamp)
  const scontato = subtotale - sconto
  // BASE PROGETTAZIONE — decisione prodotto (BR-005): 8% sul LORDO (subtotale,
  // post-maggiorazione), NON sullo scontato → la progettazione non è scontata.
  // Se Antonio confermerà "progettazione sullo scontato", cambiare SOLO la riga
  // sotto: `baseProgettazione = scontato`.
  const baseProgettazione = subtotale
  const quotaProgettazione = quotaProgettazioneFlag ? arrotondaEuro(baseProgettazione * 0.08) : 0
  const totale = scontato + quotaProgettazione
  return { articoli: calcolati, subtotale, sconto, scontato, quotaProgettazione, totale }
}

/**
 * La quota progettazione spalmata nelle righe del PDF (L25, Antonio 15/10: «OK
 * spalmala»). Riceve i totali delle righe (`calcArticolo`, interi) e la quota
 * (intera) e restituisce i totali MOSTRATI, riga per riga, all'euro intero (D4):
 *  - proporzionale al totale della riga;
 *  - metodo dei resti maggiori: la somma dei mostrati è ESATTAMENTE
 *    Σ totali + quota (aritmetica intera, nessun errore float);
 *  - a resti uguali vince l'ordine delle righe: deterministica;
 *  - una riga a 0 resta a 0, e una riga negativa (solo da uno stato manomesso,
 *    O14) non prende quota: nessuna riga scende sotto il suo totale.
 * Senza quota, o senza righe positive su cui spalmarla, le righe restano come
 * sono. Gli importi della sezione (`calcSuMisuraArticoli`) non cambiano: cambia
 * solo come il PDF li mostra.
 */
export function ripartisciQuota(totali: readonly number[], quota: number): number[] {
  const pesi = totali.map((t) => Math.max(0, t))
  const sommaPesi = pesi.reduce((s, p) => s + p, 0)
  if (quota <= 0 || sommaPesi <= 0) return [...totali]
  const parti = pesi.map((p) => Math.floor((quota * p) / sommaPesi))
  const resti = pesi.map((p, i) => quota * p - parti[i] * sommaPesi)
  let daDare = quota - parti.reduce((s, x) => s + x, 0)
  // Resto maggiore prima; a parità l'indice minore (sort stabile). Mai a una riga a peso 0.
  const ordine = pesi.map((_, i) => i).filter((i) => pesi[i] > 0).sort((a, b) => resti[b] - resti[a])
  for (const i of ordine) {
    if (daDare === 0) break
    parti[i]++
    daDare--
  }
  return totali.map((t, i) => t + parti[i])
}

/**
 * Il prezzo unitario mostrato accanto a una riga con la quota dentro (L25):
 * cresce nella stessa proporzione del totale della riga, al centesimo, così
 * €/unit × quantità non rivela la quota che manca. Senza quota (mostrato =
 * totale) o con la riga a 0 è il prezzo unitario di sempre, identico.
 */
export function prezzoUnitarioConQuota(prezzoUnitario: number, totale: number, totaleMostrato: number): number {
  if (totaleMostrato === totale || totale <= 0) return prezzoUnitario
  return Math.round((prezzoUnitario * totaleMostrato * 100) / totale) / 100
}

export interface GruppoArredo {
  /** L'arredo del gruppo; `null` ⇒ «Altre voci». */
  arredo: Arredo | null
  /** I suoi articoli, nell'ordine della sezione. */
  articoli: ArticoloSuMisura[]
  /** Somma dei totali dei suoi articoli (`calcArticolo`): interi, come le righe. */
  subtotale: number
}

/**
 * Raggruppa gli articoli per arredo (L19), per pagina e PDF. Un gruppo per
 * arredo nell'ordine di `arredi`, anche vuoto; in fondo «Altre voci»
 * (`arredo: null`) con gli articoli senza `arredoId` o con un id che non c'è
 * più, solo se ce ne sono. Senza arredi è un gruppo solo, «Altre voci».
 *
 * Sconto e quota progettazione restano di SEZIONE (`calcSuMisuraArticoli`, che
 * non cambia): la somma dei subtotali è il suo `subtotale`, quindi il totale
 * della sezione è quello di prima al centesimo.
 */
export function raggruppaPerArredo(
  articoli: readonly ArticoloSuMisura[],
  arredi: readonly Arredo[] = []
): GruppoArredo[] {
  const gruppo = (arredo: Arredo | null, lista: ArticoloSuMisura[]): GruppoArredo => ({
    arredo,
    articoli: lista,
    subtotale: lista.reduce((s, a) => s + calcArticolo(a).totale, 0),
  })
  const ids = new Set(arredi.map((a) => a.id))
  const gruppi = arredi.map((arredo) => gruppo(arredo, articoli.filter((a) => a.arredoId === arredo.id)))
  const altre = articoli.filter((a) => a.arredoId === undefined || !ids.has(a.arredoId))
  if (altre.length > 0) gruppi.push(gruppo(null, altre))
  return gruppi
}
