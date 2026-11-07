import { describe, it, expect } from 'vitest'
import {
  calcMarmeria,
  fasciaFromProfondita,
  prezzoMqMateriale,
  prezzoMlLavorazioneBordo,
  prezzoLavorazioneVaria,
  importoRiga,
} from '@/engine/calcMarmeria'
import { calcRilMont } from '@/utils/rilMont'
import type { ListinoMarmeria, QuoteMarmeria, Materiale, RilMontScaglione } from '@/types/marmeria'
// Prezzo finto della vasca (1.240): il prezzo di vendita vero non entra nei test (D7).
import { VASCA_PREZZO_FINTO as VASCA } from '@/test-utils/catalogoCucinaFinto'

const scaglioni: RilMontScaglione[] = [
  { da: 0, a: 1000, importo: 300 },
  { da: 1000.01, a: 1500, importo: 300 },
  { da: 1500.01, a: 2000, importo: 300 },
  { da: 2000.01, a: null, importo: 209 },
]

const materiale: Materiale = {
  produttore: 'DEKTON',
  colore: 'Adia kC',
  tipoSuperficie: 'Opaco',
  coloreFinituraCompleto: 'Adia kC_Opaco',
  collezione: 'INDUSTRIAL',
  tipologia: 'LAPITEC',
  spessori: {
    13: {
      spessore: 13,
      disponibile: true,
      prezziMq: { fino62: 609.16, da63a70: 609.16, oltre70: 970 },
      minimoFatturabile: 1940,
    },
    20: {
      spessore: 20,
      disponibile: true,
      prezziMq: { fino62: 712.78, da63a70: 712.78, oltre70: 1135 },
      minimoFatturabile: 2270,
    },
    30: {
      spessore: 30,
      disponibile: false,
      prezziMq: { fino62: 'Non Disp.', da63a70: 'Non Disp.', oltre70: 'Non Disp.' },
      minimoFatturabile: 'Non Disp.',
    },
  },
  alzatinaAltezza: 0.08,
  alzatinaEuroMl: 80,
  schienaleEuroMq: 1135,
}

const listino: ListinoMarmeria = {
  materiali: [materiale],
  lavorazioniBordo: [
    { id: 1, descrizione: 'Finitura costa retta', prezzoMlPerTipologia: { QUARZO: 48, LAPITEC: 61, GRES: 61 } },
  ],
  lavorazioniVarie: [
    { descrizione: 'Foro rettangolare', prezzoPerTipologia: { QUARZO: 120, LAPITEC: 132, GRES: 132 }, unitaMisura: 'PEZZO' },
  ],
  vascheIntegrate: [],
  rilMontScaglioni: scaglioni,
  scontiDisponibili: [0, 0.05, 0.10],
  aggiornato: '2026-01-01',
}

describe('fasciaFromProfondita', () => {
  it('sceglie la fascia corretta da profondità cm', () => {
    expect(fasciaFromProfondita(50)).toBe('fino62')
    expect(fasciaFromProfondita(62)).toBe('fino62')
    expect(fasciaFromProfondita(63)).toBe('63a70')
    expect(fasciaFromProfondita(70)).toBe('63a70')
    expect(fasciaFromProfondita(71)).toBe('oltre70')
    expect(fasciaFromProfondita(100)).toBe('oltre70')
  })
})

describe('prezzoMqMateriale', () => {
  it('restituisce il prezzo corretto per fascia', () => {
    expect(prezzoMqMateriale(materiale, 13, 'fino62')).toBe(609.16)
    expect(prezzoMqMateriale(materiale, 20, 'oltre70')).toBe(1135)
  })

  it('restituisce null per materiale non disponibile', () => {
    expect(prezzoMqMateriale(materiale, 30, 'fino62')).toBeNull()
  })
})

describe('calcRilMont', () => {
  it('scaglione corretto per importo 1388 → 300', () => {
    expect(calcRilMont(1388, scaglioni)).toBe(300)
  })

  it('scaglione corretto per importo oltre 2000 → 209', () => {
    expect(calcRilMont(2500, scaglioni)).toBe(209)
  })

  it('scaglione per importo 500 → 300', () => {
    expect(calcRilMont(500, scaglioni)).toBe(300)
  })
})

