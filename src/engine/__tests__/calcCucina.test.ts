import { describe, it, expect } from 'vitest'
import { calcCucina as calc, costoVoce, vociFuoriCatalogo } from '@/engine/calcCucina'
import { catalogoCucinaFinto as finto, GIORNO_RATE_FINTO as GIORNO_RATE } from '@/test-utils/catalogoCucinaFinto'
import type { SezioneCucine } from '@/types/quote'

// Prezzi del listino FINTO (src/test-utils): colonna 210 laccato 1.260,
// colonna fuorimisura 1.640, angolo laminato 460, anta vetro 170, struttura a
// giorno impiallaccio 25/40 560, striscia LED 70, isole fuorimisura 340 e 640,
// giorni extra 170 al giorno. I prezzi veri non entrano nei test (D7).
const calcCucina = (s: SezioneCucine) => calc(s, finto)

// Costruttore di una SezioneCucine con default sensati (override per-test).
function sez(p: Partial<SezioneCucine> = {}): SezioneCucine {
  return {
    voci: [],
    casse: false,
    ante: false,
    giorniExtra: 0,
    extraManuale: null,
    adeguamentoPct: 0.2,
    descrizione: '',
    sconto: 0,
    ...p,
  }
}

describe('calcCucina — catena a fasi', () => {
  it('la catena completa con le selezioni del foglio .xls (E22 → E85)', () => {
    // Colonna fuorimisura ×1 (1640), angolo laminato ×1 (460), anta vetro ×2 (340)
    // → primo totale 2440; +20% ante → 2928; struttura a giorno impiallaccio 25/40
    // ×2 (1120) nel blocco open; 9 giorni extra.
    const r = calcCucina(
      sez({
        voci: [
          { voceId: 'colonna-fuorimisura', quantita: 1 },
          { voceId: 'base-pensile-angolo-laminato', quantita: 1 },
          { voceId: 'anta-vetro-visarm', quantita: 2 },
          { voceId: 'struttura-giorno-impiallaccio-25-40', quantita: 2 },
        ],
        ante: true,
        giorniExtra: 9,
        adeguamentoPct: 0.2,
      })
    )
    expect(r.primoTotale).toBe(2440) // E22
    expect(r.casseAnte).toBe(2928) // E25
    expect(r.opzionali).toBe(0) // E48
    expect(r.open).toBe(1120) // E68
    expect(r.totaleCucina).toBe(4048) // E73
    expect(r.progettazione).toBe(405) // E74: 404,80
    expect(r.adeguamento).toBe(810) // E75: 809,60
    expect(r.giorni).toBe(9 * GIORNO_RATE) // E72
    expect(r.imponibile).toBe(4048 + 405 + 810 + 9 * GIORNO_RATE) // E85
  })

  it('LED contata UNA volta: striscia LED ×10 → +700, NON +1400 (blinda il non-bug E73)', () => {
    const r = calcCucina(sez({ voci: [{ voceId: 'striscia-led', quantita: 10 }] }))
    expect(r.opzionali).toBe(700) // 70 × 10
    expect(r.totaleCucina).toBe(700) // una sola volta (nessun +E42 aggiuntivo)
  })

  it('moltiplicatori CUMULABILI: casse +10% E ante +20% insieme sul primo totale', () => {
    const r = calcCucina(
      sez({ voci: [{ voceId: 'colonna-210-laccato', quantita: 1 }], casse: true, ante: true })
    )
    expect(r.primoTotale).toBe(1260)
    expect(r.casseAnte).toBe(1638) // 1260 + 126 (10%) + 252 (20%)
  })

  it('percentuali PARALLELE non composte: prog e adeg sul totaleCucina, non l una sull altra', () => {
    const r = calcCucina(
      sez({ voci: [{ voceId: 'colonna-210-laccato', quantita: 1 }], adeguamentoPct: 0.2 })
    )
    expect(r.totaleCucina).toBe(1260)
    expect(r.progettazione).toBe(126) // 10% di 1260
    expect(r.adeguamento).toBe(252) // 20% di 1260…
    expect(r.adeguamento).not.toBe(277) // …NON 20% di (1260+prog)
    expect(r.imponibile).toBe(1638) // 1260 + 126 + 252
  })

  it('toggleFisso: isola fuorimisura → importo FISSO, quantità ignorata', () => {
    const r = calcCucina(sez({ voci: [{ voceId: 'isola-laminato-fuorimisura', quantita: 5 }] }))
    expect(r.open).toBe(340) // fisso, NON 1700
    expect(r.totaleCucina).toBe(340)

    const r2 = calcCucina(
      sez({
        voci: [
          { voceId: 'isola-laminato-fuorimisura', quantita: 1 },
          { voceId: 'isola-laccato-impiallacciato-fuorimisura', quantita: 1 },
        ],
      })
    )
    expect(r2.open).toBe(980) // 340 + 640
  })

  it('giorni/extra fuori dalle percentuali; sconto sul totale cucina, NON sull imponibile', () => {
    const r = calcCucina(
      sez({
        voci: [{ voceId: 'colonna-210-laccato', quantita: 1 }], // totaleCucina 1260
        sconto: 0.1,
        giorniExtra: 2,
        extraManuale: { descrizione: 'maniglie speciali', importo: 500 },
        adeguamentoPct: 0.2,
      })
    )
    expect(r.totaleCucina).toBe(1260)
    expect(r.sconto).toBe(126) // 10% di 1260
    expect(r.totaleCucinaScontato).toBe(1134)
    expect(r.progettazione).toBe(126) // 10% del PIENO 1260 → non ridotto dallo sconto (fuori sconto)
    expect(r.adeguamento).toBe(252)
    expect(r.giorni).toBe(2 * GIORNO_RATE)
    expect(r.extra).toBe(500)
    const atteso = 1134 + 126 + 252 + 2 * GIORNO_RATE + 500
    expect(r.imponibile).toBe(atteso)
    // Lo sconto NON è applicato all imponibile: (imponibile senza sconto) × 0,9 è un altro numero.
    expect(r.imponibile).not.toBe(Math.round((atteso + 126) * 0.9))
  })

  it('difensivo: id ignoto non entra nelle somme ed è da definire (O5), sconto NaN → 0 (clamp)', () => {
    const r = calcCucina(
      sez({
        voci: [
          { voceId: 'non-esiste', quantita: 3 },
          { voceId: 'colonna-210-laccato', quantita: 1 },
        ],
        sconto: NaN,
      })
    )
    expect(r.totaleCucina).toBe(1260) // la voce ignota non aggiunge nulla
    expect(r.vociDaDefinire).toBe(1) // …ma non vale 0 in silenzio
    expect(r.sconto).toBe(0) // NaN clampato a 0
    expect(r.imponibile).toBe(1260 + 126 + 252) // sconto 0, no giorni/extra
  })

  it('difensivo: extra manuale negativo (stato manomesso) → 0, l imponibile non scende (V-A1)', () => {
    const r = calcCucina(
      sez({
        voci: [{ voceId: 'colonna-210-laccato', quantita: 1 }],
        extraManuale: { descrizione: 'Extra', importo: -300 },
      })
    )
    expect(r.extra).toBe(0)
    expect(r.imponibile).toBe(1260 + 126 + 252)
  })
})

