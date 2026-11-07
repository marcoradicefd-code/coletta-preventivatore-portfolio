import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

// ClientForm → quoteStore → pricelistStore → supabase: mock minimale (hermetico).
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { ClientForm } from '@/components/client/ClientForm'
import { PreventivoPrint } from '@/components/print/PreventivoPrint'
import { useQuoteStore } from '@/store/quoteStore'

// Decisione di Marco dell'08/10 (O34): la validità non resta mai vuota. Vuoto o
// 0 torna a 30 (PREVENTIVO!G9) al blur, visibile nel campo, così campo, store e
// PDF dicono la stessa cosa. Prima il campo restava vuoto e il PDF stampava 30.
describe('ClientForm — validità dell\'offerta (O34)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  const campoValidita = () => screen.getByRole<HTMLInputElement>('spinbutton')
  const validitaNelPdf = () => {
    cleanup()
    render(<PreventivoPrint />)
    return screen.getByText(/^Validità: \d+ giorni$/).textContent
  }

  it.each([
    ['vuoto', ''],
    ['0', '0'],
  ])('%s → 30 al blur: nel campo, nello store e nel PDF', (_caso, digitato) => {
    useQuoteStore.getState().setPreventivo({ validitaGiorni: 60 })
    render(<ClientForm />)
    fireEvent.change(campoValidita(), { target: { value: digitato } })
    fireEvent.blur(campoValidita())

    expect(campoValidita().value).toBe('30')
    expect(useQuoteStore.getState().preventivo.validitaGiorni).toBe(30)
    expect(validitaNelPdf()).toBe('Validità: 30 giorni')
  })

  it('60 → 60: nel campo, nello store e nel PDF', () => {
    render(<ClientForm />)
    fireEvent.change(campoValidita(), { target: { value: '60' } })
    fireEvent.blur(campoValidita())

    expect(campoValidita().value).toBe('60')
    expect(useQuoteStore.getState().preventivo.validitaGiorni).toBe(60)
    expect(validitaNelPdf()).toBe('Validità: 60 giorni')
  })
})

// O35: i token standard (given-name, tel, email…) facevano proporre al browser i
// dati di chi lo usa, cioè dell'operatore, dentro il preventivo del cliente.
// `off` non basta (Chrome lo ignora per l'Autofill): ogni campo porta un token
// che il browser non riconosce, col prefisso `cliente-`. Nessun valore digitato.
describe('ClientForm — niente Autofill dell\'operatore (O35)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  // Nomi dei campi Autofill e qualificatori della specifica HTML (WHATWG, § Autofill).
  const TOKEN_RICONOSCIUTI = new Set([
    'name', 'honorific-prefix', 'given-name', 'additional-name', 'family-name',
    'honorific-suffix', 'nickname', 'username', 'new-password', 'current-password',
    'one-time-code', 'organization-title', 'organization', 'street-address',
    'address-line1', 'address-line2', 'address-line3', 'address-level4',
    'address-level3', 'address-level2', 'address-level1', 'country', 'country-name',
    'postal-code', 'cc-name', 'cc-given-name', 'cc-additional-name', 'cc-family-name',
    'cc-number', 'cc-exp', 'cc-exp-month', 'cc-exp-year', 'cc-csc', 'cc-type',
    'transaction-currency', 'transaction-amount', 'language', 'bday', 'bday-day',
    'bday-month', 'bday-year', 'sex', 'url', 'photo', 'tel', 'tel-country-code',
    'tel-national', 'tel-area-code', 'tel-local', 'tel-local-prefix',
    'tel-local-suffix', 'tel-extension', 'email', 'impp', 'webauthn',
    'shipping', 'billing', 'home', 'work', 'mobile', 'fax', 'pager',
  ])
  const CAMPI_CLIENTE = ['nome', 'cognome', 'indirizzo', 'citta', 'telefono', 'email']

  it('i sei campi del cliente non hanno autoComplete="off" né un token che il browser riconosce', () => {
    const { container } = render(<ClientForm />)
    const campi = CAMPI_CLIENTE.map((n) => container.querySelector<HTMLInputElement>(`input[name="${n}"]`))
    expect(campi.filter(Boolean)).toHaveLength(6)

    const fuoriRegola = campi.flatMap((campo) => {
      const valore = campo?.getAttribute('autocomplete')
      if (valore == null) return [`${campo?.name}: assente`]
      const token = valore.trim().toLowerCase().split(/\s+/)
      const male =
        token[0] === 'off' ||
        token[0] === 'on' ||
        token[0].startsWith('section-') ||
        token.some((t) => TOKEN_RICONOSCIUTI.has(t))
      return male ? [`${campo?.name}: ${valore}`] : []
    })
    expect(fuoriRegola).toEqual([])
  })
})

