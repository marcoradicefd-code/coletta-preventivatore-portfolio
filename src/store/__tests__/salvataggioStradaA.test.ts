import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test-utils/supabaseFinto')).supabaseFinto.client,
  LISTINI_BUCKET: 'Listini',
}))

import { supabaseFinto, numeroDalServer } from '@/test-utils/supabaseFinto'
import { useQuoteStore, initialPreventivo } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import {
  MSG_INVIATO,
  dimenticaSalvataggio,
  prezziDaAggiornare,
  revisioneAperto,
  salvaAperto,
  useSalvataggio,
} from '@/store/salvataggioStore'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import type { ListinoCucina } from '@/types/cucina'
import { renderHook } from '@testing-library/react'
import { bloccoPdfAdesso, useBloccoPdf } from '@/hooks/useBloccoPdf'

/**
 * Strada A (Marco, 14/10) e C1, C2 della revisione L15-L21, sul salvataggio.
 * Solo il listino cucine FINTO di `src/test-utils` (D7), e una sua copia coi
 * prezzi alzati del 10% per il «listino cambiato».
 */
const ANNO = 2026
const LISTINO_A: ListinoCucina & { aggiornato: string } = { ...listinoCucinaFinto, aggiornato: 'listino-cucine-finto-A.xlsx' }
const LISTINO_B: ListinoCucina & { aggiornato: string } = {
  ...listinoCucinaFinto,
  prezzi: listinoCucinaFinto.prezzi.map((p) => ({ ...p, prezzo: Math.round(p.prezzo * 1.1) })),
  aggiornato: 'listino-cucine-finto-B.xlsx',
}
const riga = (over: Record<string, unknown> = {}) => ({ id: 'p-1', anno: ANNO, numero: 3, revisione: 0, stato: 'bozza', updated_at: 'u1', ...over })
const scritture = () => supabaseFinto.chiamate.filter((c) => c.rpc || c.passi.some(([p]) => p === 'insert' || p === 'update'))
const payload = (c: (typeof supabaseFinto.chiamate)[number]) =>
  c.passi.find(([p]) => p === 'insert' || p === 'update')?.[1][0] as Record<string, unknown> & {
    dati?: { prezzi?: { listini: Record<string, string | null>; vista: { calcolo: { iva: { totaleImponibile: number } } } } }
  }

function unaCucina() {
  useQuoteStore.getState().collegaCliente('c-0001', { ...initialPreventivo.cliente, nome: 'Cliente', cognome: 'Prova' })
  useQuoteStore.getState().setVoceQuantita('base-pensile-laminato', 3)
}

/** Primo salvataggio riuscito, col listino che c'è nello store. */
async function primoSalvataggio(stato: 'bozza' | 'inviato' = 'bozza') {
  supabaseFinto.risposte.push(numeroDalServer(3, ANNO), { data: riga({ stato }), error: null })
  const esito = await salvaAperto(stato === 'bozza' ? undefined : stato)
  expect(esito.ok).toBe(true)
  supabaseFinto.reset()
}

beforeEach(() => {
  supabaseFinto.reset()
  useQuoteStore.getState().nuovoPreventivo()
  dimenticaSalvataggio()
  useSalvataggio.setState({ inCorso: false, occupato: false })
  usePricelistStore.setState({ marmeria: null, porte: null, cucine: validatoPerTest(LISTINO_A) })
})