describe('calcMarmeria', () => {
  // Importi all'euro intero (D4): 2 mq × 609,16 = 1.218,32 → 1.218 per riga, e
  // da lì lordo, sconto e totali sono interi.
  it('applica sconto sul totale lordo', () => {
    const quote: QuoteMarmeria = {
      tipologiaMateriale: 'LAPITEC',
      righeMateriali: [
        { id: '1', materialeKey: 'Adia kC_Opaco', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 2, prezzoMq: 609.16, totale: 1218.32 },
      ],
      righeAlzatine: [],
      righeLavorazioniBordo: [],
      righeVarie: [],
      sconto: 0.10,
      includiRilMont: false,
    }

    const result = calcMarmeria(listino, quote)
    expect(result.totLordo).toBe(1218)
    expect(result.sconto).toBe(122) // 121,832 → 122
    expect(result.totScontato).toBe(1096)
    expect(result.costoRilMont).toBe(0)
    expect(result.totaleFinale).toBe(1096)
  })

  it('calcola rilievo+montaggio con scaglioni', () => {
    const quote: QuoteMarmeria = {
      tipologiaMateriale: 'LAPITEC',
      righeMateriali: [
        { id: '1', materialeKey: 'Adia kC_Opaco', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 2, prezzoMq: 609.16, totale: 1218.32 },
      ],
      righeAlzatine: [
        { id: '2', materialeKey: 'Adia kC_Opaco', qtaMl: 3, prezzoMl: 80, totale: 240 },
      ],
      righeLavorazioniBordo: [],
      righeVarie: [],
      sconto: 0,
      includiRilMont: true,
    }

    const result = calcMarmeria(listino, quote)
    // totLordo = 1218 (2 × 609,16 = 1.218,32 → 1.218, D4) + 240 = 1458
    // totScontato = 1458 (sconto 0)
    // rilMont: 1458 falls in [1000.01, 1500] → 300
    expect(result.totLordo).toBe(1458)
    expect(result.costoRilMont).toBe(300)
    expect(result.totaleFinale).toBe(1758)
  })

  it('ignora rilievo+montaggio se includiRilMont = false', () => {
    const quote: QuoteMarmeria = {
      tipologiaMateriale: 'LAPITEC',
      righeMateriali: [
        { id: '1', materialeKey: 'Adia kC_Opaco', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 2, prezzoMq: 609.16, totale: 1218.32 },
      ],
      righeAlzatine: [],
      righeLavorazioniBordo: [],
      righeVarie: [],
      sconto: 0,
      includiRilMont: false,
    }

    const result = calcMarmeria(listino, quote)
    expect(result.costoRilMont).toBe(0)
    expect(result.totaleFinale).toBe(1218)
  })

  it('niente rilievo+montaggio senza un top: lordo 0 e spunta accesa → 0 (A1, risposta di Antonio)', () => {
    const quote: QuoteMarmeria = {
      tipologiaMateriale: 'LAPITEC',
      righeMateriali: [],
      righeAlzatine: [],
      righeLavorazioniBordo: [],
      righeVarie: [],
      sconto: 0,
      includiRilMont: true,
    }

    const result = calcMarmeria(listino, quote)
    expect(result.totLordo).toBe(0)
    expect(result.costoRilMont).toBe(0)
    expect(result.totaleFinale).toBe(0)
  })

  it('lordo > 0 con sconto 100% → la fascia minima resta (il blocco si stampa e la mostra)', () => {
    const quote: QuoteMarmeria = {
      tipologiaMateriale: 'LAPITEC',
      righeMateriali: [
        { id: '1', materialeKey: 'Adia kC_Opaco', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 2, prezzoMq: 609.16, totale: 1218.32 },
      ],
      righeAlzatine: [],
      righeLavorazioniBordo: [],
      righeVarie: [],
      sconto: 1,
      includiRilMont: true,
    }

    const result = calcMarmeria(listino, quote)
    expect(result.totLordo).toBe(1218)
    expect(result.totScontato).toBe(0)
    expect(result.costoRilMont).toBe(300)
    expect(result.totaleFinale).toBe(300)
  })

  it('ignora il campo totale manomesso e ricalcola qta × prezzo (A4)', () => {
    const quote: QuoteMarmeria = {
      tipologiaMateriale: 'LAPITEC',
      righeMateriali: [
        // totale manomesso a 1 (dovrebbe essere 2 × 609.16 = 1218.32 → 1218 all'euro)
        { id: '1', materialeKey: 'Adia kC_Opaco', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 2, prezzoMq: 609.16, totale: 1 },
      ],
      righeAlzatine: [],
      righeLavorazioniBordo: [],
      righeVarie: [],
      sconto: 0,
      includiRilMont: false,
    }

    const result = calcMarmeria(listino, quote)
    expect(result.totMateriali).toBe(1218)
    expect(result.totaleFinale).toBe(1218)
  })

  it('ricalcola il bordo dal listino per la tipologia corrente, ignorando prezzo/totale stale (NEW-001)', () => {
    const quote: QuoteMarmeria = {
      tipologiaMateriale: 'LAPITEC', // LAPITEC → 61 €/ml
      righeMateriali: [],
      righeAlzatine: [],
      righeLavorazioniBordo: [
        // riga aggiunta quando la tipologia era QUARZO (48): prezzo/totale stale
        { lavorazioneId: 1, qtaMl: 2, prezzoMl: 48, totale: 96 },
      ],
      righeVarie: [],
      sconto: 0,
      includiRilMont: false,
    }

    const result = calcMarmeria(listino, quote)
    // usa il prezzo LAPITEC (61): 2 × 61 = 122, NON il 96 stale
    expect(result.totLavorazioniBordo).toBeCloseTo(122)
    expect(result.totaleFinale).toBeCloseTo(122)
  })

  it('ricalcola le lavorazioni varie dal listino per la tipologia corrente (NEW-001)', () => {
    const quote: QuoteMarmeria = {
      tipologiaMateriale: 'QUARZO', // QUARZO → 120
      righeMateriali: [],
      righeAlzatine: [],
      righeLavorazioniBordo: [],
      righeVarie: [
        // stale da LAPITEC (132)
        { descrizione: 'Foro rettangolare', um: 'PEZZO', qta: 3, prezzoUnit: 132, totale: 396 },
      ],
      sconto: 0,
      includiRilMont: false,
    }

    const result = calcMarmeria(listino, quote)
    // QUARZO 120 × 3 = 360, non 396
    expect(result.totLavorazioniVarie).toBeCloseTo(360)
  })
})

