import { describe, it, expect } from 'vitest'
import {
  chiaveEmail,
  chiaveNome,
  chiavePiva,
  chiaviTelefono,
  controllaScelte,
  pianificaImport,
  riassuntoScelte,
  type ClienteConfronto,
  type Scelta,
} from '@/lib/confrontoAnagrafica'
import { leggiCsvAnagrafica } from '@/lib/anagraficaCsv'
import { csvFinto } from '@/test-utils/anagraficaFinta'

/** Un cliente creato a mano nell'app, senza codice gestionale (finto). */
const aMano = (id: string, over: Partial<ClienteConfronto> = {}): ClienteConfronto => ({
  id,
  ragione_sociale: 'Cliente Prova',
  nome: null,
  cognome: null,
  email: null,
  telefono: null,
  localita: null,
  partita_iva: null,
  ...over,
})

describe('confrontoAnagrafica — normalizzazione per il confronto (pura)', () => {
  it('nome: minuscole, spazi, accenti via NFD, titoli tolti, ordine delle parole indifferente', () => {
    expect(chiaveNome('  Arch.  NICCOLÒ   Esempio ')).toBe('esempio niccolo')
    expect(chiaveNome('Esempio Niccolo')).toBe('esempio niccolo')
    expect(chiaveNome('Sig.ra Bianchi Prova')).toBe(chiaveNome('prova bianchi'))
    expect(chiaveNome('Ing. Dott. Verdi Finto')).toBe(chiaveNome('Verdi Finto'))
    expect(chiaveNome("D'Amico Prova")).toBe(chiaveNome('DAmico prova'))
    expect(chiaveNome('Arch.')).toBeNull()
    expect(chiaveNome(null)).toBeNull()
  })

  it('email: minuscole e spazi; senza chiocciola niente chiave', () => {
    expect(chiaveEmail(' Prova.Finta@Example.TEST ')).toBe('prova.finta@example.test')
    expect(chiaveEmail('non una email')).toBeNull()
    expect(chiaveEmail(null)).toBeNull()
  })

  it('telefono: solo cifre, prefisso internazionale tolto, troppo corto niente chiave', () => {
    expect(chiaviTelefono('000 100 0001')).toEqual(['0001000001'])
    expect(chiaviTelefono('000-1000001')).toEqual(['0001000001'])
    expect(chiaviTelefono('+39 000 1000001')).toEqual(['0001000001'])
    expect(chiaviTelefono('0039 000 1000001')).toEqual(['0001000001'])
    expect(chiaviTelefono('00 01')).toEqual([])
    expect(chiaviTelefono('')).toEqual([])
  })
})

