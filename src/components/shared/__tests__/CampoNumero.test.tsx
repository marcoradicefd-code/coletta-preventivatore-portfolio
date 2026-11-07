import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Le pagine → quoteStore → pricelistStore → supabase: mock minimale (hermetico),
// come PortaConfigModal.test.tsx e CucinePage.test.tsx.
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { ProgettoValorePage } from '@/components/valore/ProgettoValorePage'
import { PortaConfigModal } from '@/components/porte/PortaConfigModal'
import { CucinePage } from '@/components/cucine/CucinePage'
import { DimensionInput } from '@/components/marmeria/DimensionInput'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'
import type { ListinoPorte } from '@/types/porte'

/**
 * L24, punti 1 e 2: i difetti visti registrando i video. Il prezzo di Progetto a
 * valore mostrava «0», il clic metteva il cursore prima dello zero e «1200»
 * diventava 12000; la rotella cambiava il numero col cursore dentro.
 *
 * Limite di jsdom, dichiarato: non ha il cursore, la selezione dei campo
 * `type="number"` (`selectionStart` vale `null` per spec) né l'azione della
 * rotella. Qui si prova ciò che il componente FA (chiama `select()` al focus,
 * lascia il focus alla rotella, mostra vuoto lo 0); che il browser poi sostituisca
 * il testo selezionato e non cambi un campo senza focus l'ha misurato una sonda
 * in Chromium 147 (body della PR).
 */

const prezzi = () => screen.getAllByLabelText('Prezzo') as HTMLInputElement[]

/**
 * Il clic e la battitura del video, nel modello che jsdom non ha: il cursore va
 * PRIMA del contenuto (lì l'ha messo il clic, il campo è allineato a destra) e
 * il testo battuto vi si attacca, a meno che il contenuto non sia selezionato
 * (`select()` chiamato al focus) o vuoto.
 */
function cliccaEScrivi(campo: HTMLInputElement, testo: string) {
  const select = vi.spyOn(campo, 'select')
  fireEvent.focus(campo)
  const sostituisce = select.mock.calls.length > 0 || campo.value === ''
  fireEvent.change(campo, { target: { value: sostituisce ? testo : testo + campo.value } })
  select.mockRestore()
}

describe('CampoNumero — Progetto a valore (punto 1)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  it('clic nel prezzo e «1200» → prezzo 1200, mai 12000', () => {
    render(<ProgettoValorePage />)
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi voce/ }))
    cliccaEScrivi(prezzi()[0], '1200')
    expect(useQuoteStore.getState().sezioni.progettoValore!.righe[0].prezzo).toBe(1200)
  })

  it('il prezzo a 0 si mostra vuoto col segnaposto «0»; nello store resta 0', () => {
    render(<ProgettoValorePage />)
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi voce/ }))
    expect(prezzi()[0].value).toBe('')
    expect(prezzi()[0].placeholder).toBe('0')
    expect(useQuoteStore.getState().sezioni.progettoValore!.righe[0].prezzo).toBe(0)
  })

  it('lo sconto di sezione a 0 si mostra vuoto col segnaposto «0»', () => {
    render(<ProgettoValorePage />)
    const sconto = screen.getByLabelText('Sconto') as HTMLInputElement
    expect(sconto.value).toBe('')
    expect(sconto.placeholder).toBe('0')
  })

  it('«0,5» si scrive: lo zero davanti non sparisce mentre si scrive', () => {
    render(<ProgettoValorePage />)
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi voce/ }))
    const campo = prezzi()[0]
    fireEvent.focus(campo)
    fireEvent.change(campo, { target: { value: '0' } })
    expect(campo.value).toBe('0')
    fireEvent.change(campo, { target: { value: '0.5' } })
    expect(campo.value).toBe('0.5')
    expect(useQuoteStore.getState().sezioni.progettoValore!.righe[0].prezzo).toBe(0.5)
    fireEvent.blur(campo)
    expect(campo.value).toBe('0.5')
  })
})

const LISTINO_PORTE: ListinoPorte = {
  modelli: [{ nome: 'RAFFAELLA', prezzo2026: 880, h215: 1060, h240: 1150 }],
  optional: [],
  aggiornato: 'test',
}

function montaPorta() {
  useQuoteStore.getState().addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 210 })
  const rigaId = useQuoteStore.getState().sezioni.porte!.righe[0].id
  render(<PortaConfigModal rigaId={rigaId} listino={LISTINO_PORTE} onClose={() => {}} />)
  return rigaId
}

