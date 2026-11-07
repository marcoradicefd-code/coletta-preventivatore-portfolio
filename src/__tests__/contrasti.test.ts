import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * Contrasti WCAG 2.x dei token di `src/index.css` nelle coppie che l'app usa per
 * il testo (U7, U8, U9 della revisione L15-L21): almeno 4,5:1 per il testo
 * piccolo. I token si leggono dal file, quindi un valore cambiato a mano fa
 * rosso qui. Le miscele (fondo della riga scelta, voce attiva del menu) sono
 * calcolate in sRGB, come ha fatto il revisore.
 */
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
const token = (nome: string): number[] => {
  const m = new RegExp(String.raw`--color-${nome}:\s*(#[0-9A-Fa-f]{6})`).exec(css)
  if (!m) throw new Error(`token ${nome} non trovato`)
  return [1, 3, 5].map((i) => Number.parseInt(m[1].slice(i, i + 2), 16))
}
const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
const lum = (rgb: number[]) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
const contrasto = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const mix = (fg: number[], bg: number[], a: number) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)))
const BIANCO = [255, 255, 255]
/** La card delle pagine di accesso: `bg-white/[0.03]` sul navy (L26, aggiunta 4). */
const cardSuNavy = () => mix(BIANCO, token('brand-navy'), 0.03)

describe('contrasti del design system (U7, U8, U9)', () => {
  it.each([
    ['success su success-bg (banner di esito)', () => [token('success'), token('success-bg')]],
    ['bianco su success (toast di successo)', () => [BIANCO, token('success')]],
    ['error su error-bg (tutti i role="alert")', () => [token('error'), token('error-bg')]],
    ['error su bianco', () => [token('error'), BIANCO]],
    ['warning su warning-bg (badge «< 3mq»)', () => [token('warning'), token('warning-bg')]],
    ['ink-tertiary su surface-tertiary (placeholder, X della ricerca)', () => [token('ink-tertiary'), token('surface-tertiary')]],
    ['ink-tertiary su surface-primary', () => [token('ink-tertiary'), token('surface-primary')]],
    ['ink-tertiary su surface-secondary («IVA esclusa» nei riepiloghi, O1)', () => [token('ink-tertiary'), token('surface-secondary')]],
    ['ink-tertiary sulla riga scelta (località in SceltaCliente)', () => [token('ink-tertiary'), mix(token('brand-red'), BIANCO, 0.11)]],
    ['voce attiva del menu su navy + 15% rosso', () => [token('brand-red-su-navy'), mix(token('brand-red'), token('brand-navy'), 0.15)]],
    // L26, aggiunta 4: i messaggi della pagina di accesso, sul riquadro `bg-success/10` o `bg-error/10` sopra la card.
    ['success-su-navy sul riquadro di successo della card di accesso', () => [token('success-su-navy'), mix(token('success'), cardSuNavy(), 0.1)]],
    ['error-su-navy sul riquadro d’errore della card di accesso', () => [token('error-su-navy'), mix(token('error'), cardSuNavy(), 0.1)]],
  ] as const)('%s: almeno 4,5:1', (_nome, coppia) => {
    const [a, b] = coppia()
    expect(contrasto(a, b)).toBeGreaterThanOrEqual(4.5)
  })

  // L29: i segmenti pieni della barra della password sono componenti non
  // testuali (WCAG 1.4.11): almeno 3:1 sulla card e sul segmento vuoto
  // (`bg-white/15` sulla card). L'etichetta del livello è scritta nello stesso
  // colore: almeno 4,5:1 sulla card.
  const segmentoVuoto = () => mix(BIANCO, cardSuNavy(), 0.15)
  it.each(['error-su-navy', 'warning-su-navy', 'giallo-verde-su-navy', 'success-su-navy'])(
    'barra della password, %s: segmento 3:1 su card e vuoto, etichetta 4,5:1',
    (nome) => {
      expect(contrasto(token(nome), cardSuNavy())).toBeGreaterThanOrEqual(4.5)
      expect(contrasto(token(nome), segmentoVuoto())).toBeGreaterThanOrEqual(3)
    }
  )

  it('l’errore resta diverso dal rosso brand (rule ui)', () => {
    expect(token('error')).not.toEqual(token('brand-red'))
  })

  const file = execFileSync('git', ['ls-files', 'src/components'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.tsx') && !f.includes('__tests__'))
  const trovati = (re: RegExp) => file.filter((f) => re.test(readFileSync(resolve(process.cwd(), f), 'utf8')))

  it('nessun testo nei colori sotto soglia: placeholder ink-disabled, badge su tinta al 10-15%, bianco sotto il 40% sul navy', () => {
    expect(file.length).toBeGreaterThan(50)
    expect(trovati(/placeholder:text-ink-disabled/)).toEqual([])
    expect(trovati(/bg-(success|error|warning)\/(10|15) text-/)).toEqual([])
    // Il bianco sul navy sotto il 40% è sotto 3,8:1 (U9); le icone al 40% reggono il 3:1 dei componenti.
    expect(trovati(/text-white\/(1|2|3)[0-9]\b/)).toEqual([])
  })

  it('O1 (verdetto sulla #98): nessuna parola scritta in text-ink-disabled, il colore del disabilitato (2,2:1)', () => {
    // Testo vero, non solo i placeholder: un elemento in ink-disabled con una
    // parola scritta (due lettere di fila) nel JSX. Restano fuori i segni di
    // valore assente («—», «N/D») e le icone.
    const parolaInDisabled = /className="[^"]*\btext-ink-disabled\b[^"]*">[^<{]*\p{L}{2}/u
    expect(trovati(parolaInDisabled)).toEqual([])
    // Il pattern prende davvero la forma di «IVA esclusa» (presidio contro un'espressione che non trova niente).
    expect(parolaInDisabled.test('<p className="text-xs text-ink-disabled mt-1">IVA esclusa</p>')).toBe(true)
  })
})
