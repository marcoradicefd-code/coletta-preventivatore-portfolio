import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// PreventivoPrint → quoteStore → pricelistStore → supabase: mock minimale per
// restare hermetici (nessun env, nessuna rete), come negli altri test di stampa.
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { PreventivoPrint } from '@/components/print/PreventivoPrint'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { articoloPZ } from '@/test-utils/articoli'
import { listinoCucinaFinto, VASCA_PREZZO_FINTO } from '@/test-utils/catalogoCucinaFinto'
import type { ListinoMarmeria } from '@/types/marmeria'
import type { ListinoPorte } from '@/types/porte'
import { ALIQUOTE_IVA } from '@/engine/iva'
import { calcSuMisuraArticoli } from '@/engine/calcSuMisura'

// Listino cucine finto nello store, come dal bucket: i prezzi di vendita veri
// non entrano nei test (D7).
beforeEach(() => usePricelistStore.setState({ cucine: validatoPerTest(listinoCucinaFinto) }))

// Invariante: un importo entra nel totale imponibile solo se il documento lo stampa.
// A1 della review del 07/10: con la spunta «rilievo e montaggio» e un gres a lordo
// 0 il totale portava la fascia minima, senza blocco Gres né riga che la spiegasse.

// Listino gres sintetico, forma Rev_82: 300 € fino a 2.000, 400 € fino a 3.000, 15% oltre.
const listinoGres: ListinoMarmeria = {
  materiali: [],
  lavorazioniBordo: [],
  lavorazioniVarie: [],
  vascheIntegrate: [],
  rilMontScaglioni: [
    { da: 0, a: 2000, importo: 300 },
    { da: 2000, a: 3000, importo: 400 },
    { da: 3000, a: null, importo: 0, percentuale: 0.15 },
  ],
  scontiDisponibili: [0],
  aggiornato: '',
}

const rigaGres = {
  materialeKey: 'k',
  spessore: 13 as const,
  fascia: 'fino62' as const,
  profonditaCm: 60,
  qtaMq: 1,
  prezzoMq: 100,
  totale: 100,
}

/**
 * Importo stampato accanto a «Totale imponibile( parziale)», come numero: è il
 * «TOTALE GENERALE/PARZIALE (IVA esclusa)» di prima di L18, allo stesso euro.
 */
function totaleStampato(): number {
  const tr = screen.getByText(/^Totale imponibile( parziale)?$/).closest('tr')!
  const m = (tr.textContent ?? '').match(/(-?\d{1,3}(?:\.\d{3})*,\d{2})/)
  expect(m, `nessun importo in «${tr.textContent}»`).toBeTruthy()
  return parseFloat(m![1].replace(/\./g, '').replace(',', '.'))
}

const bloccoGres = () => screen.queryByText('Marmeria / Gres')
const voceRilMont = () => screen.queryByText('Rilievo e montaggio')

describe('PreventivoPrint — rilievo e montaggio senza un top (A1)', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ marmeria: validatoPerTest(listinoGres) })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null })
  })

  it('gres mai compilato e spunta accesa: il totale è solo arredi, nessun blocco Gres', () => {
    const s = useQuoteStore.getState()
    s.addArticoloSuMisura(articoloPZ) // arredi 100 €
    s.setIncludiRilMont(true)
    render(<PreventivoPrint />)
    expect(bloccoGres()).toBeNull()
    expect(voceRilMont()).toBeNull()
    expect(totaleStampato()).toBe(100)
  })

  it('gres svuotato dopo la spunta (la spunta resta salvata): idem', () => {
    const s = useQuoteStore.getState()
    s.addArticoloSuMisura(articoloPZ)
    s.addRigaMateriale(rigaGres)
    s.setIncludiRilMont(true)
    s.removeRigaMateriale(useQuoteStore.getState().sezioni.gres!.righeMateriali[0].id)
    expect(useQuoteStore.getState().sezioni.gres!.includiRilMont).toBe(true)
    render(<PreventivoPrint />)
    expect(bloccoGres()).toBeNull()
    expect(totaleStampato()).toBe(100)
  })

  it('gres di sole righe a quantità 0: idem', () => {
    const s = useQuoteStore.getState()
    s.addArticoloSuMisura(articoloPZ)
    s.addRigaMateriale({ ...rigaGres, qtaMq: 0, totale: 0 })
    s.setIncludiRilMont(true)
    render(<PreventivoPrint />)
    expect(bloccoGres()).toBeNull()
    expect(totaleStampato()).toBe(100)
  })

  it('presidio: lordo > 0 con sconto 100% → blocco stampato, fascia minima visibile e sommata', () => {
    const s = useQuoteStore.getState()
    s.addArticoloSuMisura(articoloPZ)
    s.addRigaMateriale(rigaGres) // lordo 100, scontato 0
    s.setScontoSezione('gres', 1)
    s.setIncludiRilMont(true)
    render(<PreventivoPrint />)
    expect(bloccoGres()).not.toBeNull()
    expect(voceRilMont()?.closest('div')?.textContent).toContain('300,00')
    expect(totaleStampato()).toBe(100 + 300)
  })
})