describe('prezzoMlLavorazioneBordo / prezzoLavorazioneVaria', () => {
  it('legge il prezzo per tipologia dal listino', () => {
    expect(prezzoMlLavorazioneBordo(listino, 1, 'QUARZO')).toBe(48)
    expect(prezzoMlLavorazioneBordo(listino, 1, 'LAPITEC')).toBe(61)
    expect(prezzoLavorazioneVaria(listino, 'Foro rettangolare', 'LAPITEC')).toBe(132)
  })

  it('null (mai 0) per id/descrizione inesistenti: la riga è «da definire» (A2)', () => {
    expect(prezzoMlLavorazioneBordo(listino, 999, 'QUARZO')).toBeNull()
    expect(prezzoLavorazioneVaria(listino, 'Inesistente', 'QUARZO')).toBeNull()
  })
})

describe('calcMarmeria — lavorazioni non prezzabili «da definire» (A2)', () => {
  const listinoND: ListinoMarmeria = {
    ...listino,
    lavorazioniBordo: [{ id: 1, descrizione: 'Toro', prezzoMlPerTipologia: { QUARZO: 50, LAPITEC: 60, GRES: null } }],
    lavorazioniVarie: [{ descrizione: 'Foro', prezzoPerTipologia: { QUARZO: 30, LAPITEC: 30, GRES: 30 }, unitaMisura: 'PEZZO' }],
  }
  const q = (p: Partial<QuoteMarmeria>): QuoteMarmeria => ({
    tipologiaMateriale: 'GRES', righeMateriali: [], righeAlzatine: [], righeLavorazioniBordo: [],
    righeVarie: [], sconto: 0, includiRilMont: false, ...p,
  })

  it('N/D per la tipologia o sparita dal listino: fuori dal totale e contata; a quantità 0 non conta', () => {
    const r = calcMarmeria(
      listinoND,
      q({
        righeLavorazioniBordo: [
          { lavorazioneId: 1, qtaMl: 3, prezzoMl: 60, totale: 180 }, // N/D in GRES
          { lavorazioneId: 7, qtaMl: 0, prezzoMl: 10, totale: 0 }, // sparita, ma quantità 0
        ],
        righeVarie: [
          { descrizione: 'Foro', um: 'PEZZO', qta: 2, prezzoUnit: 30, totale: 60 },
          { descrizione: 'Foro rinominato', um: 'PEZZO', qta: 1, prezzoUnit: 30, totale: 30 },
        ],
      })
    )
    expect(r.totLavorazioniBordo).toBe(0)
    expect(r.totLavorazioniVarie).toBe(60)
    expect(r.lavorazioniDaDefinire).toBe(2)
  })

  it('gres di sole lavorazioni da definire: lordo 0, nessun rilievo anche con la spunta', () => {
    const r = calcMarmeria(
      listinoND,
      q({ righeLavorazioniBordo: [{ lavorazioneId: 1, qtaMl: 3, prezzoMl: 60, totale: 180 }], includiRilMont: true })
    )
    expect(r.totLordo).toBe(0)
    expect(r.costoRilMont).toBe(0)
    expect(r.lavorazioniDaDefinire).toBe(1)
  })
})

