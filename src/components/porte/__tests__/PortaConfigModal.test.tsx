import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// PortaConfigModal → quoteStore → pricelistStore → supabase: mock minimale (hermetico),
// stesso pattern di PortePage.test.tsx / quotePorte.test.ts.
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { PortaConfigModal } from '@/components/porte/PortaConfigModal'
import { useQuoteStore } from '@/store/quoteStore'
import type { ListinoPorte } from '@/types/porte'
import type { OptionalScelto } from '@/types/quote'

// Listino minimo ma valido: il modello evita l'avviso "modello non trovato" (irrilevante
// per la label ma tiene il render realistico). Gli optional del listino NON influenzano la
// label — che dipende solo da unita/nome della scelta sulla riga — ma li includo per realismo.
const LISTINO: ListinoPorte = {
  modelli: [{ nome: 'RAFFAELLA', prezzo2026: 880, h215: 1060, h240: 1150 }],
  optional: [
    { nome: 'BATTISCOPA MASSELLO', unita: 'ML', prezzo: 1.2 },
    { nome: 'PROFILO ML', unita: 'ML', prezzo: 3 },
    { nome: 'SPECCHIO', unita: 'MQ', prezzo: 50 },
  ],
  aggiornato: 'test',
}

// Monta il modal con UNA singola scelta optional sulla riga (isola il caso label).
function renderConOptional(nome: string, unita: OptionalScelto['unita']) {
  const s = useQuoteStore.getState()
  s.addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 210 })
  const rigaId = useQuoteStore.getState().sezioni.porte!.righe[0].id
  s.addOptionalPorta(rigaId, { nome, unita, quantita: 1, prezzoManuale: null })
  render(<PortaConfigModal rigaId={rigaId} listino={LISTINO} onClose={() => {}} />)
}

describe('PortaConfigModal — label optional (scoping /battiscopa/i)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  it('1) optional ML con nome battiscopa → "altezza battiscopa (cm)"', () => {
    renderConOptional('BATTISCOPA MASSELLO', 'ML')
    expect(screen.getByText('altezza battiscopa (cm)')).toBeTruthy()
    expect(screen.queryByText('Quantità (cm)')).toBeNull()
  })

  it('2) optional ML NON battiscopa → "Quantità (cm)" (blinda lo scoping)', () => {
    // Nome sintetico: ML ma senza "battiscopa" → NON deve scattare l'etichetta speciale.
    renderConOptional('PROFILO ML', 'ML')
    expect(screen.getByText('Quantità (cm)')).toBeTruthy()
    expect(screen.queryByText('altezza battiscopa (cm)')).toBeNull()
  })

  it('3) optional MQ → "Quantità (mq)"', () => {
    renderConOptional('SPECCHIO', 'MQ')
    expect(screen.getByText('Quantità (mq)')).toBeTruthy()
  })
})