// ── Test a proprietà ─────────────────────────────────────────────────────────
// Stati casuali con seme fisso, anche con valori che la UI non offre ma che un
// localStorage manomesso o un blob legacy può portare (extra Cucina negativo,
// lavorazione bordo sparita dal listino, voce cucina sparita dal catalogo), con la
// porta ancora da completare (altezza 0: da L1 la UI ci arriva svuotando il campo)
// e con quella oltre i 240 cm (fascia h240), e con prezzi e quantità coi centesimi,
// perché l'arrotondamento abbia qualcosa da fare. Sei invarianti; le somme a
// uguaglianza ESATTA: gli importi sono interi (D4, PR 9), quindi non hanno errore
// e non serve tolleranza; l'IVA è in centesimi e si confronta in centesimi interi.
//   I0  ogni importo stampato è un intero (righe di riepilogo, importi delle
//       tabelle, voci maniglia con importo, totale imponibile); le imposte e il
//       totale IVA compresa no, sono coi centesimi (L18);
//   I1  totale imponibile stampato = Σ dei totali dei blocchi stampati;
//   I2  dentro ogni blocco, le righe di riepilogo stampate sommano al totale del
//       blocco; nel gres anche ogni tabella somma al suo totale di riepilogo;
//   I3  la cucina stampa «Totale parziale cucina», e il TOTALE è PARZIALE e la
//       nomina, se e solo se ha una voce che il catalogo non sa prezzare (O5);
//   I4  IVA (L18): le quote «IVA x% su € q» sommano al totale imponibile, ogni
//       imposta è q × x centesimi, TOTALE (IVA compresa) = imponibile + Σ imposte,
//       e la colonna IVA c'è nelle tabelle se e solo se le aliquote sono più d'una
//       (e una tabella di voci c'è: cucina e gres di sola vasca non ne hanno);
//   I5  arredi (L19): il «Totale Su Misura» stampato è quello calcolato SENZA
//       raggruppamento (gli stessi articoli senza `arredoId`); con gli arredi, ogni
//       «Subtotale <arredo>» è la somma della sua tabella, e i subtotali (arredi e
//       «Altre voci») sommano al «Subtotale falegnameria»; con o senza arredi, le
//       righe delle tabelle degli articoli sommano al «Subtotale falegnameria», che
//       con la quota progettazione la contiene già (L25: niente riga «Quota
//       progettazione», la quota è spalmata nelle righe).
// Le aliquote (di sezione e di riga, o nessuna) vengono da un PRNG A PARTE, con un
// seme derivato: gli stati di prima di L18 restano IDENTICI, quindi I1 dice anche
// che il totale imponibile è quello di prima, stato per stato.
// Gli arredi (L19: 0–4 arredi, 0–3 articoli in più, assegnati a caso, anche a un
// arredo che non c'è più) vengono da un terzo PRNG, dopo le aliquote: le scelte del
// generatore e delle aliquote restano quelle di prima, e gli articoli in più
// cambiano l'imponibile solo degli stati dove compaiono.
// Nessuno shrinking: un controesempio esce con l'indice dello stato e lo stato intero.
//
// STATI e SEME. Il gate (`npm test`, la CI) gira a 400 stati; `npm run test:rapido`
// a 150, per il quotidiano. Tutti e due col seme fisso: i primi N stati sono un
// prefisso dei 400 (ogni pick e ogni rnd consumano un numero), quindi un run ridotto
// rigioca gli stessi primi N, non altri. Si cambiano con STATI_PROPRIETA e
// SEME_PROPRIETA (interi ≥ 1: un valore sbagliato fa fallire il file nominando la
// variabile, non lo trasforma in un ciclo da 0 giri). Un controesempio si rigioca con
//   SEME_PROPRIETA=<seme> STATI_PROPRIETA=<indice+1> npx vitest run <questo file>
// e il messaggio dell'expect finale lo scrive già pronto.

