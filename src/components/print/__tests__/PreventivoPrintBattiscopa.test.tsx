import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ListinoPorte } from '@/types/porte'
import type { RigaPorta, RigaBattiscopa } from '@/types/quote'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { PreventivoPrint } from '@/components/print/PreventivoPrint'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { sezioneNonVuota } from '@/components/layout/sections'
import { descrizioneBattiscopaDefault } from '@/data/testiDefault'

const LISTINO: ListinoPorte = {
  modelli: [{ nome: 'GIOTTO', prezzo2026: 700, h215: 900, h240: 1000 }],
  optional: [
    { nome: 'STIPITI', unita: 'PORTA', prezzo: 150 },
    { nome: 'BATTISCOPA MASSELLO', unita: 'ML', prezzo: 1.2 },
  ],
  aggiornato: 'test',
}

// H 5 cm × 1,2 €/cm = 6 €/ml × 100 ml = 600 € (specifica di Antonio, 06/10).
const BATT: RigaBattiscopa = {
  id: 'b1',
  nome: 'BATTISCOPA MASSELLO',
  prezzoUnitario: 1.2,
  altezzaCm: 5,
  metriLineari: 100,
}

/** Una riga della #33: quantitaCm era la lunghezza. Oggi è da completare. */
const BATT_LEGACY: RigaBattiscopa = {
  id: 'b1',
  nome: 'BATTISCOPA MASSELLO',
  quantitaCm: 500,
  prezzoUnitario: 1.2,
}

const rigaPortaBase = (over: Partial<RigaPorta> = {}): RigaPorta => ({
  id: 'r1',
  modelloNome: 'GIOTTO',
  altezzaCm: 210,
  optionals: [],
  ...over,
})

function semina(righe: RigaPorta[], battiscopa?: RigaBattiscopa[]) {
  useQuoteStore.setState((s) => ({
    sezioni: { ...s.sezioni, porte: { sconto: 0, righe, ...(battiscopa ? { battiscopa } : {}) } },
  }))
}

/** La tabella del battiscopa: segue l'etichetta "Battiscopa". */
function tabellaBatt(): HTMLElement {
  return screen.getByText('Battiscopa', { selector: 'div' }).nextElementSibling as HTMLElement
}

/** Le righe della tabella battiscopa, come testo per cella. */
function righeBatt(): string[][] {
  return Array.from(tabellaBatt().querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.textContent ?? '')
  )
}

describe('PreventivoPrint — tabella battiscopa: Voce · ml · €/ml · Importo', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO) })
  })
  afterEach(() => cleanup())

  it('intestazioni: Voce, ml, €/ml, Importo', () => {
    semina([], [BATT])
    render(<PreventivoPrint />)
    const th = Array.from(tabellaBatt().querySelectorAll('thead th')).map((t) => t.textContent)
    expect(th).toEqual(['Voce', 'ml', '€/ml', 'Importo'])
  })

  it('riga prodotto: H × €/cm = €/ml, per i metri lineari', () => {
    semina([], [BATT])
    render(<PreventivoPrint />)
    const [prodotto] = righeBatt()
    expect(prodotto[0]).toContain('Battiscopa BATTISCOPA MASSELLO H 5 cm — 100 ml × 6,00 €/ml')
    expect(prodotto.slice(1)).toEqual(['100', '€ 6,00', '€ 600,00'])
  })

  it('il totale imponibile somma porte + battiscopa: 700 + 600 = 1.300', () => {
    semina([rigaPortaBase()], [BATT])
    render(<PreventivoPrint />)
    const totalRow = screen.getByText(/^Totale imponibile$/).closest('tr')
    expect(totalRow?.textContent).toContain('1.300,00')
  })

  it('il ×qta delle porte NON tocca il battiscopa: 700×3 + 600 = 2.700', () => {
    semina([rigaPortaBase({ quantita: 3 })], [BATT])
    render(<PreventivoPrint />)
    const totalRow = screen.getByText(/^Totale imponibile$/).closest('tr')
    expect(totalRow?.textContent).toContain('2.700,00')
  })

  it('+20% solo sul prodotto e riga di posa, importi all\'euro intero: 39,60 → 40 + 22 = 62', () => {
    semina([], [{ ...BATT, metriLineari: 5.5, prezzoPosaMl: 4, extra: true }])
    render(<PreventivoPrint />)
    const [prodotto, posa] = righeBatt()
    expect(prodotto.slice(1)).toEqual(['5,5', '€ 7,20', '€ 40,00']) // il €/ml resta coi centesimi
    expect(posa).toEqual(['Posa — 5,5 ml × 4,00 €/ml', '5,5', '€ 4,00', '€ 22,00'])
    const totalRow = screen.getByText(/^Totale imponibile$/).closest('tr')
    expect(totalRow?.textContent).toContain('62,00')
  })

  it('senza posa: nessuna riga di posa', () => {
    semina([], [BATT])
    render(<PreventivoPrint />)
    expect(righeBatt()).toHaveLength(1)
    expect(screen.queryByText(/^Posa —/)).toBeNull()
  })

  it('riga della #33: "da completare" nell Importo, totale PARZIALE', () => {
    semina([rigaPortaBase()], [BATT_LEGACY])
    render(<PreventivoPrint />)
    const [riga] = righeBatt()
    expect(riga.slice(1)).toEqual(['—', '—', 'da completare'])
    const totale = screen.getByText(/^Totale imponibile parziale$/).closest('tr')
    expect(totale?.textContent).toContain('700,00')
  })

  it('riga nuova senza misure: "da completare", nessuna riga da 0,00 €', () => {
    semina([], [{ ...BATT, metriLineari: undefined }])
    render(<PreventivoPrint />)
    const [riga] = righeBatt()
    expect(riga.slice(1)).toEqual(['—', '—', 'da completare'])
    expect(tabellaBatt().textContent).not.toContain('0,00')
  })

  it('battiscopa irrisolvibile: "prezzo da definire", fuori dal totale', () => {
    semina([], [{ ...BATT, nome: 'SPARITO', prezzoUnitario: undefined }])
    render(<PreventivoPrint />)
    expect(screen.getByText('prezzo da definire')).toBeTruthy()
    // Una voce da definire rende il totale finale PARZIALE, e lo dice.
    const totalRow = screen.getByText(/^Totale imponibile parziale$/).closest('tr')
    expect(totalRow?.textContent).toContain('0,00')
  })

  it('senza battiscopa: nessuna tabella battiscopa nel PDF', () => {
    semina([rigaPortaBase()])
    render(<PreventivoPrint />)
    expect(screen.queryByText('Battiscopa')).toBeNull()
  })
})