// Regola di Antonio (06/10): prezzo VUOTO = maniglia inclusa, prezzo = modello
// extra che si somma. "Aggiungi" con il modello vuoto creava una maniglia senza
// nome, e il testo del PDF finiva in "maniglia ." (bug corretto qui).
describe('PortaConfigModal — maniglia: aggiunta con modello, prezzo vuoto = inclusa', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  function montaRiga(conManiglia?: { qta: number; modello: string; finitura: string }) {
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 210 })
    const rigaId = useQuoteStore.getState().sezioni.porte!.righe[0].id
    if (conManiglia) useQuoteStore.getState().setManigliaPorta(rigaId, conManiglia)
    render(<PortaConfigModal rigaId={rigaId} listino={LISTINO} onClose={() => {}} />)
  }
  const maniglia = () => useQuoteStore.getState().sezioni.porte!.righe[0].maniglia

  it('"Aggiungi maniglia" è disabilitato finché il modello è vuoto', () => {
    montaRiga()
    const aggiungi = screen.getByRole('button', { name: /aggiungi maniglia/i }) as HTMLButtonElement
    expect(aggiungi.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Modello maniglia'), { target: { value: '   ' } })
    expect(aggiungi.disabled).toBe(true)
    fireEvent.click(aggiungi)
    expect(maniglia()).toBeUndefined()
  })

  it('con il modello scritto, "Aggiungi" crea la maniglia SENZA prezzo (inclusa)', () => {
    montaRiga()
    fireEvent.change(screen.getByLabelText('Modello maniglia'), { target: { value: 'Olivari Rio' } })
    fireEvent.click(screen.getByRole('button', { name: /aggiungi maniglia/i }))
    expect(maniglia()).toEqual({ qta: 1, modello: 'Olivari Rio', finitura: '' })
    expect(maniglia()).not.toHaveProperty('prezzoUnitario')
    const prezzo = screen.getByLabelText('Prezzo unitario maniglia') as HTMLInputElement
    expect(prezzo.value).toBe('')
    expect(prezzo.placeholder).toBe('inclusa')
    expect(screen.getByTestId('totale-maniglia').textContent).toBe('inclusa')
  })

  it('scrivere un prezzo lo somma; svuotarlo torna a inclusa (la chiave sparisce)', () => {
    montaRiga({ qta: 2, modello: 'Olivari Rio', finitura: '' })
    const prezzo = screen.getByLabelText('Prezzo unitario maniglia')
    fireEvent.change(prezzo, { target: { value: '45' } })
    expect(maniglia()?.prezzoUnitario).toBe(45)
    expect(screen.getByTestId('totale-maniglia').textContent).toBe('€ 90,00')
    fireEvent.change(prezzo, { target: { value: '' } })
    expect(maniglia()).not.toHaveProperty('prezzoUnitario')
    expect(screen.getByTestId('totale-maniglia').textContent).toBe('inclusa')
  })
})

// Importi all'euro intero (D4): il riepilogo del modal mostrava «prezzo unitario ×
// quantità» coi centesimi accanto a un totale riga intero.
describe('PortaConfigModal — riepilogo prezzo all\'euro intero', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  it('porte e maniglia intere, e il totale riga è la loro somma', () => {
    const s = useQuoteStore.getState()
    s.addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 210 })
    const rigaId = useQuoteStore.getState().sezioni.porte!.righe[0].id
    s.updateRigaPorta(rigaId, { quantita: 3 })
    s.addOptionalPorta(rigaId, { nome: 'SPECCHIO', unita: 'MQ', quantita: 0.011, prezzoManuale: null }) // 0,55 a porta
    s.setManigliaPorta(rigaId, { qta: 3, modello: 'Olivari Rio', finitura: '', prezzoUnitario: 12.5 }) // 37,50 → 38
    render(<PortaConfigModal rigaId={rigaId} listino={LISTINO} onClose={() => {}} />)
    const riga = (label: string) => screen.getByText(label).parentElement?.textContent ?? ''
    expect(riga('Prezzo unitario × 3')).toContain('€ 2.642,00') // 880,55 × 3 = 2.641,65 → 2.642
    expect(riga('Maniglia')).toContain('€ 38,00')
    expect(riga('Totale riga')).toContain('€ 2.680,00')
  })
})

// O4: è nel modal che l'altezza si svuota, quindi è lì che va detto.
describe('PortaConfigModal — altezza svuotata', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  it('svuotare l altezza mostra l avviso e toglie il «Totale riga» pieno', () => {
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 210 })
    const rigaId = useQuoteStore.getState().sezioni.porte!.righe[0].id
    render(<PortaConfigModal rigaId={rigaId} listino={LISTINO} onClose={() => {}} />)
    expect(screen.queryByText(/Inserisci l'altezza/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Altezza porta (cm)'), { target: { value: '' } })
    expect(useQuoteStore.getState().sezioni.porte!.righe[0].altezzaCm).toBe(0)
    expect(screen.getByText("Inserisci l'altezza: la porta resta fuori dal totale finché manca.")).toBeTruthy()
    expect(screen.getByTestId('totale-riga-porta').textContent).toBe('esclusa dal totale')
  })
})