const STATI_GATE = 400
/** Intero ≥ 1 da una variabile d'ambiente, altrimenti lancia: «4oo» non deve essere 0 giri. */
function internoDaEnv(nome: string, predefinito: number, massimo = Number.MAX_SAFE_INTEGER): number {
  const v = process.env[nome]
  if (v === undefined) return predefinito
  const n = /^\d+$/.test(v) ? Number(v) : NaN
  if (!(n >= 1 && n <= massimo)) throw new Error(`${nome}=«${v}» non va bene: serve un intero tra 1 e ${massimo}`)
  return n
}
const STATI = internoDaEnv('STATI_PROPRIETA', STATI_GATE)
// mulberry32 lavora a 32 bit: un seme più grande si ridurrebbe a un altro in silenzio.
const SEME = internoDaEnv('SEME_PROPRIETA', 20261007, 0xffffffff)

const listinoGresProprieta: ListinoMarmeria = {
  ...listinoGres,
  lavorazioniBordo: [{ id: 1, descrizione: 'Costa retta', prezzoMlPerTipologia: { QUARZO: 10.35, LAPITEC: 10.35, GRES: 10.35 } }],
  lavorazioniVarie: [{ descrizione: 'Foro', prezzoPerTipologia: { QUARZO: 12.5, LAPITEC: 12.5, GRES: 12.5 }, unitaMisura: 'PEZZO' }],
  scontiDisponibili: [0, 0.05, 0.1],
}
const listinoPorte: ListinoPorte = {
  modelli: [{ nome: 'GIOTTO', prezzo2026: 700, h215: 900, h240: 1000 }],
  optional: [{ nome: 'BATTISCOPA MASSELLO', unita: 'ML', prezzo: 1.2 }],
  aggiornato: '',
}

// PRNG con seme (mulberry32): stessi stati a ogni esecuzione.
function prng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** «€ 1.234,56», «- € 100,00» → numero con segno. */
function importo(testo: string): number {
  const negativo = /-\s*€?\s*\d|€\s*-\s*\d/.test(testo)
  const v = parseFloat(testo.replace(/[^0-9,.]/g, '').replace(/\./g, '').replace(',', '.'))
  return negativo ? -v : v
}

type Riga = { label: string; value: number }
/** Le righe di riepilogo (`SummaryRow`: un div con due span) in ordine di documento. */
function righeRiepilogo(): Riga[] {
  const out: Riga[] = []
  document.querySelectorAll('div').forEach((d) => {
    const sp = Array.from(d.children).filter((c) => c.tagName === 'SPAN')
    if (sp.length === 2 && d.children.length === 2 && /€\s*[\d.,]+$/.test(sp[1].textContent ?? '')) {
      out.push({ label: sp[0].textContent ?? '', value: importo(sp[1].textContent ?? '') })
    }
  })
  return out
}

const TOTALI_DI_BLOCCO = [
  /^Totale( parziale)? cucina$/,
  /^Totale Marmeria$/,
  /^Totale Su Misura$/,
  /^Totale( parziale)? Porte$/,
  /^Totale progetto su misura$/,
]
const eTotaleDiBlocco = (label: string) => TOTALI_DI_BLOCCO.some((r) => r.test(label))

/** Tabella del gres (titolo nel PDF) → riga di riepilogo che ne è il totale. */
const TABELLE_GRES: [string, string][] = [
  ['Top — Schienali — Fianchi (€/mq)', 'Totale materiali'],
  ['Alzatine (€/ml)', 'Totale alzatine'],
  ['Lavorazioni bordo (€/ml)', 'Totale lavorazioni bordo'],
  ['Lavorazioni varie', 'Totale lavorazioni varie'],
]

/**
 * La tabella dei totali (imponibile, IVA, totale IVA compresa): l'ultima del
 * documento, dopo ci sono note, firma e condizioni, senza tabelle. Una query sola,
 * non un `getByText` su tutto il DOM: gira 400 volte, dentro il tetto di 60 s.
 */
function tabellaTotali(): Element {
  const tabelle = document.querySelectorAll('table')
  const t = tabelle[tabelle.length - 1]
  if (!/^Totale imponibile( parziale)?$/.test(t?.querySelector('th')?.textContent ?? '')) {
    throw new Error("la tabella dei totali non è l'ultima del documento")
  }
  return t
}

/** «€ 1.234,56» → 123456: l'IVA si confronta in centesimi interi, senza float. */
function centesimi(testo: string): number {
  const m = /(-?)\s*€?\s*(\d{1,3}(?:\.\d{3})*),(\d{2})/.exec(testo)
  if (!m) return Number.NaN
  const v = Number(m[2].replace(/\./g, '')) * 100 + Number(m[3])
  return m[1] ? -v : v
}

/** Gli importi dell'ultima colonna di una tabella; le righe «da definire» non hanno €. */
function importiColonnaFinale(tabella: Element): number[] {
  return Array.from(tabella.querySelectorAll('tbody td:last-child'))
    .map((td) => td.textContent ?? '')
    .filter((s) => s.includes('€'))
    .map(importo)
}