describe('CampoNumero — il focus seleziona il contenuto, in sezioni diverse (punto 1)', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ cucine: validatoPerTest(listinoCucinaFinto) })
  })
  afterEach(() => cleanup())

  function selezionaAlFocus(campo: HTMLInputElement) {
    const select = vi.spyOn(campo, 'select')
    fireEvent.focus(campo)
    return select.mock.calls.length
  }

  it('Progetto a valore: prezzo e sconto', () => {
    render(<ProgettoValorePage />)
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi voce/ }))
    expect(selezionaAlFocus(prezzi()[0])).toBe(1)
    expect(selezionaAlFocus(screen.getByLabelText('Sconto') as HTMLInputElement)).toBe(1)
  })

  it('Porte: la quantità resta «1» e si seleziona; altezza selezionata', () => {
    montaPorta()
    const quantita = screen.getByLabelText('Quantità porte') as HTMLInputElement
    expect(quantita.value).toBe('1')
    expect(selezionaAlFocus(quantita)).toBe(1)
    expect(selezionaAlFocus(screen.getByLabelText('Altezza porta (cm)') as HTMLInputElement)).toBe(1)
  })

  it('Porte: quantità svuotata e poi «3» → 3, non 13', () => {
    const rigaId = montaPorta()
    const quantita = screen.getByLabelText('Quantità porte') as HTMLInputElement
    fireEvent.focus(quantita)
    fireEvent.change(quantita, { target: { value: '' } })
    expect(quantita.value).toBe('')
    fireEvent.change(quantita, { target: { value: '3' } })
    expect(useQuoteStore.getState().sezioni.porte!.righe.find((r) => r.id === rigaId)!.quantita).toBe(3)
    // Lasciato vuoto, all'uscita il campo torna a dire il valore su cui si calcola.
    fireEvent.change(quantita, { target: { value: '' } })
    fireEvent.blur(quantita)
    expect(quantita.value).toBe('1')
  })

  it('Cucine: quantità di una voce e sconto (0 → vuoto)', () => {
    render(<CucinePage />)
    expect(selezionaAlFocus(screen.getByLabelText(/Quantità ANTA IN VETRO VISARM/i) as HTMLInputElement)).toBe(1)
    const sconto = screen.getByLabelText('Sconto') as HTMLInputElement
    expect(sconto.value).toBe('')
    expect(selezionaAlFocus(sconto)).toBe(1)
  })

  it('Gres: profondità del top', () => {
    render(<DimensionInput value={0} onChange={() => {}} />)
    expect(selezionaAlFocus(screen.getByRole('spinbutton') as HTMLInputElement)).toBe(1)
  })
})

describe('CampoNumero — la rotella non cambia il numero (punto 2)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  it('wheel su un campo col focus: il campo perde il focus e il valore non cambia', () => {
    render(<ProgettoValorePage />)
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi voce/ }))
    const campo = prezzi()[0]
    fireEvent.change(campo, { target: { value: '1250' } })
    campo.focus()
    expect(document.activeElement).toBe(campo)
    fireEvent.wheel(campo, { deltaY: -100 })
    expect(document.activeElement).not.toBe(campo)
    expect(campo.value).toBe('1250')
    expect(useQuoteStore.getState().sezioni.progettoValore!.righe[0].prezzo).toBe(1250)
  })

  it('wheel su un campo senza focus: niente da fare, il focus resta dov’è', () => {
    render(<ProgettoValorePage />)
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi voce/ }))
    const sconto = screen.getByLabelText('Sconto') as HTMLInputElement
    sconto.focus()
    fireEvent.wheel(prezzi()[0], { deltaY: 100 })
    expect(document.activeElement).toBe(sconto)
  })
})

/** Tutti i file `.tsx` di `src/components`, test esclusi. */
function componenti(dir = join(process.cwd(), 'src/components')): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) return nome === '__tests__' ? [] : componenti(p)
    return p.endsWith('.tsx') ? [p] : []
  })
}

describe('CampoNumero — un punto solo (presidio)', () => {
  it('nessun componente scrive `type="number"` a mano: i campi numerici passano da CampoNumero', () => {
    const fuori = componenti()
      .filter((p) => !p.endsWith('CampoNumero.tsx'))
      .filter((p) => readFileSync(p, 'utf8').includes('type="number"'))
      .map((p) => p.slice(p.indexOf('src/')))
    expect(fuori).toEqual([])
  })
})
