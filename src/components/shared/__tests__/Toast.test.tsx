import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useRef } from 'react'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { ToastProvider, AUTO_DISMISS_MS } from '@/components/shared/Toast'
import { useToast } from '@/components/shared/toastContext'

/**
 * Banco di prova: un pulsante per ogni via d'ingresso del provider. I test
 * premono i pulsanti invece di chiamare l'API a mano, così passano dallo stesso
 * percorso dei componenti veri (render → context → setState).
 */
function Banco() {
  const { showToast, setNotifica } = useToast()
  const numero = useRef(0)
  return (
    <>
      <button onClick={() => showToast(`Errore numero ${(numero.current += 1)}`, 'error')}>errore-numerato</button>
      <button onClick={() => showToast('Porte — rotto', 'error')}>errore-come-persistente</button>
      <button onClick={() => showToast('Listino caricato', 'success')}>successo</button>
      <button onClick={() => showToast('Formato non valido. Usa .xlsx o .xls', 'error')}>errore-evento</button>
      <button onClick={() => showToast('"B.xlsx" eliminato', 'success')}>secondo-successo</button>
      <button onClick={() => setNotifica('listino:porte', { message: 'Porte — rotto', type: 'error' })}>
        persistente
      </button>
      <button onClick={() => setNotifica('listino:porte', null)}>rimuovi-persistente</button>
    </>
  )
}

function renderBanco() {
  return render(
    <ToastProvider>
      <Banco />
    </ToastProvider>
  )
}

async function avanza(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/**
 * L'`avanza(0)` dopo il click non è scaramanzia: AnimatePresence smonta il nodo
 * al giro DOPO quello in cui React lo toglie dallo stato, anche con le
 * animazioni spente (vedi test-utils/setup.ts). Senza, un'asserzione di
 * sparizione legge il frame precedente all'uscita e fallisce per il motivo
 * sbagliato.
 */
async function premi(nome: string) {
  fireEvent.click(screen.getByRole('button', { name: nome }))
  await avanza(0)
}

/** Tutto ciò che è a schermo, errori (alert) e successi (status) insieme. */
function visibili(): string[] {
  return [...screen.queryAllByRole('alert'), ...screen.queryAllByRole('status')].map(
    (n) => n.textContent ?? ''
  )
}

describe('ToastProvider — eventi effimeri e notifiche derivate', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('un evento sparisce da solo dopo l auto-dismiss', async () => {
    // Comportamento di OGGI, che la PR non deve rompere: i successi e le
    // validazioni sono notizie di un istante, non condizioni.
    renderBanco()
    await premi('successo')
    expect(visibili()).toHaveLength(1)

    await avanza(AUTO_DISMISS_MS + 100)

    expect(visibili()).toEqual([])
  })

  it('due eventi ravvicinati: il secondo NON cancella il primo', async () => {
    // La coda vera. Prima il provider teneva UN messaggio e `showToast`
    // sovrascriveva: da lì nasceva TOAST_SLOT_MS, che metteva in fila gli errori
    // per non farli mangiare a vicenda.
    renderBanco()
    await premi('successo')
    await avanza(100)
    await premi('secondo-successo')

    const testi = visibili()
    expect(testi).toHaveLength(2)
    expect(testi.join(' ')).toContain('Listino caricato')
    expect(testi.join(' ')).toContain('eliminato')
  })

  it('ogni evento ha la SUA scadenza: il primo se ne va, il secondo resta', async () => {
    renderBanco()
    await premi('successo')
    await avanza(1_000)
    await premi('secondo-successo')

    // t=3600 dal primo (scaduto), t=2600 dal secondo (vivo).
    await avanza(AUTO_DISMISS_MS - 900)

    expect(visibili()).toHaveLength(1)
    expect(visibili()[0]).toContain('eliminato')
  })

  it('U11: un errore (evento) resta finché non lo si chiude; il successo se ne va da solo', async () => {
    renderBanco()
    await premi('errore-evento')
    await premi('successo')
    await avanza(AUTO_DISMISS_MS * 4)
    expect(visibili()).toEqual([expect.stringContaining('Formato non valido')])
    await premi('Chiudi notifica')
    expect(visibili()).toEqual([])
  })

  it('una notifica derivata NON ha scadenza', async () => {
    renderBanco()
    await premi('persistente')

    await avanza(AUTO_DISMISS_MS * 10)

    expect(visibili()).toHaveLength(1)
    expect(visibili()[0]).toContain('Porte — rotto')
  })

  it('rimuovere la chiave spegne la notifica derivata', async () => {
    renderBanco()
    await premi('persistente')
    expect(visibili()).toHaveLength(1)

    await premi('rimuovi-persistente')

    expect(visibili()).toEqual([])
  })

  it('la stessa chiave non si duplica: due set uguali = una notifica sola', async () => {
    // Idempotenza: il mirror di AppShell ri-esegue a ogni cambio di `errors`, e
    // StrictMode esegue gli effetti due volte. Se `setNotifica` accodasse invece
    // di aggiornare, un errore comparirebbe in doppio.
    renderBanco()
    await premi('persistente')
    await premi('persistente')

    expect(visibili()).toHaveLength(1)
  })

  it('a11y: gli errori interrompono (alert), i successi no (status)', async () => {
    // `aria-live="assertive"` su tutto interrompeva lo screen reader per dire
    // "file caricato". Un errore lo merita, un successo no.
    renderBanco()
    await premi('errore-evento')
    await premi('successo')

    expect(screen.getByRole('alert').textContent).toContain('Formato non valido')
    expect(screen.getByRole('status').textContent).toContain('Listino caricato')
  })

  describe('N1 (verdetto sulla #98): gli errori non si accumulano', () => {
    it('lo stesso errore cinque volte: uno solo a schermo', async () => {
      renderBanco()
      for (let i = 0; i < 5; i++) await premi('errore-evento')
      expect(screen.getAllByRole('alert')).toHaveLength(1)
    })

    it('un errore uguale a una notifica derivata visibile non si aggiunge', async () => {
      renderBanco()
      await premi('persistente')
      await premi('errore-come-persistente')
      expect(visibili()).toEqual([expect.stringContaining('Porte — rotto')])
    })

    it('chiuso il primo, lo stesso errore torna: si confronta solo con ciò che è a schermo', async () => {
      renderBanco()
      await premi('errore-evento')
      await premi('Chiudi notifica')
      await premi('errore-evento')
      expect(screen.getAllByRole('alert')).toHaveLength(1)
    })

    it('al massimo tre errori: dal quarto se ne va il più vecchio', async () => {
      renderBanco()
      for (let i = 0; i < 5; i++) await premi('errore-numerato')
      expect(screen.getAllByRole('alert').map((n) => n.textContent)).toEqual(['Errore numero 3', 'Errore numero 4', 'Errore numero 5'])
    })

    it('la notifica derivata non si toglie per far posto: escono gli eventi più vecchi', async () => {
      renderBanco()
      await premi('persistente')
      for (let i = 0; i < 4; i++) await premi('errore-numerato')
      expect(screen.getAllByRole('alert').map((n) => n.textContent)).toEqual(['Porte — rotto', 'Errore numero 3', 'Errore numero 4'])
    })

    it('i successi non contano nel tetto e non tolgono errori', async () => {
      renderBanco()
      for (let i = 0; i < 3; i++) await premi('errore-numerato')
      await premi('successo')
      expect(screen.getAllByRole('alert')).toHaveLength(3)
      expect(screen.getAllByRole('status')).toHaveLength(1)
    })
  })
})
