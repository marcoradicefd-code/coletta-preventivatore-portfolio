import { describe, it, expect } from 'vitest'
import {
  PASSWORD_MIN,
  valutaPassword,
  erroreRegolaPassword,
  MSG_PASSWORD_CORTA,
  MSG_PASSWORD_CARATTERI,
  type IdSuggerimento,
} from '@/lib/regolaPassword'

// L29: la regola della password, uguale alle impostazioni di Supabase del
// 16/10 (minimo 10, lettere e cifre). Password inventate, email `@example.test`.
const EMAIL = 'mario.rossi@example.test'

const obbligatorio = (password: string, id: 'lunghezza' | 'lettereCifre') =>
  valutaPassword(password).obbligatori.find((v) => v.id === id)?.ok
const suggerimento = (password: string, id: IdSuggerimento, email?: string) =>
  valutaPassword(password, email).suggerimenti.find((v) => v.id === id)?.ok

describe('valutaPassword — gli obbligatori', () => {
  it('il minimo è 10, come «Minimum password length» di Supabase', () => {
    expect(PASSWORD_MIN).toBe(10)
  })

  it.each([
    ['9 caratteri', 'abcdefg1x', false],
    ['10 caratteri', 'abcdefg1xy', true],
  ])('lunghezza, %s', (_caso, password, atteso) => {
    expect(obbligatorio(password, 'lunghezza')).toBe(atteso)
  })

  it.each([
    ['solo lettere', 'soltantolettere', false],
    ['solo cifre', '9876501234', false],
    ['lettere accentate e cifre, senza lettere ASCII', 'èèèèè12345', false],
    ['lettere e cifre', 'lettere2026', true],
  ])('lettere e cifre, %s', (_caso, password, atteso) => {
    expect(obbligatorio(password, 'lettereCifre')).toBe(atteso)
  })

  it('valida solo con tutti e due', () => {
    expect(valutaPassword('abcdefg1x').valida).toBe(false)
    expect(valutaPassword('soltantolettere').valida).toBe(false)
    expect(valutaPassword('lettere2026').valida).toBe(true)
  })

  it('il messaggio d’errore è quello del primo obbligatorio mancante', () => {
    expect(erroreRegolaPassword('corta1')).toBe(MSG_PASSWORD_CORTA)
    expect(MSG_PASSWORD_CORTA).toContain('almeno 10 caratteri')
    expect(erroreRegolaPassword('soltantolettere')).toBe(MSG_PASSWORD_CARATTERI)
    expect(erroreRegolaPassword('lettere2026')).toBeNull()
  })
})

describe('valutaPassword — i suggerimenti', () => {
  it.each([
    ['lunga', 'Lettere2026x', 'Lettere2026xyz9'],
    ['maiuscoleMinuscole', 'lettere2026', 'Lettere2026'],
    ['simbolo', 'Lettere2026', 'Lettere2026!'],
    ['ripetizioni', 'Lettttere2026', 'Lettere2026'],
    ['sequenze', 'Lettere1234', 'Lettere2026'],
    ['comune', 'coletta2026', 'Lettere2026'],
  ] as const)('%s: manca con «%s», c’è con «%s»', (id, senza, con) => {
    expect(suggerimento(senza, id)).toBe(false)
    expect(suggerimento(con, id)).toBe(true)
  })

  it.each(['abcd', 'dcba', 'qwerty', 'asdf', '4321', '7890'])('la sequenza «%s» è ovvia', (seq) => {
    expect(suggerimento(`Zx${seq}97!`, 'sequenze')).toBe(false)
  })

  it.each(['password', 'qwerty', 'coletta', '12345678', 'Password!', 'Coletta2026', 'juventus1'])(
    '«%s» è una password comune',
    (password) => {
      expect(suggerimento(password, 'comune')).toBe(false)
    }
  )

  it('«Coletta2026!x» non è comune: la parola è dentro, non è la password', () => {
    expect(suggerimento('Coletta2026!x', 'comune')).toBe(true)
  })

  it('la parte prima della @ dell’email, intera o a pezzi, non deve esserci', () => {
    expect(suggerimento('Rossi2026!x', 'email', EMAIL)).toBe(false)
    expect(suggerimento('xMario.Rossi9', 'email', EMAIL)).toBe(false)
    expect(suggerimento('Lettere2026!', 'email', EMAIL)).toBe(true)
  })

  it('senza email il suggerimento dell’email non compare', () => {
    expect(valutaPassword('Lettere2026').suggerimenti.map((v) => v.id)).not.toContain('email')
    expect(valutaPassword('Lettere2026', EMAIL).suggerimenti.map((v) => v.id)).toContain('email')
  })

  it('a password vuota nessun suggerimento risulta fatto', () => {
    expect(valutaPassword('', EMAIL).suggerimenti.every((v) => !v.ok)).toBe(true)
  })
})

describe('valutaPassword — il livello', () => {
  it.each([
    ['', 0, 'Molto debole'],
    ['abc', 0, 'Molto debole'],
    ['abcdefghij', 1, 'Debole'],
    ['abcdefgh12', 2, 'Discreta'],
    ['Mariolino27', 3, 'Buona'],
    ['Coletta2026!x', 4, 'Ottima'],
  ] as const)('«%s» → %i, %s', (password, livello, etichetta) => {
    const v = valutaPassword(password, EMAIL)
    expect(v.livello).toBe(livello)
    expect(v.etichetta).toBe(etichetta)
  })

  it.each([
    ['manca la cifra', 'Soltanto-Lettere-Lunghe!?'],
    ['manca la lunghezza', 'Ab1!xyZ'],
  ])('un obbligatorio mancante tiene il livello sotto 2 (%s), anche coi suggerimenti', (_caso, password) => {
    const v = valutaPassword(password)
    expect(v.valida).toBe(false)
    expect(v.livello).toBeLessThan(2)
    expect(v.suggerimenti.filter((s) => s.ok).length).toBeGreaterThanOrEqual(3)
  })
})
