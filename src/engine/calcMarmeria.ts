import type {
  ListinoMarmeria,
  QuoteMarmeria,
  FasciaProfondita,
  Materiale,
  SpessoreType,
  TipologiaMateriale,
} from '@/types/marmeria'
import { calcRilMont } from '@/utils/rilMont'
import { safeFin } from '@/utils/format'
import { arrotondaEuro } from '@/engine/arrotondaEuro'

/** Sotto questa somma di mq dei top si fattura il minimo (foglio PREVENTIVO, riga 74). */
export const MQ_MINIMO_FATTURABILE = 2

export interface ResultMarmeria {
  totMateriali: number
  /** Quanto manca ai top per arrivare al minimo fatturabile; 0 se non si applica. */
  integrazioneMinimo: number
  totAlzatine: number
  totLavorazioniBordo: number
  totLavorazioniVarie: number
  /**
   * Righe bordo e varie con quantità > 0 che il listino non sa prezzare (N/D per la
   * tipologia, oppure lavorazione non più nel listino): fuori dai totali, «da definire».
   */
  lavorazioniDaDefinire: number
  totVasca: number
  totLordo: number
  sconto: number
  totScontato: number
  costoRilMont: number
  totaleFinale: number
}

export function fasciaFromProfondita(cm: number): FasciaProfondita {
  if (cm <= 62) return 'fino62'
  if (cm <= 70) return '63a70'
  return 'oltre70'
}

export function prezzoMqMateriale(
  materiale: Materiale,
  spessore: SpessoreType,
  fascia: FasciaProfondita
): number | null {
  const ms = materiale.spessori[spessore]
  if (!ms || !ms.disponibile) return null

  const fasciaKey = fascia === 'fino62' ? 'fino62' : fascia === '63a70' ? 'da63a70' : 'oltre70'
  const p = ms.prezziMq[fasciaKey]
  return p === 'Non Disp.' ? null : p
}

/**
 * L'importo di una riga gres (materiale, alzatina, bordo, varia): quantità ×
 * prezzo all'euro intero (D4). UNA funzione per engine, PDF e tabelle: il PDF
 * stampava materiali e alzatine dal `totale` persistito nello store, che un
 * localStorage manomesso poteva far divergere dal totale ricalcolato (A4).
 */
export function importoRiga(quantita: number, prezzo: number): number {
  return arrotondaEuro(quantita * prezzo)
}

/** Un prezzo di lavorazione vale solo se positivo: null e 0 sono «Non Disp.» (come nel parser). */
const prezzoValido = (p: number | null | undefined): number | null =>
  typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null

/**
 * Prezzo €/ml di una lavorazione bordo per la tipologia corrente, letto dal
 * listino. Il prezzo è tipologia-dipendente: cambiando la tipologia del
 * preventivo, questo valore cambia → fonte di verità per evitare totali stale
 * (NEW-001). `null` se la lavorazione non è nel listino o non è disponibile per
 * la tipologia: mai 0, che nel PDF diventava una riga a € 0,00 (A2).
 */
export function prezzoMlLavorazioneBordo(
  listino: ListinoMarmeria,
  lavorazioneId: number,
  tipologia: TipologiaMateriale
): number | null {
  const lav = listino.lavorazioniBordo.find((l) => l.id === lavorazioneId)
  return prezzoValido(lav?.prezzoMlPerTipologia[tipologia])
}

/**
 * Prezzo unitario di una lavorazione varia per la tipologia corrente, letto dal
 * listino (match per descrizione: le righe varie non hanno id). `null` se assente
 * o non disponibile per la tipologia, come per il bordo.
 */
export function prezzoLavorazioneVaria(
  listino: ListinoMarmeria,
  descrizione: string,
  tipologia: TipologiaMateriale
): number | null {
  const lav = listino.lavorazioniVarie.find((l) => l.descrizione === descrizione)
  return prezzoValido(lav?.prezzoPerTipologia[tipologia])
}

