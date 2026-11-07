import { describe, it, expect } from 'vitest'
import { isVoceBattiscopa, BATTISCOPA_EXTRA_PCT } from '@/data/battiscopa'

// Il predicato decide cosa SPARISCE dalla select degli optional. Un predicato
// troppo largo nasconde voci che il preventivo perderebbe in silenzio, quindi
// qui si elenca esplicitamente cosa nasconde E cosa no — è il test che rende
// sicuro cambiarlo.

describe('isVoceBattiscopa — cosa NASCONDE dalla select optional', () => {
  const nascoste = [
    'BATTISCOPA MASSELLO',
    'LAVORAZIONE EXTRA BATTISCOPA',
    'battiscopa massello', // il listino non garantisce le maiuscole
    '  BATTISCOPA  ', // né gli spazi
    'BATTISCOPA IN ESSENZA H8',
  ]
  for (const nome of nascoste) {
    it(`nasconde "${nome}"`, () => expect(isVoceBattiscopa(nome)).toBe(true))
  }
})

describe('isVoceBattiscopa — cosa NON nasconde (le voci che restano scegliibili)', () => {
  const restano = [
    'STIPITI E MOSTRINE',
    'SPECCHIO',
    'PIVOT',
    'IMPIALLACCIATA SU MISURA',
    'MOSTRINE DA 8CM',
    'SERRATURA MAGNETICA',
    '', // difensivo: nome vuoto non è un battiscopa
  ]
  for (const nome of restano) {
    it(`lascia "${nome}"`, () => expect(isVoceBattiscopa(nome)).toBe(false))
  }
})

describe('BATTISCOPA_EXTRA_PCT', () => {
  it('è il +20% del listino ("+20% rispetto al prezzo del battiscopa")', () => {
    expect(BATTISCOPA_EXTRA_PCT).toBe(0.2)
  })

  it('applicato a 1,2 €/cm dà esattamente 1,44 — lo stesso numero della voce del listino', () => {
    // Il listino ha già la variante come voce a sé (1.44). Derivandola dal rate
    // congelato si ottiene lo stesso importo senza dipendere da quella voce.
    expect(Math.round(1.2 * (1 + BATTISCOPA_EXTRA_PCT) * 100) / 100).toBe(1.44)
  })
})
