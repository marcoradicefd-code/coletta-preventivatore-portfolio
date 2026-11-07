import { safeFin } from '@/utils/format'
import { arrotondaEuro } from '@/engine/arrotondaEuro'
import { BATTISCOPA_EXTRA_PCT } from '@/data/battiscopa'
import type { ListinoPorte } from '@/types/porte'
import type {
  SezionePorte,
  RigaPorta,
  RigaBattiscopa,
  OptionalScelto,
  PrezziModelloSnapshot,
  ManigliaPorta,
} from '@/types/quote'

// ── Engine Porte (SPEC_FASE2 §B.4) ──
// Puro. I prezzi vengono dalla RIGA, congelati alla scelta (E3): il listino serve
// solo come ripiego per le righe pre-snapshot. Prima si risolveva tutto per nome a
// ogni render, e un modello rinominato nel listino nuovo azzerava in silenzio i
// preventivi in corso — il prezzo promesso al cliente sparito senza un errore.
// I totali restano SEMPRE derivati. Difensivo: `safeFin` + clamp sconto.
// Regola Antonio: le colonne altezza sono PREZZI PIENI ALTERNATIVI (si applica UNA
// fascia), NON additivi; gli optional invece si SOMMANO.
//
// Catena di riga (PR B):
//   prezzoUnitarioRiga = prezzoBase(fascia) + Σ optional      ← per UNA porta
//   totale             = prezzoUnitarioRiga × quantita        ← optional inclusi
//                      + maniglia.qta × maniglia.prezzo       ← FUORI dal ×qta
// Le righe salvate prima della PR B non hanno `quantita`: valgono 1 e il loro
// prezzo non si muove di un centesimo (presidio pinnato in calcPorte.test.ts).

export type FasciaAltezza = 'base' | 'h215' | 'h240'

/**
 * Da dove viene il prezzo della riga.
 * - `snapshot`: tutto congelato sulla riga. È il caso normale dopo E3.
 * - `live`: qualcosa è stato risolto dal listino (riga pre-snapshot) — funziona,
 *   ma è esposto al rename: è il comportamento di ieri.
 * - `irrisolvibile`: nessuno snapshot E nessun riscontro nel listino. Il prezzo
 *   non è ricostruibile e NON viene inventato: la riga esce dal totale e si
 *   dichiara.
 * - `da-completare`: il prezzo c'è, mancano le misure (porta senza altezza;
 *   battiscopa senza altezza o metri lineari, comprese le righe della #33).
 *   Esce dal totale come `irrisolvibile`, ma il rimedio è diverso: scrivere le
 *   misure.
 */
export type OrigineRiga = 'snapshot' | 'live' | 'irrisolvibile' | 'da-completare'

/**
 * La riga ha un importo vero? Le altre escono dal subtotale e contano in
 * `daDefinire`. Switch esaustivo: un'origine nuova senza un caso qui non compila.
 */
export function origineValorizzata(origine: OrigineRiga): boolean {
  switch (origine) {
    case 'snapshot':
    case 'live':
      return true
    case 'irrisolvibile':
    case 'da-completare':
      return false
    default: {
      const esaustivo: never = origine
      return esaustivo
    }
  }
}

export interface RigaPortaCalcolata {
  id: string
  modelloNome: string
  /** Altezza normalizzata: 0, negativa o non finita ⇒ 0, e la riga è `da-completare`. */
  altezzaCm: number
  /** Fascia selezionata dall'altezza. Vale SEMPRE: dipende dall'altezza, non dal prezzo. */
  fascia: FasciaAltezza
  /**
   * Prezzo pieno della fascia, PER UNA porta. È 0 solo se il modello non si
   * trova (né sulla riga né nel listino): con un optional sparito vale il prezzo
   * di fascia anche se la riga è irrisolvibile. Se la riga ha un importo lo dice
   * `origine`, mai questo campo.
   */
  prezzoBase: number
  /** Somma dei costi optional, PER UNA porta. */
  optionalTotale: number
  /** Quante porte: `riga.quantita` normalizzata (assente/assurda ⇒ 1). */
  quantita: number
  /** prezzoBase + optionalTotale: quello che il PDF stampa come prezzo unitario. */
  prezzoUnitarioRiga: number
  /** Contributo della maniglia: qta × prezzo all'euro intero, FUORI dal moltiplicatore porte. */
  totaleManiglia: number
  /**
   * prezzoUnitarioRiga × quantita all'euro intero + totaleManiglia: l'importo di
   * riga. Calcolato anche per le righe non valorizzate (a differenza del
   * battiscopa, che lo azzera): conta solo se `origineValorizzata(origine)`.
   */
  totale: number
  origine: OrigineRiga
}

