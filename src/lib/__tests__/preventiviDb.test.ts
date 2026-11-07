import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test-utils/supabaseFinto')).supabaseFinto.client,
  LISTINI_BUCKET: 'Listini',
}))

import { supabaseFinto, numeroDalServer, EMAIL_FINTA, TELEFONO_FINTO, DATI_FINTI } from '@/test-utils/supabaseFinto'
import { spiaConsole } from '@/test-utils/spiaConsole'
import {
  annullaPreventivo,
  apriPreventivo,
  elencaPreventivi,
  leggiDati,
  nuovaRevisione,
  salvaPreventivo,
  MSG_CONFLITTO,
  type Salvataggio,
} from '@/lib/preventiviDb'
import { initialPreventivo, QUOTE_VERSION } from '@/store/quoteStore'
import { prezziAdesso } from '@/store/salvataggioStore'
import { INITIAL_SEZIONI } from '@/store/quoteFallbacks'
import { formatNumeroPreventivo } from '@/utils/numeroPreventivo'
import type { NumeroRiservato, PreventivoSalvato } from '@/types/archivio'
import { MSG_ERRORE_RETE } from '@/lib/erroriDb'

const ANNO = 2026
const SALVATO: PreventivoSalvato = { id: 'p-1', anno: ANNO, numero: 7, revisione: 0, stato: 'bozza', updatedAt: '2026-10-13T10:00:00.000001+00:00' }
const rigaDb = (over: Record<string, unknown> = {}) => ({
  id: 'p-1', anno: ANNO, numero: 7, revisione: 0, stato: 'bozza', updated_at: '2026-10-13T10:05:00.000002+00:00', ...over,
})
const preventivoFinto = { ...initialPreventivo, cliente: { ...initialPreventivo.cliente, nome: 'Cliente Prova Srl', email: EMAIL_FINTA, telefono: TELEFONO_FINTO } }

const salvataggio = (over: Partial<Salvataggio> = {}): Salvataggio => ({
  archivio: { clienteId: 'c-0001', preventivo: null },
  preventivo: preventivoFinto,
  sezioni: INITIAL_SEZIONI,
  stato: 'bozza',
  totaleImponibile: 1234,
  ...over,
})

const passo = (i: number, nome: string) => supabaseFinto.chiamate[i]?.passi.filter(([p]) => p === nome).map(([, a]) => a)

beforeEach(() => supabaseFinto.reset())

