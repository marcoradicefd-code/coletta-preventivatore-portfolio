import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, cleanup } from '@testing-library/react'
import { CartaAccesso, MessaggiAccesso } from '@/components/auth/CartaAccesso'

afterEach(() => cleanup())

// L26, aggiunta 3 di Marco: `shadow-apple-xl` è un'ombra navy, e sul fondo
// navy della pagina di accesso disegnava anelli concentrici agli angoli. Il
// token e gli altri usi, su fondi chiari, restano.
describe('CartaAccesso', () => {
  it('la card non ha l\'ombra navy (shadow-apple-xl)', () => {
    render(
      <CartaAccesso>
        <p>contenuto</p>
      </CartaAccesso>
    )
    const card = screen.getByText('contenuto').parentElement as HTMLElement

    expect(card.className).toContain('border-white/10')
    expect(card.className).not.toContain('shadow-apple-xl')
  })
})

// L26, aggiunta 4: `text-success` (#15803D) e `text-error` (#DC2626) sono per i
// fondi chiari; sul navy della card davano 3,07:1 e 3,29:1. Le schermate su
// navy usano i token `-su-navy` (rapporti in `src/index.css` e in contrasti.test.ts).
describe('messaggi sul navy', () => {
  const classe = (testo: string) => (screen.getByText(testo).parentElement as HTMLElement).className

  it.each([
    ['errore', { errore: 'Errore di prova', successo: null }, 'Errore di prova', 'text-error-su-navy', /(^|\s)text-error(\s|$)/],
    ['successo', { errore: null, successo: 'Esito di prova' }, 'Esito di prova', 'text-success-su-navy', /(^|\s)text-success(\s|$)/],
  ])('il riquadro di %s usa il token su navy', (_caso, props, testo, atteso, vecchio) => {
    render(<MessaggiAccesso {...props} avviso={null} />)

    expect(classe(testo)).toContain(atteso)
    expect(classe(testo)).not.toMatch(vecchio)
  })

  it('nessuna schermata su navy (src/components/auth) usa text-success o text-error dei fondi chiari', () => {
    const cartella = resolve(process.cwd(), 'src/components/auth')
    const file = readdirSync(cartella).filter((f) => f.endsWith('.tsx'))
    const vecchi = file.filter((f) => /\btext-(success|error)(?!-su-navy)\b/.test(readFileSync(resolve(cartella, f), 'utf8')))

    expect(file.length).toBeGreaterThanOrEqual(5)
    expect(vecchi).toEqual([])
  })
})
