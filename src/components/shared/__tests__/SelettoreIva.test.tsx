import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// I componenti leggono quoteStore → pricelistStore → supabase: mock minimale (hermetico).
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { IvaSezione } from '@/components/shared/SelettoreIva'
import { PortaConfigModal } from '@/components/porte/PortaConfigModal'
import { PortePage } from '@/components/porte/PortePage'
import { ArticoloConfigModal } from '@/components/sumisura/ArticoloConfigModal'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { articoloPZ } from '@/test-utils/articoli'
import type { ListinoPorte } from '@/types/porte'

// Listino sintetico, prezzi tondi inventati.
const LISTINO: ListinoPorte = {
  modelli: [{ nome: 'GIOTTO', prezzo2026: 700, h215: 900, h240: 1000 }],
  optional: [{ nome: 'BATTISCOPA MASSELLO', unita: 'ML', prezzo: 2 }],
  aggiornato: '',
}

const s = () => useQuoteStore.getState()
const select = (el: HTMLElement) => el as HTMLSelectElement

describe('IVA nelle schermate (L18)', () => {
  beforeEach(() => s().resetAll())
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ porte: null })
  })

  it('selettore di sezione: 22% se non scelto, la scelta va nello store', () => {
    render(<IvaSezione sezione="gres" iva={{ totale: 1000 }} />)
    const campo = select(screen.getByLabelText('IVA'))
    expect(campo.value).toBe('22')
    // Niente «come la sezione» nel selettore di sezione: solo le tre aliquote.
    expect(Array.from(campo.options).map((o) => o.value)).toEqual(['4', '10', '22'])
    fireEvent.change(campo, { target: { value: '10' } })
    expect(s().sezioni.gres?.aliquotaIva).toBe(10)
  })

  it('una sola aliquota: nessuna riga «IVA x%»; due: una riga per aliquota con quota e imposta', () => {
    const { unmount } = render(<IvaSezione sezione="arredi" iva={{ totale: 400, righe: [{ importo: 400 }] }} />)
    expect(screen.queryByText(/^IVA \d+% su/)).toBeNull()
    unmount()
    render(
      <IvaSezione
        sezione="arredi"
        iva={{ totale: 400, aliquota: 10, righe: [{ importo: 300 }, { importo: 100, aliquota: 22 }] }}
      />
    )
    expect(screen.getByText('IVA 10% su € 300,00').nextElementSibling?.textContent).toBe('€ 30,00')
    expect(screen.getByText('IVA 22% su € 100,00').nextElementSibling?.textContent).toBe('€ 22,00')
  })

  it('PortaConfigModal: «come la sezione» finché non si sceglie; 10% e ritorno alla sezione', () => {
    s().setAliquotaIvaSezione('porte', 4)
    s().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    const rigaId = s().sezioni.porte!.righe[0].id
    render(<PortaConfigModal rigaId={rigaId} listino={LISTINO} onClose={() => {}} />)
    const campo = select(screen.getByLabelText('IVA'))
    expect(campo.value).toBe('')
    expect(campo.options[0].textContent).toBe('Come la sezione (4%)')
    fireEvent.change(campo, { target: { value: '10' } })
    expect(s().sezioni.porte!.righe[0].aliquotaIva).toBe(10)
    fireEvent.change(campo, { target: { value: '' } })
    expect(s().sezioni.porte!.righe[0].aliquotaIva).toBeUndefined()
  })

  it('ArticoloConfigModal: l\'aliquota scelta esce col salvataggio', () => {
    const onSalva = vi.fn()
    render(<ArticoloConfigModal iniziale={articoloPZ} modalita="nuovo" onSalva={onSalva} onClose={() => {}} />)
    const campo = select(screen.getByLabelText('IVA'))
    expect(campo.options[0].textContent).toBe('Come la sezione (22%)')
    fireEvent.change(campo, { target: { value: '4' } })
    fireEvent.click(screen.getByText('Aggiungi al preventivo'))
    expect(onSalva).toHaveBeenCalledWith(expect.objectContaining({ aliquotaIva: 4 }), [])
  })

  it('pagina Porte: il battiscopa ha il suo selettore, e il riepilogo divide per aliquota', () => {
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO) })
    s().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 }) // 700 €, al 22% della sezione
    s().addBattiscopa('BATTISCOPA MASSELLO')
    const b = s().sezioni.porte!.battiscopa![0]
    s().updateBattiscopa(b.id, { altezzaCm: 10, metriLineari: 5 }) // 2 €/cm × 10 cm × 5 ml = 100 €
    render(<PortePage />)
    // Due selettori «IVA»: quello del battiscopa (con «come la sezione») e quello di sezione.
    const [riga, sezione] = screen.getAllByLabelText('IVA').map(select)
    expect(riga.options[0].textContent).toBe('Come la sezione (22%)')
    expect(sezione.value).toBe('22')
    expect(screen.queryByText(/^IVA \d+% su/)).toBeNull()
    fireEvent.change(riga, { target: { value: '10' } })
    expect(s().sezioni.porte!.battiscopa![0].aliquotaIva).toBe(10)
    expect(screen.getByText('IVA 10% su € 100,00')).toBeTruthy()
    expect(screen.getByText('IVA 22% su € 700,00')).toBeTruthy()
  })
})