describe('PreventivoPrint — descrizione battiscopa tri-stato', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO) })
  })
  afterEach(() => cleanup())

  it('mai editata: si compone da nome, altezza, metri e €/ml', () => {
    semina([], [BATT])
    render(<PreventivoPrint />)
    expect(descrizioneBattiscopaDefault('BATTISCOPA MASSELLO', 5, 100, 6)).toBe(
      'Battiscopa BATTISCOPA MASSELLO H 5 cm — 100 ml × 6,00 €/ml'
    )
    expect(screen.getByText(descrizioneBattiscopaDefault('BATTISCOPA MASSELLO', 5, 100, 6))).toBeTruthy()
  })

  it('cambiando i metri il testo automatico SEGUE', () => {
    semina([], [{ ...BATT, metriLineari: 12.5 }])
    render(<PreventivoPrint />)
    expect(screen.getByText(/— 12,5 ml × 6,00 €\/ml/)).toBeTruthy()
  })

  it('svuotata dalla pagina (null): torna l etichetta composta, niente riga vuota', () => {
    semina([], [{ ...BATT, descrizione: null }])
    render(<PreventivoPrint />)
    expect(screen.getByText(descrizioneBattiscopaDefault('BATTISCOPA MASSELLO', 5, 100, 6))).toBeTruthy()
  })

  it('EDITATA: resta la promessa dell utente, la colonna ml dice comunque la verità', () => {
    semina([], [{ ...BATT, metriLineari: 12.5, descrizione: 'Battiscopa rovere su misura' }])
    render(<PreventivoPrint />)
    expect(screen.getByText('Battiscopa rovere su misura')).toBeTruthy()
    expect(screen.queryByText(/— 12,5 ml/)).toBeNull()
    expect(righeBatt()[0][1]).toBe('12,5')
  })
})

describe('sezioneNonVuota — un preventivo di SOLO battiscopa esiste', () => {
  it('porte con zero righe ma un battiscopa: la sezione NON è vuota', () => {
    // Senza questo, la feature esisterebbe e non si vedrebbe: né tab, né PDF.
    expect(sezioneNonVuota('porte', { porte: { righe: [], sconto: 0, battiscopa: [BATT] } })).toBe(true)
  })

  it('porte del tutto vuote: resta vuota', () => {
    expect(sezioneNonVuota('porte', { porte: { righe: [], sconto: 0, battiscopa: [] } })).toBe(false)
    expect(sezioneNonVuota('porte', { porte: { righe: [], sconto: 0 } })).toBe(false)
  })
})
