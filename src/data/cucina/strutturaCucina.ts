import type { CatalogoCucina, ListinoCucina, VoceCatalogo, VoceSenzaPrezzo, VoceStrutturaCucina } from '@/types/cucina'

// ── STRUTTURA CUCINA (senza prezzi) ──
// Le 56 voci del foglio CUCINA, con `id` slug stabili e `nome` verbatim dal
// foglio: blocco, kind, unità e le percentuali di casse e ante. I prezzi, la
// tariffa dei giorni e la vasca NON stanno qui: sono sensibili (D7) e li porta
// il listino cucine nel bucket, abbinato per nome dal parser (PR 10b-1) e
// composto con questa struttura da `componiCatalogoCucina` (PR 10b-2). I test
// girano sul listino finto di `src/test-utils/catalogoCucinaFinto.ts`.
//
// Confini blocchi (righe del foglio):
//   base      E4:E21   → PRIMO TOTALE (E22)
//   [molt.]   E23,E24  → +casse/ante su E22 → TOTALE CASSE+ANTE (E25), cumulabili
//   opzionali E26:E47  → TOTALE OPZIONALI (E48)  — LED (E42) è QUI, contata una sola volta
//   open      E54:E67  → TOTALE OPEN (E68)        — include 2 toggle-fisso isole (E61/E63)

