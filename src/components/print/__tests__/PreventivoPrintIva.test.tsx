import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// PreventivoPrint → quoteStore → pricelistStore → supabase: mock minimale (hermetico).
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { PreventivoPrint } from '@/components/print/PreventivoPrint'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { articoloPZ } from '@/test-utils/articoli'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'
import { blobPrimaDiL18, CHIAVE_BLOB } from '@/test-utils/blobPrimaDiL18'
import type { ListinoMarmeria } from '@/types/marmeria'
import type { ListinoPorte } from '@/types/porte'

// Listini sintetici, prezzi tondi inventati; cucina sul listino finto (D7).
const listinoGres: ListinoMarmeria = {
  materiali: [],
  lavorazioniBordo: [],
  lavorazioniVarie: [],
  vascheIntegrate: [],
  rilMontScaglioni: [{ da: 0, a: null, importo: 300 }],
  scontiDisponibili: [0],
  aggiornato: '',
}
const listinoPorte: ListinoPorte = {
  modelli: [{ nome: 'GIOTTO', prezzo2026: 700, h215: 900, h240: 1000 }],
  optional: [{ nome: 'BATTISCOPA MASSELLO', unita: 'ML', prezzo: 2 }],
  aggiornato: '',
}
const rigaGres = { materialeKey: 'k', spessore: 13 as const, fascia: 'fino62' as const, profonditaCm: 60, qtaMq: 3, prezzoMq: 100, totale: 300 }

const s = () => useQuoteStore.getState()
/** Il testo della riga dei totali con quell'intestazione. */
const rigaTotali = (nome: string) => screen.getByRole('rowheader', { name: nome }).closest('tr')?.textContent ?? ''
const intestazioniIva = () => Array.from(document.querySelectorAll('th')).filter((th) => th.textContent === 'IVA')

