import { describe, it, expect } from 'vitest'
import { calcRilMont } from '@/utils/rilMont'
import type { RilMontScaglione } from '@/types/marmeria'

/**
 * Gli scaglioni COME LI PRODUCE IL PARSER dal listino attivo (Rev_83 LUG26),
 * verificati identici anche sul Rev_82: soglie, importi e formula non si sono
 * mossi fra le due revisioni.
 *
 * L'ultima fascia ha `importo: 0` — il valore in cache di `CEILING(E2*0.15,1)`
 * su un preventivo vuoto — e la `percentuale` letta dal testo della formula.
 * Quello 0 è la trappola: sembra un prezzo e non lo è.
 */
const listinoReale: RilMontScaglione[] = [
  { da: 0, a: 1000, importo: 300 },
  { da: 1000.01, a: 1500, importo: 350 },
  { da: 1500.01, a: 2000, importo: 400 },
  { da: 3000, a: null, importo: 0, percentuale: 0.15 },
]

describe('calcRilMont — fasce fisse (comportamento invariato)', () => {
  // Il perimetro (a) del piano: sotto i 2.000 l'app era GIÀ allineata al
  // listino. Qui non si corregge niente, si pinna — perché il fix delle fasce
  // alte non deve spostare di un euro i preventivi piccoli, che sono la maggior
  // parte di quelli che Coletta fa in un mese.
  it.each([
    [500, 300],
    [999.99, 300],
    [1000, 300],
    [1000.01, 350],
    [1200, 350],
    [1500, 350],
    [1500.01, 400],
    [1800, 400],
    [1999.99, 400],
  ])('base %s € → %s €', (base, atteso) => {
    expect(calcRilMont(base, listinoReale)).toBe(atteso)
  })
})

describe('calcRilMont — il buco 2.000-3.000 (bug #1)', () => {
  // PRESIDIO. Prima: nessuno scaglione rispondeva (2.500 > `a` della terza
  // fascia, < `da` della quarta) e si cadeva sul fallback, che restituiva
  // l'importo dell'ULTIMO elemento dell'array — la fascia aperta, cioè 0.
  // Montaggio gratis su un lavoro da 2.500 €.
  //
  // Il buco era del PARSER, non del listino: nella formula Excel la colonna A
  // non compare, quindi da 1.500,01 in su e fino a 3.000 esclusi è tutto 400.
  it.each([
    [2000, 400],
    [2000.01, 400],
    [2500, 400],
    [2999.99, 400],
  ])('base %s € → %s € (era 0)', (base, atteso) => {
    expect(calcRilMont(base, listinoReale)).toBe(atteso)
  })

  it('la colonna A non è un tetto: superarla non fa cadere la fascia', () => {
    const unaFasciaSola: RilMontScaglione[] = [{ da: 0, a: 100, importo: 50 }]
    expect(calcRilMont(500, unaFasciaSola)).toBe(50)
  })
})