/** I casi del verdetto sulla #99 (revisore, 15/10): ognuno era rosso sul codice di 2f854e3. */
describe('verdetto del 15/10 — chiavi del confronto', () => {
  it('F1. titoli fuori elenco e titoli attaccati al nome si tolgono; le sigle restano una parola', () => {
    const base = chiaveNome('Bianchi Prova')
    for (const t of ['Sig.na Bianchi Prova', 'Sig.ri Bianchi Prova', 'Ill.ma Bianchi Prova', 'Dr.ssa Bianchi Prova', 'Arch.Bianchi Prova', 'Sig.ra.Bianchi Prova']) {
      expect(chiaveNome(t), t).toBe(base)
    }
    expect(chiaveNome('Prova S.r.l.')).toBe(chiaveNome('Prova Srl'))
  })

  it('«Sigg.ri» davanti al nome si toglie come gli altri titoli', () => {
    expect(chiaveNome('Sigg.ri Anna Neri')).toBe(chiaveNome('Anna Neri'))
  })

  it('F2. telefono con (+39), «+ 39», «00 39», e più numeri nello stesso campo: una chiave per numero', () => {
    for (const t of ['(+39) 000 1000001', '+ 39 000 1000001', '00 39 000 1000001']) expect(chiaviTelefono(t), t).toEqual(['0001000001'])
    for (const t of ['000 1000001 / 000 2000002', '000 1000001; 000 2000002', '000 1000001, 000 2000002', '000 1000001 - 000 2000002']) {
      expect(chiaviTelefono(t), t).toEqual(['0001000001', '0002000002'])
    }
  })

  it('F2. il doppione si trova anche col secondo numero del campo', () => {
    const { righe } = leggiCsvAnagrafica(csvFinto([{ codice: '601', ragione: 'Ditta Prova Sei', telefono: '000 1000001 / 000 6000006' }]))
    const p = pianificaImport(righe, [aMano('a-6', { ragione_sociale: 'Altro Nome', telefono: '+39 000 6000006' })], new Map())
    expect(p.voci[0]).toMatchObject({ tipo: 'doppione', candidati: [{ cliente: { id: 'a-6' }, motivi: ['telefono'] }] })
  })

  it('F3. la partita IVA è una chiave (spazi, punti e «IT» tolti)', () => {
    expect(chiavePiva('IT 000.111.22233')).toBe('00011122233')
    expect(chiavePiva('00011122233')).toBe('00011122233')
    expect(chiavePiva('')).toBeNull()
    const { righe } = leggiCsvAnagrafica(csvFinto([{ codice: '602', ragione: 'Omonimo Prova', piva: '00011122233' }]))
    const p = pianificaImport(righe, [aMano('a-7', { ragione_sociale: 'Altra Ditta', partita_iva: 'IT00011122233' })], new Map())
    expect(p.voci[0]).toMatchObject({ tipo: 'doppione', candidati: [{ cliente: { id: 'a-7' }, motivi: ['piva'] }] })
  })

  it('F4. un telefono segnaposto a cifre tutte uguali non è una chiave: niente doppioni a catena', () => {
    expect(chiaviTelefono('000 0000000')).toEqual([])
    expect(chiaviTelefono('333 3333333')).toEqual([])
    expect(chiavePiva('00000000000')).toBeNull()
    const { righe } = leggiCsvAnagrafica(csvFinto([{ codice: '603', ragione: 'Prova Sette', telefono: '000 0000000' }]))
    const p = pianificaImport(righe, [aMano('a-8', { ragione_sociale: 'Prova Otto', telefono: '0000000000' })], new Map())
    expect(p.voci[0].tipo).toBe('nuovo')
  })
})

describe('pianificaImport — nuovi, già presenti col codice, possibili doppioni', () => {
  const { righe } = leggiCsvAnagrafica(
    csvFinto([
      { codice: '101', ragione: 'Arch. Niccolò Esempio', telefono: '000 2000001' },
      { codice: '102', ragione: 'Ditta Fittizia Srl', email: 'Ufficio@Example.test' },
      { codice: '103', ragione: 'Bottega Prova', telefono: '000 3000003' },
      { codice: '104', ragione: 'Nuovo Cliente Prova' },
      { codice: '105', ragione: 'Già Importato Prova' },
      { codice: '106', ragione: 'Esempio Niccolo', segnalazioni: 'possibile doppione' },
    ])
  )
  const senzaCodice = [
    aMano('a-1', { ragione_sociale: 'Niccolo Esempio', nome: 'Niccolo', cognome: 'Esempio' }),
    aMano('a-2', { ragione_sociale: 'Fittizia', email: 'ufficio@example.test' }),
    aMano('a-3', { ragione_sociale: 'Signor Prova', telefono: '0003000003' }),
  ]
  const piano = pianificaImport(righe, senzaCodice, new Map([['105', 'g-5']]))

  it('doppione per nome con accenti e titolo diversi, per email, per telefono con spazi: mai fusi, si mostrano', () => {
    const tipo = Object.fromEntries(piano.voci.map((v) => [v.riga.codice_gestionale, v]))
    expect(tipo['101']).toMatchObject({ tipo: 'doppione', candidati: [{ cliente: { id: 'a-1' }, motivi: ['nome'] }] })
    expect(tipo['102']).toMatchObject({ tipo: 'doppione', candidati: [{ cliente: { id: 'a-2' }, motivi: ['email'] }] })
    expect(tipo['103']).toMatchObject({ tipo: 'doppione', candidati: [{ cliente: { id: 'a-3' }, motivi: ['telefono'] }] })
    expect(tipo['104'].tipo).toBe('nuovo')
    expect(tipo['105']).toMatchObject({ tipo: 'esistente', clienteId: 'g-5' })
  })

  it('il codice già nell’app vince sul confronto: la riga si aggiorna, non è un doppione', () => {
    const p = pianificaImport(righe.slice(0, 1), senzaCodice, new Map([['101', 'g-1']]))
    expect(p.voci[0]).toMatchObject({ tipo: 'esistente', clienteId: 'g-1' })
  })

  it('i doppioni dentro il file si mostrano (righe e motivo), non si fondono', () => {
    expect(piano.doppioniNelFile).toEqual([{ motivo: 'nome', righe: [2, 7] }])
  })

  it('un indice per chiave: il confronto non è O(n²) (10.000 righe e 10.000 clienti in poco)', () => {
    const molte = Array.from({ length: 10_000 }, (_, i) => ({ ...righe[3], riga: i + 2, codice_gestionale: `C${i}`, ragione_sociale: `Prova ${i}` }))
    const clienti = Array.from({ length: 10_000 }, (_, i) => aMano(`m-${i}`, { ragione_sociale: `Altro ${i}`, telefono: `000${i}`.padEnd(10, '9') }))
    const t0 = performance.now()
    const p = pianificaImport(molte, clienti, new Map())
    expect(performance.now() - t0).toBeLessThan(2000)
    expect(p.voci.every((v) => v.tipo === 'nuovo')).toBe(true)
  })
})