/**
 * Ogni importo stampato: righe di riepilogo, ultima colonna di ogni tabella
 * (Totale / Importo / Prezzo a corpo; le colonne dei prezzi unitari non sono
 * l'ultima), le voci maniglia «= € …». I prezzi unitari restano coi centesimi.
 */
function importiStampati(righe: Riga[], maniglie: number[], totali: Element): number[] {
  // La tabella dei totali ha l'IVA coi centesimi: la controlla I4, non I0.
  const tabelle = Array.from(document.querySelectorAll('table'))
    .filter((t) => t !== totali)
    .flatMap(importiColonnaFinale)
  return [...righe.map((r) => r.value), ...tabelle, ...maniglie]
}

/**
 * Gli importi delle voci «+ maniglia … × N = € …» sotto le righe porta. Conta solo
 * le voci con importo: sotto una porta da completare (L1) la voce non ha «= €».
 */
function maniglieStampate(): number[] {
  return Array.from(document.querySelectorAll('td > div'))
    .map((d) => d.textContent ?? '')
    .filter((s) => /^\+ maniglia .*= € /.test(s))
    .map((s) => importo(s.slice(s.lastIndexOf('='))))
}

type Controllo = { totale: Riga; addendi: Riga[] }
/**
 * I totali di un blocco con le righe stampate che li compongono. Nel gres anche
 * i subtotali: «Totale lordo» = le righe sopra (materiali, integrazione al minimo,
 * alzatine, lavorazioni, vasca) e «Totale scontato» = lordo − sconto; una riga
 * che entra nel lordo senza essere stampata lo rompe.
 */
function controlliDelBlocco(totale: Riga, blocco: Riga[]): Controllo[] {
  const tra = (re: RegExp) => blocco.filter((b) => re.test(b.label))
  const l = totale.label
  // La cucina stampa una riga sola, il totale (Antonio 12/10, L17): nessun addendo
  // da sommare nel blocco; il suo importo lo controllano I0 e I1.
  if (/cucina$/.test(l)) return []
  if (l === 'Totale Marmeria') {
    const iLordo = blocco.findIndex((b) => b.label === 'Totale lordo')
    const lordo = blocco[iLordo]
    const scontato = blocco.find((b) => b.label === 'Totale scontato')
    if (!lordo || !scontato) return []
    return [
      { totale: lordo, addendi: blocco.slice(0, iLordo) },
      { totale: scontato, addendi: [lordo, ...tra(/^Sconto/)] },
      { totale, addendi: tra(/^(Totale scontato|Rilievo e montaggio)$/) },
    ]
  }
  if (l === 'Totale Su Misura') return [{ totale, addendi: tra(/^(Subtotale falegnameria|Sconto)/) }]
  if (/Porte$/.test(l) || l === 'Totale progetto su misura') return [{ totale, addendi: tra(/^(Subtotale$|Sconto)/) }]
  return []
}

/** Stato leggibile per il messaggio di errore: le sezioni senza gli id di riga. */
/** Id che il catalogo (finto) non sa prezzare: uno sparito e un moltiplicatore. */
const FUORI_CATALOGO = new Set(['voce-tolta-dal-catalogo', 'casse'])

function statoLeggibile(): string {
  return JSON.stringify(useQuoteStore.getState().sezioni, (k, v) => (k === 'id' ? undefined : v))
}