describe('ClientForm — revisione funzionale del 14/10 sulla #97', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  const CLIENTE = { nome: 'Mario', cognome: 'Prova', indirizzo: 'Via di Prova 1', citta: 'Paese di Prova', telefono: '000 0000000', email: 'prova@example.test' }

  it('#13: riscegliere lo stesso cliente riallinea i campi, e la modifica di prima non torna nello store', () => {
    useQuoteStore.getState().collegaCliente('c-0001', CLIENTE)
    const { container } = render(<ClientForm />)
    const campo = (n: string) => container.querySelector<HTMLInputElement>(`input[name="${n}"]`) as HTMLInputElement
    fireEvent.change(campo('nome'), { target: { value: 'Marco' } })
    expect(useQuoteStore.getState().preventivo.cliente.nome).toBe('Marco')
    // Di nuovo lo stesso cliente dalla scelta (stesso id): i campi tornano quelli dell'anagrafica.
    act(() => useQuoteStore.getState().collegaCliente('c-0001', CLIENTE))
    expect(campo('nome').value).toBe('Mario')
    // Al tasto dopo, in un altro campo, il valore vecchio non torna nello store.
    fireEvent.change(campo('cognome'), { target: { value: 'Prova Finta' } })
    expect(useQuoteStore.getState().preventivo.cliente).toMatchObject({ nome: 'Mario', cognome: 'Prova Finta' })
  })

  it('#16: ogni etichetta del form è associata al suo campo, con un id non indovinabile (useId)', () => {
    const { container } = render(<ClientForm />)
    const etichette = Array.from(container.querySelectorAll('label'))
    expect(etichette.length).toBeGreaterThanOrEqual(11)
    for (const l of etichette) {
      const campo = l.htmlFor ? document.getElementById(l.htmlFor) : null
      expect(campo, l.textContent ?? '').not.toBeNull()
      // Chrome deduce il tipo di Autofill anche dall'id: niente «nome», «email»… (rule `ui`, O35).
      expect(l.htmlFor).not.toMatch(/^(numero|data|validitaGiorni|oggettoPreventivo|note|nome|cognome|indirizzo|citta|telefono|email)$/)
    }
    expect(screen.getByLabelText(/^Nome/)).toBe(container.querySelector('input[name="nome"]'))
    expect(screen.getByLabelText('Note aggiuntive')).toBe(container.querySelector('textarea[name="note"]'))
  })
})

// U16 (revisione L15-L21): Nome e Cognome avevano l'asterisco dei campi
// obbligatori, ma da L21-B non lo sono; «N. Preventivo» sembrava modificabile.
describe('ClientForm — obbligatori e sola lettura (U16)', () => {
  afterEach(() => cleanup())
  it('niente asterisco su Nome e Cognome; il numero in sola lettura non ha l’aspetto di un campo da scrivere', () => {
    render(<ClientForm />)
    for (const nome of ['Nome', 'Cognome']) {
      const etichetta = screen.getByText(nome, { selector: 'label' })
      expect(etichetta.textContent, nome).toBe(nome)
    }
    const numero = screen.getByLabelText('N. Preventivo')
    expect(numero.className).toContain('bg-transparent')
    expect(numero.className).not.toContain('bg-surface-tertiary')
  })
})