describe('calcMarmeria — sconto difensivo', () => {
  const conSconto = (sconto: number): QuoteMarmeria => ({
    tipologiaMateriale: 'LAPITEC',
    righeMateriali: [
      { id: '1', materialeKey: 'k', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 2, prezzoMq: 100, totale: 200 },
    ],
    righeAlzatine: [],
    righeLavorazioniBordo: [],
    righeVarie: [],
    sconto,
    includiRilMont: false,
  })

  it('sconto = 1 → totale scontato 0', () => {
    const r = calcMarmeria(listino, conSconto(1))
    expect(r.totLordo).toBe(200)
    expect(r.totScontato).toBe(0)
  })

  it('sconto > 1 → clamp a 1', () => {
    expect(calcMarmeria(listino, conSconto(5)).totScontato).toBe(0)
  })

  it('sconto NaN → nessuno sconto', () => {
    const r = calcMarmeria(listino, conSconto(NaN))
    expect(r.sconto).toBe(0)
    expect(r.totScontato).toBe(200)
  })
})

describe('calcMarmeria — rilievo+montaggio senza scaglioni', () => {
  it('listino con scaglioni vuoti → costoRilMont 0 anche se richiesto', () => {
    const listinoNoScaglioni = { ...listino, rilMontScaglioni: [] }
    const quote: QuoteMarmeria = {
      tipologiaMateriale: 'LAPITEC',
      righeMateriali: [
        { id: '1', materialeKey: 'k', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 2, prezzoMq: 100, totale: 200 },
      ],
      righeAlzatine: [],
      righeLavorazioniBordo: [],
      righeVarie: [],
      sconto: 0,
      includiRilMont: true,
    }
    expect(calcMarmeria(listinoNoScaglioni, quote).costoRilMont).toBe(0)
  })
})

describe('calcRilMont — edge', () => {
  it('scaglioni vuoti → 0', () => {
    expect(calcRilMont(1000, [])).toBe(0)
  })

  it('totale NaN → 0', () => {
    expect(calcRilMont(NaN, scaglioni)).toBe(0)
  })

  it('importo fuori da ogni scaglione → fallback all\'ultimo importo', () => {
    const sc: RilMontScaglione[] = [{ da: 0, a: 100, importo: 50 }]
    expect(calcRilMont(99999, sc)).toBe(50)
  })
})

