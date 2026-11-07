import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// PreventivoPrint → quoteStore → pricelistStore → supabase: mock minimale (hermetico).
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { PreventivoPrint } from '@/components/print/PreventivoPrint'
import { useQuoteStore } from '@/store/quoteStore'
import { articoloPZ } from '@/test-utils/articoli'
import { blobPrimaDiL18, CHIAVE_BLOB } from '@/test-utils/blobPrimaDiL18'
import { impronta } from '@/utils/impronta'

// Valori finti e tondi, nomi di ambienti: il caso del 09/10 ricostruito.
const s = () => useQuoteStore.getState()
/** L'importo stampato accanto a un'etichetta di riepilogo (`SummaryRow`). */
const riga = (label: string) => screen.getByText(label).parentElement!.children[1].textContent
/** Le descrizioni nella tabella che segue il titolo di un arredo. */
const descrizioniSotto = (titolo: string) => {
  const tabella = screen.getByText(titolo).nextElementSibling!
  return Array.from(tabella.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td div')?.textContent)
}

/** Ingresso: a giorno 300, armadio 1.200, 2 cassetti × 150, led 100 = 1.900. Matrimoniale: armadio 2.000, boiserie 800 = 2.800. */
function casoDel0910() {
  const ingresso = s().addArredo('Ingresso')
  const matrimoniale = s().addArredo('Matrimoniale')
  const voce = (descrizione: string, prezzoUnitario: number, arredoId: string, quantita = 1) =>
    s().addArticoloSuMisura({ ...articoloPZ, descrizione, prezzoUnitario, quantita, arredoId })
  voce('A giorno', 300, ingresso)
  voce('Armadio ingresso', 1200, ingresso)
  voce('Armadio matrimoniale', 2000, matrimoniale)
  voce('Cassetti', 150, ingresso, 2)
  voce('Boiserie', 800, matrimoniale)
  voce('Led', 100, ingresso)
  s().setScontoSezione('arredi', 0.1)
  s().setQuotaProgettazione(true)
}

describe('PreventivoPrint — Arredi raggruppati per arredo (L19)', () => {
  beforeEach(() => s().resetAll())
  afterEach(() => cleanup())

  it('il controllo di Marco: due blocchi col loro subtotale, e il totale Arredi è quello senza gruppi', () => {
    casoDel0910()
    const { unmount } = render(<PreventivoPrint />)
    expect(descrizioniSotto('Ingresso')).toEqual(['A giorno', 'Armadio ingresso', 'Cassetti', 'Led'])
    expect(descrizioniSotto('Matrimoniale')).toEqual(['Armadio matrimoniale', 'Boiserie'])
    // Nell'ordine degli arredi, e il riepilogo di sezione dopo.
    const testo = document.body.textContent ?? ''
    expect(testo.indexOf('Subtotale Ingresso')).toBeLessThan(testo.indexOf('Matrimoniale'))
    expect(testo.indexOf('Subtotale Matrimoniale')).toBeLessThan(testo.indexOf('Subtotale falegnameria'))
    // Con la quota spalmata nelle righe (L25): 376 è l'8% esatto di ogni riga,
    // Ingresso 1.900 + 152, Matrimoniale 2.800 + 224.
    expect(riga('Subtotale Ingresso')).toBe('€ 2.052,00')
    expect(riga('Subtotale Matrimoniale')).toBe('€ 3.024,00')
    expect(screen.queryByText('Altre voci')).toBeNull()
    // 4.700 + 8% del lordo (376) = 5.076, − 10% del lordo (470) = 4.606, il totale di sempre.
    expect(riga('Subtotale falegnameria')).toBe('€ 5.076,00')
    expect(riga('Sconto')).toBe('- € 470,00')
    expect(riga('Totale Su Misura')).toBe('€ 4.606,00')
    unmount()

    // Lo stesso preventivo senza gruppi: stesso totale, al centesimo.
    for (const a of s().sezioni.arredi!.arredi!) s().removeArredo(a.id, 'sposta')
    render(<PreventivoPrint />)
    expect(screen.queryByText('Subtotale Ingresso')).toBeNull()
    expect(riga('Subtotale falegnameria')).toBe('€ 5.076,00')
    expect(riga('Totale Su Misura')).toBe('€ 4.606,00')
  })

  it('«Altre voci» dopo gli arredi, con le voci senza arredo o di un arredo tolto; un arredo vuoto non si stampa', () => {
    const studio = s().addArredo('Studio')
    s().addArredo('Cameretta') // vuoto
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Mensola' })
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Libreria', prezzoUnitario: 500, arredoId: studio })
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Scarpiera', prezzoUnitario: 250, arredoId: 'arredo-tolto' })
    render(<PreventivoPrint />)
    expect(descrizioniSotto('Studio')).toEqual(['Libreria'])
    expect(descrizioniSotto('Altre voci')).toEqual(['Mensola', 'Scarpiera'])
    expect(screen.queryByText('Cameretta')).toBeNull()
    expect(riga('Subtotale Studio')).toBe('€ 500,00')
    expect(riga('Subtotale Altre voci')).toBe('€ 350,00')
    expect(riga('Totale Su Misura')).toBe('€ 850,00')
  })

  it('la colonna IVA di L18 resta per riga, in ogni blocco', () => {
    const ingresso = s().addArredo('Ingresso')
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Armadio', arredoId: ingresso, aliquotaIva: 10 })
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Mensola' })
    render(<PreventivoPrint />)
    const celle = (descrizione: string) =>
      Array.from(screen.getByText(descrizione).closest('tr')!.querySelectorAll('td')).map((td) => td.textContent).slice(-2)
    expect(celle('Armadio')).toEqual(['10%', '€ 100,00'])
    expect(celle('Mensola')).toEqual(['22%', '€ 100,00'])
  })

  it('un elemento da matrice esce come «Armadio con ante — interno …, esterno …», col −10% e il suo importo (L20)', () => {
    const ingresso = s().addArredo('Ingresso')
    s().addArticoloSuMisura({
      ...articoloPZ, descrizione: 'Armadio con ante', prezzoUnitario: 523, um: 'MQ', quantita: null, larghezzaCm: 300, altezzaCm: 100,
      profonditaSotto40: true, arredoId: ingresso,
      combinazione: { tipo: 'ARMADIO CON ANTE', interno: 'LAMINATO BIANCO', esterno: 'LACCATO OPACO' },
    })
    s().addArticoloSuMisura({
      ...articoloPZ, descrizione: 'Telaio con ante', prezzoUnitario: 853, um: 'MQ', quantita: null, larghezzaCm: 100, altezzaCm: 300,
      arredoId: ingresso, combinazione: { tipo: 'TELAIO CON ANTE', interno: '', esterno: 'LACCATO OPACO' },
    })
    render(<PreventivoPrint />)
    expect(descrizioniSotto('Ingresso')).toEqual([
      'Armadio con ante — interno laminato bianco, esterno laccato opaco',
      'Telaio con ante — esterno laccato opaco',
    ])
    const riga = screen.getByText(/^Armadio con ante —/).closest('tr')!
    expect(riga.textContent).toContain('−10% prof.')
    // 3 mq × 523 = 1.569 − 157; telaio 3 mq × 853 = 2.559.
    expect(riga.lastElementChild!.textContent).toBe('€ 1.412,00')
    expect(screen.getByText('Subtotale Ingresso').parentElement!.children[1].textContent).toBe('€ 3.971,00')
  })

  it('il nome dell arredo non resta orfano a fine pagina e il suo subtotale non si spezza', () => {
    const ingresso = s().addArredo('Ingresso')
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Armadio', arredoId: ingresso })
    render(<PreventivoPrint />)
    const titolo = screen.getByText('Ingresso')
    expect(titolo.getAttribute('style')).toMatch(/(^|; )break-after: avoid/)
    expect(titolo.getAttribute('style')).toMatch(/page-break-after: avoid/)
    // Il contenitore di «Subtotale Ingresso» (`SummaryRow` dentro il suo wrapper).
    const subtotale = screen.getByText('Subtotale Ingresso').parentElement!.parentElement!
    expect(subtotale.getAttribute('style')).toMatch(/(^|; )break-inside: avoid/)
    expect(subtotale.getAttribute('style')).toMatch(/page-break-inside: avoid/)
  })
})

describe('presidio: un preventivo salvato prima di L19 nel PDF', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    cleanup()
    localStorage.clear()
    s().resetAll()
  })

  it('si stampa come prima (una tabella, nessun titolo); con un arredo nuovo tutto va in «Altre voci», stesso totale', async () => {
    localStorage.setItem(CHIAVE_BLOB, JSON.stringify(blobPrimaDiL18))
    await useQuoteStore.persist.rehydrate()
    const { unmount } = render(<PreventivoPrint />)
    expect(screen.queryByText('Altre voci')).toBeNull()
    expect(screen.queryByText(/^Subtotale (?!falegnameria$)./)).toBeNull()
    expect(screen.getByText('Mobile').closest('table')!.previousElementSibling!.textContent).not.toBe('Altre voci')
    expect(riga('Totale Su Misura')).toBe('€ 200,00')
    unmount()

    s().addArredo('Ingresso')
    render(<PreventivoPrint />)
    expect(descrizioniSotto('Altre voci')).toEqual(['Mobile'])
    expect(riga('Subtotale Altre voci')).toBe('€ 200,00')
    expect(riga('Totale Su Misura')).toBe('€ 200,00')
  })
})