describe('preventiviDb — salvataggio, numero, revisioni (L21)', () => {
  it('primo salvataggio: anno e numero li assegna il database (S11), poi la riga nasce con revisione 0 e i dati versionati', async () => {
    supabaseFinto.risposte.push(numeroDalServer(1, ANNO), { data: rigaDb({ numero: 1 }), error: null })
    const esito = await salvaPreventivo(salvataggio())
    expect(supabaseFinto.chiamate[0]).toMatchObject({ rpc: 'nuovo_numero_preventivo' })
    expect(supabaseFinto.chiamate[0].args).toBeUndefined()
    expect(supabaseFinto.arg(1, 'insert')).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      anno: ANNO,
      numero: 1,
      revisione: 0,
      cliente_id: 'c-0001',
      stato: 'bozza',
      dati: { versione: QUOTE_VERSION, preventivo: preventivoFinto, sezioni: INITIAL_SEZIONI },
      totale_imponibile: 1234,
    })
    expect(esito).toEqual({ ok: true, dato: { ...SALVATO, numero: 1, updatedAt: '2026-10-13T10:05:00.000002+00:00' } })
  })

  it('primo salvataggio idempotente: la risposta persa non costa un secondo numero né una riga doppia', async () => {
    const riservati: NumeroRiservato[] = []
    // 1° tentativo: numero avuto, INSERT senza risposta (rete giù, forma di postgrest-js).
    supabaseFinto.risposte.push(numeroDalServer(5, ANNO), new TypeError('Failed to fetch'))
    const primo = await salvaPreventivo(salvataggio(), (r) => riservati.push(r))
    expect(primo).toEqual({ ok: false, errore: MSG_ERRORE_RETE, rete: true })
    expect(riservati).toEqual([{ id: expect.stringMatching(/^[0-9a-f-]{36}$/), anno: ANNO, numero: 5 }])
    const riservato = riservati[0]
    const id = riservato.id

    // 2° tentativo col numero tenuto: nessuna RPC, stesso id e stesso numero.
    supabaseFinto.reset()
    supabaseFinto.risposte.push({ data: rigaDb({ id, numero: 5 }), error: null })
    const secondo = await salvaPreventivo(salvataggio({ archivio: { clienteId: 'c-0001', preventivo: null, riservato } }), () => {
      throw new Error('nessun numero nuovo')
    })
    expect(supabaseFinto.chiamate.some((c) => c.rpc)).toBe(false)
    expect(supabaseFinto.arg(0, 'insert')).toMatchObject({ id, anno: ANNO, numero: 5, revisione: 0 })
    expect(secondo.ok && secondo.dato).toMatchObject({ id, numero: 5 })

    // Se il 1° INSERT era arrivato davvero: 23505 sull'id, la riga si ritrova e si aggiorna col lock.
    supabaseFinto.reset()
    supabaseFinto.risposte.push(
      { data: null, error: { code: '23505' } },
      { data: rigaDb({ id, numero: 5 }), error: null },
      { data: rigaDb({ id, numero: 5, updated_at: 'aggiornata' }), error: null }
    )
    const terzo = await salvaPreventivo(salvataggio({ archivio: { clienteId: 'c-0001', preventivo: null, riservato } }))
    expect(supabaseFinto.chiamate.map((c) => c.passi[0][0])).toEqual(['insert', 'select', 'update'])
    expect(passo(1, 'eq')).toEqual([['id', id]])
    expect(passo(2, 'eq')).toEqual([['id', id], ['updated_at', '2026-10-13T10:05:00.000002+00:00']])
    expect(terzo.ok && terzo.dato).toMatchObject({ id, numero: 5, updatedAt: 'aggiornata' })
  })

  it('S11: l’anno lo sceglie il server, non l’orologio del browser; il 22023 ha un messaggio suo', async () => {
    vi.useFakeTimers({ now: new Date('2031-06-15T10:00:00Z') })
    try {
      supabaseFinto.risposte.push(numeroDalServer(3, ANNO), { data: rigaDb({ numero: 3 }), error: null })
      await salvaPreventivo(salvataggio())
      expect(supabaseFinto.arg(1, 'insert')).toMatchObject({ anno: ANNO, numero: 3 })
    } finally {
      vi.useRealTimers()
    }
    supabaseFinto.reset()
    supabaseFinto.risposte.push({ data: null, error: { code: '22023' } })
    const esito = await salvaPreventivo(salvataggio())
    expect(esito).toMatchObject({ ok: false, codice: '22023', errore: expect.stringMatching(/data e (l’)?ora/) })
  })

  it('S3: dati di forma sbagliata dal database non si aprono (né crash né preventivo a metà)', async () => {
    const malformati = [{ arredi: 5 }, { porte: { righe: 7 } }, { cucine: 'x' }, { progettoValore: { voci: 1 } }, { arredi: { ...INITIAL_SEZIONI.arredi, articoli: [{ id: 'a', descrizione: 'x', prezzoUnitario: 'mille', um: 'PZ' }] } }]
    for (const sezioni of malformati) {
      expect(leggiDati({ versione: QUOTE_VERSION, preventivo: {}, sezioni }), JSON.stringify(sezioni)).toBeNull()
    }
    expect(leggiDati({ versione: QUOTE_VERSION, preventivo: { cliente: 5, data: 20261014 }, sezioni: INITIAL_SEZIONI })).toBeNull()
    // Una sezione null vale come assente: si apre.
    expect(leggiDati({ versione: QUOTE_VERSION, preventivo: {}, sezioni: { gres: null } })?.sezioni).toEqual({})
    supabaseFinto.risposte.push({ data: { ...rigaDb(), cliente_id: 'c-0001', dati: { versione: QUOTE_VERSION, preventivo: {}, sezioni: { arredi: 5 } } }, error: null })
    expect(await apriPreventivo('p-1')).toEqual({ ok: false, errore: 'Il preventivo salvato non è leggibile da questa versione dell’app.' })
  })

  it('il cliente collegato eliminato nel frattempo (23503): il messaggio lo dice; una revisione con un altro cliente (23514) pure', async () => {
    const aperto = { archivio: { clienteId: 'c-0001', preventivo: null, riservato: { id: 'p-1', anno: ANNO, numero: 7 } } }
    supabaseFinto.risposte.push({ data: null, error: { code: '23503' } })
    expect(await salvaPreventivo(salvataggio(aperto))).toMatchObject({ ok: false, errore: expect.stringMatching(/non esiste più/) })
    supabaseFinto.risposte.push({ data: { revisione: 0 }, error: null }, { data: null, error: { code: '23514' } })
    expect(await nuovaRevisione(salvataggio({ archivio: { clienteId: 'c-0002', preventivo: SALVATO } }))).toMatchObject({
      ok: false,
      errore: expect.stringMatching(/tiene il cliente del preventivo/),
    })
  })

  it('senza un cliente dell\'anagrafica non si salva, e nessun numero si consuma', async () => {
    const esito = await salvaPreventivo(salvataggio({ archivio: { clienteId: null, preventivo: null } }))
    expect(esito.ok).toBe(false)
    expect(supabaseFinto.chiamate).toHaveLength(0)
  })

  it('salvataggio successivo: stessa riga, con il lock su updated_at, e nessun numero nuovo', async () => {
    supabaseFinto.risposte.push({ data: rigaDb(), error: null })
    const esito = await salvaPreventivo(salvataggio({ archivio: { clienteId: 'c-0001', preventivo: SALVATO }, stato: 'inviato' }))
    expect(supabaseFinto.chiamate).toHaveLength(1)
    expect(supabaseFinto.chiamate[0].tabella).toBe('preventivi')
    expect(passo(0, 'eq')).toEqual([['id', 'p-1'], ['updated_at', SALVATO.updatedAt]])
    expect(supabaseFinto.arg(0, 'update')).toMatchObject({ stato: 'inviato', cliente_id: 'c-0001' })
    expect(supabaseFinto.arg(0, 'update')).not.toHaveProperty('numero')
    expect(esito.ok && esito.dato.updatedAt).toBe('2026-10-13T10:05:00.000002+00:00')
  })

  it('lock perso (nessuna riga aggiornata): conflitto, nessuna seconda scrittura', async () => {
    supabaseFinto.risposte.push({ data: null, error: null })
    const esito = await salvaPreventivo(salvataggio({ archivio: { clienteId: 'c-0001', preventivo: SALVATO } }))
    expect(esito).toEqual({ ok: false, errore: MSG_CONFLITTO, conflitto: true })
    expect(supabaseFinto.chiamate).toHaveLength(1)
  })

  it('un preventivo annullato non si salva sopra', async () => {
    const esito = await salvaPreventivo(salvataggio({ archivio: { clienteId: 'c-0001', preventivo: { ...SALVATO, stato: 'annullato' } } }))
    expect(esito.ok).toBe(false)
    expect(supabaseFinto.chiamate).toHaveLength(0)
  })

  it('nuova revisione: stesso anno e numero, l\'ultima revisione + 1, in bozza, senza chiedere un numero', async () => {
    supabaseFinto.risposte.push({ data: { revisione: 2 }, error: null }, { data: rigaDb({ id: 'p-9', revisione: 3 }), error: null })
    const esito = await nuovaRevisione(salvataggio({ archivio: { clienteId: 'c-0001', preventivo: { ...SALVATO, stato: 'inviato' } } }))
    expect(supabaseFinto.chiamate.some((c) => c.rpc)).toBe(false)
    expect(passo(0, 'eq')).toEqual([['anno', ANNO], ['numero', 7]])
    expect(supabaseFinto.arg(0, 'order')).toBe('revisione')
    expect(supabaseFinto.arg(1, 'insert')).toMatchObject({ anno: ANNO, numero: 7, revisione: 3, stato: 'bozza' })
    expect(esito.ok && formatNumeroPreventivo(esito.dato)).toBe('2026-007 rev. 3')
  })

  it('annulla: lo stato diventa annullato, con il lock', async () => {
    supabaseFinto.risposte.push({ data: rigaDb({ stato: 'annullato' }), error: null })
    const esito = await annullaPreventivo({ id: 'p-1', updatedAt: SALVATO.updatedAt })
    expect(supabaseFinto.arg(0, 'update')).toEqual({ stato: 'annullato' })
    expect(passo(0, 'eq')).toEqual([['id', 'p-1'], ['updated_at', SALVATO.updatedAt]])
    expect(esito.ok && esito.dato.stato).toBe('annullato')
  })

  it('apri: i dati passano dalla migrazione del localStorage (un salvataggio v3 si apre), col legame', async () => {
    const datiV3 = { versione: 3, preventivo: { ...preventivoFinto, includiCondizioni: undefined }, suMisura: { articoli: [], quotaProgettazione: true, noteGenerali: '', includiNotePagamento: false, mostraMqInPdf: false } }
    supabaseFinto.risposte.push({ data: { ...rigaDb(), cliente_id: 'c-0001', dati: datiV3 }, error: null })
    const esito = await apriPreventivo('p-1')
    expect(esito.ok).toBe(true)
    if (!esito.ok) return
    expect(esito.dato.sezioni.arredi).toMatchObject({ quotaProgettazione: true, sconto: 0 })
    expect(esito.dato.preventivo.includiCondizioni).toBe(true)
    expect(esito.dato.preventivo.cliente.nome).toBe('Cliente Prova Srl')
    expect(esito.dato.archivio).toEqual({ clienteId: 'c-0001', preventivo: { ...SALVATO, updatedAt: '2026-10-13T10:05:00.000002+00:00' } })
  })

  it('apri: dati di una versione futura o senza forma non si aprono a metà', async () => {
    supabaseFinto.risposte.push(
      { data: { ...rigaDb(), cliente_id: 'c-0001', dati: { versione: QUOTE_VERSION + 1, preventivo: preventivoFinto, sezioni: {} } }, error: null },
      { data: { ...rigaDb(), cliente_id: 'c-0001', dati: 'non un oggetto' }, error: null }
    )
    expect((await apriPreventivo('p-1')).ok).toBe(false)
    expect((await apriPreventivo('p-1')).ok).toBe(false)
  })

  it('strada A: `dati` porta i prezzi congelati; aprendo tornano nel legame, e se sono di forma sbagliata si apre dal vivo', async () => {
    const prezzi = prezziAdesso(INITIAL_SEZIONI)
    supabaseFinto.risposte.push({ data: rigaDb(), error: null })
    await salvaPreventivo(salvataggio({ archivio: { clienteId: 'c-0001', preventivo: SALVATO }, prezzi }))
    expect(supabaseFinto.arg(0, 'update')).toMatchObject({ dati: { prezzi }, totale_imponibile: 1234 })
    const letti = leggiDati({ versione: QUOTE_VERSION, preventivo: {}, sezioni: INITIAL_SEZIONI, prezzi })
    expect(letti?.prezzi).toEqual(prezzi)
    const rotti = leggiDati({ versione: QUOTE_VERSION, preventivo: {}, sezioni: INITIAL_SEZIONI, prezzi: { vista: 5 } })
    expect(rotti?.prezzi).toBeNull()
    supabaseFinto.reset()
    supabaseFinto.risposte.push({ data: { ...rigaDb({ stato: 'inviato' }), cliente_id: 'c-0001', dati: { versione: QUOTE_VERSION, preventivo: {}, sezioni: INITIAL_SEZIONI, prezzi } }, error: null })
    const aperto = await apriPreventivo('p-1')
    expect(aperto.ok && aperto.dato.archivio.prezzi).toEqual(prezzi)
  })

  it('S7 e strada A: il 23514 di un UPDATE dice che cosa il database non accetta e cosa fare', async () => {
    supabaseFinto.risposte.push({ data: null, error: { code: '23514' } })
    const esito = await salvaPreventivo(salvataggio({ archivio: { clienteId: 'c-0002', preventivo: SALVATO } }))
    expect(esito).toMatchObject({ ok: false, codice: '23514', errore: expect.stringMatching(/nuova revisione/) })
  })

  it('elenco: anno, numero e revisione dal più recente, cliente dall\'embed, senza i dati interi', async () => {
    supabaseFinto.risposte.push({ data: [], error: null })
    await elencaPreventivi()
    const colonne = String(supabaseFinto.arg(0, 'select'))
    expect(colonne).toContain('clienti(ragione_sociale)')
    expect(colonne).not.toMatch(/\bdati\b/)
    expect(passo(0, 'order')).toEqual([['anno', { ascending: false }], ['numero', { ascending: false }], ['revisione', { ascending: false }]])
  })

  it('formatNumeroPreventivo: AAAA-NNN, oltre il 999, e la revisione solo se c\'è', () => {
    expect(formatNumeroPreventivo({ anno: 2026, numero: 1, revisione: 0 })).toBe('2026-001')
    expect(formatNumeroPreventivo({ anno: 2026, numero: 1000, revisione: 0 })).toBe('2026-1000')
    expect(formatNumeroPreventivo({ anno: 2026, numero: 42, revisione: 2 })).toBe('2026-042 rev. 2')
  })

  it('presidio: nessuna funzione logga i dati del preventivo (email, telefono e ragione sociale finti)', async () => {
    const spia = spiaConsole()
    spia.avvia()
    try {
      supabaseFinto.risposte.push(
        { data: null, error: { code: '23505', details: EMAIL_FINTA } },
        numeroDalServer(1, ANNO),
        new TypeError(EMAIL_FINTA),
        { data: { ...rigaDb(), cliente_id: 'c-0001', dati: { versione: 4, preventivo: preventivoFinto, sezioni: {} } }, error: null }
      )
      await salvaPreventivo(salvataggio())
      await salvaPreventivo(salvataggio())
      await apriPreventivo('p-1')
      // aggiornaConLock (salvataggio successivo e conflitto), nuovaRevisione,
      // annullaPreventivo, elencaPreventivi, con errori che citano i dati finti.
      const dettagli = { code: '23514', message: DATI_FINTI.join(' '), details: DATI_FINTI.join(' ') }
      supabaseFinto.risposte.push(
        { data: null, error: dettagli },
        { data: null, error: null },
        { data: { revisione: 0 }, error: null },
        { data: null, error: dettagli },
        new TypeError(DATI_FINTI.join(' ')),
        { data: [{ ...rigaDb(), totale_imponibile: 1, cliente_id: 'c-0001', clienti: { ragione_sociale: DATI_FINTI[2] } }], error: null },
        { data: null, error: dettagli }
      )
      const aperto = salvataggio({ archivio: { clienteId: 'c-0001', preventivo: SALVATO } })
      await salvaPreventivo(aperto)
      await salvaPreventivo(aperto)
      await nuovaRevisione(aperto)
      await annullaPreventivo(SALVATO)
      await elencaPreventivi()
      await elencaPreventivi()
      expect(spia.trovati(DATI_FINTI)).toEqual([])
    } finally {
      spia.ripristina()
    }
  })
})