describe('calcCucina — importi all\'euro intero (D4)', () => {
  it('il costo di una voce a quantità frazionaria è intero (70 × 2,56 = 179,20 → 179)', () => {
    expect(costoVoce(finto, 'striscia-led', 2.56)?.costo).toBe(179)
    expect(calcCucina(sez({ voci: [{ voceId: 'striscia-led', quantita: 2.56 }] })).opzionali).toBe(179)
  })

  it('casse e ante sono importi interi esposti dall\'engine, e casseAnte è la loro somma', () => {
    // primo totale 1260 × 1,0055 = 1.266,93 → 1.267; +10% = 126,7 → 127; +20% = 253,4 → 253.
    const r = calcCucina(
      sez({ voci: [{ voceId: 'colonna-210-laccato', quantita: 1.0055 }], casse: true, ante: true })
    )
    expect(r.primoTotale).toBe(1267)
    expect(r.importoCasse).toBe(127)
    expect(r.importoAnte).toBe(253)
    expect(r.casseAnte).toBe(r.primoTotale + r.importoCasse + r.importoAnte)
  })

  it('moltiplicatori spenti → importi 0', () => {
    const r = calcCucina(sez({ voci: [{ voceId: 'colonna-210-laccato', quantita: 1 }] }))
    expect(r.importoCasse).toBe(0)
    expect(r.importoAnte).toBe(0)
  })

  it('righe derivate intere e imponibile = somma di quello che si stampa', () => {
    const r = calcCucina(
      sez({
        voci: [{ voceId: 'colonna-210-laccato', quantita: 1.0055 }], // 1.267
        sconto: 0.125, // 158,375 → 158
        adeguamentoPct: 0.125, // 158,375 → 158
        giorniExtra: 0.5,
        extraManuale: { descrizione: 'X', importo: 10.5 }, // 11
      })
    )
    expect(r.sconto).toBe(158)
    expect(r.progettazione).toBe(127) // 126,7
    expect(r.adeguamento).toBe(158)
    expect(r.giorni).toBe(Math.round(0.5 * GIORNO_RATE))
    expect(r.extra).toBe(11)
    expect(r.imponibile).toBe(r.totaleCucina - r.sconto + r.progettazione + r.adeguamento + r.giorni + r.extra)
    for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true)
  })
})

