import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test-utils/supabaseFinto')).supabaseFinto.client,
  LISTINI_BUCKET: 'Listini',
}))

import { supabaseFinto, clienteFinto, EMAIL_FINTA, DATI_FINTI } from '@/test-utils/supabaseFinto'
import {
  clienteDaArchivio,
  contaPreventiviCliente,
  elencaClienti,
  eliminaCliente,
  salvaCliente,
  stessiDati,
  MSG_CONFLITTO_CLIENTE,
  type DatiCliente,
} from '@/lib/clientiDb'
import { MSG_ERRORE_DB, MSG_ERRORE_RETE, messaggioErroreDb } from '@/lib/erroriDb'
import { spiaConsole } from '@/test-utils/spiaConsole'

const datiFinti = (over: Partial<DatiCliente> = {}): DatiCliente => ({
  ragione_sociale: '  Cliente Prova Srl  ',
  nome: '',
  cognome: '   ',
  telefono: ' 000 0000000 ',
  email: EMAIL_FINTA,
  indirizzo: null,
  cap: null,
  localita: 'Paese di Prova',
  provincia: null,
  partita_iva: null,
  note: null,
  ...over,
})

beforeEach(() => supabaseFinto.reset())

describe('clientiDb — anagrafica nel database (L21)', () => {
  it('elencaClienti legge colonne esplicite (mai *, niente codice fiscale), ordinate per ragione sociale', async () => {
    supabaseFinto.risposte.push({ data: [clienteFinto()], error: null })
    const esito = await elencaClienti()
    expect(esito).toEqual({ ok: true, dato: [clienteFinto()] })
    expect(supabaseFinto.chiamate[0].tabella).toBe('clienti')
    const colonne = String(supabaseFinto.arg(0, 'select'))
    expect(colonne).not.toContain('*')
    expect(colonne).not.toMatch(/fiscale/)
    expect(supabaseFinto.arg(0, 'order')).toBe('ragione_sociale')
  })

  it('un errore del server non porta in UI il testo né i dettagli, che possono citare i valori', async () => {
    supabaseFinto.risposte.push({
      data: null,
      error: { code: '23505', message: `duplicate ${EMAIL_FINTA}`, details: `Key (email)=(${EMAIL_FINTA}) already exists` },
    })
    const esito = await elencaClienti()
    expect(esito.ok).toBe(false)
    expect(JSON.stringify(esito)).not.toContain(EMAIL_FINTA)
  })

  it('messaggioErroreDb: rete, permessi, archivio non pronto, sconosciuto', () => {
    expect(messaggioErroreDb(new TypeError('Failed to fetch'))).toBe(MSG_ERRORE_RETE)
    expect(messaggioErroreDb({ code: '', message: 'TypeError: Failed to fetch' }, 0)).toBe(MSG_ERRORE_RETE)
    expect(messaggioErroreDb({ code: '42501' })).toMatch(/non consentita/)
    expect(messaggioErroreDb({ code: '42P01' })).toMatch(/non è ancora pronto/)
    expect(messaggioErroreDb({ code: 'XX000', message: EMAIL_FINTA })).toBe(MSG_ERRORE_DB)
    expect(messaggioErroreDb(null)).toBe(MSG_ERRORE_DB)
  })

  it('salvaCliente nuovo: insert con i campi puliti (spazi tolti, vuoti a null) e l’id generato nel client, senza codice', async () => {
    supabaseFinto.risposte.push({ data: clienteFinto(), error: null })
    const esito = await salvaCliente(null, datiFinti(), 'c-nuovo-0001')
    expect(esito.ok).toBe(true)
    const riga = supabaseFinto.arg(0, 'insert') as Record<string, unknown>
    expect(riga).toMatchObject({ id: 'c-nuovo-0001', ragione_sociale: 'Cliente Prova Srl', nome: null, cognome: null, telefono: '000 0000000' })
    expect(riga).not.toHaveProperty('codice_gestionale')
    expect(riga).not.toHaveProperty('created_by')
  })

  it('S8. creazione idempotente: risposta persa e «Riprova» con lo stesso id = il 23505 sull’id ritrova la riga, niente doppione', async () => {
    const arrivata = clienteFinto({ id: 'c-nuovo-0001', ragione_sociale: 'Cliente Prova Srl', nome: null, cognome: null, localita: 'Paese di Prova', indirizzo: null, cap: null, provincia: null })
    supabaseFinto.risposte.push(
      new TypeError('Failed to fetch'),
      { data: null, error: { code: '23505', message: 'duplicate key' }, status: 409 },
      { data: arrivata, error: null }
    )
    expect(await salvaCliente(null, datiFinti(), 'c-nuovo-0001')).toMatchObject({ ok: false, rete: true })
    const riprova = await salvaCliente(null, datiFinti(), 'c-nuovo-0001')
    expect(riprova).toEqual({ ok: true, dato: arrivata })
    expect(supabaseFinto.chiamate.map((c) => c.passi[0][0])).toEqual(['insert', 'insert', 'select'])
    expect(supabaseFinto.arg(1, 'insert')).toMatchObject({ id: 'c-nuovo-0001' })
    expect(supabaseFinto.chiamate[2].passi.find(([p]) => p === 'eq')?.[1]).toEqual(['id', 'c-nuovo-0001'])
  })

  it('salvaCliente senza ragione sociale: errore e nessuna chiamata', async () => {
    const esito = await salvaCliente(null, datiFinti({ ragione_sociale: '   ' }))
    expect(esito.ok).toBe(false)
    expect(supabaseFinto.chiamate).toHaveLength(0)
  })

  it('salvaCliente esistente: update sul suo id con il lock su updated_at; nessuna riga = conflitto, non successo', async () => {
    supabaseFinto.risposte.push({ data: null, error: null }, { data: clienteFinto({ updated_at: 'dopo' }), error: null })
    const aperto = { id: 'c-0001', updatedAt: '2026-10-13T10:00:00.000000+00:00' }
    const esito = await salvaCliente(aperto, datiFinti())
    expect(supabaseFinto.arg(0, 'update')).toBeDefined()
    const eq = supabaseFinto.chiamate[0].passi.filter(([p]) => p === 'eq').map(([, a]) => a)
    expect(eq).toEqual([['id', 'c-0001'], ['updated_at', aperto.updatedAt]])
    expect(esito).toEqual({ ok: false, errore: MSG_CONFLITTO_CLIENTE, conflitto: true })
    expect(await salvaCliente(aperto, datiFinti())).toEqual({ ok: true, dato: clienteFinto({ updated_at: 'dopo' }) })
  })

  it('stessiDati: spazi e vuoti non contano, un campo cambiato sì', () => {
    expect(stessiDati(datiFinti(), datiFinti({ ragione_sociale: 'Cliente Prova Srl', nome: null, telefono: '000 0000000' }))).toBe(true)
    expect(stessiDati(datiFinti(), datiFinti({ note: 'una nota' }))).toBe(false)
  })

  it('rete giù nella forma vera di postgrest-js (status 0, nessun rigetto): errore di rete con «rete», non «del database»', async () => {
    supabaseFinto.risposte.push(new TypeError('Failed to fetch'), new TypeError('Failed to fetch'), new TypeError('Failed to fetch'))
    expect(await elencaClienti()).toEqual({ ok: false, errore: MSG_ERRORE_RETE, rete: true })
    expect(await contaPreventiviCliente('c-0001')).toEqual({ ok: false, errore: MSG_ERRORE_RETE, rete: true })
    expect(await salvaCliente({ id: 'c-0001', updatedAt: 'x' }, datiFinti())).toEqual({ ok: false, errore: MSG_ERRORE_RETE, rete: true })
  })

  it('il 23503 dice due cose diverse: eliminando, il cliente ha preventivi; scrivendo un preventivo, il cliente non c\'è più', async () => {
    supabaseFinto.risposte.push({ data: null, error: { code: '23503' } })
    expect(await eliminaCliente('c-0001')).toEqual({ ok: false, errore: 'Il cliente ha preventivi collegati: non si può eliminare.', codice: '23503' })
    expect(messaggioErroreDb({ code: '23503' })).toMatch(/cliente collegato al preventivo non esiste più/)
  })

  it('contaPreventiviCliente conta i preventivi del cliente, senza scaricarli', async () => {
    supabaseFinto.risposte.push({ count: 2, error: null })
    expect(await contaPreventiviCliente('c-0001')).toEqual({ ok: true, dato: 2 })
    expect(supabaseFinto.chiamate[0].tabella).toBe('preventivi')
    expect(supabaseFinto.chiamate[0].passi[0]).toEqual(['select', ['id', { count: 'exact', head: true }]])
  })

  it('eliminaCliente: zero righe eliminate è un errore detto, una riga è un successo', async () => {
    supabaseFinto.risposte.push({ data: [], error: null }, { data: [{ id: 'c-0001' }], error: null })
    expect(await eliminaCliente('c-0001')).toEqual({ ok: false, errore: expect.stringMatching(/non eliminato/i) })
    expect(await eliminaCliente('c-0001')).toEqual({ ok: true, dato: true })
  })

  it('clienteDaArchivio: un\'azienda va nel nome; una persona tiene nome e cognome; CAP, località e provincia in Città', () => {
    expect(clienteDaArchivio(clienteFinto() as never)).toEqual({
      nome: 'Cliente Prova Srl',
      cognome: '',
      indirizzo: 'Via di Prova 1',
      citta: '00000 Paese di Prova (XX)',
      telefono: '000 0000000',
      email: EMAIL_FINTA,
    })
    const persona = clienteDaArchivio(clienteFinto({ nome: 'Mario', cognome: 'Prova', cap: null, provincia: null }) as never)
    expect(persona).toMatchObject({ nome: 'Mario', cognome: 'Prova', citta: 'Paese di Prova' })
  })
})