export const catalogoSenzaPrezzi: readonly VoceSenzaPrezzo[] = [
  // ── Blocco BASE (E4:E21) → PRIMO TOTALE (E22) — tutte 'qty', PEZZO ──
  { id: 'base-pensile-laminato', nome: String.raw`BASE\PENSILE LAMINATO`, blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'base-pensile-laminato-900', nome: 'BASE PENSILE LAMINATO >900', blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'base-pensile-laccato', nome: String.raw`BASE\PENSILE LACCATO`, blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'base-pensile-laccato-900', nome: 'BASE PENSILE LACCATO>900', blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'base-pensile-finitura-speciale', nome: 'BASE PENSILE FINITURA SPECIALE', blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'base-pensile-finitura-speciale-900', nome: 'BASE PENSILE FINITURA SPECIALE>900', blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'base-pensile-impiallacciato', nome: String.raw`BASE\PENSILE IMPIALLACCIATO`, blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'base-pensile-impiallacciato-900', nome: String.raw`BASE\PENSILE IMPIALLACCIATO >900`, blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'colonna-210-laminato', nome: 'COLONNA  210 LAMINATO', blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'colonna-210-laccato', nome: 'COLONNA 210 LACCATO', blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'colonna-210-impiallacciato', nome: 'COLONNA 210 IMPIALLACCIATO', blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'colonna-extra-210-laminato', nome: 'COLONNA EXTRA 210 LAMINATO', blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'colonna-extra-210-laccato', nome: 'COLONNA EXTRA 210 LACCATO', blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'colonna-extra-210-impiallacciato', nome: 'COLONNA EXTRA 210 IMPIALLACCIATO', blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'colonna-fuorimisura', nome: 'COLONNA FUORIMISURA (IN ALTEZZA E LARGHEZZA)', blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'base-pensile-angolo-laccato-impiallacciato', nome: 'BASE PENSILE ANGOLO LACCATO/impiallacciato', blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'base-pensile-angolo-laminato', nome: String.raw`BASE\PENSILE ANGOLO LAMINATO`, blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'anta-vetro-visarm', nome: 'ANTA IN VETRO VISARM 6/8 CON CERNIERE SALICE', blocco: 'base', kind: 'qty', unita: 'PEZZO' },

  // ── Moltiplicatori su PRIMO TOTALE (E23/E24) → TOTALE CASSE+ANTE (E25) — cumulabili ──
  // NB: nel foglio entrambe le etichette dicono "CASSE"; nel modello di Antonio la
  // +10% è "casse" (E23) e la +20% è "ante" (E24). `id` = handle del modello,
  // `nome` = testo verbatim del foglio (l'etichetta UI si rifinisce allo Stadio C).
  { id: 'casse', nome: 'CASSE IN LAMINATO A SCELTA ABET/LAMICOLOR', blocco: 'base', kind: 'moltiplicatore', percentuale: 0.1 },
  { id: 'ante', nome: 'CASSE IN LAMINATO A SCELTA SMART/METALLO', blocco: 'base', kind: 'moltiplicatore', percentuale: 0.2 },

  // ── Blocco OPZIONALI (E26:E47) → TOTALE OPZIONALI (E48) ──
  { id: 'gola-alluminio-legno', nome: 'GOLA IN ALLUMINIO/LEGNO', blocco: 'opzionali', kind: 'qty', unita: 'ML' },
  { id: 'maniglia-su-anta', nome: 'MANIGLIA SU ANTA ML', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'maniglia-metallo-custom', nome: 'MANIGLIA METALLO CUSTOM ', blocco: 'opzionali', kind: 'qty', unita: 'ML' },
  { id: 'cassetto-cestone', nome: String.raw`CASSETTO\CESTONE`, blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'cassetto-blum-alluminio', nome: 'CASSETTO BLUM IN ALLUMINIO', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'cassetto-120-70kg', nome: 'CASSETTO 120 PORTATA 70KG', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'cassetto-coda-di-rondine', nome: 'CASSETTO CON CODA DI RONDINE', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'cesto-estrazione-300-sige', nome: 'CESTO ESTRAZIONE 300MM SIGE ', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'blum-revego-anta-scomparsa', nome: 'SISTEMA BLUM REVEGO ANTA SCOMPARSA', blocco: 'opzionali', kind: 'qty', unita: 'ANTA' },
  { id: 'portapattumiera-differenziata', nome: 'PORTAPATTUMIERA DIFFERENZIATA', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'cestello-corner-vibo', nome: 'CESTELLO CORNER VIBO', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'colonna-vibo-metalstyle-galaxy', nome: 'COLONNA VIBO METALSTYLE GALAXY RANGE', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'scolapiatti', nome: 'SCOLAPIATTI', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'tubo-espulsione-cappa', nome: 'TUBO ESPULSIONE CAPPA', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'presa-italia-schuco-eubiq', nome: 'PRESA ITALIA/SCHUCO EUBIQ', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'portaposate-acciaio-legno', nome: 'PORTAPOSATE ACCIAIO/LEGNO', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'striscia-led', nome: 'STRISCIA LED (al ml)', blocco: 'opzionali', kind: 'qty', unita: 'ML' },
  { id: 'sensore-incasso-led', nome: 'SENSORE INCASSO LED', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'trasformatore', nome: 'TRASFORMATORE', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'faretto-led', nome: 'FARETTO LED ', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'multipresa-evoline', nome: 'MULTIPRESA EVOLINE', blocco: 'opzionali', kind: 'qty', unita: 'PEZZO' },
  { id: 'braccetto-salice-wind-pacta', nome: 'BRACCETTO SALICE WIND / SALICE PACTA', blocco: 'opzionali', kind: 'qty', unita: 'COPPIA' },

  // ── Blocco OPEN (E54:E67) → TOTALE OPEN (E68) — 12 'qty' + 2 'toggleFisso' isole ──
  { id: 'fianco-finitura-doppia', nome: 'FIANCO IN FINITURA DOPPIA', blocco: 'open', kind: 'qty', unita: 'PEZZO' },
  { id: 'struttura-giorno-laminato-25-40', nome: String.raw`STRUTTURA A GIORNO LAMINATO 25\40`, blocco: 'open', kind: 'qty', unita: 'MQ' },
  { id: 'struttura-giorno-impiallaccio-25-40', nome: 'STRUTTURA A GIORNO IMPIALLACCIO 25/40', blocco: 'open', kind: 'qty', unita: 'MQ' },
  { id: 'struttura-giorno-laccato-25-40', nome: 'STRUTTURA A GIORNO LACCATO 25/40', blocco: 'open', kind: 'qty', unita: 'MQ' },
  { id: 'struttura-giorno-impiallaccio-50-60', nome: 'STRUTTURA A GIORNO IMPIALLACCIO 50/60', blocco: 'open', kind: 'qty', unita: 'MQ' },
  { id: 'struttura-giorno-laccato-50-60', nome: 'STRUTTURA A GIORNO LACCATO 50/60', blocco: 'open', kind: 'qty', unita: 'MQ' },
  { id: 'isola-laminato-240x90', nome: 'ISOLA LAMINATO MAX 240X90 (CESTONI NON INCLUSI)', blocco: 'open', kind: 'qty', unita: 'PEZZO' },
  { id: 'isola-laminato-fuorimisura', nome: 'ISOLA LAMINATO FUORIMISURA', blocco: 'open', kind: 'toggleFisso' },
  { id: 'isola-laccato-impiallacciato-240x90', nome: 'ISOLA LACCATO/IMPIALLACCIATO 240X90 (CESTONI NON INCLUSI)', blocco: 'open', kind: 'qty', unita: 'PEZZO' },
  { id: 'isola-laccato-impiallacciato-fuorimisura', nome: 'ISOLA LACCATO/IMPIALLACCIATO FUORIMISURA', blocco: 'open', kind: 'toggleFisso' },
  { id: 'pannello-retro-isola', nome: 'PANNELLO RETRO ISOLA', blocco: 'open', kind: 'qty', unita: 'PEZZO' },
  { id: 'cappa-su-misura-falmec', nome: 'CAPPA SU MISURA (INCLUSA CAPPA FALMEC GRUPPO INCASSO)', blocco: 'open', kind: 'qty', unita: 'PEZZO' },
  { id: 'cornice-chiusura', nome: 'CORNICE CHIUSURA', blocco: 'open', kind: 'qty', unita: 'ML' },
  { id: 'pannello-stampato-decorprint', nome: 'PANNELLO STAMPATO DECORPRINT', blocco: 'open', kind: 'qty', unita: 'MQ' },
]