describe('calcCucina — voci fuori catalogo da definire (O5)', () => {
  it('tutte le voci a catalogo: nessuna da definire', () => {
    const r = calcCucina(
      sez({
        voci: [
          { voceId: 'colonna-210-laccato', quantita: 1 },
          { voceId: 'isola-laminato-fuorimisura', quantita: 1 },
        ],
        casse: true,
        ante: true,
      })
    )
    expect(r.vociDaDefinire).toBe(0)
  })

  it('una voce tolta dal catalogo dopo il salvataggio: da definire, le altre restano prezzate', () => {
    const senzaLed = { ...finto, voci: finto.voci.filter((v) => v.id !== 'striscia-led') }
    const r = calc(
      sez({
        voci: [
          { voceId: 'striscia-led', quantita: 10 },
          { voceId: 'colonna-210-laccato', quantita: 1 },
        ],
      }),
      senzaLed
    )
    expect(r.vociDaDefinire).toBe(1)
    expect(r.opzionali).toBe(0)
    expect(r.totaleCucina).toBe(1260)
  })

  it('un moltiplicatore finito fra le voci (stato manomesso) è da definire, non un costo', () => {
    const r = calcCucina(sez({ voci: [{ voceId: 'casse', quantita: 1 }] }))
    expect(r.vociDaDefinire).toBe(1)
    expect(r.totaleCucina).toBe(0)
  })

  it('casse attiva ma assente dal catalogo: importo 0 e da definire; ante presente si calcola', () => {
    const senzaCasse = { ...finto, voci: finto.voci.filter((v) => v.id !== 'casse') }
    const r = calc(
      sez({ voci: [{ voceId: 'colonna-210-laccato', quantita: 1 }], casse: true, ante: true }),
      senzaCasse
    )
    expect(r.importoCasse).toBe(0)
    expect(r.importoAnte).toBe(252)
    expect(r.vociDaDefinire).toBe(1)
    // Spenta, la stessa assenza non conta.
    expect(calc(sez({ voci: [{ voceId: 'colonna-210-laccato', quantita: 1 }] }), senzaCasse).vociDaDefinire).toBe(0)
  })

  it('vociFuoriCatalogo: le voci da definire, nell ordine salvato', () => {
    const voci = [
      { voceId: 'vecchia-voce', quantita: 2 },
      { voceId: 'colonna-210-laccato', quantita: 1 },
      { voceId: 'ante', quantita: 1 },
    ]
    expect(vociFuoriCatalogo(voci, finto)).toEqual([
      { voceId: 'vecchia-voce', quantita: 2 },
      { voceId: 'ante', quantita: 1 },
    ])
  })
})

