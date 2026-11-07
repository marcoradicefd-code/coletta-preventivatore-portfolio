import { safeFin } from '@/utils/format'
import { arrotondaEuro } from '@/engine/arrotondaEuro'
import { PROFONDITA_OLTRE_65_PCT, PROG_PCT, type CatalogoCucina } from '@/types/cucina'
import type { SezioneCucine, VoceCucinaScelta } from '@/types/quote'

// ── Engine Cucine (SPEC_FASE2 §A.5 #1, fase 8) ──
// Puro (no DOM/store/Supabase). Riproduce la catena verificata dal foglio CUCINA
// del listino cucine, SENZA il bug E73 (che riaddizionava la STRISCIA LED E42 già
// inclusa in E48). Prezzi/kind e tariffa dei giorni risolti dal catalogo che passa
// il chiamante (composto dal listino), mai congelati sulla scelta. Sorgente unica
// per UI (Riepilogo) e PDF.
// Importi all'euro intero (D4): ogni costo di voce, ogni moltiplicatore e ogni
// riga derivata si arrotonda dove nasce; i subtotali sono somme di interi.
//
// Catena:
//   primoTotale   = Σ voci blocco 'base' (prezzo×qty)                         [E22]
//   casseAnte     = primoTotale + (casse ? ×0.10) + (ante ? ×0.20)  cumulabili [E25]
//   supplementoProfondita = profonditaOltre65 ? casseAnte × 0.20 : 0      (L25)
//   opzionali     = Σ voci blocco 'opzionali' (LED contata UNA volta)          [E48]
//   open          = Σ voci blocco 'open' (qty×prezzo + toggle-fisso isole)     [E68]
//   totaleCucina  = casseAnte + supplementoProfondita + opzionali + open
//                   (NIENTE giorni, NIENTE +E42)                               [E73]
//   sconto        = totaleCucina × clamp(scontoPct)          ← SOLO sui beni
//   progettazione = totaleCucina × 0.10   (SEMPRE)  ┐ paralleli sul totale PIENO
//   adeguamento   = totaleCucina × adeguamentoPct   ┘ (fuori sconto, come BR-005)
//   giorni        = giorniExtra × tariffa del listino (assente: da definire)   [E72]
//   extra         = extraManuale.importo                       (casella unica)
//   imponibile    = (totaleCucina − sconto) + progettazione + adeguamento
//                   + giorni + extra                                           [E85]

export interface ResultCucina {
  /** E22 — Σ blocco base. */
  primoTotale: number
  /** E23 — +10% casse sul primo totale (0 se spento). */
  importoCasse: number
  /** E24 — +20% ante sul primo totale (0 se spento). */
  importoAnte: number
  /** E25 — primoTotale + importoCasse + importoAnte (cumulabili). */
  casseAnte: number
  /**
   * Profondità oltre 65 cm (L25): +20% di `casseAnte`, nel totale cucina. C'è
   * solo con la spunta: senza, il risultato ha la forma di prima e la vista dei
   * prezzi congelati dei preventivi già salvati la stessa impronta (strada A).
   */
  supplementoProfondita?: number
  /** E48 — Σ blocco opzionali (LED inclusa una sola volta). */
  opzionali: number
  /** E68 — Σ blocco open (incl. toggle-fisso isole). */
  open: number
  /** E73 — casseAnte + supplementoProfondita + opzionali + open. Base dello sconto. */
  totaleCucina: number
  /** Importo scontato, applicato SOLO a totaleCucina. */
  sconto: number
  /** totaleCucina − sconto. */
  totaleCucinaScontato: number
  /** E74 — 10% sul totaleCucina pieno (fuori sconto). */
  progettazione: number
  /** E75 — adeguamentoPct sul totaleCucina pieno (fuori sconto). */
  adeguamento: number
  /** E72 — giorniExtra × tariffa del listino; 0 se il listino non la porta (da definire). */
  giorni: number
  /** Extra manuale a corpo. */
  extra: number
  /** E85 — imponibile finale (IVA esclusa). */
  imponibile: number
  /**
   * Voci e moltiplicatori attivi che il catalogo non sa prezzare (O5): una voce
   * tolta o rinominata, o casse/ante che il catalogo non ha; e i giorni extra
   * quando il listino non porta la tariffa (contano 1). Non entrano nelle somme e
   * rendono PARZIALE il totale: mai 0 € in silenzio.
   */
  vociDaDefinire: number
}

/** Clamp difensivo di una frazione a [0,1] (NaN/∞ → 0), come calcSuMisura/calcMarmeria. */
function clampFrac(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0
}

/** Percentuale di un moltiplicatore (casse/ante); null se il catalogo non lo ha. */
function percentualeMoltiplicatore(catalogo: CatalogoCucina, id: string): number | null {
  const v = catalogo.voci.find((x) => x.id === id)
  return v?.kind === 'moltiplicatore' ? v.percentuale : null
}

/**
 * Costo di una scelta risolvendo prezzo/kind dal catalogo:
 * - 'qty'         → prezzo × quantità, all'euro intero;
 * - 'toggleFisso' → prezzo fisso (quantità ignorata: presenza = selezionato);
 * - 'moltiplicatore' o id ignoto → nessun contributo diretto (i moltiplicatori
 *   passano da casse/ante, non dalla lista voci): la scelta è «da definire» (O5).
 * Ritorna il blocco su cui accumulare, o null se la scelta non produce costo diretto.
 * Esportata: è anche il costo che la pagina mostra accanto alla voce.
 */