describe('salvataggio: strada A, C1 e C2', () => {
  it('C1: con la cucina compilata e il listino cucine assente «Salva» non scrive un totale a 0, e lo dice', async () => {
    unaCucina()
    usePricelistStore.setState({ cucine: null })
    const esito = await salvaAperto()
    expect(esito).toMatchObject({ ok: false, errore: expect.stringMatching(/Listino Cucine non caricato/) })
    expect(scritture()).toEqual([])
    expect(useSalvataggio.getState().errore?.errore).toMatch(/Listino Cucine non caricato/)
  })

  it('C1: lo stesso blocco per «Nuova revisione»', async () => {
    unaCucina()
    await primoSalvataggio()
    usePricelistStore.setState({ cucine: null })
    const esito = await revisioneAperto()
    expect(esito).toMatchObject({ ok: false, errore: expect.stringMatching(/Listino Cucine non caricato/) })
    expect(scritture()).toEqual([])
  })

  it('prezzi congelati: `dati` porta il calcolo, la data e i listini usati; il totale salvato è quello del calcolo', async () => {
    unaCucina()
    supabaseFinto.risposte.push(numeroDalServer(3, ANNO), { data: riga(), error: null })
    expect((await salvaAperto()).ok).toBe(true)
    const p = payload(scritture()[1])
    expect(p.dati?.prezzi?.listini).toEqual({ gres: null, porte: null, cucine: 'listino-cucine-finto-A.xlsx' })
    expect(p.dati?.prezzi?.vista.calcolo.iva.totaleImponibile).toBe(p.totale_imponibile)
    expect(p.totale_imponibile).toBeGreaterThan(0)
    expect(p.dati?.prezzi).toMatchObject({ calcolatiIl: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) })
    // Lo store tiene i prezzi del salvataggio: il PDF di un inviato li userà.
    expect(useQuoteStore.getState().archivio.prezzi?.vista.calcolo.iva.totaleImponibile).toBe(p.totale_imponibile)
  })

  it('C2: bozza salvata, poi il listino cambia: i prezzi sono da aggiornare e il salvataggio riscrive il totale nuovo', async () => {
    unaCucina()
    await primoSalvataggio()
    const totaleA = useQuoteStore.getState().archivio.prezzi?.vista.calcolo.iva.totaleImponibile
    expect(prezziDaAggiornare()).toBe(false)
    usePricelistStore.setState({ cucine: validatoPerTest(LISTINO_B) })
    expect(prezziDaAggiornare()).toBe(true)
    supabaseFinto.risposte.push({ data: riga({ updated_at: 'u2' }), error: null })
    expect((await salvaAperto()).ok).toBe(true)
    const p = payload(scritture()[0])
    expect(p.totale_imponibile).not.toBe(totaleA)
    expect(p.totale_imponibile).toBe(p.dati?.prezzi?.vista.calcolo.iva.totaleImponibile)
    expect(prezziDaAggiornare()).toBe(false)
  })

  it('inviato senza modifiche: il cambio di stato scrive solo lo stato, i prezzi congelati restano', async () => {
    unaCucina()
    await primoSalvataggio('inviato')
    const prezzi = useQuoteStore.getState().archivio.prezzi
    usePricelistStore.setState({ cucine: validatoPerTest(LISTINO_B) })
    supabaseFinto.risposte.push({ data: riga({ stato: 'accettato', updated_at: 'u2' }), error: null })
    expect((await salvaAperto('accettato')).ok).toBe(true)
    expect(payload(scritture()[0])).toEqual({ stato: 'accettato' })
    expect(useQuoteStore.getState().archivio.prezzi).toBe(prezzi)
  })

  it('inviato con modifiche: «Salva» non riscrive (nuova revisione), «Correggi» sì', async () => {
    unaCucina()
    await primoSalvataggio('inviato')
    useQuoteStore.getState().setVoceQuantita('base-pensile-laminato', 4)
    expect(await salvaAperto()).toMatchObject({ ok: false, errore: MSG_INVIATO })
    expect(scritture()).toEqual([])
    supabaseFinto.risposte.push({ data: riga({ stato: 'inviato', updated_at: 'u2' }), error: null })
    expect((await salvaAperto(undefined, undefined, { correggi: true })).ok).toBe(true)
    expect(payload(scritture()[0])).toMatchObject({ stato: 'inviato', dati: expect.anything() })
  })
})

describe('N2 (verdetto sulla #98): il PDF dai prezzi congelati non chiede il listino', () => {
  it('inviato coi prezzi congelati e listino Cucine assente: «Genera» non è bloccato', async () => {
    unaCucina()
    await primoSalvataggio('inviato')
    usePricelistStore.setState({ cucine: null })
    expect(bloccoPdfAdesso()).toEqual({ bloccato: false, motivo: null })
    expect(renderHook(() => useBloccoPdf()).result.current).toEqual({ bloccato: false, motivo: null })
  })

  it('lo stesso per accettato e annullato', async () => {
    for (const stato of ['accettato', 'annullato'] as const) {
      useQuoteStore.getState().nuovoPreventivo()
      dimenticaSalvataggio()
      usePricelistStore.setState({ cucine: validatoPerTest(LISTINO_A) })
      unaCucina()
      await primoSalvataggio('inviato')
      useQuoteStore.setState((q) => ({ archivio: { ...q.archivio, preventivo: { ...q.archivio.preventivo!, stato } } }))
      usePricelistStore.setState({ cucine: null })
      expect(bloccoPdfAdesso(), stato).toEqual({ bloccato: false, motivo: null })
    }
  })

  it('le sezioni cambiate dopo il salvataggio: i congelati non valgono, il blocco resta', async () => {
    unaCucina()
    await primoSalvataggio('inviato')
    useQuoteStore.getState().setVoceQuantita('base-pensile-laminato', 4)
    usePricelistStore.setState({ cucine: null })
    expect(bloccoPdfAdesso()).toMatchObject({ bloccato: true, motivo: expect.stringMatching(/Listino Cucine non caricato/) })
    expect(renderHook(() => useBloccoPdf()).result.current.bloccato).toBe(true)
  })

  it('una bozza salvata resta bloccata: si stampa dal vivo', async () => {
    unaCucina()
    await primoSalvataggio()
    usePricelistStore.setState({ cucine: null })
    expect(bloccoPdfAdesso().bloccato).toBe(true)
    expect(renderHook(() => useBloccoPdf()).result.current.bloccato).toBe(true)
  })

  it('«Nuova revisione» e «Correggi» ricalcolano coi listini di adesso: senza listino restano bloccati', async () => {
    unaCucina()
    await primoSalvataggio('inviato')
    usePricelistStore.setState({ cucine: null })
    expect(await revisioneAperto()).toMatchObject({ ok: false, errore: expect.stringMatching(/Listino Cucine non caricato/) })
    // Una modifica fuori dalle sezioni: i congelati valgono ancora per il PDF, ma la correzione riscrive.
    useQuoteStore.getState().setCliente({ telefono: '000 0000000' })
    expect(bloccoPdfAdesso().bloccato).toBe(false)
    expect(await salvaAperto(undefined, undefined, { correggi: true })).toMatchObject({
      ok: false,
      errore: expect.stringMatching(/Listino Cucine non caricato/),
    })
    expect(scritture()).toEqual([])
  })
})