describe('calcMarmeria — vasca in gres', () => {
  // Materiali = 2 × 500 = 1000 €: numeri tondi, e il boundary a 2000 della
  // fixture `scaglioni` resta a portata di una vasca (1.240) → serve ai test
  // sullo scaglione qui sotto.
  const base = (extra: Partial<QuoteMarmeria> = {}): QuoteMarmeria => ({
    tipologiaMateriale: 'GRES',
    righeMateriali: [
      { id: '1', materialeKey: 'k', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 2, prezzoMq: 500, totale: 1000 },
    ],
    righeAlzatine: [],
    righeLavorazioniBordo: [],
    righeVarie: [],
    sconto: 0,
    includiRilMont: false,
    ...extra,
  })

  it('vasca inclusa → il suo prezzo nel lordo', () => {
    const r = calcMarmeria(listino, base({ vasca: { inclusa: true, prezzo: VASCA } }))
    expect(r.totVasca).toBe(1240)
    expect(r.totLordo).toBe(2240) // 1000 materiali + 1240 vasca
    expect(r.totaleFinale).toBe(2240)
  })

  it('quote senza chiave `vasca` → risultato invariato (no-regression)', () => {
    // Pinna OGNI campo, non solo totVasca: un preventivo senza vasca deve dare
    // lo stesso identico Result di prima che la vasca esistesse.
    expect(calcMarmeria(listino, base())).toEqual({
      totMateriali: 1000,
      integrazioneMinimo: 0,
      totAlzatine: 0,
      totLavorazioniBordo: 0,
      totLavorazioniVarie: 0,
      lavorazioniDaDefinire: 0,
      totVasca: 0,
      totLordo: 1000,
      sconto: 0,
      totScontato: 1000,
      costoRilMont: 0,
      totaleFinale: 1000,
    })
  })

  it('vasca esclusa → identica alla quote senza la chiave (il prezzo non trapela)', () => {
    const esclusa = calcMarmeria(listino, base({ vasca: { inclusa: false, prezzo: VASCA } }))
    expect(esclusa).toEqual(calcMarmeria(listino, base()))
    expect(esclusa.totVasca).toBe(0)
  })

  it('la vasca è scontata come il resto del gres: sconto 50% → 620', () => {
    // Solo vasca, zero materiali: isola il contributo della vasca allo sconto.
    const r = calcMarmeria(
      listino,
      base({ righeMateriali: [], sconto: 0.5, vasca: { inclusa: true, prezzo: VASCA } })
    )
    expect(r.totLordo).toBe(1240)
    expect(r.sconto).toBe(620)
    expect(r.totScontato).toBe(620)
  })

  // ── Il caso che motiva l'intera scelta di far entrare la vasca nel lordo ──
  // La vasca NON è additiva sul totale: entrando nella base scontata (G81) può
  // cambiare lo scaglione del montaggio, e quindi il totale si muove di più (o
  // di meno) del prezzo della vasca.
  describe('sposta lo scaglione del montaggio (PREVENTIVO!G81)', () => {
    it('la vasca fa scattare lo scaglione: 300 → 209', () => {
      const senza = calcMarmeria(listino, base({ includiRilMont: true }))
      expect(senza.totScontato).toBe(1000) // scaglione [0, 1000] → 300
      expect(senza.costoRilMont).toBe(300)
      expect(senza.totaleFinale).toBe(1300)

      const con = calcMarmeria(
        listino,
        base({ includiRilMont: true, vasca: { inclusa: true, prezzo: VASCA } })
      )
      expect(con.totScontato).toBe(2240) // scaglione [2000.01, null] → 209
      expect(con.costoRilMont).toBe(209)
      // +1240 di vasca, ma il totale sale di 1149: lo scaglione è sceso di 91.
      expect(con.totaleFinale).toBe(2449)
    })

    it('la vasca è scontata PRIMA di scegliere lo scaglione (G81, non "vasca fuori sconto")', () => {
      const r = calcMarmeria(
        listino,
        base({
          righeMateriali: [
            { id: '1', materialeKey: 'k', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 2, prezzoMq: 1000, totale: 2000 },
          ],
          sconto: 0.5,
          includiRilMont: true,
          vasca: { inclusa: true, prezzo: VASCA },
        })
      )
      expect(r.totLordo).toBe(3240)
      expect(r.totScontato).toBe(1620) // (2000 + 1240) × 0.5

      // 1620 → scaglione [1500.01, 2000] → 300.
      // È l'assert che discrimina il modello: col modello alternativo (vasca
      // FUORI dallo sconto, sommata dopo) la base sarebbe 2000 × 0.5 + 1240 =
      // 2240 → scaglione [2000.01, null] → 209. Se questo torna 209, qualcuno
      // ha spostato la vasca fuori dal lordo.
      expect(r.costoRilMont).toBe(300)
      expect(r.totaleFinale).toBe(1920)
    })
  })
})