export function costoVoce(
  catalogo: CatalogoCucina,
  voceId: string,
  quantita: number
): { blocco: 'base' | 'opzionali' | 'open'; costo: number } | null {
  const v = catalogo.voci.find((x) => x.id === voceId)
  if (!v) return null
  if (v.kind === 'qty') return { blocco: v.blocco, costo: arrotondaEuro(v.prezzo * safeFin(quantita)) }
  if (v.kind === 'toggleFisso') return { blocco: v.blocco, costo: arrotondaEuro(v.prezzo) }
  return null
}

/**
 * Le voci salvate che il catalogo non sa prezzare (O5): id tolto o rinominato, o
 * un id che non è una voce. Un solo predicato: l'engine le conta, la pagina le
 * elenca col pulsante per toglierle.
 */
export function vociFuoriCatalogo(voci: readonly VoceCucinaScelta[], catalogo: CatalogoCucina): VoceCucinaScelta[] {
  return voci.filter((s) => costoVoce(catalogo, s.voceId, s.quantita) === null)
}

/**
 * Giorni extra (E72) e voci da definire (O5), fuori da `calcCucina` per tenerla
 * leggibile. Da definire: le voci che il catalogo non sa prezzare, casse/ante
 * attive che il catalogo non ha, e i giorni extra quando il listino non porta la
 * tariffa (valgono 0 nelle somme e contano 1).
 */
function giorniEDaDefinire(
  sezione: SezioneCucine,
  catalogo: CatalogoCucina,
  pct: { casse: number | null; ante: number | null }
): { giorni: number; vociDaDefinire: number } {
  const giorniExtra = safeFin(sezione.giorniExtra)
  const giorniSenzaTariffa = giorniExtra > 0 && catalogo.giornoRate === null
  const vociDaDefinire =
    vociFuoriCatalogo(sezione.voci, catalogo).length +
    (sezione.casse && pct.casse === null ? 1 : 0) +
    (sezione.ante && pct.ante === null ? 1 : 0) +
    (giorniSenzaTariffa ? 1 : 0)
  const giorni = catalogo.giornoRate === null ? 0 : arrotondaEuro(giorniExtra * catalogo.giornoRate)
  return { giorni, vociDaDefinire }
}

export function calcCucina(sezione: SezioneCucine, catalogo: CatalogoCucina): ResultCucina {
  // Subtotali per blocco (E22 / E48 / E68).
  let primoTotale = 0
  let opzionali = 0
  let open = 0
  for (const scelta of sezione.voci) {
    const r = costoVoce(catalogo, scelta.voceId, scelta.quantita)
    if (!r) continue
    if (r.blocco === 'base') primoTotale += r.costo
    else if (r.blocco === 'opzionali') opzionali += r.costo
    else open += r.costo
  }

  // Moltiplicatori CUMULABILI sul PRIMO TOTALE (E23 +10% casse, E24 +20% ante).
  // Uno attivo che il catalogo non ha vale 0 nelle somme ma è «da definire».
  const pctCasse = percentualeMoltiplicatore(catalogo, 'casse')
  const pctAnte = percentualeMoltiplicatore(catalogo, 'ante')
  const importoCasse = sezione.casse && pctCasse !== null ? arrotondaEuro(primoTotale * pctCasse) : 0
  const importoAnte = sezione.ante && pctAnte !== null ? arrotondaEuro(primoTotale * pctAnte) : 0
  const casseAnte = primoTotale + importoCasse + importoAnte
  // Profondità oltre 65 cm (L25): dopo casse e ante, prima di opzionali e open.
  const profondita = sezione.profonditaOltre65 === true
  const supplementoProfondita = profondita ? arrotondaEuro(casseAnte * PROFONDITA_OLTRE_65_PCT) : 0
  const { giorni, vociDaDefinire } = giorniEDaDefinire(sezione, catalogo, { casse: pctCasse, ante: pctAnte })

  // TOTALE CUCINA (E73): niente giorni extra, LED già contata una sola volta in `opzionali`.
  const totaleCucina = casseAnte + supplementoProfondita + opzionali + open

  // Sconto sezione SOLO sui beni (regola A.3 + decisione Antonio).
  const sconto = arrotondaEuro(totaleCucina * clampFrac(sezione.sconto))
  const totaleCucinaScontato = totaleCucina - sconto

  // Percentuali PARALLELE (non composte) sul totale PIENO → fuori sconto.
  const progettazione = arrotondaEuro(totaleCucina * PROG_PCT)
  const adeguamento = arrotondaEuro(totaleCucina * Math.max(0, safeFin(sezione.adeguamentoPct)))

  // Giorni (sopra) + extra: fuori da percentuali e sconto.
  // Extra ≥ 0 anche qui, non solo nella UI: un negativo da uno stato manomesso
  // scendeva nell'imponibile senza una riga stampata (il PDF la mostra solo se > 0).
  const extra = Math.max(0, arrotondaEuro(sezione.extraManuale?.importo ?? 0))

  const imponibile = totaleCucinaScontato + progettazione + adeguamento + giorni + extra

  return {
    primoTotale,
    importoCasse,
    importoAnte,
    casseAnte,
    ...(profondita ? { supplementoProfondita } : {}),
    opzionali,
    open,
    totaleCucina,
    sconto,
    totaleCucinaScontato,
    progettazione,
    adeguamento,
    giorni,
    extra,
    imponibile,
    vociDaDefinire,
  }
}