describe('PreventivoPrint — totale stampato = somma dei blocchi stampati (stati casuali)', () => {
  beforeEach(() => {
    usePricelistStore.setState({
      marmeria: validatoPerTest(listinoGresProprieta),
      porte: validatoPerTest(listinoPorte),
    })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null, porte: null })
  })

  it(`${STATI} stati: I0, I1, I2, I3, I4 e I5 valgono in tutti, a uguaglianza esatta`, () => {
    console.info(
      `test a proprietà del PDF: ${STATI} stati, seme ${SEME}` +
        (STATI < STATI_GATE ? ` — run ridotto: il gate è \`npm test\` (${STATI_GATE} stati)` : '')
    )
    const rnd = prng(SEME)
    const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)]
    // PRNG delle aliquote, a parte: non consuma numeri di `rnd`, quindi gli stati di
    // prima di L18 non cambiano (e non cambia la misura dei rami della rule `test`).
    const rndIva = prng((SEME ^ 0x1b18) >>> 0)
    const pickIva = () => ALIQUOTE_IVA[Math.floor(rndIva() * ALIQUOTE_IVA.length)]
    // PRNG degli arredi (L19), a parte come quello delle aliquote.
    const rndArredi = prng((SEME ^ 0x1b19) >>> 0)
    const pickArredi = <T,>(a: readonly T[]): T => a[Math.floor(rndArredi() * a.length)]
    // Stati con almeno due gruppi stampati (I5 non vuoto) e con un articolo assegnato
    // a un arredo tolto, che deve finire in «Altre voci».
    let statiRaggruppati = 0
    let statiArredoTolto = 0
    // Stati con la quota progettazione spalmata nelle righe (L25): senza, la parte
    // di I5 sulle tabelle degli articoli proverebbe solo il caso senza quota.
    let statiQuotaSpalmata = 0
    // Quanti stati stampano più di un'aliquota: se fossero 0, la colonna IVA e la
    // ripartizione fra aliquote non sarebbero mai provate.
    let statiPiuAliquote = 0
    const controesempi: string[] = []
    // Quanti stati stampano almeno una voce maniglia: se fossero 0, il controllo
    // I0 sulle maniglie passerebbe a vuoto.
    let statiConManiglia = 0
    // Idem per le voci cucina fuori catalogo (I3).
    let statiFuoriCatalogo = 0
    // Idem per la porta da completare (altezza 0): senza questo contatore, togliere lo
    // 0 da pick([210, 230, 250, 0]) lascerebbe il test verde senza più provare quel ramo.
    let statiPortaDaCompletare = 0

    for (let i = 0; i < STATI; i++) {
      useQuoteStore.getState().resetAll()
      const s = useQuoteStore.getState()

      if (rnd() < 0.5) {
        s.addArticoloSuMisura({ ...articoloPZ, prezzoUnitario: pick([0, 50, 100, 333.33, 99.95]), quantita: pick([0, 1, 2]) })
      }
      s.setQuotaProgettazione(rnd() < 0.4)
      s.setScontoSezione('arredi', pick([0, 0.1, 0.125]))

      const nRighe = pick([0, 0, 1, 2])
      for (let k = 0; k < nRighe; k++) {
        s.addRigaMateriale({ ...rigaGres, materialeKey: 'k' + k, qtaMq: pick([0, 1.5, 2, 1.37]), prezzoMq: pick([0, 100, 250, 333.33]), totale: 0 })
      }
      if (rnd() < 0.3) s.addRigaAlzatina({ materialeKey: 'a', qtaMl: pick([1, 2.35]), prezzoMl: pick([50, 33.3]), totale: 0 })
      if (rnd() < 0.25) s.addRigaLavorazioneBordo({ lavorazioneId: pick([1, 99]), qtaMl: pick([2, 1.25]), prezzoMl: 10, totale: 20 })
      if (rnd() < 0.25) s.addRigaVaria({ descrizione: 'Foro', um: 'PEZZO', qta: pick([1, 3]), prezzoUnit: 12.5, totale: 0 })
      if (rnd() < 0.25) s.setVasca({ inclusa: true, prezzo: pick([0, VASCA_PREZZO_FINTO, VASCA_PREZZO_FINTO - 0.5]) })
      if (rnd() < 0.4) s.setIncludiRilMont(true)
      s.setScontoSezione('gres', pick([0, 0.05, 0.1]))

      if (rnd() < 0.5) s.setVoceQuantita('base-pensile-laminato', pick([1, 4]))
      // O5: una voce tolta dal catalogo, o un id di moltiplicatore finito fra le voci.
      if (rnd() < 0.2) s.setVoceQuantita(pick([...FUORI_CATALOGO]), pick([1, 3]))
      if (rnd() < 0.3) s.setGiorniExtra(pick([1, 3]))
      if (rnd() < 0.3) s.setExtraManuale({ descrizione: 'Extra', importo: pick([300, -300, 300.5]) })
      if (rnd() < 0.3) s.setAdeguamentoCucina(pick([0, 0.05, 0.125]))
      s.setScontoSezione('cucine', pick([0, 0.1]))

      if (rnd() < 0.35) {
        const altezzaCm = pick([210, 230, 250, 0])
        if (altezzaCm === 0) statiPortaDaCompletare++
        s.addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm })
        if (rnd() < 0.6) {
          const id = useQuoteStore.getState().sezioni.porte!.righe.at(-1)!.id
          // Prezzo coi centesimi: 12,50 × 1 → 13, 37,45 × 2 = 74,90 → 75.
          s.setManigliaPorta(id, { qta: pick([1, 2]), modello: 'M', finitura: '', prezzoUnitario: pick([12.5, 37.45]) })
        }
      }
      if (rnd() < 0.2) s.addBattiscopa('BATTISCOPA MASSELLO')
      s.setScontoSezione('porte', pick([0, 0.1]))

      if (rnd() < 0.35) s.addRigaProgettoValore({ descrizione: 'P', prezzo: pick([0, 500, 1200, 250.5]) })
      s.setScontoSezione('progettoValore', pick([0, 0.1]))

      // Aliquote (L18): metà delle sezioni e metà delle righe ne scelgono una,
      // le altre restano assenti (22 la sezione, «come la sezione» la riga).
      for (const sez of ['arredi', 'gres', 'cucine', 'porte', 'progettoValore'] as const) {
        if (rndIva() < 0.5) s.setAliquotaIvaSezione(sez, pickIva())
      }
      const sezioni = useQuoteStore.getState().sezioni
      for (const a of sezioni.arredi?.articoli ?? []) if (rndIva() < 0.5) s.updateArticoloSuMisura(a.id, { aliquotaIva: pickIva() })
      for (const r of sezioni.porte?.righe ?? []) if (rndIva() < 0.5) s.updateRigaPorta(r.id, { aliquotaIva: pickIva() })
      for (const b of sezioni.porte?.battiscopa ?? []) if (rndIva() < 0.5) s.updateBattiscopa(b.id, { aliquotaIva: pickIva() })

      // Arredi (L19), dopo le aliquote e da `rndArredi`.
      const nInPiu = Math.floor(rndArredi() * 4)
      for (let k = 0; k < nInPiu; k++) {
        s.addArticoloSuMisura({
          ...articoloPZ,
          descrizione: `Elemento ${k}`,
          prezzoUnitario: pickArredi([50, 99.95, 333.33]),
          quantita: pickArredi([1, 2]),
          ...(rndArredi() < 0.5 ? { aliquotaIva: pickArredi(ALIQUOTE_IVA) } : {}),
        })
      }
      const idArredi = ['Ingresso', 'Matrimoniale', 'Studio', 'Cameretta']
        .slice(0, Math.floor(rndArredi() * 5))
        .map((nome) => s.addArredo(nome))
      for (const a of useQuoteStore.getState().sezioni.arredi?.articoli ?? []) {
        const r = rndArredi()
        let arredoId: string | undefined
        if (r < 0.15) arredoId = 'arredo-tolto'
        else if (r >= 0.4 && idArredi.length > 0) arredoId = pickArredi(idArredi)
        s.updateArticoloSuMisura(a.id, { arredoId })
      }

      const { unmount } = render(<PreventivoPrint />)
      const righe = righeRiepilogo()
      const totaliDiBlocco = righe.filter((r) => eTotaleDiBlocco(r.label))
      const sommaBlocchi = totaliDiBlocco.reduce((a, r) => a + r.value, 0)
      // Dalla tabella dei totali, non da `totaleStampato()`: un `getByText` su tutto
      // il DOM a ogni stato costava quanto il resto dei controlli (L18, tetto di 60 s).
      const totali = tabellaTotali()
      const totale = importo(totali.querySelector('td')?.textContent ?? '')

      const maniglie = maniglieStampate()
      if (maniglie.length > 0) statiConManiglia++
      const nonInteri = [...importiStampati(righe, maniglie, totali), totale].filter((v) => !Number.isInteger(v))
      if (nonInteri.length > 0) {
        controesempi.push(`stato #${i} · I0: importi stampati non interi ${nonInteri.join(', ')}\n  ${statoLeggibile()}`)
      }

      if (totale !== sommaBlocchi) {
        controesempi.push(
          `stato #${i} · I1: TOTALE stampato ${totale.toFixed(2)}, Σ blocchi stampati ${sommaBlocchi.toFixed(2)}\n  ${statoLeggibile()}`
        )
      }

      let inizio = 0
      righe.forEach((r, idx) => {
        if (!eTotaleDiBlocco(r.label)) return
        const controlli = controlliDelBlocco(r, righe.slice(inizio, idx))
        inizio = idx + 1
        for (const { totale: t, addendi } of controlli) {
          const somma = addendi.reduce((a, b) => a + b.value, 0)
          if (somma !== t.value) {
            controesempi.push(
              `stato #${i} · I2 «${t.label}»: righe stampate ${somma.toFixed(2)}, totale stampato ${t.value.toFixed(2)}\n  ${statoLeggibile()}`
            )
          }
        }
      })

      // Le intestazioni delle tabelle gres in una passata sola sui div senza figli,
      // invece di quattro `queryByText` sull'intero documento (stesso esito, L18).
      const etichette = new Map<string, Element>()
      document.querySelectorAll('div').forEach((d) => {
        if (d.childElementCount === 0) etichette.set(d.textContent ?? '', d)
      })
      for (const [titolo, labelTotale] of TABELLE_GRES) {
        const intestazione = etichette.get(titolo)
        if (!intestazione) continue
        const somma = importiColonnaFinale(intestazione.nextElementSibling as Element).reduce((a, b) => a + b, 0)
        const totaleTabella = righe.find((r) => r.label === labelTotale)?.value
        if (somma !== totaleTabella) {
          controesempi.push(
            `stato #${i} · I2 tabella «${titolo}»: righe ${somma}, «${labelTotale}» ${totaleTabella}\n  ${statoLeggibile()}`
          )
        }
      }
      // I4 (L18): quote IVA, imposte e totale IVA compresa, in centesimi interi.
      const righeTotali = Array.from(totali.querySelectorAll('tr')).map((tr) => ({
        label: tr.querySelector('th')?.textContent ?? '',
        cent: centesimi(tr.querySelector('td')?.textContent ?? ''),
      }))
      const righeIva = righeTotali.flatMap((r) => {
        const m = /^IVA (\d+)% su (.+)$/.exec(r.label)
        return m ? [{ aliquota: Number(m[1]), quota: centesimi(m[2]), imposta: r.cent }] : []
      })
      const ivato = righeTotali.find((r) => /^TOTALE( PARZIALE)? \(IVA compresa\)$/.test(r.label))?.cent
      const sommaQuote = righeIva.reduce((a, r) => a + r.quota, 0)
      const sommaImposte = righeIva.reduce((a, r) => a + r.imposta, 0)
      const impostaSbagliata = righeIva.find((r) => r.imposta !== Math.round((r.quota / 100) * r.aliquota))
      const colonnaIva = Array.from(document.querySelectorAll('th')).some((th) => th.textContent === 'IVA')
      // Una sezione a corpo senza righe (cucina, gres di sola vasca) non ha tabelle:
      // con sole sezioni così le aliquote possono essere due e la colonna non c'è.
      const tabelleDiVoci = document.querySelectorAll('thead').length > 0
      if (righeIva.length > 1) statiPiuAliquote++
      if (
        sommaQuote !== totale * 100 ||
        impostaSbagliata ||
        ivato !== totale * 100 + sommaImposte ||
        colonnaIva !== (righeIva.length > 1 && tabelleDiVoci)
      ) {
        controesempi.push(
          `stato #${i} · I4: imponibile ${totale}, Σ quote ${sommaQuote / 100}, Σ imposte ${sommaImposte / 100}, ` +
            `ivato ${(ivato ?? Number.NaN) / 100}, colonna IVA ${colonnaIva}, aliquote ${righeIva.map((r) => r.aliquota).join('/')}\n  ${statoLeggibile()}`
        )
      }

      // I5 (L19): arredi raggruppati, stesso totale di sezione.
      const quoteSM = useQuoteStore.getState().sezioni.arredi
      if (quoteSM && quoteSM.articoli.length > 0) {
        const senzaGruppi = calcSuMisuraArticoli(
          quoteSM.articoli.map((a) => ({ ...a, arredoId: undefined })),
          quoteSM.quotaProgettazione,
          quoteSM.sconto
        ).totale
        const stampato = righe.find((r) => r.label === 'Totale Su Misura')?.value
        const subtotaliGruppi = righe.filter((r) => /^Subtotale (?!falegnameria$)./.test(r.label))
        const subtotaleSezione = righe.find((r) => r.label === 'Subtotale falegnameria')?.value
        const sommaGruppi = subtotaliGruppi.reduce((a, r) => a + r.value, 0)
        if (subtotaliGruppi.length > 1) statiRaggruppati++
        if (quoteSM.articoli.some((a) => a.arredoId === 'arredo-tolto') && subtotaliGruppi.length > 0) statiArredoTolto++
        // L25: tutte le tabelle degli articoli (colonna €/unit) sommano al «Subtotale
        // falegnameria», e nessuna riga «Quota progettazione» resta nel riepilogo.
        const sommaTabelleArticoli = Array.from(document.querySelectorAll('table'))
          .filter((t) => Array.from(t.querySelectorAll('th')).some((th) => th.textContent === '€/unit'))
          .flatMap(importiColonnaFinale)
          .reduce((a, b) => a + b, 0)
        const rigaQuota = righe.some((r) => /progettazione/i.test(r.label))
        if (quoteSM.quotaProgettazione && sommaTabelleArticoli > 0) statiQuotaSpalmata++
        // Ogni gruppo: la riga «Subtotale <nome>» sta nel div sotto la sua tabella.
        const tabelleSbagliate = Array.from(document.querySelectorAll('div'))
          .filter((d) => d.childElementCount === 2 && d.children[0].tagName === 'SPAN')
          .filter((d) => /^Subtotale (?!falegnameria$)./.test(d.children[0].textContent ?? ''))
          .filter((d) => {
            const tabella = d.parentElement?.previousElementSibling
            const somma = tabella?.tagName === 'TABLE' ? importiColonnaFinale(tabella).reduce((a, b) => a + b, 0) : Number.NaN
            return somma !== importo(d.children[1].textContent ?? '')
          })
        if (
          stampato !== senzaGruppi ||
          (subtotaliGruppi.length > 0 && sommaGruppi !== subtotaleSezione) ||
          subtotaliGruppi.length > 0 !== ((quoteSM.arredi?.length ?? 0) > 0) ||
          tabelleSbagliate.length > 0 ||
          sommaTabelleArticoli !== subtotaleSezione ||
          rigaQuota
        ) {
          controesempi.push(
            `stato #${i} · I5: «Totale Su Misura» ${stampato}, senza gruppi ${senzaGruppi}, Σ subtotali ${sommaGruppi}, ` +
              `«Subtotale falegnameria» ${subtotaleSezione}, Σ tabelle articoli ${sommaTabelleArticoli}, riga quota ${rigaQuota}, ` +
              `gruppi ${subtotaliGruppi.length}, tabelle sbagliate ${tabelleSbagliate.length}\n  ${statoLeggibile()}`
          )
        }
      }

      // I3 (O5): la cucina si dice parziale, e il TOTALE con lei, se e solo se ha
      // una voce che il catalogo non sa prezzare.
      const fuori = (useQuoteStore.getState().sezioni.cucine?.voci ?? []).some((v) => FUORI_CATALOGO.has(v.voceId))
      if (fuori) statiFuoriCatalogo++
      const cucinaParziale = righe.some((r) => r.label === 'Totale parziale cucina')
      const testo = document.body.textContent ?? ''
      if (cucinaParziale !== fuori || (fuori && !(/TOTALE PARZIALE/.test(testo) && testo.includes('totale parziale — Cucina')))) {
        controesempi.push(`stato #${i} · I3: voce fuori catalogo ${fuori}, «Totale parziale cucina» ${cucinaParziale}\n  ${statoLeggibile()}`)
      }
      unmount()
    }

    // Lo stato più basso fra i controesempi è il primo, perché il ciclo li scrive in ordine.
    const primo = Number(/^stato #(\d+)/.exec(controesempi[0] ?? '')?.[1])
    const riproduzione = `SEME_PROPRIETA=${SEME} STATI_PROPRIETA=${primo + 1} npx vitest run src/components/print/__tests__/PreventivoPrintTotale.test.tsx`
    expect(
      controesempi.length,
      `${controesempi.length} controesempi su ${STATI} stati, seme ${SEME}; i primi 3:\n${controesempi.slice(0, 3).join('\n')}\nper rigiocare fino al primo: ${riproduzione}`
    ).toBe(0)
    expect(statiConManiglia, `nessuno dei ${STATI} stati (seme ${SEME}) stampa una maniglia: il controllo I0 sulle maniglie è vuoto`).toBeGreaterThan(0)
    expect(statiFuoriCatalogo, `nessuno dei ${STATI} stati (seme ${SEME}) ha una voce fuori catalogo: il controllo I3 è vuoto`).toBeGreaterThan(0)
    expect(statiPortaDaCompletare, `nessuno dei ${STATI} stati (seme ${SEME}) ha una porta da completare: il ramo di L1 è vuoto`).toBeGreaterThan(0)
    expect(statiPiuAliquote, `nessuno dei ${STATI} stati (seme ${SEME}) stampa più di un'aliquota: I4 sulla ripartizione è vuoto`).toBeGreaterThan(0)
    expect(statiRaggruppati, `nessuno dei ${STATI} stati (seme ${SEME}) stampa due gruppi di arredi: I5 è vuoto`).toBeGreaterThan(0)
    expect(statiArredoTolto, `nessuno dei ${STATI} stati (seme ${SEME}) ha un articolo di un arredo tolto: «Altre voci» non è provata`).toBeGreaterThan(0)
    expect(statiQuotaSpalmata, `nessuno dei ${STATI} stati (seme ${SEME}) spalma la quota progettazione: I5 con la quota è vuoto`).toBeGreaterThan(0)
    // STATI render SINCRONI (400 nel gate): il timeout non può interromperli, li giudica
    // a fine corsa. A 400 stati il file dura 6-10 s da solo; nella suite intera, a
    // macchina carica, è arrivato a 32 s (08/10, load 17-20). Il tempo è lineare in
    // STATI. 60 s resta un tetto contro un blocco vero, non una misura di velocità:
    // chi alza STATI di molto oltre 400 deve alzarlo.
  }, 60_000)
})