describe('PreventivoPrint — quota progettazione spalmata nelle righe (L25)', () => {
  beforeEach(() => {
    s().resetAll()
    // Data fissa: l'intestazione la stampa, e l'impronta del PDF senza quota non deve dipendere dal giorno.
    s().setPreventivo({ data: '2026-10-15', includiCondizioni: false })
  })
  afterEach(() => cleanup())

  /** 333,33 × 1 → 333 · 150 × 2 → 300 · 99,95 × 1 → 100: subtotale 733, sconto 10% 73, quota 8% 59. */
  function treRighe() {
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Libreria', prezzoUnitario: 333.33 })
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Cassetti', prezzoUnitario: 150, quantita: 2 })
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Mensola', prezzoUnitario: 99.95, aliquotaIva: 10 })
    s().setScontoSezione('arredi', 0.1)
  }
  /** Le celle €/unit e Totale di una riga, per descrizione. */
  const celle = (descrizione: string) => {
    const td = screen.getByText(descrizione).closest('tr')!.querySelectorAll('td')
    return [td[2].textContent, td[td.length - 1].textContent]
  }

  it('con la quota: ogni riga la contiene, le righe sommano al subtotale, Subtotale − Sconto = Totale', () => {
    treRighe()
    s().setQuotaProgettazione(true)
    render(<PreventivoPrint />)
    // 59 in proporzione: 26,8 · 24,1 · 8,0 → 26 + 24 + 8 = 58, l'euro di resto alla
    // prima (resto maggiore). €/unit nella stessa proporzione del totale della riga.
    expect(celle('Libreria')).toEqual(['€ 360,36', '€ 360,00'])
    expect(celle('Cassetti')).toEqual(['€ 162,00', '€ 324,00'])
    expect(celle('Mensola')).toEqual(['€ 107,95', '€ 108,00'])
    // 360 + 324 + 108 = 792 = 733 + 59.
    expect(riga('Subtotale falegnameria')).toBe('€ 792,00')
    // Lo sconto è sul lordo senza quota: con la quota la percentuale non torna, quindi non si stampa.
    expect(riga('Sconto')).toBe('- € 73,00')
    expect(screen.queryByText(/^Sconto \(/)).toBeNull()
    // 792 − 73 = 719 = 733 − 73 + 59: il totale di sempre.
    expect(riga('Totale Su Misura')).toBe('€ 719,00')
    expect(screen.queryByText(/Quota progettazione/)).toBeNull()
  })

  it('con la quota la parola «progettazione» compare solo nella descrizione della sezione', () => {
    treRighe()
    s().setQuotaProgettazione(true)
    render(<PreventivoPrint />)
    const testo = document.body.textContent ?? ''
    expect(testo.match(/progettazione/gi)).toHaveLength(1)
    expect(screen.getByText(/Rilievo, progettazione/).textContent).toContain('CARATTERISTICHE GENERALI')
  })

  it('senza la quota il PDF è identico a prima di L25', () => {
    treRighe()
    const ingresso = s().addArredo('Ingresso')
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Armadio', prezzoUnitario: 523, arredoId: ingresso })
    render(<PreventivoPrint />)
    expect(celle('Libreria')).toEqual(['€ 333,33', '€ 333,00'])
    expect(riga('Sconto (10%)')).toBe('- € 126,00')
    // L'impronta dell'HTML intero, misurata su `main` dd129f4 prima di L25 con lo stesso stato.
    expect(impronta(document.body.innerHTML)).toBe('d30947d9-15022')
  })
})