describe('PreventivoPrint — IVA per aliquota (L18)', () => {
  beforeEach(() => {
    s().resetAll()
    usePricelistStore.setState({
      cucine: validatoPerTest(listinoCucinaFinto),
      marmeria: validatoPerTest(listinoGres),
      porte: validatoPerTest(listinoPorte),
    })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null, porte: null })
  })

  it('il controllo di Marco: Arredi al 10% con una riga al 22%, Porte al 22%, Gres al 10%', () => {
    s().setAliquotaIvaSezione('arredi', 10)
    s().addArticoloSuMisura({ ...articoloPZ, prezzoUnitario: 1000 }) // al 10% della sezione
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Mensola', prezzoUnitario: 500, aliquotaIva: 22 })
    s().setAliquotaIvaSezione('porte', 22)
    s().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 }) // 700
    s().setAliquotaIvaSezione('gres', 10)
    s().addRigaMateriale(rigaGres) // 3 mq × 100 = 300
    render(<PreventivoPrint />)

    // 1.500 + 700 + 300: l'imponibile di sempre.
    expect(rigaTotali('Totale imponibile')).toContain('€ 2.500,00')
    // 10%: 1.000 arredi + 300 gres; 22%: 500 arredi + 700 porte. Due righe, in ordine.
    expect(rigaTotali('IVA 10% su € 1.300,00')).toContain('€ 130,00')
    expect(rigaTotali('IVA 22% su € 1.200,00')).toContain('€ 264,00')
    expect(screen.queryAllByRole('rowheader', { name: /^IVA / })).toHaveLength(2)
    expect(rigaTotali('TOTALE (IVA compresa)')).toContain('€ 2.894,00')

    // Più aliquote: la colonna IVA c'è, prima dell'importo, con l'aliquota della riga.
    expect(intestazioniIva().length).toBeGreaterThan(0)
    const mensola = screen.getByText('Mensola').closest('tr')!
    expect(Array.from(mensola.querySelectorAll('td')).map((td) => td.textContent).slice(-2)).toEqual(['22%', '€ 500,00'])
    const mobile = screen.getByText('Mobile').closest('tr')!
    expect(Array.from(mobile.querySelectorAll('td')).map((td) => td.textContent).slice(-2)).toEqual(['10%', '€ 1.000,00'])
  })

  it('un\'aliquota sola: nessuna colonna IVA e una riga «IVA 22%»', () => {
    s().addArticoloSuMisura(articoloPZ)
    render(<PreventivoPrint />)
    expect(intestazioniIva()).toHaveLength(0)
    expect(rigaTotali('IVA 22% su € 100,00')).toContain('€ 22,00')
    expect(rigaTotali('TOTALE (IVA compresa)')).toContain('€ 122,00')
  })

  it('sconto di sezione su due aliquote: si divide in proporzione alle righe', () => {
    // Porta 700 al 22% della sezione + battiscopa 100 al 10%; sconto 10% su 800 = 80.
    s().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    s().addBattiscopa('BATTISCOPA MASSELLO')
    const b = s().sezioni.porte!.battiscopa![0]
    s().updateBattiscopa(b.id, { altezzaCm: 10, metriLineari: 5, aliquotaIva: 10 }) // 2 €/cm × 10 × 5 = 100
    s().setScontoSezione('porte', 0.1)
    render(<PreventivoPrint />)
    expect(rigaTotali('Totale imponibile')).toContain('€ 720,00')
    expect(rigaTotali('IVA 10% su € 90,00')).toContain('€ 9,00')
    expect(rigaTotali('IVA 22% su € 630,00')).toContain('€ 138,60')
    expect(rigaTotali('TOTALE (IVA compresa)')).toContain('€ 867,60')
  })

  it('totale parziale: le etichette dicono «parziale», l\'IVA è sul parziale e la nota resta', () => {
    s().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    s().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 0 }) // da completare: fuori dal totale
    render(<PreventivoPrint />)
    expect(rigaTotali('Totale imponibile parziale')).toContain('€ 700,00')
    expect(rigaTotali('IVA 22% su € 700,00')).toContain('€ 154,00')
    expect(rigaTotali('TOTALE PARZIALE (IVA compresa)')).toContain('€ 854,00')
    expect(screen.queryByRole('rowheader', { name: 'Totale imponibile' })).toBeNull()
    expect(screen.getByText('totale parziale — Porte da definire')).toBeTruthy()
  })

  it('la nota sull\'IVA dice dove si trova', () => {
    render(<PreventivoPrint />)
    expect(screen.getByText('Gli importi delle voci sono IVA esclusa; l\'IVA è indicata nel riepilogo finale.')).toBeTruthy()
    expect(screen.queryByText('Tutti i prezzi si intendono IVA esclusa.')).toBeNull()
  })
})

describe('presidio: un preventivo salvato prima di L18 si stampa al 22% su tutto', () => {
  beforeEach(() => {
    localStorage.clear()
    usePricelistStore.setState({
      cucine: validatoPerTest(listinoCucinaFinto),
      marmeria: validatoPerTest(listinoGres),
      porte: validatoPerTest(listinoPorte),
    })
  })
  afterEach(() => {
    cleanup()
    localStorage.clear()
    s().resetAll()
    usePricelistStore.setState({ marmeria: null, porte: null })
  })

  it('il blob senza aliquote si apre: cinque blocchi, una sola riga IVA al 22% sull\'imponibile intero', async () => {
    localStorage.setItem(CHIAVE_BLOB, JSON.stringify(blobPrimaDiL18))
    await useQuoteStore.persist.rehydrate()
    render(<PreventivoPrint />)
    for (const titolo of ['Cucina', 'Marmeria / Gres', 'Falegnameria Su Misura', 'Porte', 'Progetto su misura']) {
      expect(screen.getByText(titolo)).toBeTruthy()
    }
    const righeIva = screen.getAllByRole('rowheader', { name: /^IVA / })
    expect(righeIva).toHaveLength(1)
    // La quota al 22% è tutto l'imponibile, e nessuna tabella ha la colonna IVA.
    const imponibile = /€ [\d.,]+/.exec(rigaTotali('Totale imponibile'))?.[0]
    expect(righeIva[0].textContent).toBe(`IVA 22% su ${imponibile}`)
    expect(intestazioniIva()).toHaveLength(0)
  })
})