describe('calcCucina — giorni extra senza tariffa nel listino', () => {
  const senzaTariffa = { ...finto, giornoRate: null }

  it('i giorni valgono 0 nelle somme e sono una voce da definire: il totale è parziale', () => {
    const r = calc(sez({ voci: [{ voceId: 'colonna-210-laccato', quantita: 1 }], giorniExtra: 3 }), senzaTariffa)
    expect(r.giorni).toBe(0)
    expect(r.vociDaDefinire).toBe(1)
    expect(r.imponibile).toBe(1260 + 126 + 252) // niente giorni
  })

  it('senza giorni extra la tariffa assente non conta', () => {
    const r = calc(sez({ voci: [{ voceId: 'colonna-210-laccato', quantita: 1 }] }), senzaTariffa)
    expect(r.vociDaDefinire).toBe(0)
  })
})

describe('calcCucina — profondità oltre 65 cm, +20% di casse e ante (L25)', () => {
  // Listino finto: colonna fuorimisura 1.640 + angolo laminato 460 + 2 ante vetro
  // 340 = primo totale 2.440; striscia LED ×10 = 700 (opzionali); struttura a
  // giorno impiallaccio 25/40 ×2 = 1.120 (open).
  const voci = [
    { voceId: 'colonna-fuorimisura', quantita: 1 },
    { voceId: 'base-pensile-angolo-laminato', quantita: 1 },
    { voceId: 'anta-vetro-visarm', quantita: 2 },
    { voceId: 'striscia-led', quantita: 10 },
    { voceId: 'struttura-giorno-impiallaccio-25-40', quantita: 2 },
  ]

  it('con la spunta il totale cucina cresce di arrotondaEuro(casseAnte × 0,2); opzionali e open non cambiano', () => {
    const senza = calcCucina(sez({ voci }))
    const con = calcCucina(sez({ voci, profonditaOltre65: true }))
    expect(con.casseAnte).toBe(2440)
    expect(con.supplementoProfondita).toBe(488)
    expect(con.opzionali).toBe(senza.opzionali)
    expect(con.open).toBe(senza.open)
    expect(con.totaleCucina).toBe(senza.totaleCucina + 488)
    expect(con.totaleCucina).toBe(2440 + 488 + 700 + 1120)
  })

  it('si somma a casse e ante: il 20% è di TOTALE CASSE+ANTE, con tutte e tre attive', () => {
    const r = calcCucina(sez({ voci, casse: true, ante: true, profonditaOltre65: true }))
    // 2.440 + 244 + 488 = 3.172; 20% = 634,4 → 634.
    expect(r.casseAnte).toBe(3172)
    expect(r.supplementoProfondita).toBe(634)
    expect(r.totaleCucina).toBe(3172 + 634 + 700 + 1120)
  })

  it('sconto, progettazione e adeguamento si calcolano sul totale che lo contiene', () => {
    const r = calcCucina(sez({ voci: voci.slice(0, 3), profonditaOltre65: true, sconto: 0.1, adeguamentoPct: 0.2 }))
    // 2.440 + 488 = 2.928: sconto 292,8 → 293, progettazione 292,8 → 293, adeguamento 585,6 → 586.
    expect(r.totaleCucina).toBe(2928)
    expect(r.sconto).toBe(293)
    expect(r.progettazione).toBe(293)
    expect(r.adeguamento).toBe(586)
    expect(r.imponibile).toBe(2928 - 293 + 293 + 586)
  })

  it('spunta spenta o assente: importi identici a prima, e il risultato non porta la chiave', () => {
    const prima = calcCucina(sez({ voci, casse: true, sconto: 0.1 }))
    expect(calcCucina(sez({ voci, casse: true, sconto: 0.1, profonditaOltre65: false }))).toEqual(prima)
    // Senza la chiave la vista dei prezzi congelati dei preventivi già salvati ha
    // la stessa impronta (strada A, L22): niente «listino cambiato» falso.
    expect('supplementoProfondita' in prima).toBe(false)
  })
})
