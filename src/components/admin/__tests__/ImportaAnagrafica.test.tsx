import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test-utils/supabaseFinto')).supabaseFinto.client,
  LISTINI_BUCKET: 'Listini',
}))
// Il worker vero non c'è in jsdom: qui gira lo stesso parser, sul buffer del file scelto.
vi.mock('@/lib/excelWorker', async () => {
  const { leggiCsvAnagrafica, decodificaAnagrafica } = await import('@/lib/anagraficaCsv')
  return { parseExcelInWorker: vi.fn(async (_tipo: string, buffer: ArrayBuffer) => leggiCsvAnagrafica(decodificaAnagrafica(buffer))) }
})

import { supabaseFinto, clienteFinto, DATI_FINTI, EMAIL_FINTA, RAGIONE_SOCIALE_FINTA } from '@/test-utils/supabaseFinto'
import { spiaConsole } from '@/test-utils/spiaConsole'
import { csvFinto, INTESTAZIONE_FINTA } from '@/test-utils/anagraficaFinta'
import { ImportaAnagrafica, MAX_BYTE_ANAGRAFICA } from '@/components/admin/ImportaAnagrafica'
import { COLONNE_CONFRONTO } from '@/lib/importAnagrafica'
import { useAuthStore } from '@/store/authStore'

/** Il file finto: un nuovo, un doppione per telefono (con spazi diversi) del cliente creato a mano, una scartata. */
const FILE = csvFinto([
  { codice: '401', ragione: 'Nuovo Prova Snc', telefono: '000 4000001', localita: 'Paese di Prova', segnalazioni: 'telefono da verificare' },
  { codice: '402', ragione: 'Arch. Altro Nome Prova', telefono: '0004000002', indirizzo: 'Via del File 2' },
  { codice: '', ragione: 'Senza Codice Prova' },
])
// Il telefono di zeri di `clienteFinto` è un segnaposto e non è più una chiave (F4): qui un numero vero, finto.
const A_MANO = clienteFinto({ id: 'a-1', indirizzo: null, telefono: '000 400 0002', partita_iva: '00011122233' })

const sceglie = (testo: string, nome = 'anagrafica.csv', tipo = 'text/csv') =>
  fireEvent.change(screen.getByLabelText('File dell’anagrafica (.csv)'), { target: { files: [new File([testo], nome, { type: tipo })] } })

/** Le letture del confronto: senza codice, poi col codice; ognuna a pagine fino alla pagina vuota. */
function confrontoInCoda(senza = [A_MANO], con: { id: string; codice_gestionale: string }[] = []) {
  for (const pagina of [senza, con]) {
    if (pagina.length > 0) supabaseFinto.risposte.push({ data: pagina, error: null })
    supabaseFinto.risposte.push({ data: [], error: null })
  }
}

const chiamateScrittura = () => supabaseFinto.chiamate.filter((c) => c.passi.some(([p]) => p === 'insert' || p === 'update'))

const spia = spiaConsole()
beforeEach(() => {
  supabaseFinto.reset()
  useAuthStore.setState({ isAdmin: true })
  spia.avvia()
})
afterEach(() => {
  // Presidio dei log (L21): nessun dato del file né dei clienti nella console, mai.
  expect(spia.trovati([...DATI_FINTI, 'Nuovo Prova Snc', 'Via del File 2'])).toEqual([])
  spia.ripristina()
  cleanup()
  useAuthStore.setState({ isAdmin: false })
})