/** Una riga battiscopa calcolata (altezza × €/cm = €/ml, × metri lineari, + posa). */
export interface RigaBattiscopaCalcolata {
  id: string
  nome: string
  /** Altezza normalizzata (assente/assurda ⇒ 0). */
  altezzaCm: number
  /** Metri lineari normalizzati (assenti/assurdi ⇒ 0). */
  metriLineari: number
  /** €/cm effettivo: quello congelato, +20% se `extra`. 0 se irrisolvibile. */
  rate: number
  /** rate × altezzaCm. */
  prezzoMl: number
  /** prezzoMl × metriLineari, all'euro intero. */
  prodotto: number
  /** Posa €/ml (a mano, senza +20%). */
  prezzoPosaMl: number
  /** prezzoPosaMl × metriLineari, all'euro intero. */
  posa: number
  /** prodotto + posa se la riga è valorizzata, altrimenti 0. */
  totale: number
  /** LEGACY #33: la lunghezza in cm della riga vecchia, per dirlo nell'avviso. */
  quantitaCmLegacy?: number
  origine: OrigineRiga
}

export interface ResultPorte {
  righe: RigaPortaCalcolata[]
  /** Righe battiscopa a corpo: FUORI dal moltiplicatore delle porte. */
  battiscopa: RigaBattiscopaCalcolata[]
  /** Σ totale delle righe con un importo vero. Le non valorizzate NON entrano. */
  subtotale: number
  /** Importo scontato sul subtotale. */
  sconto: number
  /** subtotale − sconto. */
  totale: number
  /** Quante righe non sono valorizzate (escluse dal subtotale). */
  daDefinire: number
}

/** La fascia dipende SOLO dall'altezza: si conosce anche quando il prezzo no. */
export function fasciaPerAltezza(altezzaCm: number): FasciaAltezza {
  const h = safeFin(altezzaCm)
  if (h > 240) return 'h240'
  if (h > 215) return 'h215'
  return 'base'
}

/**
 * Seleziona la fascia e il prezzo pieno in base all'altezza:
 * ≤215 → prezzo2026 · (215, 240] → h215 · >240 → h240. ALTERNATIVI, non additivi.
 * Accetta sia un `ModelloPorta` del listino sia la terna congelata sulla riga.
 */
export function prezzoFascia(
  prezzi: PrezziModelloSnapshot,
  altezzaCm: number
): { fascia: FasciaAltezza; prezzo: number } {
  const fascia = fasciaPerAltezza(altezzaCm)
  const prezzo =
    fascia === 'h240' ? prezzi.h240 : fascia === 'h215' ? prezzi.h215 : prezzi.prezzo2026
  return { fascia, prezzo: safeFin(prezzo) }
}

/**
 * Il rate €/unità di un optional. `null` = non ricostruibile (né congelato sulla
 * scelta, né presente nel listino): chi chiama decide, e nessuno inventa 0.
 */
function rateOptional(opt: OptionalScelto, listino: ListinoPorte | null): number | null {
  if (opt.unita === 'MANUALE') return safeFin(opt.prezzoManuale ?? 0)
  if (opt.prezzoUnitario !== undefined) return safeFin(opt.prezzoUnitario)
  const live = listino?.optional.find((o) => o.nome === opt.nome)
  // `prezzo: null` = non determinabile dal listino (vedi types/porte.ts). Non è
  // zero: è l'assenza di un prezzo, e vale come l'optional sparito. Su un listino
  // valido non capita — `porteSchema` rifiuta i non-MANUALE senza prezzo > 0.
  if (!live || live.prezzo === null) return null
  return safeFin(live.prezzo)
}