describe('preventiviDb — revisione funzionale del 14/10 sulla #97', () => {
  it('b: «Nuova revisione» idempotente: la risposta persa non fa nascere una revisione doppia', async () => {
    const riservati: NumeroRiservato[] = []
    const aperto = { ...SALVATO, stato: 'inviato' as const }
    // 1° tentativo: l'ultima revisione è la 0, l'INSERT parte con un id generato qui e la risposta si perde.
    supabaseFinto.risposte.push({ data: { revisione: 0 }, error: null }, new TypeError('Failed to fetch'))
    const primo = await nuovaRevisione(salvataggio({ archivio: { clienteId: 'c-0001', preventivo: aperto } }), (r) => riservati.push(r))
    expect(primo).toMatchObject({ ok: false, rete: true })
    expect(riservati).toEqual([{ id: expect.stringMatching(/^[0-9a-f-]{36}$/), anno: ANNO, numero: 7 }])
    const riservato = riservati[0]
    expect(supabaseFinto.arg(1, 'insert')).toMatchObject({ id: riservato.id, anno: ANNO, numero: 7, revisione: 1 })

    // 2° tentativo («Riprova»): la riga era arrivata, quindi l'ultima ora è la 1 e l'INSERT
    // della 2 con lo stesso id trova l'unicità dell'id (23505): la riga si ritrova e si
    // aggiorna col lock. Niente revisione 2, niente id nuovo.
    supabaseFinto.reset()
    supabaseFinto.risposte.push(
      { data: { revisione: 1 }, error: null },
      { data: null, error: { code: '23505' } },
      { data: rigaDb({ id: riservato.id, revisione: 1 }), error: null },
      { data: rigaDb({ id: riservato.id, revisione: 1, updated_at: 'aggiornata' }), error: null }
    )
    const secondo = await nuovaRevisione(salvataggio({ archivio: { clienteId: 'c-0001', preventivo: aperto, riservato } }), () => {
      throw new Error('nessun id nuovo')
    })
    expect(supabaseFinto.arg(1, 'insert')).toMatchObject({ id: riservato.id, revisione: 2 })
    expect(passo(2, 'eq')).toEqual([['id', riservato.id]])
    expect(passo(3, 'eq')).toEqual([['id', riservato.id], ['updated_at', '2026-10-13T10:05:00.000002+00:00']])
    expect(supabaseFinto.arg(3, 'update')).toMatchObject({ stato: 'bozza' })
    expect(secondo.ok && secondo.dato).toMatchObject({ id: riservato.id, revisione: 1, updatedAt: 'aggiornata' })
  })
})