/**
 * La struttura SENZA percentuali: id, nome, blocco, kind, unità. È ciò che il
 * parser del foglio CUCINA riceve nel worker per abbinare i nomi (PR 10b-1).
 */
export const strutturaCucina: readonly VoceStrutturaCucina[] = catalogoSenzaPrezzi.map((v) => ({
  id: v.id,
  nome: v.nome,
  blocco: v.blocco,
  kind: v.kind,
  unita: v.kind === 'qty' ? v.unita : null,
}))

/**
 * Il catalogo dell'engine: la struttura del codice con i prezzi del listino,
 * per id. Una voce che il listino non prezza resta fuori (la pagina non la
 * offre; se era già scelta è «da definire», O5). Casse e ante vengono dal
 * codice: le percentuali del file servono solo al referto.
 */
export function componiCatalogoCucina(listino: Pick<ListinoCucina, 'prezzi' | 'giornoRate'>): CatalogoCucina {
  const prezzi = new Map(listino.prezzi.map((p) => [p.id, p.prezzo]))
  const voci: VoceCatalogo[] = []
  for (const v of catalogoSenzaPrezzi) {
    if (v.kind === 'moltiplicatore') {
      voci.push(v)
      continue
    }
    const prezzo = prezzi.get(v.id)
    if (prezzo !== undefined) voci.push({ ...v, prezzo })
  }
  return { voci, giornoRate: listino.giornoRate }
}

/**
 * Validatore fail-loud della struttura (convenzione data/finiture): id univoci,
 * percentuali in (0,1] sui moltiplicatori. Chiamato dal test.
 */
export function validateStrutturaCucina(): void {
  const ids = catalogoSenzaPrezzi.map((v) => v.id)
  const dupl = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dupl.length > 0) {
    throw new Error(`strutturaCucina: id duplicati → ${[...new Set(dupl)].join(', ')}`)
  }
  for (const v of catalogoSenzaPrezzi) {
    if (v.kind === 'moltiplicatore' && !(v.percentuale > 0 && v.percentuale <= 1)) {
      throw new Error(`strutturaCucina: percentuale non valida per "${v.id}" (${v.percentuale})`)
    }
  }
}