/**
 * Costo di un optional scelto. MANUALE → `prezzoManuale`; altrimenti il rate è
 * congelato sulla scelta (o risolto dal listino per le scelte pre-snapshot):
 * PORTA fisso (×1), MQ/PEZZO/ML × quantità (battiscopa ML 1,2 €/cm; la variante
 * "+20%" è già 1,44 nel listino). Rate non ricostruibile → 0, ma la riga che lo
 * contiene esce dal totale (vedi `calcRigaPorta`).
 */
export function costoOptional(opt: OptionalScelto, listino: ListinoPorte | null): number {
  const rate = rateOptional(opt, listino)
  if (rate === null) return 0
  if (opt.unita === 'PORTA') return rate // fisso, ×1
  return safeFin(rate * safeFin(opt.quantita))
}

/**
 * Quante porte vale una riga. **Assente ⇒ 1**: prima della PR B una riga era
 * una porta, e leggerla così è ciò che tiene fermi i preventivi già salvati.
 *
 * Difensivo come il resto dell'engine: zero, negativi e non-finiti ⇒ 1, mai una
 * riga che si azzera in silenzio nel PDF del cliente. Frazioni troncate: mezze
 * porte non esistono, e `2,7` è un dito scivolato sul tastierino.
 */
export function quantitaPorte(riga: Pick<RigaPorta, 'quantita'>): number {
  const q = Math.trunc(safeFin(riga.quantita ?? 1))
  return q >= 1 ? q : 1
}

/**
 * Costo della maniglia della riga: `qta × prezzoUnitario`.
 *
 * Fuori dal moltiplicatore delle porte di proposito (vedi `ManigliaPorta`).
 * Valori negativi o non finiti ⇒ 0: una maniglia non può scontare la porta.
 */
export function costoManiglia(riga: Pick<RigaPorta, 'maniglia'>): number {
  const m = riga.maniglia
  if (!m || manigliaInclusa(m)) return 0
  const qta = safeFin(m.qta)
  if (qta <= 0) return 0
  return safeFin(qta * safeFin(m.prezzoUnitario ?? 0))
}

/**
 * Maniglia inclusa: prezzo assente, 0 o non valido (regola di Antonio, 06/10).
 * È la standard, non si somma. UNA sola definizione, letta da testo, PDF e UI:
 * se ognuno decidesse "inclusa" a modo suo, il PDF potrebbe dire inclusa una
 * maniglia che il totale fattura.
 */
export function manigliaInclusa(m: ManigliaPorta): boolean {
  return safeFin(m.prezzoUnitario ?? 0) <= 0
}

/**
 * Da dove viene l'importo di una riga porta. Gemella di `origineBattiscopa`: il
 * prezzo che manca vince sull'altezza che manca, perché scriverla non basterebbe.
 */
function originePorta(stato: {
  prezzoNoto: boolean
  altezzaValida: boolean
  qualcosaDalListino: boolean
}): OrigineRiga {
  if (!stato.prezzoNoto) return 'irrisolvibile'
  if (!stato.altezzaValida) return 'da-completare'
  if (stato.qualcosaDalListino) return 'live'
  return 'snapshot'
}

