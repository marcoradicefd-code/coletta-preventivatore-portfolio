import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test-utils/supabaseFinto')).supabaseFinto.client,
  LISTINI_BUCKET: 'Listini',
}))

import { nomeClienteDi, titoloPdf } from '@/store/quoteSelectors'
import { clienteDaArchivio } from '@/lib/clientiDb'
import { clienteFinto, RAGIONE_SOCIALE_FINTA } from '@/test-utils/supabaseFinto'
import type { Cliente } from '@/types/common'
import type { PreventivoSalvato } from '@/types/archivio'

// Punto 1 di Antonio (14/10): il titolo del documento è il nome del file che
// Chrome propone e l'intestazione di ogni pagina. Solo clienti finti.

const CLIENTE: Cliente = { nome: 'Mario', cognome: 'Prova', indirizzo: '', citta: '', telefono: '', email: 'prova@example.test' }
const SALVATO: PreventivoSalvato = { id: 'p-1', anno: 2026, numero: 4, revisione: 0, stato: 'bozza', updatedAt: 'x' }

const titolo = (cliente: Partial<Cliente> | null, salvato: PreventivoSalvato | null = SALVATO) =>
  titoloPdf({ cliente: { ...CLIENTE, ...cliente } }, { preventivo: salvato })

/** Il controllo che vale per ogni titolo: niente pezzi rotti. */
function senzaPezziRotti(t: string) {
  expect(t).not.toMatch(/undefined|null|N\. —|–\s*$|\s{2}/)
  expect(t).toBe(t.trim())
}

describe('titoloPdf — numero e cliente nel titolo del PDF', () => {
  it('numero del database e cliente: «Preventivo N. 2026-004 – Mario Prova»', () => {
    expect(titolo({})).toBe('Preventivo N. 2026-004 – Mario Prova')
  })

  it('revisione: il numero è quello di formatNumeroPreventivo, «2026-004 rev. 1»', () => {
    expect(titolo({}, { ...SALVATO, revisione: 1 })).toBe('Preventivo N. 2026-004 rev. 1 – Mario Prova')
  })

  it('cliente con la sola ragione sociale: la stessa funzione del blocco CLIENTE', () => {
    const cliente = clienteDaArchivio(clienteFinto())
    expect(nomeClienteDi(cliente)).toBe(RAGIONE_SOCIALE_FINTA)
    expect(titoloPdf({ cliente }, { preventivo: SALVATO })).toBe(`Preventivo N. 2026-004 – ${RAGIONE_SOCIALE_FINTA}`)
  })

  it('annullato: la dicitura in fondo, «… – ANNULLATO»', () => {
    expect(titolo({}, { ...SALVATO, stato: 'annullato' })).toBe('Preventivo N. 2026-004 – Mario Prova – ANNULLATO')
  })

  it('senza numero, senza cliente o senza nessuno dei due: il ripiego coi pezzi che ci sono', () => {
    const senzaNumero = titolo({}, null)
    const senzaCliente = titolo({ nome: '', cognome: '' })
    const nessuno = titolo({ nome: ' ', cognome: '' }, null)
    expect(senzaNumero).toBe('Preventivo Coletta – Mario Prova')
    expect(senzaCliente).toBe('Preventivo N. 2026-004')
    expect(nessuno).toBe('Preventivo Coletta')
    for (const t of [senzaNumero, senzaCliente, nessuno]) senzaPezziRotti(t)
  })

  it('cliente con campi mancanti (un blob manomesso): mai «undefined», mai un trattino in fondo', () => {
    const t = titoloPdf({ cliente: {} as Cliente }, { preventivo: SALVATO })
    expect(t).toBe('Preventivo N. 2026-004')
    expect(titoloPdf({ cliente: undefined as unknown as Cliente }, null)).toBe('Preventivo Coletta')
    senzaPezziRotti(t)
  })

  it('caratteri vietati nei nomi di file (slash, backslash e : * ? " < > |): sostituiti con uno spazio', () => {
    expect(titolo({ nome: String.raw`A/B\C:D*E?F"G<H>I|L`, cognome: '' })).toBe('Preventivo N. 2026-004 – A B C D E F G H I L')
  })

  it('caratteri di controllo (costruiti, non scritti): tolti come gli altri', () => {
    const c = String.fromCharCode
    const nome = `Mario${c(0)}${c(9)}${c(10)}Pro${c(31)}va${c(127)}`
    expect(titolo({ nome, cognome: '' })).toBe('Preventivo N. 2026-004 – Mario Pro va')
  })

  it('spazi ripetuti ridotti a uno, e niente spazi agli estremi', () => {
    const t = titolo({ nome: '  Mario   Luigi ', cognome: '  Prova  ' })
    expect(t).toBe('Preventivo N. 2026-004 – Mario Luigi Prova')
    senzaPezziRotti(t)
  })

  it('un cliente di soli caratteri vietati vale come assente: niente trattino in fondo', () => {
    expect(titolo({ nome: '/// ***', cognome: '|' })).toBe('Preventivo N. 2026-004')
  })

  it('tetto di 120 caratteri: tronca il cliente, mai il numero né la dicitura ANNULLATO', () => {
    const lungo = 'Ragione Sociale Molto Lunga '.repeat(12)
    const t = titolo({ nome: lungo, cognome: '' }, { ...SALVATO, numero: 1234, revisione: 12, stato: 'annullato' })
    expect(Array.from(t).length).toBeLessThanOrEqual(120)
    expect(t.startsWith('Preventivo N. 2026-1234 rev. 12 – Ragione Sociale')).toBe(true)
    expect(t.endsWith(' – ANNULLATO')).toBe(true)
    senzaPezziRotti(t)
  })
})