describe('ImportaAnagrafica — solo admin, anteprima, scelte, report (L21, PR C)', () => {
  it('chi non è admin non vede l’import (lo ripete il database, 0006)', () => {
    useAuthStore.setState({ isAdmin: false })
    render(<ImportaAnagrafica />)
    expect(screen.getByRole('alert').textContent).toContain('solo per l’amministratore')
    expect(screen.queryByLabelText('File dell’anagrafica (.csv)')).toBeNull()
  })

  it('anteprima prima di scrivere: conteggi, prime righe, segnalazioni, scartate col motivo, doppione mostrato e non fuso', async () => {
    confrontoInCoda()
    render(<ImportaAnagrafica />)
    sceglie(FILE)
    const anteprima = await screen.findByRole('region', { name: 'Anteprima dell’import' })
    const conteggi = within(anteprima).getByText('Clienti nuovi').closest('dl') as HTMLElement
    expect(conteggi.textContent).toContain('Righe lette3')
    expect(conteggi.textContent).toContain('Clienti nuovi1')
    expect(conteggi.textContent).toContain('Possibili doppioni con clienti già nell’app1')
    expect(conteggi.textContent).toContain('Righe scartate1')
    expect(within(anteprima).getByText('Riga 4: codice gestionale mancante')).toBeTruthy()
    expect(within(anteprima).getByText('Riga 2: telefono da verificare')).toBeTruthy()
    const doppione = within(anteprima).getByRole('group', { name: /Riga 3: Arch\. Altro Nome Prova/ })
    expect(within(doppione).getByRole('radio', { name: new RegExp(`Collega a «${RAGIONE_SOCIALE_FINTA}» \\(stesso telefono`) })).toBeTruthy()
    // F3 (verdetto del 15/10): località e partita IVA del candidato nell'etichetta, per non collegare alla cieca.
    expect(within(doppione).getByRole('radio', { name: /Collega a/ }).closest('label')?.textContent).toMatch(/Paese di Prova.*P\.IVA 00011122233/)
    // Di default nessuna scelta.
    expect(within(doppione).getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true)
    // Il confronto scarica solo i campi del confronto.
    expect(supabaseFinto.arg(0, 'select')).toBe(COLONNE_CONFRONTO)
    expect(chiamateScrittura()).toEqual([])
  })

  it('nessuna scelta per un doppione: «Importa» non parte, lo dice e porta il focus sulla scelta', async () => {
    confrontoInCoda()
    render(<ImportaAnagrafica />)
    sceglie(FILE)
    await screen.findByRole('region', { name: 'Anteprima dell’import' })
    fireEvent.click(screen.getByRole('button', { name: 'Importa' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Manca la scelta per 1 possibile doppione \(riga 3\): l’import non parte/)
    expect(document.activeElement).toBe(screen.getAllByRole('radio')[0])
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(chiamateScrittura()).toEqual([])
  })

  it('«Collega», conferma, import: il codice al cliente creato a mano, i campi scritti a mano restano; il report conta tutto', async () => {
    confrontoInCoda()
    render(<ImportaAnagrafica />)
    sceglie(FILE)
    await screen.findByRole('region', { name: 'Anteprima dell’import' })
    fireEvent.click(screen.getByRole('radio', { name: /Collega a/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Importa' }))
    const conferma = await screen.findByRole('alertdialog')
    // F6 (verdetto del 15/10): la conferma dice quanti nuovi e quanti «Collega», e che il codice poi non si cambia.
    expect(conferma.textContent).toMatch(/Clienti nuovi: 1\..*Collegati a un cliente già nell’app: 1, e il codice gestionale poi non si cambia più\..*Già nell’app col codice, solo i campi vuoti: 0\..*Saltati: 0\./)
    supabaseFinto.risposte.push({ data: [A_MANO], error: null }, { data: { id: 'a-1' }, error: null }, { data: [{}], error: null })
    fireEvent.click(within(conferma).getByRole('button', { name: 'Importa l’anagrafica' }))
    const esito = await screen.findByRole('region', { name: 'Esito dell’import' })
    expect(esito.textContent).toContain('Importati (clienti nuovi)1')
    expect(esito.textContent).toContain('Collegati a un cliente già nell’app1')
    expect(esito.textContent).toContain('Saltati0')
    expect(esito.textContent).toContain('Scartati1')
    expect(within(esito).getByText('Riga 4: codice gestionale mancante')).toBeTruthy()
    const collega = supabaseFinto.chiamate.find((c) => c.passi.some(([p]) => p === 'update'))
    expect(collega?.passi.find(([p]) => p === 'update')?.[1][0]).toEqual({ codice_gestionale: '402', indirizzo: 'Via del File 2' })
    expect(JSON.stringify(collega?.passi)).not.toContain(EMAIL_FINTA)
  })

  it('«Salta» dopo la conferma «Torna indietro» non scrive niente; poi lo scrive come saltato', async () => {
    confrontoInCoda()
    render(<ImportaAnagrafica />)
    sceglie(FILE)
    await screen.findByRole('region', { name: 'Anteprima dell’import' })
    fireEvent.click(screen.getByRole('radio', { name: /^Salta/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Importa' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Torna indietro' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(chiamateScrittura()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Importa' }))
    supabaseFinto.risposte.push({ data: [{}], error: null })
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Importa l’anagrafica' }))
    const esito = await screen.findByRole('region', { name: 'Esito dell’import' })
    expect(esito.textContent).toContain('Saltati1')
    expect(chiamateScrittura()).toHaveLength(1)
    // F7 (verdetto del 15/10): l'esito annunciato nell'<output> e il focus sul titolo dell'esito, non sul body.
    await waitFor(() => expect(document.activeElement).toBe(within(esito).getByRole('heading', { name: 'Import finito' })))
    expect(document.querySelector('output')?.textContent).toBe('Import finito: 1 importati, 0 aggiornati, 0 già presenti, 0 collegati, 1 saltati, 1 scartati.')
  })

  it('DB-2 (verdetto del 15/10). un errore che vale per tutti ferma l’import: il report lo dice, con le righe non scritte', async () => {
    confrontoInCoda()
    render(<ImportaAnagrafica />)
    sceglie(FILE)
    await screen.findByRole('region', { name: 'Anteprima dell’import' })
    fireEvent.click(screen.getByRole('radio', { name: /^Salta/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Importa' }))
    supabaseFinto.risposte.push({ data: null, error: { code: 'PGRST301', message: EMAIL_FINTA }, status: 401 })
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Importa l’anagrafica' }))
    const esito = await screen.findByRole('region', { name: 'Esito dell’import' })
    expect(within(esito).getByRole('alert').textContent).toContain('Import fermato: la sessione è scaduta.')
    expect(esito.textContent).toContain('Non scritte (import fermato)1')
    expect(esito.textContent).toContain('dall’esito sconosciuto, le righe 2.')
    expect(esito.textContent).not.toContain(EMAIL_FINTA)
  })

  it('intestazione sbagliata: file rifiutato col motivo, nessuna lettura né scrittura nel database', async () => {
    render(<ImportaAnagrafica />)
    sceglie(csvFinto([{ codice: '501', ragione: 'Prova' }], { intestazione: INTESTAZIONE_FINTA.replace('email', 'mail') }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/^File rifiutato: colonna 4 dell’intestazione: attesa «email»/)
    expect(supabaseFinto.chiamate).toEqual([])
  })

  it('un file troppo grande si rifiuta prima di leggerlo', async () => {
    render(<ImportaAnagrafica />)
    const grande = new File(['x'], 'grande.csv', { type: 'text/csv' })
    Object.defineProperty(grande, 'size', { value: MAX_BYTE_ANAGRAFICA + 1 })
    fireEvent.change(screen.getByLabelText('File dell’anagrafica (.csv)'), { target: { files: [grande] } })
    expect((await screen.findByRole('alert')).textContent).toContain('supera i 5 MB')
    expect(supabaseFinto.chiamate).toEqual([])
  })

  it('la lettura dei clienti fallisce: errore senza dati personali e «Riprova», che rifà solo il confronto', async () => {
    supabaseFinto.risposte.push({ data: null, error: { code: '42501', message: EMAIL_FINTA } })
    render(<ImportaAnagrafica />)
    sceglie(FILE)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Operazione non consentita per questo account.')
    expect(alert.textContent).not.toContain(EMAIL_FINTA)
    confrontoInCoda([], [{ id: 'g-1', codice_gestionale: '401' }])
    fireEvent.click(within(alert).getByRole('button', { name: 'Riprova' }))
    const anteprima = await screen.findByRole('region', { name: 'Anteprima dell’import' })
    expect(within(anteprima).getByText('Già nell’app col codice (si riempiono solo i campi vuoti)').nextSibling?.textContent).toBe('1')
  })
})