/** Calcola una singola riga-porta (prezzo di fascia + optional) × quantità + maniglia. */
export function calcRigaPorta(riga: RigaPorta, listino: ListinoPorte | null): RigaPortaCalcolata {
  const modelloLive = listino?.modelli.find((m) => m.nome === riga.modelloNome)
  const prezzi: PrezziModelloSnapshot | null = riga.prezziModello ?? modelloLive ?? null

  // Basta UN pezzo non ricostruibile perché il totale della riga sia incompleto:
  // meglio dichiararlo che consegnare una somma corta che sembra giusta.
  const optionalNonRisolti = riga.optionals.some((o) => rateOptional(o, listino) === null)
  // `live` se anche solo un pezzo è stato pescato dal listino invece che dalla riga.
  const qualcosaDalListino =
    (riga.prezziModello === undefined && prezzi !== null) ||
    riga.optionals.some((o) => o.unita !== 'MANUALE' && o.prezzoUnitario === undefined)

  // Altezza 0, negativa, NaN o null (campo svuotato, blob manomesso): la porta
  // è da completare, mai prezzata in fascia base con un'altezza inventata.
  const altezzaCm = Math.max(0, safeFin(riga.altezzaCm))

  const origine = originePorta({
    prezzoNoto: prezzi !== null && !optionalNonRisolti,
    altezzaValida: altezzaCm > 0,
    qualcosaDalListino,
  })

  const fascia = fasciaPerAltezza(altezzaCm)
  const prezzoBase = prezzi ? prezzoFascia(prezzi, altezzaCm).prezzo : 0
  const optionalTotale = safeFin(riga.optionals.reduce((s, o) => s + costoOptional(o, listino), 0))

  // `prezzoBase` e `optionalTotale` restano UNITARI: sono i numeri che il PDF
  // stampa nella colonna "prezzo unitario". Moltiplicarli qui li eleverebbe al
  // quadrato a valle, dove l'importo li rimoltiplica per la quantità.
  const quantita = quantitaPorte(riga)
  const prezzoUnitarioRiga = safeFin(prezzoBase + optionalTotale)
  // La quantità moltiplica base E optional perché gli optional sono PER PORTA:
  // `STIPITI E MOSTRINE` ha `unita: 'PORTA'`, il battiscopa è €/cm sull'altezza
  // di UNA porta. Due porte vogliono due set di stipiti; moltiplicare il solo
  // prezzo base darebbe due porte con un set solo.
  // Importi all'euro intero (D4): le porte e la maniglia sono due importi stampati
  // (Importo e «+ maniglia … = €»), quindi si arrotondano ciascuno e la riga è la
  // loro somma. I prezzi UNITARI restano coi centesimi del listino.
  const totaleManiglia = arrotondaEuro(costoManiglia(riga))

  return {
    id: riga.id,
    modelloNome: riga.modelloNome,
    altezzaCm,
    fascia,
    prezzoBase,
    optionalTotale,
    quantita,
    prezzoUnitarioRiga,
    totaleManiglia,
    totale: arrotondaEuro(prezzoUnitarioRiga * quantita) + totaleManiglia,
    origine,
  }
}

/**
 * Da dove viene l'importo di una riga battiscopa. Il prezzo che manca vince
 * sulle misure che mancano: completarle non basterebbe a valorizzare la riga.
 */
function origineBattiscopa(stato: {
  prezzoNoto: boolean
  misureComplete: boolean
  rateCongelato: boolean
}): OrigineRiga {
  if (!stato.prezzoNoto) return 'irrisolvibile'
  if (!stato.misureComplete) return 'da-completare'
  if (stato.rateCongelato) return 'snapshot'
  return 'live'
}

/**
 * Calcola una riga battiscopa a corpo (specifica di Antonio, 06/10):
 * prezzoMl = altezzaCm × €/cm, prodotto = prezzoMl × metriLineari,
 * posa = prezzoPosaMl × metriLineari, totale = prodotto + posa. Senza altezza o
 * senza metri (comprese le righe della #33) la riga è `da-completare`.
 *
 * Il rate è quello CONGELATO alla scelta; se manca si ripiega sul listino vivo
 * (riga pre-snapshot), e se non c'è nemmeno lì la riga è `irrisolvibile` e resta
 * fuori dal totale — mai un prezzo inventato su un PDF che va al cliente.
 *
 * `extra` applica il +20% del listino AL RATE CONGELATO, quindi solo al prodotto
 * e mai alla posa, invece di far scegliere
 * la voce-variante: così la maggiorazione segue il prezzo promesso a questo
 * preventivo, non quello di oggi.
 *
 * Il moltiplicatore delle porte non passa di qui: è il senso stesso di questa
 * riga (vedi `RigaBattiscopa`).
 */
