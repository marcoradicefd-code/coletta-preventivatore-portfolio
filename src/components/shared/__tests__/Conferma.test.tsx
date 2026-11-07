import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { useConferma } from '@/hooks/useConferma'
import type { Domanda } from '@/components/shared/Conferma'

const DOMANDA: Domanda = {
  titolo: 'Annullare il preventivo N. 2026-001?',
  testo: 'Il numero resta, ma il preventivo non si modifica più.',
  azioni: [
    { valore: 'no', etichetta: 'Torna indietro', tipo: 'secondario' },
    { valore: 'si', etichetta: 'Annulla il preventivo', tipo: 'pericolo' },
  ],
}

/** Monta il hook; `apri()` fa la domanda dal pulsante «Apri», come farebbe una pagina. */
function monta() {
  const esito: { risposta?: Promise<string | null> } = {}
  function Prova() {
    const { chiedi, finestra } = useConferma()
    return (
      <>
        <button type="button" onClick={() => (esito.risposta = chiedi(DOMANDA))}>
          Apri
        </button>
        {finestra}
      </>
    )
  }
  render(<Prova />)
  return () => {
    fireEvent.click(screen.getByRole('button', { name: 'Apri' }))
    return esito.risposta!
  }
}

afterEach(cleanup)

describe('Conferma — al posto di window.confirm (L21-B, § 3.4)', () => {
  it('alertdialog con titolo e testo collegati, verbi espliciti, focus sull\'azione che non fa danni; il verbo scelto risponde', async () => {
    const apri = monta()
    const risposta = apri()
    const dialogo = screen.getByRole('alertdialog', { name: DOMANDA.titolo })
    const descritto = document.getElementById(dialogo.getAttribute('aria-describedby') ?? '')
    expect(descritto?.textContent).toBe(DOMANDA.testo)
    expect([...dialogo.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Torna indietro', 'Annulla il preventivo'])
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Torna indietro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annulla il preventivo' }))
    expect(await risposta).toBe('si')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('Esc (evento cancel) risponde null e chiude, senza scegliere niente', async () => {
    const apri = monta()
    const risposta = apri()
    fireEvent(screen.getByRole('alertdialog'), new Event('cancel', { cancelable: true }))
    expect(await risposta).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('nel codice dell\'app non c\'è più nessun window.confirm', () => {
    const file = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? (d.name === '__tests__' ? [] : file(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []
      )
    const conConfirm = file(resolve(process.cwd(), 'src')).filter((f) => /\bconfirm\s*\(/.test(readFileSync(f, 'utf8')))
    expect(conConfirm).toEqual([])
  })
})
