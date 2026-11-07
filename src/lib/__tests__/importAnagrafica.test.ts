import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test-utils/supabaseFinto')).supabaseFinto.client,
  LISTINI_BUCKET: 'Listini',
}))

import { supabaseFinto, clienteFinto, EMAIL_FINTA, TELEFONO_FINTO, RAGIONE_SOCIALE_FINTA, DATI_FINTI } from '@/test-utils/supabaseFinto'
import { spiaConsole } from '@/test-utils/spiaConsole'
import { csvFinto } from '@/test-utils/anagraficaFinta'
import { leggiCsvAnagrafica } from '@/lib/anagraficaCsv'
import { pianificaImport, type Scelta } from '@/lib/confrontoAnagrafica'
import {
  campiDaRiempire,
  eseguiImport,
  leggiPerConfronto,
  COLONNE_CONFRONTO,
  LOTTO_IMPORT,
  MSG_FERMO_NON_CONSENTITO,
  MSG_FERMO_SCONOSCIUTO,
  MSG_FERMO_SESSIONE,
  MSG_FERMO_TROPPE,
} from '@/lib/importAnagrafica'
import { MSG_ERRORE_RETE } from '@/lib/erroriDb'

const passi = (i: number) => supabaseFinto.chiamate[i].passi
const passo = (i: number, nome: string) => passi(i).find(([p]) => p === nome)?.[1]

/** Il file finto della prova: un cliente nuovo, uno già importato, un doppione di quello creato a mano. */
const FILE = csvFinto([
  { codice: '301', ragione: 'Nuovo Prova Srl', telefono: '000 3000001', email: 'nuovo@example.test', segnalazioni: 'telefono da verificare' },
  { codice: '302', ragione: 'Già Importato Prova', telefono: '000 3000002', indirizzo: 'Via del File 2', note: 'dal gestionale' },
  { codice: '303', ragione: `Sig.ra ${RAGIONE_SOCIALE_FINTA}`, telefono: '000 3000003', email: 'dal.file@example.test', indirizzo: 'Via del File 3', cap: '00003' },
])
const { righe } = leggiCsvAnagrafica(FILE)
/** Creato a mano da Antonio nell'app: senza codice, con telefono ed email scritti a mano. */
const A_MANO = clienteFinto({ id: 'a-1', indirizzo: null, cap: null, localita: 'Scritta a Mano' })
const GIA = clienteFinto({ id: 'g-2', codice_gestionale: '302', ragione_sociale: 'Già Importato Prova', telefono: null, email: null, indirizzo: 'Via Corretta a Mano', cap: null, localita: null, provincia: null, note: null })
const piano = pianificaImport(righe, [A_MANO], new Map([['302', 'g-2']]))

const spia = spiaConsole()
beforeEach(() => {
  supabaseFinto.reset()
  spia.avvia()
})
afterEach(() => {
  expect(spia.trovati(DATI_FINTI)).toEqual([])
  spia.ripristina()
})

describe('importAnagrafica — lettura per il confronto (selettore minimo)', () => {
  it('scarica dei clienti senza codice solo i campi del confronto, dei clienti col codice solo id e codice; pagina fino alla pagina vuota', async () => {
    supabaseFinto.risposte.push(
      { data: [A_MANO], error: null },
      { data: [], error: null },
      { data: [{ id: 'g-2', codice_gestionale: '302' }], error: null },
      { data: [], error: null }
    )
    const esito = await leggiPerConfronto()
    expect(esito.ok).toBe(true)
    if (!esito.ok) return
    // F3 (verdetto del 15/10): in più solo località e partita IVA, per riconoscere un omonimo.
    expect(COLONNE_CONFRONTO).toBe('id, ragione_sociale, nome, cognome, email, telefono, localita, partita_iva')
    expect(passo(0, 'select')).toEqual([COLONNE_CONFRONTO])
    expect(passo(0, 'is')).toEqual(['codice_gestionale', null])
    expect(passo(2, 'select')).toEqual(['id, codice_gestionale'])
    expect(passo(2, 'not')).toEqual(['codice_gestionale', 'is', null])
    // La pagina dopo parte da dove è finita la prima, qualunque sia il tetto di PostgREST.
    expect(passo(0, 'range')).toEqual([0, 999])
    expect(passo(1, 'range')).toEqual([1, 1000])
    expect(esito.dato.conCodice.get('302')).toBe('g-2')
    expect(esito.dato.senzaCodice.map((c) => c.id)).toEqual(['a-1'])
  })

  it('un errore di lettura arriva senza dati personali', async () => {
    supabaseFinto.risposte.push({ data: null, error: { code: '42501', message: EMAIL_FINTA } })
    const esito = await leggiPerConfronto()
    expect(esito).toEqual({ ok: false, errore: 'Operazione non consentita per questo account.', codice: '42501' })
  })
})

