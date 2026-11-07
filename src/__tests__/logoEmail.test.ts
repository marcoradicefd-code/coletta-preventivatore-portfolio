import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// L26: i template delle email di Supabase caricano il logo da
// `/email/logo-coletta.png`, cioè da `public/` (i file di `src/assets` prendono
// un hash nel nome). È una copia: se il logo cambia e la copia no, le email
// mostrano quello vecchio. Entrambi i file sono versionati, quindi gira anche in CI.
describe('logo per le email', () => {
  it('public/email/logo-coletta.png è identico byte per byte a src/assets/brand/logo-coletta.png', () => {
    const originale = readFileSync(resolve(process.cwd(), 'src/assets/brand/logo-coletta.png'))
    const copia = readFileSync(resolve(process.cwd(), 'public/email/logo-coletta.png'))

    expect(copia).toHaveLength(originale.length)
    expect(copia.equals(originale)).toBe(true)
  })
})