describe('calcMarmeria — minimo fatturabile 2 mq (A5, risposta di Antonio)', () => {
  // Prezzi sintetici. Il minimo è 2 × il prezzo €/mq della RIGA (fascia già
  // applicata), non il «MINIMO 2 MQ» del listino: la chiave 'x' non è nel listino
  // apposta, il minimo non lo legge.
  const top = (qtaMq: number, prezzoMq: number, materialeKey = 'x') => ({
    id: materialeKey + qtaMq, materialeKey, spessore: 13 as const, fascia: 'fino62' as const,
    profonditaCm: 60, qtaMq, prezzoMq, totale: 0,
  })
  const q = (p: Partial<QuoteMarmeria>): QuoteMarmeria => ({
    tipologiaMateriale: 'GRES', righeMateriali: [], righeAlzatine: [], righeLavorazioniBordo: [],
    righeVarie: [], sconto: 0, includiRilMont: false, ...p,
  })

  it('1,2 mq a 500 €/mq → materiali 600 + integrazione 400 = 1.000 nel lordo', () => {
    const r = calcMarmeria(listino, q({ righeMateriali: [top(1.2, 500)] }))
    expect(r.totMateriali).toBeCloseTo(600)
    expect(r.integrazioneMinimo).toBeCloseTo(400)
    expect(r.totLordo).toBeCloseTo(1000)
  })

  it('continuità: 1,99 mq e 2,00 mq dello stesso materiale fatturano lo stesso', () => {
    const sotto = calcMarmeria(listino, q({ righeMateriali: [top(1.99, 500)] }))
    const pari = calcMarmeria(listino, q({ righeMateriali: [top(2, 500)] }))
    expect(pari.integrazioneMinimo).toBe(0)
    expect(sotto.totMateriali + sotto.integrazioneMinimo).toBeCloseTo(pari.totMateriali)
  })

  it('nessun top (Σ mq = 0): nessun minimo, anche con vasca e lavorazioni', () => {
    const r = calcMarmeria(
      listino,
      q({
        righeMateriali: [top(0, 500)],
        righeLavorazioniBordo: [{ lavorazioneId: 1, qtaMl: 2, prezzoMl: 0, totale: 0 }],
        vasca: { inclusa: true, prezzo: VASCA },
      })
    )
    expect(r.integrazioneMinimo).toBe(0)
  })

  it('più materiali: vale il 2 × prezzo più alto fra le righe con quantità', () => {
    const r = calcMarmeria(
      listino,
      q({ righeMateriali: [top(0.5, 300, 'a'), top(0.5, 500, 'b'), top(0, 900, 'c')] })
    )
    // minimo = 2 × 500 (la riga a 900 ha quantità 0 e non conta); righe = 150 + 250
    expect(r.integrazioneMinimo).toBeCloseTo(1000 - 400)
  })

  it('le alzatine si sommano sempre, anche quando scatta il minimo', () => {
    const r = calcMarmeria(
      listino,
      q({ righeMateriali: [top(1, 500)], righeAlzatine: [{ id: 'z', materialeKey: 'x', qtaMl: 2, prezzoMl: 50, totale: 100 }] })
    )
    expect(r.integrazioneMinimo).toBeCloseTo(500)
    expect(r.totLordo).toBeCloseTo(1000 + 100)
  })

  it('l integrazione è scontata e conta nella base del rilievo e montaggio', () => {
    // 1 mq a 1.200 → minimo 2.400: base 2.400 × 0,9 = 2.160 → fascia oltre 2.000 (209)
    const r = calcMarmeria(listino, q({ righeMateriali: [top(1, 1200)], sconto: 0.1, includiRilMont: true }))
    expect(r.totLordo).toBeCloseTo(2400)
    expect(r.sconto).toBeCloseTo(240)
    expect(r.costoRilMont).toBe(209)
  })
})