describe('presidio: nessuna riga di cliente nella console', () => {
  const spia = spiaConsole()
  afterEach(() => spia.ripristina())

  it('il presidio morde (un console.log con l\'email finta lo fa scattare), e nessuna funzione logga righe di clienti', async () => {
    spia.avvia()
    console.log('riga', { email: EMAIL_FINTA })
    expect(spia.contiene(EMAIL_FINTA)).toBe(true)
    spia.svuota()

    supabaseFinto.risposte.push(
      { data: [clienteFinto()], error: null },
      { data: null, error: { code: '23505', message: EMAIL_FINTA, details: EMAIL_FINTA } },
      new TypeError(`fetch ${EMAIL_FINTA}`),
      { data: clienteFinto(), error: null },
      { data: null, error: null },
      { data: null, error: { code: '23505', details: DATI_FINTI.join(' ') }, status: 409 },
      new TypeError(`fetch ${DATI_FINTI.join(' ')}`),
      { count: null, error: { code: '42501', message: EMAIL_FINTA } },
      { data: [], error: null }
    )
    await elencaClienti()
    await elencaClienti()
    await elencaClienti()
    await salvaCliente({ id: 'c-0001', updatedAt: 'x' }, datiFinti())
    await salvaCliente({ id: 'c-0001', updatedAt: 'x' }, datiFinti())
    await salvaCliente(null, datiFinti())
    await salvaCliente(null, datiFinti())
    await contaPreventiviCliente('c-0001')
    await eliminaCliente('c-0001')
    expect(spia.trovati(DATI_FINTI)).toEqual([])
  })
})