describe('calcRilMont — fascia aperta a percentuale (bug #2)', () => {
  // PRESIDIO. Prima: 0 su qualunque importo ≥ 3.000, perché la cella IMPORTO
  // della fascia aperta è una formula il cui valore in cache è 0.
  // Istruzione Antonio, call 31/07/2026: "applica il 15%", ribaltato al cliente
  // così com'è. La fascia-zero del file è un'ANOMALIA del listino, non una regola.
  it.each([
    [3000.01, 455],
    [4000, 600],
    [4010, 605],
    [6656.8, 1000], // 20 mq × 332,84 €/mq: il caso che gira nell'e2e sul Rev_83
    [12183, 1830], // base alta: 1.827,45 → 1.828 → 1.830
  ])('base %s € → %s €', (base, atteso) => {
    expect(calcRilMont(base, listinoReale)).toBe(atteso)
  })

  it('a 3.000 esatti c\'è uno scalino 400 → 450: è la formula, non un bug', () => {
    // `IF($E$2>=A5, ...)` con A5 = 3000: il confine è `>=`, quindi 3.000 esatti
    // entra già nella percentuale. 2.999,99 paga 400, 3.000 paga 450: 50 € di
    // salto su un centesimo di base. Sembra sbagliato e non lo è.
    // Chi un domani "aggiusterà" questo scalino sta cambiando il listino, non
    // correggendo il codice: parlarne con Antonio prima di toccare.
    expect(calcRilMont(2999.99, listinoReale)).toBe(400)
    expect(calcRilMont(3000, listinoReale)).toBe(450)
  })

  it('3.000,01 → 455: niente guardia di arrotondamento, la guardia SAREBBE il bug', () => {
    // 3000,01 × 0,15 = 450,0015 → CEILING all'euro = 451 → CEILING al 5 = 455.
    // Una "guardia" che arrotondasse il prodotto a 2 decimali darebbe 450,00 →
    // 450 → 450, cioè 5 € in meno del listino. Verificato su tutti gli interi
    // 3.000-20.000: zero divergenze fra Math.ceil(base*0,15) e il CEILING di
    // Excel, quindi non c'è nessun problema di floating point da difendere.
    expect(calcRilMont(3000.01, listinoReale)).toBe(455)
  })

  it('i due CEILING sono entrambi necessari: 4.010 fa 605, non 601,50', () => {
    // Solo percentuale:        4010 × 0,15 = 601,50
    // + CEILING all'euro:      602
    // + CEILING al multiplo 5: 605  ← quello che fattura De Bari
    expect(calcRilMont(4010, listinoReale)).toBe(605)
    expect(calcRilMont(4010, listinoReale)).not.toBe(601.5)
  })
})

describe('calcRilMont — base arrotondata al centesimo (O1)', () => {
  // Le basi sono ESPRESSIONI, non numeri scritti: il rumore nasce dalla somma
  // float che fa calcMarmeria, e un letterale lo perderebbe al parse.
  it.each([
    ['3,25 mq × 332,84 + 16,17 ml × 131 = 3.200 esatti', 480, 3.25 * 332.84 + 16.17 * 131],
    ['1,88 mq × 1135 + 14,2 ml × 61 = 3.000 esatti', 450, 1.88 * 1135 + 14.2 * 61],
  ])('%s → %s € anche se il float sfora', (_caso, atteso, base) => {
    expect(calcRilMont(base, listinoReale)).toBe(atteso)
  })
})

describe('calcRilMont — bordi e input storti', () => {
  it('sotto il DA più basso cade sulla fascia più bassa (ultimo else della cascata)', () => {
    // Nel foglio l'else finale è `C2`, la fascia più bassa: sotto la prima
    // soglia il listino non dice "gratis", dice 300.
    expect(calcRilMont(0, listinoReale)).toBe(300)
    const senzaZero: RilMontScaglione[] = [{ da: 100, a: 200, importo: 70 }]
    expect(calcRilMont(50, senzaZero)).toBe(70)
  })

  it('ordine di arrivo indifferente: si valuta dal DA più alto', () => {
    const mescolati = [...listinoReale].reverse()
    expect(calcRilMont(4000, mescolati)).toBe(600)
    expect(calcRilMont(2500, mescolati)).toBe(400)
    expect(calcRilMont(500, mescolati)).toBe(300)
  })

  it('scaglioni vuoti o totale non finito → 0', () => {
    expect(calcRilMont(4000, [])).toBe(0)
    expect(calcRilMont(NaN, listinoReale)).toBe(0)
    expect(calcRilMont(Infinity, listinoReale)).toBe(0)
  })

  it('percentuale assente → resta l\'importo fisso, anche sulla fascia aperta', () => {
    const apertaFissa: RilMontScaglione[] = [
      { da: 0, a: 1000, importo: 300 },
      { da: 1000.01, a: null, importo: 209 },
    ]
    expect(calcRilMont(50_000, apertaFissa)).toBe(209)
  })
})