describe('riassuntoScelte (F6, verdetto del 15/10) — i conteggi per la conferma', () => {
  it('nuovi (anche «Crea nuovo»), collegati, già nell’app col codice, saltati', () => {
    const { righe } = leggiCsvAnagrafica(
      csvFinto([
        { codice: '701', ragione: 'Prova Uno', email: 'uno@example.test' },
        { codice: '702', ragione: 'Prova Due', email: 'due@example.test' },
        { codice: '703', ragione: 'Prova Tre', email: 'tre@example.test' },
        { codice: '704', ragione: 'Prova Quattro' },
        { codice: '705', ragione: 'Prova Cinque' },
      ])
    )
    const app = ['uno', 'due', 'tre'].map((n) => aMano(`a-${n}`, { ragione_sociale: `Altro ${n}`, email: `${n}@example.test` }))
    const piano = pianificaImport(righe, app, new Map([['705', 'g-5']]))
    const scelte = new Map<number, Scelta>([
      [2, { tipo: 'collega', clienteId: 'a-uno' }],
      [3, { tipo: 'nuovo' }],
      [4, { tipo: 'salta' }],
    ])
    expect(riassuntoScelte(piano, scelte)).toEqual({ nuovi: 2, collegati: 1, daRiempire: 1, saltati: 1 })
  })
})

describe('controllaScelte — senza una scelta per ogni doppione l’import non parte', () => {
  const { righe } = leggiCsvAnagrafica(
    csvFinto([
      { codice: '201', ragione: 'Prova Uno', email: 'uno@example.test' },
      { codice: '202', ragione: 'Prova Uno Bis', email: 'uno@example.test' },
      { codice: '203', ragione: 'Prova Tre' },
    ])
  )
  const piano = pianificaImport(righe, [aMano('a-1', { ragione_sociale: 'Altra Prova', email: 'uno@example.test' })], new Map())

  it('di default nessuna scelta: mancano tutte', () => {
    expect(controllaScelte(piano, new Map())).toEqual({ mancanti: [2, 3], collegatiDueVolte: [], fuoriElenco: [] })
  })

  it('Collega, Crea nuovo e Salta valgono; due righe collegate allo stesso cliente no', () => {
    const ok = new Map<number, Scelta>([
      [2, { tipo: 'collega', clienteId: 'a-1' }],
      [3, { tipo: 'salta' }],
    ])
    expect(controllaScelte(piano, ok)).toEqual({ mancanti: [], collegatiDueVolte: [], fuoriElenco: [] })
    const doppio = new Map<number, Scelta>([
      [2, { tipo: 'collega', clienteId: 'a-1' }],
      [3, { tipo: 'collega', clienteId: 'a-1' }],
    ])
    expect(controllaScelte(piano, doppio).collegatiDueVolte).toEqual([3])
    const fuori = new Map<number, Scelta>([
      [2, { tipo: 'collega', clienteId: 'x-9' }],
      [3, { tipo: 'nuovo' }],
    ])
    expect(controllaScelte(piano, fuori).fuoriElenco).toEqual([2])
  })
})