describe('calcMarmeria — importi all\'euro intero (D4)', () => {
  const vuota: QuoteMarmeria = {
    tipologiaMateriale: 'LAPITEC',
    righeMateriali: [],
    righeAlzatine: [],
    righeLavorazioniBordo: [],
    righeVarie: [],
    sconto: 0,
    includiRilMont: false,
  }
  const top = (qtaMq: number, prezzoMq: number) => ({
    id: 't' + qtaMq + prezzoMq, materialeKey: 'Adia kC_Opaco', spessore: 13 as const, fascia: 'fino62' as const,
    profonditaCm: 60, qtaMq, prezzoMq, totale: 0,
  })

  it('importoRiga: quantità × prezzo all\'euro intero', () => {
    expect(importoRiga(2, 609.16)).toBe(1218)
    // Al più vicino, senza doppio arrotondamento: 1,5 × 80,33 = 120,495 → 120, non
    // 120,50 → 121 (scarto 0,505). Il rumore dei float si toglie a 15 cifre.
    expect(importoRiga(1.5, 80.33)).toBe(120)
  })

  it('ogni riga si arrotonda per conto suo: due righe da 0,40 € fanno 0, non 1', () => {
    const r = calcMarmeria(listino, { ...vuota, righeMateriali: [top(0.001, 400), top(0.001, 400)] })
    expect(r.totMateriali).toBe(0)
  })

  it('integrazione al minimo intera: minimo = 2 × prezzo all\'euro, meno le righe già intere', () => {
    // 1 mq × 609,16 → 609; minimo 2 × 609,16 = 1.218,32 → 1.218; integrazione 609.
    const r = calcMarmeria(listino, { ...vuota, righeMateriali: [top(1, 609.16)] })
    expect(r.totMateriali).toBe(609)
    expect(r.integrazioneMinimo).toBe(609)
    expect(r.totMateriali + r.integrazioneMinimo).toBe(1218)
  })

  it('bordo, varie e vasca sono interi; il lordo è la loro somma', () => {
    const r = calcMarmeria(listino, {
      ...vuota,
      righeLavorazioniBordo: [{ lavorazioneId: 1, qtaMl: 1.25, prezzoMl: 61, totale: 0 }], // 76,25 → 76
      righeVarie: [{ descrizione: 'Foro rettangolare', um: 'PEZZO', qta: 1, prezzoUnit: 132, totale: 132 }],
      vasca: { inclusa: true, prezzo: VASCA - 0.5 }, // 1.239,50 → 1.240
    })
    expect(r.totLavorazioniBordo).toBe(76)
    expect(r.totLavorazioniVarie).toBe(132)
    expect(r.totVasca).toBe(1240)
    expect(r.totLordo).toBe(76 + 132 + 1240)
  })

  it('lo scaglione del rilievo si sceglie sullo scontato intero, quello stampato', () => {
    const scaglioniSoglia: RilMontScaglione[] = [
      { da: 0, a: 3000, importo: 400 },
      { da: 3000, a: null, importo: 0, percentuale: 0.15 },
    ]
    // 2 mq × 1.499,80 = 2.999,60 → 3.000 stampato: fascia aperta, 15% = 450
    // (sul grezzo sarebbe 400). 2 mq: niente minimo fatturabile.
    const r = calcMarmeria(
      { ...listino, rilMontScaglioni: scaglioniSoglia },
      { ...vuota, righeMateriali: [top(2, 1499.8)], includiRilMont: true }
    )
    expect(r.totScontato).toBe(3000)
    expect(r.costoRilMont).toBe(450)
    expect(r.totaleFinale).toBe(3450)
  })

  it('una fascia del listino con i centesimi esce comunque intera', () => {
    const r = calcMarmeria(
      { ...listino, rilMontScaglioni: [{ da: 0, a: null, importo: 300.4 }] },
      { ...vuota, righeMateriali: [top(1, 500)], includiRilMont: true }
    )
    expect(r.costoRilMont).toBe(300)
  })

  it('tutti gli importi del risultato sono interi', () => {
    const r = calcMarmeria(listino, {
      ...vuota,
      righeMateriali: [top(1.37, 609.16)],
      righeAlzatine: [{ id: 'a', materialeKey: 'Adia kC_Opaco', qtaMl: 2.3, prezzoMl: 80.4, totale: 0 }],
      sconto: 0.05,
      includiRilMont: true,
    })
    for (const [k, v] of Object.entries(r)) expect(Number.isInteger(v), k).toBe(true)
  })
})