export function calcMarmeria(
  listino: ListinoMarmeria,
  quote: QuoteMarmeria
): ResultMarmeria {
  // Tutti i totali sono RICALCOLATI dall'input, mai presi dal campo `totale`
  // persistito nelle righe (difensivo: blocca la manipolazione del totale via
  // store/localStorage — A4).
  const tip = quote.tipologiaMateriale

  // Materiali e alzatine: il prezzo è fissato per materiale al momento
  // dell'aggiunta (non dipende dalla tipologia) → ricalcolo la moltiplicazione.
  // Importi all'euro intero (D4): ogni riga si arrotonda con `importoRiga`, e
  // ogni totale qui sotto è una somma di interi.
  const totMateriali = quote.righeMateriali.reduce(
    (sum, r) => sum + importoRiga(r.qtaMq, r.prezzoMq),
    0
  )
  const totAlzatine = quote.righeAlzatine.reduce(
    (sum, r) => sum + importoRiga(r.qtaMl, r.prezzoMl),
    0
  )

  // Minimo fatturabile (risposta di Antonio, 08/10): se i top sommano più di 0 e
  // meno di 2 mq si fattura il minimo = 2 × il prezzo €/mq della riga, il più alto
  // fra le righe con quantità. NON il «MINIMO 2 MQ» del listino (2 × «oltre 70»,
  // la colonna che usa il foglio): l'app prezza per fascia e «oltre 70» costa
  // 1,6-1,8 volte «fino a 62», quindi 1,9 mq costerebbero più di 2,1 mq. Le
  // alzatine restano fuori dal minimo e si sommano sempre (il foglio le perde, G74).
  const mqTop = quote.righeMateriali.reduce((sum, r) => sum + safeFin(r.qtaMq), 0)
  const minimo =
    mqTop > 0 && mqTop < MQ_MINIMO_FATTURABILE
      ? Math.max(
          0,
          ...quote.righeMateriali
            .filter((r) => safeFin(r.qtaMq) > 0)
            .map((r) => importoRiga(MQ_MINIMO_FATTURABILE, r.prezzoMq))
        )
      : 0
  const integrazioneMinimo = Math.max(0, minimo - totMateriali)

  // Bordo e varie: il prezzo è TIPOLOGIA-dipendente → ri-letto dal listino per
  // la tipologia corrente, ignorando il prezzo memorizzato (fix NEW-001:
  // il cambio tipologia si propaga ai totali anche su righe già inserite).
  // Una riga che il listino non sa prezzare resta fuori dai totali e si conta
  // come «da definire»: il PDF la dichiara e il totale è PARZIALE (A2).
  let lavorazioniDaDefinire = 0
  const totLavorazioniBordo = quote.righeLavorazioniBordo.reduce((sum, r) => {
    const prezzo = prezzoMlLavorazioneBordo(listino, r.lavorazioneId, tip)
    if (prezzo === null) {
      if (safeFin(r.qtaMl) > 0) lavorazioniDaDefinire++
      return sum
    }
    return sum + importoRiga(r.qtaMl, prezzo)
  }, 0)
  const totLavorazioniVarie = quote.righeVarie.reduce((sum, r) => {
    const prezzo = prezzoLavorazioneVaria(listino, r.descrizione, tip)
    if (prezzo === null) {
      if (safeFin(r.qta) > 0) lavorazioniDaDefinire++
      return sum
    }
    return sum + importoRiga(r.qta, prezzo)
  }, 0)

  // Vasca in gres: voce a corpo, prezzo snapshottato nella voce (non dipende dalla
  // tipologia: è già il prezzo gres) → ricalcolo dall'input come per `prezzoMq`.
  const totVasca = quote.vasca?.inclusa ? arrotondaEuro(quote.vasca.prezzo) : 0

  // La vasca entra nel LORDO, quindi è scontata con la scontistica gres e concorre
  // alla base che sceglie lo scaglione del montaggio. Rispecchia il foglio:
  // RIL_MONT!E2 = PREVENTIVO!G81 = (materiali + lavorazioni) × (1 − sconto), e la
  // vasca è un bene gres (decisione Antonio: segue il prezzo del gres, stessa
  // scontistica). Il montaggio resta FUORI dallo sconto (G85 = G81 + G83).
  // L'integrazione al minimo è materiale: sta nel lordo come G74 → G78 → G81.
  const totLordo =
    totMateriali + integrazioneMinimo + totAlzatine + totLavorazioniBordo + totLavorazioniVarie + totVasca
  // Lo sconto è una frazione [0,1]: clamp difensivo perché l'engine è puro e
  // non si fida dell'input (può arrivare manomesso dallo store/localStorage).
  const scontoFrac = Number.isFinite(quote.sconto) ? Math.max(0, Math.min(1, quote.sconto)) : 0
  const sconto = arrotondaEuro(totLordo * scontoFrac)
  const totScontato = totLordo - sconto

  // Senza un gres da montare (lordo 0) niente rilievo e montaggio, anche con la
  // spunta accesa (risposta di Antonio, 08/10): il blocco Gres non si stampa e la
  // fascia minima finirebbe nel TOTALE GENERALE senza una riga che la spieghi (A1).
  // Con lordo > 0 e sconto 100% il blocco si stampa e la fascia minima resta.
  // Lo scaglione si sceglie sullo scontato già intero, quello stampato sopra la
  // riga: 2.999,60 stampato 3.000 prende la fascia dei 3.000. L'arrotondamento
  // fuori è una difesa: le fasce del listino sono importi, che il parser non
  // garantisce interi.
  const costoRilMont = quote.includiRilMont && totLordo > 0
    ? arrotondaEuro(calcRilMont(totScontato, listino.rilMontScaglioni))
    : 0

  const totaleFinale = totScontato + costoRilMont

  return {
    totMateriali: safeFin(totMateriali),
    integrazioneMinimo: safeFin(integrazioneMinimo),
    totAlzatine: safeFin(totAlzatine),
    totLavorazioniBordo: safeFin(totLavorazioniBordo),
    totLavorazioniVarie: safeFin(totLavorazioniVarie),
    lavorazioniDaDefinire,
    totVasca: safeFin(totVasca),
    totLordo: safeFin(totLordo),
    sconto: safeFin(sconto),
    totScontato: safeFin(totScontato),
    costoRilMont: safeFin(costoRilMont),
    totaleFinale: safeFin(totaleFinale),
  }
}