describe('campiDaRiempire — i campi vuoti si riempiono, quelli scritti a mano no', () => {
  it('solo i campi vuoti (o di soli spazi) dell’app, solo con un valore del file', () => {
    expect(campiDaRiempire(clienteFinto({ indirizzo: '  ', cap: null }), righe[2])).toEqual({ indirizzo: 'Via del File 3', cap: '00003' })
    // Telefono vuoto nell'app ma anche nel file: niente; indirizzo e CAP scritti a mano: restano.
    expect(campiDaRiempire(clienteFinto({ telefono: null }), { ...righe[2], telefono: null })).toEqual({})
  })
})

describe('eseguiImport — scrittura a lotti, un esito per riga', () => {
  it('«Collega» dà il codice e riempie i campi vuoti senza sovrascrivere quelli scritti a mano; nuovi a lotti; esistenti solo dove mancava', async () => {
    const scelte = new Map<number, Scelta>([[4, { tipo: 'collega', clienteId: 'a-1' }]])
    supabaseFinto.risposte.push(
      { data: [A_MANO, GIA], error: null }, // lettura dei clienti da aggiornare
      { data: { id: 'g-2' }, error: null }, // aggiornamento del già importato
      { data: { id: 'a-1' }, error: null }, // collegamento
      { data: [{ codice_gestionale: '301' }], error: null } // lotto dei nuovi
    )
    const avanzamento: number[] = []
    const esito = await eseguiImport(piano, scelte, (fatte) => avanzamento.push(fatte))
    expect(esito).toEqual({ importati: 1, aggiornati: 1, invariati: 0, collegati: 1, saltati: 0, scartate: [], fermato: null })
    expect(avanzamento.at(-1)).toBe(3)

    expect(passo(0, 'in')).toEqual(['id', ['g-2', 'a-1']])
    // Già importato: solo i campi vuoti, l'indirizzo corretto a mano resta.
    expect(passo(1, 'update')).toEqual([{ telefono: '000 3000002', note: 'dal gestionale' }])
    expect(passo(1, 'eq')).toEqual(['id', 'g-2'])
    // Collega: codice e campi vuoti; telefono ed email scritti a mano non si toccano.
    const collega = passo(2, 'update')?.[0] as Record<string, unknown>
    expect(collega).toEqual({ codice_gestionale: '303', indirizzo: 'Via del File 3', cap: '00003' })
    expect(collega).not.toHaveProperty('telefono')
    expect(collega).not.toHaveProperty('email')
    expect(collega).not.toHaveProperty('ragione_sociale')
    expect(passi(2).filter(([p]) => p === 'eq')).toEqual([['eq', ['id', 'a-1']], ['eq', ['updated_at', A_MANO.updated_at]]])
    expect(passo(2, 'is')).toEqual(['codice_gestionale', null])
    // Nuovi: il codice e i campi del file, mai `segnalazioni` né il numero di riga.
    expect(passo(3, 'insert')).toEqual([
      [{ codice_gestionale: '301', ragione_sociale: 'Nuovo Prova Srl', telefono: '000 3000001', email: 'nuovo@example.test', indirizzo: null, cap: null, localita: null, provincia: null, partita_iva: null, note: null }],
    ])
  })

  it('«Crea nuovo» e «Salta»: il doppione si inserisce come nuovo, o non si scrive', async () => {
    supabaseFinto.risposte.push({ data: [GIA], error: null }, { data: { id: 'g-2' }, error: null }, { data: [{}, {}], error: null })
    const crea = await eseguiImport(piano, new Map([[4, { tipo: 'nuovo' }]]))
    expect(crea).toMatchObject({ importati: 2, collegati: 0, saltati: 0 })
    expect(passo(2, 'insert')?.[0] as unknown[]).toHaveLength(2)

    supabaseFinto.reset()
    supabaseFinto.risposte.push({ data: [GIA], error: null }, { data: { id: 'g-2' }, error: null }, { data: [{}], error: null })
    const salta = await eseguiImport(piano, new Map([[4, { tipo: 'salta' }]]))
    expect(salta).toMatchObject({ importati: 1, collegati: 0, saltati: 1 })
  })

  it('nessuna scelta per un doppione: l’import non parte, nessuna chiamata', async () => {
    await expect(eseguiImport(piano, new Map())).rejects.toThrow(/manca la scelta/)
    expect(supabaseFinto.chiamate).toEqual([])
  })

  it('rilancio senza duplicati: col codice già nell’app e niente da riempire, nessuna scrittura', async () => {
    const tuttiImportati = pianificaImport(righe.slice(0, 2), [], new Map([['301', 'g-1'], ['302', 'g-2']]))
    supabaseFinto.risposte.push({
      data: [
        clienteFinto({ id: 'g-1', codice_gestionale: '301', telefono: '000 3000001', email: 'nuovo@example.test' }),
        { ...GIA, telefono: '000 3000002', note: 'dal gestionale' },
      ],
      error: null,
    })
    const esito = await eseguiImport(tuttiImportati, new Map())
    expect(esito).toEqual({ importati: 0, aggiornati: 0, invariati: 2, collegati: 0, saltati: 0, scartate: [], fermato: null })
    expect(supabaseFinto.chiamate).toHaveLength(1)
  })

  it('un lotto rifiutato si riprova riga per riga: ogni riga il suo esito; il codice già usato lo dice', async () => {
    const soloNuovi = pianificaImport(righe.slice(0, 2), [], new Map())
    supabaseFinto.risposte.push(
      { data: null, error: { code: '23505', message: `Key (codice_gestionale)=(302) ${EMAIL_FINTA}` } },
      { data: { codice_gestionale: '301' }, error: null },
      { data: null, error: { code: '23505', message: TELEFONO_FINTO } }
    )
    const esito = await eseguiImport(soloNuovi, new Map())
    expect(esito.importati).toBe(1)
    expect(esito.scartate).toEqual([{ riga: 3, motivo: 'il codice gestionale c’è già nell’anagrafica: rilancia l’import per aggiornare il cliente' }])
    expect(JSON.stringify(esito)).not.toContain(EMAIL_FINTA)
  })

  it('un lotto perso per la rete non si riprova: l’import si ferma, esito sconosciuto, il rilancio non duplica', async () => {
    const soloNuovi = pianificaImport(righe.slice(0, 2), [], new Map())
    supabaseFinto.risposte.push(new Error('Failed to fetch'))
    const esito = await eseguiImport(soloNuovi, new Map())
    expect(esito.importati).toBe(0)
    expect(esito.scartate).toEqual([])
    expect(esito.fermato).toEqual({ motivo: MSG_FERMO_SCONOSCIUTO, righe: [2, 3] })
    expect(supabaseFinto.chiamate).toHaveLength(1)
    expect(MSG_ERRORE_RETE).toBeTruthy()
  })

  it('un cliente modificato da un’altra parte durante l’import non si sovrascrive (lock), uno che ha già un codice non si collega', async () => {
    supabaseFinto.risposte.push(
      { data: [{ ...A_MANO, codice_gestionale: '999' }, GIA], error: null },
      { data: null, error: null }, // lock: zero righe
      { data: [{}], error: null }
    )
    const esito = await eseguiImport(piano, new Map([[4, { tipo: 'collega', clienteId: 'a-1' }]]))
    expect(esito).toMatchObject({ importati: 1, aggiornati: 0, collegati: 0 })
    expect(esito.scartate).toEqual([
      { riga: 3, motivo: 'il cliente è stato modificato da un’altra parte durante l’import: rilancia l’import' },
      { riga: 4, motivo: 'il cliente dell’app ha già un codice gestionale: rilancia l’import' },
    ])
  })

  it('la lettura dei clienti da aggiornare fallisce: l’import si ferma prima di scrivere, senza dati nel motivo', async () => {
    supabaseFinto.risposte.push({ data: null, error: { code: 'PGRST301', message: EMAIL_FINTA }, status: 401 })
    const esito = await eseguiImport(piano, new Map([[4, { tipo: 'collega', clienteId: 'a-1' }]]))
    expect(esito).toMatchObject({ importati: 0, collegati: 0, scartate: [], fermato: { motivo: MSG_FERMO_SESSIONE, righe: [2, 3, 4] } })
    expect(supabaseFinto.chiamate).toHaveLength(1)
  })

  describe('verdetto del 15/10 — DB-1 e DB-2: un errore che vale per tutti ferma l’import', () => {
    const tre = pianificaImport(righe, [], new Map())
    const tanti = pianificaImport(
      Array.from({ length: LOTTO_IMPORT + 2 }, (_, i) => ({ ...righe[0], riga: i + 2, codice_gestionale: `M${i}` })),
      [],
      new Map()
    )

    it('DB-1. un lotto scritto con risposta 502 (senza codice) è «esito sconosciuto»: niente ripiego riga per riga, niente falsi scarti', async () => {
      supabaseFinto.risposte.push({ data: null, error: { message: 'Bad Gateway' }, status: 502 })
      const esito = await eseguiImport(tre, new Map())
      expect(esito).toMatchObject({ importati: 0, scartate: [], fermato: { motivo: MSG_FERMO_SCONOSCIUTO, righe: [2, 3, 4] } })
      expect(supabaseFinto.chiamate).toHaveLength(1)
    })

    it('DB-1. 5xx anche con un codice (504 col timeout dell’istruzione): esito sconosciuto, ci si ferma', async () => {
      supabaseFinto.risposte.push({ data: null, error: { code: '57014', message: 'canceling statement' }, status: 504 })
      const esito = await eseguiImport(tre, new Map())
      expect(esito.fermato?.motivo).toBe(MSG_FERMO_SCONOSCIUTO)
      expect(supabaseFinto.chiamate).toHaveLength(1)
    })

    it('DB-2. 42501 sul primo lotto: ci si ferma, il secondo lotto non parte, nessun ripiego', async () => {
      supabaseFinto.risposte.push({ data: null, error: { code: '42501', message: EMAIL_FINTA }, status: 403 })
      const esito = await eseguiImport(tanti, new Map())
      expect(esito.fermato?.motivo).toBe(MSG_FERMO_NON_CONSENTITO)
      expect(esito.fermato?.righe).toHaveLength(LOTTO_IMPORT + 2)
      expect(esito.scartate).toEqual([])
      expect(supabaseFinto.chiamate).toHaveLength(1)
    })

    it('DB-2. sessione scaduta (PGRST301): ci si ferma col suo messaggio', async () => {
      supabaseFinto.risposte.push({ data: null, error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 })
      const esito = await eseguiImport(tanti, new Map())
      expect(esito.fermato?.motivo).toBe(MSG_FERMO_SESSIONE)
      expect(supabaseFinto.chiamate).toHaveLength(1)
    })

    it('DB-2. 429, troppe richieste: ci si ferma col suo messaggio', async () => {
      supabaseFinto.risposte.push({ data: null, error: { message: 'Too Many Requests' }, status: 429 })
      const esito = await eseguiImport(tanti, new Map())
      expect(esito.fermato?.motivo).toBe(MSG_FERMO_TROPPE)
      expect(supabaseFinto.chiamate).toHaveLength(1)
    })

    it('DB-2. un errore dei dati (23502, 22001) fa ripiegare riga per riga, e l’import va avanti', async () => {
      supabaseFinto.risposte.push(
        { data: null, error: { code: '23502', message: EMAIL_FINTA }, status: 400 },
        { data: {}, error: null },
        { data: null, error: { code: '22001', message: EMAIL_FINTA }, status: 400 },
        { data: {}, error: null }
      )
      const esito = await eseguiImport(tre, new Map())
      expect(esito).toMatchObject({ importati: 2, fermato: null, scartate: [{ riga: 3, motivo: 'un valore della riga non è accettato dal database (troppo lungo, mancante o di formato sbagliato)' }] })
      expect(supabaseFinto.chiamate).toHaveLength(4)
    })

    it('DB-2. un aggiornamento con 42501 ferma l’import: niente altri aggiornamenti né inserimenti', async () => {
      supabaseFinto.risposte.push({ data: [A_MANO, GIA], error: null }, { data: null, error: { code: '42501', message: EMAIL_FINTA }, status: 403 })
      const esito = await eseguiImport(piano, new Map([[4, { tipo: 'collega', clienteId: 'a-1' }]]))
      expect(esito).toMatchObject({ aggiornati: 0, collegati: 0, importati: 0, fermato: { motivo: MSG_FERMO_NON_CONSENTITO, righe: [2, 3, 4] } })
      expect(supabaseFinto.chiamate).toHaveLength(2)
    })
  })

  it('i nuovi vanno a lotti di LOTTO_IMPORT righe', async () => {
    const tante = Array.from({ length: LOTTO_IMPORT + 1 }, (_, i) => ({ ...righe[0], riga: i + 2, codice_gestionale: `N${i}` }))
    supabaseFinto.risposte.push({ data: [], error: null }, { data: [], error: null })
    const esito = await eseguiImport(pianificaImport(tante, [], new Map()), new Map())
    expect(esito.importati).toBe(LOTTO_IMPORT + 1)
    expect(passo(0, 'insert')?.[0] as unknown[]).toHaveLength(LOTTO_IMPORT)
    expect(passo(1, 'insert')?.[0] as unknown[]).toHaveLength(1)
  })
})