export function calcRigaBattiscopa(
  riga: RigaBattiscopa,
  listino: ListinoPorte | null
): RigaBattiscopaCalcolata {
  const live = listino?.optional.find((o) => o.nome === riga.nome)
  const rateBase =
    riga.prezzoUnitario !== undefined
      ? safeFin(riga.prezzoUnitario)
      : live && live.prezzo !== null
        ? safeFin(live.prezzo)
        : null

  // Misure: assenti, negative o non finite valgono 0, e una riga senza altezza
  // o senza metri è da completare (mai una riga da 0,00 € sul PDF).
  const altezzaCm = Math.max(0, safeFin(riga.altezzaCm ?? 0))
  const metriLineari = Math.max(0, safeFin(riga.metriLineari ?? 0))
  const prezzoPosaMl = Math.max(0, safeFin(riga.prezzoPosaMl ?? 0))

  const origine = origineBattiscopa({
    prezzoNoto: rateBase !== null,
    misureComplete: altezzaCm > 0 && metriLineari > 0,
    rateCongelato: riga.prezzoUnitario !== undefined,
  })

  // +20% solo sul prodotto. Il €/cm e il €/ml restano prezzi unitari coi
  // centesimi: si arrotondano all'euro (D4) solo i due importi stampati,
  // prodotto e posa, e il totale è la loro somma.
  const rate = rateBase === null ? 0 : safeFin(riga.extra ? rateBase * (1 + BATTISCOPA_EXTRA_PCT) : rateBase)
  const prezzoMl = safeFin(rate * altezzaCm)
  const prodotto = arrotondaEuro(prezzoMl * metriLineari)
  const posa = arrotondaEuro(prezzoPosaMl * metriLineari)

  return {
    id: riga.id,
    nome: riga.nome,
    altezzaCm,
    metriLineari,
    rate,
    prezzoMl,
    prodotto,
    prezzoPosaMl,
    posa,
    totale: origineValorizzata(origine) ? prodotto + posa : 0,
    ...(riga.metriLineari === undefined && riga.quantitaCm !== undefined
      ? { quantitaCmLegacy: riga.quantitaCm }
      : {}),
    origine,
  }
}

/**
 * Aggrega la sezione Porte. Sconto sezione sul lordo, clampato [0,1] (NaN/∞ → 0)
 * come le altre sezioni. Sorgente unica per UI (Riepilogo) e PDF.
 *
 * Le righe non valorizzate (irrisolvibili o da completare) NON entrano nel
 * subtotale: un prezzo che non sappiamo ricostruire vale "da definire", non 0.
 * Sommarle come zero abbasserebbe il totale in silenzio — il cliente
 * riceverebbe un preventivo che vale meno del dovuto e nessuno se ne
 * accorgerebbe.
 */
export function calcPorte(sezione: SezionePorte, listino: ListinoPorte | null): ResultPorte {
  const righe = sezione.righe.map((r) => calcRigaPorta(r, listino))
  const battiscopa = (sezione.battiscopa ?? []).map((b) => calcRigaBattiscopa(b, listino))
  const daDefinire =
    righe.filter((r) => !origineValorizzata(r.origine)).length +
    battiscopa.filter((b) => !origineValorizzata(b.origine)).length
  // Porte e battiscopa nello stesso subtotale, quindi lo sconto di sezione (che
  // si applica DOPO, sotto) li prende entrambi: è un solo sconto commerciale
  // sulla sezione, non due regimi.
  const subtotale =
    righe.filter((r) => origineValorizzata(r.origine)).reduce((s, r) => s + r.totale, 0) +
    battiscopa.filter((b) => origineValorizzata(b.origine)).reduce((s, b) => s + b.totale, 0)
  const scontoClamp = Number.isFinite(sezione.sconto)
    ? Math.max(0, Math.min(1, sezione.sconto))
    : 0
  const sconto = arrotondaEuro(subtotale * scontoClamp)
  const totale = subtotale - sconto
  return { righe, battiscopa, subtotale, sconto, totale, daDefinire }
}
