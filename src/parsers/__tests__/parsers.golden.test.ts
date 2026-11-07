/// <reference types="node" />
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { parseSuMisura } from '@/parsers/parseSuMisura'
import { parseMarmeria, INTESTAZIONI_GAMMA_COLORI, INTESTAZIONI_MASTER_LAVORAZIONI } from '@/parsers/parseMarmeria'
import { normLabel } from '@/parsers/parserUtils'
import { prezzoDaMatrice, tipiMatrice, interniMatrice, esterniMatrice } from '@/engine/matriceFiniture'
import { validaListinoMarmeria } from '@/parsers/marmeriaSchema'
import { validaListinoSuMisura } from '@/parsers/suMisuraSchema'
import { parsePorte } from '@/parsers/parsePorte'
import { validaListinoPorte } from '@/parsers/porteSchema'
import { parseCucina } from '@/parsers/parseCucina'
import { validaListinoCucina } from '@/parsers/cucinaSchema'
import { catalogoSenzaPrezzi, componiCatalogoCucina, strutturaCucina } from '@/data/cucina/strutturaCucina'
import { calcCucina } from '@/engine/calcCucina'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'
import { PROG_PCT, ADEG_DEFAULT, type ListinoCucina } from '@/types/cucina'
import type { ListinoSuMisura } from '@/types/sumisura'
import type { ListinoMarmeria } from '@/types/marmeria'
import type { ListinoPorte } from '@/types/porte'
import type { SezioneCucine } from '@/types/quote'
import { dimensioneDecompressa, MAX_DECOMPRESSO_BYTE } from '@/lib/dimensioneZip'

// Golden fixture: i due listini REALI pinnano l'output dei parser e proteggono
// il refactor Su Misura + la migrazione xlsx→exceljs da regressioni silenziose.
//
// I file .xls/.xlsx contengono prezzi commerciali reali (fornitore + margini):
// sono GITIGNORED (vedi .gitignore) e restano solo in locale. In CI / su cloni
// senza i file, queste suite vengono SALTATE automaticamente — non falliscono.
// Per eseguirle: esportare i 2 listini dal bucket Supabase in
// src/parsers/__tests__/fixtures/ con questi nomi.
const FIXTURES_DIR = resolve(process.cwd(), 'src/parsers/__tests__/fixtures')
const SUMISURA_FILE = 'COLETTA_APR26_AGGIORNATO.xls'
const MARMERIA_FILE = 'FEB26_MARMERIA_DE_BARI_INTERNO_Rev_77_sconto_mob.xlsx'
// Listino aggiornato: nuova golden fixture di regressione (gitignored come gli altri).
const MARMERIA_REV82_FILE = 'MAGG26 MARMERIA_DE_BARI_INTERNO_Rev_82_sconto_mob.xlsx'
// Listino attivo (LUG26), quello servito dal bucket: golden gitignored, auto-skip se assente.
const MARMERIA_REV83_FILE = 'LUG26 MARMERIA_DE_BARI_INTERNO_Rev_83_sconto_mob.xlsx'
// Listino porte reale (xlsx o ods): golden gitignored come gli altri, auto-skip se assente.
const PORTE_FILE = 'LISTINO PORTE COLETTA EBANISTERIA.ods'
// Listino cucine reale (PR 10b-1): prezzi di vendita, sensibili (D7). Gitignored, auto-skip se assente.
const CUCINE_FILE = 'LISTINO CUCINA COLETTA.xls'
// Prospetto Su Misura 2026 (L7): la generazione «PREZZO»/«U.MISURA» e il foglio RETI LETTO.
const PROSPETTO_SUMISURA_FILE = 'COLETTA_2026_prospetto_preventivi_sumisura.xlsx'
// Il rev1 dello stesso prospetto (L20): in più i fogli FINITURE (la matrice) e ACCESSORI.
const REV1_SUMISURA_FILE = 'rev1_COLETTA_2026_prospetto_preventivi_sumisura.xlsx'

const hasFixtures =
  existsSync(resolve(FIXTURES_DIR, SUMISURA_FILE)) &&
  existsSync(resolve(FIXTURES_DIR, MARMERIA_FILE))
const hasRev82 = existsSync(resolve(FIXTURES_DIR, MARMERIA_REV82_FILE))
const hasRev83 = existsSync(resolve(FIXTURES_DIR, MARMERIA_REV83_FILE))
const hasPorte = existsSync(resolve(FIXTURES_DIR, PORTE_FILE))
const hasCucine = existsSync(resolve(FIXTURES_DIR, CUCINE_FILE))
const hasProspetto = existsSync(resolve(FIXTURES_DIR, PROSPETTO_SUMISURA_FILE))
const hasRev1 = existsSync(resolve(FIXTURES_DIR, REV1_SUMISURA_FILE))

const describeIf = hasFixtures ? describe : describe.skip
const describeIfRev82 = hasRev82 ? describe : describe.skip
const describeIfRev83 = hasRev83 ? describe : describe.skip
const describeIfPorte = hasPorte ? describe : describe.skip
const describeIfCucine = hasCucine ? describe : describe.skip
const describeIfProspetto = hasProspetto ? describe : describe.skip
const describeIfRev1 = hasRev1 ? describe : describe.skip

// `cellFormula: true` come il worker di produzione (`excelParser.worker.ts`).
// Non è un dettaglio: la percentuale della fascia aperta di RIL_MONT vive nel
// TESTO della formula, non nel valore. Leggendo senza formule il golden
// pinnerebbe il ramo di fallback del parser invece del dato letto dal file,
// cioè un comportamento che in produzione non accade mai.
function loadWorkbook(name: string): XLSX.WorkBook {
  const path = resolve(FIXTURES_DIR, name)
  return XLSX.read(readFileSync(path), { type: 'buffer', cellFormula: true, sheetRows: 2000 })
}

describeIf('golden — parseSuMisura (listino reale Coletta)', () => {
  let listino: ListinoSuMisura
  beforeAll(() => {
    listino = parseSuMisura(loadWorkbook(SUMISURA_FILE))
  })

  it('estrae almeno un foglio con voci', () => {
    expect(listino.fogli.length).toBeGreaterThan(0)
    const totVoci = listino.fogli.reduce((s, f) => s + f.voci.length, 0)
    expect(totVoci).toBeGreaterThan(0)
  })

  it('struttura parsata stabile (snapshot)', () => {
    // `aggiornato` è new Date().toISOString() → non deterministico: lo normalizzo.
    expect({ ...listino, aggiornato: '<iso>' }).toMatchSnapshot()
  })
})

describeIfProspetto('golden — parseSuMisura sul prospetto 2026 (intestazioni per etichetta, L7)', () => {
  // Solo conteggi e uguaglianze: nessun prezzo del file compare nel test né nei log.
  // Per questo le voci si confrontano per impronta (SHA-256 del JSON) e non con
  // `toEqual`, che da rosso stamperebbe il diff coi prezzi veri.
  const reti = (l: ListinoSuMisura) => l.fogli.find((f) => f.nome.toUpperCase().includes('RETI LETTO'))?.voci ?? []
  const impronta = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')

  it('legge SU MISURA e RETI LETTO per etichetta: 33 e 5 voci, Zod ok, nessun avviso', () => {
    const listino = parseSuMisura(loadWorkbook(PROSPETTO_SUMISURA_FILE))
    expect(listino.fogli.map((f) => [f.nome, f.voci.length])).toEqual([
      ['SU MISURA', 33],
      ['RETI LETTO DEBERNARDIS', 5],
    ])
    expect(validaListinoSuMisura(listino)).toEqual({ ok: true })
    expect(listino.avvisi).toBeUndefined()
  })

  it('una colonna inserita nel foglio RETI LETTO vero lascia invariati i prezzi cliente', () => {
    const base = parseSuMisura(loadWorkbook(PROSPETTO_SUMISURA_FILE))
    const wb = loadWorkbook(PROSPETTO_SUMISURA_FILE)
    const foglio = wb.SheetNames.find((s) => s.toUpperCase().includes('RETI LETTO'))!
    // Come fa Excel: la colonna «PREZZO 2027» entra fra PREZZO e CLIENTE, con un
    // numero su ogni riga piena (il prezzo fornitore aumentato), e il resto scala.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[foglio], { header: 1, defval: '' })
    const nuovaCella = (r: unknown[], i: number): unknown => {
      if (i === 0) return 'PREZZO 2027'
      if (r.every((c) => c === '' || c == null)) return ''
      return typeof r[1] === 'number' ? r[1] * 1.1 : r[1]
    }
    const spostate = rows.map((r, i) => [...r.slice(0, 2), nuovaCella(r, i), ...r.slice(2)])
    wb.Sheets[foglio] = XLSX.utils.aoa_to_sheet(spostate)
    const dopo = parseSuMisura(wb)
    // Le sole descrizioni: da rosso `toHaveLength` stampa l'array, e qui non ha prezzi.
    expect(reti(dopo).map((v) => v.descrizione)).toHaveLength(reti(base).length)
    expect(impronta(reti(dopo))).toBe(impronta(reti(base)))
    expect(dopo.avvisi).toBeUndefined()
  })
})

describeIfRev1('golden — parseSuMisura sul rev1 (matrice FINITURE e ACCESSORI, L20)', () => {
  // Solo forma, conteggi e un'impronta: nessun prezzo del file compare nel test né
  // nei log. Le combinazioni si confrontano per impronta (SHA-256 del JSON), come
  // nella #76, e non con `toEqual`, che da rosso stamperebbe i prezzi veri.
  const impronta = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
  const matrice = (l: ListinoSuMisura) => l.fogli.flatMap((f) => f.matrice ?? [])
  let listino: ListinoSuMisura
  beforeAll(() => {
    listino = parseSuMisura(loadWorkbook(REV1_SUMISURA_FILE))
  })

  it('quattro fogli: FINITURE con 25 combinazioni e 4 voci standard, ACCESSORI con 13 voci; Zod ok', () => {
    expect(listino.fogli.map((f) => [f.nome, f.voci.length, f.matrice?.length ?? null])).toEqual([
      ['SU MISURA', 33, null],
      ['FINITURE', 4, 25],
      ['ACCESSORI', 13, null],
      ['RETI LETTO DEBERNARDIS', 5, null],
    ])
    expect(validaListinoSuMisura(listino)).toEqual({ ok: true })
  })

  it('combinazioni e unità per tipo di arredo, mensole a metro lineare', () => {
    const perTipo: Record<string, string[]> = {}
    for (const r of matrice(listino)) (perTipo[r.tipo] ??= []).push(r.unita)
    expect(Object.entries(perTipo).map(([tipo, unita]) => [tipo, unita.length, [...new Set(unita)]])).toEqual([
      ['MOBILE GIORNO/LIBRERIA', 5, ['MQ']],
      ['ARMADIO/MOBILE CON ANTE', 6, ['MQ']],
      ['TELAIO CON ANTE', 3, ['MQ']],
      ['TELAIO CON SPECCHIO', 1, ['MQ']],
      ['MENSOLE A MURO', 3, ['ML']],
      ['BOISERIE', 5, ['MQ']],
      ['PANNELLATURA CABINA ARMADIOCON CREMALIERE WUERTH)', 2, ['MQ']],
    ])
    // «Qualsiasi interno» per telaio, specchio, mensole, boiserie e cabina. Solo i
    // tipi: da rosso `toHaveLength` stampa l'array, e le righe hanno i prezzi veri.
    expect(matrice(listino).filter((r) => r.interno === '').map((r) => r.tipo)).toHaveLength(14)
  })

  it('nel referto: le due grafie di ABET-LAMICOLOR e la nota di testata con la regola dei 40 cm', () => {
    expect(listino.avvisi).toEqual([
      'Foglio "FINITURE", colonna INTERNO: grafie diverse lette come la stessa finitura: «LAMINATO ABET-LAMICOLOR», «LAMINATO ABET – LAMICOLOR».',
    ])
    const nota = listino.fogli.find((f) => f.nome === 'FINITURE')!.nota
    expect(nota).toMatch(/^PREZZI VALIDI PER SVILUPPO DI ALMENO 3MQ/)
    expect(nota).toMatch(/MINORE DI 40CM RIDUZIONE DEL 10% PREZZO LISTINO$/)
  })

  it('ogni riga si ritrova col suo prezzo, e la scelta a cascata dà 25 combinazioni tutte prezzate (si contano gli scarti)', () => {
    const m = matrice(listino)
    const righeScartate = m.filter((r) => prezzoDaMatrice(m, r.tipo, r.interno, r.esterno) !== r.prezzo).length
    let combinazioni = 0
    let senzaPrezzo = 0
    for (const tipo of tipiMatrice(m)) {
      const interni = interniMatrice(m, tipo)
      for (const interno of interni.length > 0 ? interni : ['']) {
        for (const esterno of esterniMatrice(m, tipo, interno)) {
          combinazioni++
          if (prezzoDaMatrice(m, tipo, interno, esterno) === null) senzaPrezzo++
        }
      }
    }
    // Le due grafie di ABET-LAMICOLOR sono un interno solo, con i quattro esterni delle sue righe.
    expect([righeScartate, combinazioni, senzaPrezzo]).toEqual([0, 25, 0])
  })

  it('una colonna inserita nel foglio FINITURE vero lascia invariata la matrice (impronta)', () => {
    const wb = loadWorkbook(REV1_SUMISURA_FILE)
    // Come fa Excel: «PREZZO 2027» entra fra ESTERNO e PREZZO, con un numero su
    // ogni riga piena, e il resto scala.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.FINITURE, { header: 1, defval: '' })
    const spostate = rows.map((r, i) => {
      const vuota = r.every((c) => c === '' || c == null)
      const nuova = i === 2 ? 'PREZZO 2027' : vuota || i < 2 ? '' : 1
      return [...r.slice(0, 3), nuova, ...r.slice(3)]
    })
    wb.Sheets.FINITURE = XLSX.utils.aoa_to_sheet(spostate)
    const dopo = parseSuMisura(wb)
    expect(matrice(dopo)).toHaveLength(25)
    expect(impronta(matrice(dopo))).toBe(impronta(matrice(listino)))
  })
})

describeIf('golden — parseMarmeria (listino reale De Bari)', () => {
  let listino: ListinoMarmeria
  beforeAll(() => {
    listino = parseMarmeria(loadWorkbook(MARMERIA_FILE))
  })

  it('estrae materiali, lavorazioni, scaglioni e sconti', () => {
    expect(listino.materiali.length).toBeGreaterThan(0)
    expect(listino.lavorazioniBordo.length).toBeGreaterThan(0)
    expect(listino.rilMontScaglioni.length).toBeGreaterThan(0)
    expect(listino.scontiDisponibili.length).toBeGreaterThan(0)
  })

  it('riassunto strutturale stabile (snapshot)', () => {
    // ~400 materiali: snapshot di un RIASSUNTO (conteggi + campioni) invece del
    // dump completo, per mantenibilità.
    const summary = {
      conteggi: {
        materiali: listino.materiali.length,
        lavorazioniBordo: listino.lavorazioniBordo.length,
        lavorazioniVarie: listino.lavorazioniVarie.length,
        vascheIntegrate: listino.vascheIntegrate.length,
        rilMontScaglioni: listino.rilMontScaglioni.length,
      },
      primoMateriale: listino.materiali[0],
      primaLavorazioneBordo: listino.lavorazioniBordo[0],
      scontiDisponibili: listino.scontiDisponibili,
      rilMontScaglioni: listino.rilMontScaglioni,
    }
    expect(summary).toMatchSnapshot()
  })
})

describeIfRev82('golden — parseMarmeria (listino reale De Bari Rev_82)', () => {
  let listino: ListinoMarmeria
  beforeAll(() => {
    listino = parseMarmeria(loadWorkbook(MARMERIA_REV82_FILE))
  })

  it('estrae ~418 materiali (più del Rev_77) e passa la validazione Zod', () => {
    expect(listino.materiali.length).toBeGreaterThan(410)
    expect(validaListinoMarmeria(listino)).toEqual({ ok: true })
  })

  it('legge le nuove fasce RIL_MONT (350 e 400) con DA/A coerenti', () => {
    const byBand = (da: number) => listino.rilMontScaglioni.find((s) => s.da === da)
    expect(byBand(1000.01)?.importo).toBe(350)
    expect(byBand(1500.01)?.importo).toBe(400)
    // Tutti gli scaglioni coerenti: a null oppure ≥ da.
    for (const s of listino.rilMontScaglioni) {
      if (s.a !== null) expect(s.a).toBeGreaterThanOrEqual(s.da)
    }
  })

  it('legge ancora il minimo fatturabile del primo materiale', () => {
    const primoSpessore = Object.values(listino.materiali[0].spessori)[0]
    expect(primoSpessore).toBeDefined()
    // minimoFatturabile è numero o 'Non Disp.' — verifico che sia stato letto (non undefined).
    expect(primoSpessore!.minimoFatturabile).toBeDefined()
  })

  it('riassunto strutturale stabile (snapshot)', () => {
    const summary = {
      conteggi: {
        materiali: listino.materiali.length,
        lavorazioniBordo: listino.lavorazioniBordo.length,
        lavorazioniVarie: listino.lavorazioniVarie.length,
        vascheIntegrate: listino.vascheIntegrate.length,
        rilMontScaglioni: listino.rilMontScaglioni.length,
      },
      primoMateriale: listino.materiali[0],
      primaLavorazioneBordo: listino.lavorazioniBordo[0],
      scontiDisponibili: listino.scontiDisponibili,
      rilMontScaglioni: listino.rilMontScaglioni,
    }
    expect(summary).toMatchSnapshot()
  })
})

describeIfRev83('golden — parseMarmeria (listino attivo De Bari Rev_83)', () => {
  // Solo conteggi ed etichette: nessun prezzo nel codice.
  it('conteggi stabili e validazione Zod', () => {
    const listino = parseMarmeria(loadWorkbook(MARMERIA_REV83_FILE))
    expect({
      materiali: listino.materiali.length,
      spessori: listino.materiali.reduce((n, m) => n + Object.keys(m.spessori).length, 0),
      lavorazioniBordo: listino.lavorazioniBordo.length,
      lavorazioniVarie: listino.lavorazioniVarie.length,
      rilMontScaglioni: listino.rilMontScaglioni.length,
      scontiDisponibili: listino.scontiDisponibili.length,
      avvisi: listino.avvisi?.length ?? 0,
    }).toEqual({
      materiali: 521,
      spessori: 879,
      lavorazioniBordo: 7,
      lavorazioniVarie: 12,
      rilMontScaglioni: 4,
      scontiDisponibili: 21,
      avvisi: 0,
    })
    // La fascia aperta si legge dalla formula, non dal fallback.
    expect(listino.rilMontScaglioni.find((s) => s.a === null)?.percentuale).toBeGreaterThan(0)
    expect(validaListinoMarmeria(listino)).toEqual({ ok: true })
  })

  it('le intestazioni lette per indice sono quelle attese (A3), con la variante «12» in 6 e 54', () => {
    const wb = loadWorkbook(MARMERIA_REV83_FILE)
    const righe = (foglio: string) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[foglio], { header: 1, defval: '' })
    const gamma = righe('GAMMA_COLORI')[0]
    for (const [col, ammesse] of INTESTAZIONI_GAMMA_COLORI) expect(ammesse).toContain(normLabel(gamma[col]))
    expect(normLabel(gamma[6])).toBe('disponibilitàspessore 12mm')
    expect(normLabel(gamma[54])).toBe('minimo 2 mq spessore 12')
    const master = righe('MASTER_LAVORAZIONI')
    const varie = master.find((r) => normLabel(r[0]).startsWith('lavorazioni varie'))!
    for (const riga of [master[0], varie]) {
      for (const [col, ammesse] of INTESTAZIONI_MASTER_LAVORAZIONI) expect(ammesse).toContain(normLabel(riga[col]))
    }
  })
})

describeIfPorte('golden — parsePorte (listino reale Coletta)', () => {
  // NB: nessun prezzo reale asserito nel codice (i valori sensibili restano nella
  // fixture gitignored) — solo conteggi, pulizia strutturale e validazione Zod.
  let listino: ListinoPorte
  beforeAll(() => {
    listino = parsePorte(loadWorkbook(PORTE_FILE))
  })

  it('estrae modelli + optional e supera la validazione Zod', () => {
    expect(listino.modelli.length).toBeGreaterThan(0)
    expect(listino.optional.length).toBeGreaterThan(0)
    expect(validaListinoPorte(listino)).toEqual({ ok: true })
  })

  it('ogni prezzo 2026 è numerico positivo e pulito (nessun rumore float)', () => {
    for (const m of listino.modelli) {
      expect(m.prezzo2026).toBeGreaterThan(0)
      expect(m.prezzo2026 * 100).toBe(Math.round(m.prezzo2026 * 100)) // round 2dec applicato
    }
  })

  it('legge almeno un optional ML con rate positivo (battiscopa)', () => {
    const ml = listino.optional.filter(
      (o) => o.unita === 'ML' && typeof o.prezzo === 'number' && (o.prezzo as number) > 0
    )
    expect(ml.length).toBeGreaterThan(0)
  })

  it('nessun modello scartato per prezzo mancante: nessun avviso sul listino reale', () => {
    // Se diventa rosso, il file ha righe con un nome e senza prezzo nella colonna
    // dell'anno: modelli veri da prezzare, o righe-nota che la regola dovrebbe
    // ignorare (allora si restringe a «almeno una fascia numerica», L6).
    expect(listino.avvisi).toBeUndefined()
  })
})

describeIfCucine('golden — parseCucina (listino cucine reale Coletta)', () => {
  // Nessun prezzo nel test: si confrontano il file e il catalogo del codice fra
  // loro, a runtime. I numeri restano nella fixture gitignorata (D7).
  let listino: ListinoCucina
  beforeAll(() => {
    listino = parseCucina(loadWorkbook(CUCINE_FILE), strutturaCucina)
  })

  it('tutte le 56 voci del codice: 54 con prezzo e i 2 moltiplicatori, nessuna mancante né sconosciuta', () => {
    expect(listino.prezzi).toHaveLength(54)
    expect(listino.percentuali.casse).not.toBeNull()
    expect(listino.percentuali.ante).not.toBeNull()
    expect(listino.vociMancanti).toEqual([])
    expect(listino.righeSconosciute).toEqual([])
    expect(validaListinoCucina(listino)).toEqual({ ok: true })
  })

  it('vasca e tariffa dei giorni presenti', () => {
    expect(listino.vascaGres).not.toBeNull()
    expect(listino.giornoRate).not.toBeNull()
  })

  it('le percentuali del file sono quelle del codice (nessun avviso nel referto)', () => {
    const codice = (id: string) => {
      const v = catalogoSenzaPrezzi.find((x) => x.id === id)
      return v?.kind === 'moltiplicatore' ? v.percentuale : null
    }
    expect(listino.percentuali).toEqual({
      casse: codice('casse'),
      ante: codice('ante'),
      progettazione: PROG_PCT,
      adeguamento: ADEG_DEFAULT,
    })
  })

  // Le quantità che il foglio porta in colonna D, lette come una scelta della pagina
  // Cucine: ogni riga con D > 0 abbinata per nome alla struttura del codice.
  it(
    'riproduce il foglio: E22, E25, E48, E68, E72, E73, E74, E75, E85 a scarto 0, con D42 = 0 ' +
      '(il bug di E73 che riconta la LED non pesa); le isole a importo fisso (D61/D63 = 0) non sono coperte',
    () => {
      const ws = loadWorkbook(CUCINE_FILE).Sheets.CUCINA
      const num = (cella: string): number => {
        const v = ws[cella]?.v
        return typeof v === 'number' ? v : 0
      }
      // Precondizioni dichiarate nel nome: se il file cambia, il test lo dice.
      expect(normLabel(String(ws.A42?.v))).toBe(normLabel('STRISCIA LED (al ml)'))
      expect(num('D42')).toBe(0)
      expect([num('D61'), num('D63')]).toEqual([0, 0])

      const sezione: SezioneCucine = {
        voci: [],
        casse: false,
        ante: false,
        giorniExtra: num('D72'),
        extraManuale: null,
        adeguamentoPct: ADEG_DEFAULT,
        descrizione: '',
        sconto: 0,
      }
      const senzaVoce: string[] = []
      for (let r = 4; r <= 67; r++) {
        const qta = num(`D${r}`)
        if (qta === 0) continue
        const voce = strutturaCucina.find((v) => normLabel(v.nome) === normLabel(String(ws[`A${r}`]?.v ?? '')))
        if (!voce) senzaVoce.push(`A${r}`)
        else if (voce.kind === 'moltiplicatore') sezione[voce.id as 'casse' | 'ante'] = qta === 1
        else sezione.voci.push({ voceId: voce.id, quantita: qta })
      }
      expect(senzaVoce).toEqual([])
      let extra = 0
      for (let r = 76; r <= 84; r++) extra += num(`E${r}`)
      if (extra > 0) sezione.extraManuale = { descrizione: 'Extra', importo: extra }

      const r = calcCucina(sezione, componiCatalogoCucina(listino))
      expect({
        E22: r.primoTotale,
        E25: r.casseAnte,
        E48: r.opzionali,
        E68: r.open,
        E72: r.giorni,
        E73: r.totaleCucina,
        E74: r.progettazione,
        E75: r.adeguamento,
        E85: r.imponibile,
      }).toEqual({
        E22: num('E22'),
        E25: num('E25'),
        E48: num('E48'),
        E68: num('E68'),
        E72: num('E72'),
        E73: num('E73'),
        E74: num('E74'),
        E75: num('E75'),
        E85: num('E85'),
      })
      expect(r.vociDaDefinire).toBe(0)
    }
  )

  it('nessun prezzo del listino finto dei test è un prezzo vero, di nessuna voce (vasca e giorni compresi)', () => {
    const veri = new Set([...listino.prezzi.map((p) => p.prezzo), listino.vascaGres, listino.giornoRate])
    const coincidenti = listinoCucinaFinto.prezzi.filter((p) => veri.has(p.prezzo)).map((p) => p.id)
    expect(coincidenti).toEqual([])
    expect(veri.has(listinoCucinaFinto.vascaGres)).toBe(false)
    expect(veri.has(listinoCucinaFinto.giornoRate)).toBe(false)
  })
})

// Tetto sulla dimensione decompressa (O60): guardia contro un tetto troppo
// basso. Un listino vero che si avvicina a un quarto del tetto rompe questo
// test prima che il tetto rifiuti il listino in produzione per tutti. Legge solo
// le dimensioni dalla central directory, non stampa niente.
const LISTINI_VERI = existsSync(FIXTURES_DIR)
  ? readdirSync(FIXTURES_DIR).filter((f) => !f.startsWith('._') && /\.xlsx?$/i.test(f))
  : []
const describeIfListini = LISTINI_VERI.length > 0 ? describe : describe.skip

describeIfListini('golden — tetto sulla dimensione decompressa (listini veri)', () => {
  it('nessun listino vero supera un quarto del tetto', () => {
    const oltre = LISTINI_VERI.filter((nome) => {
      const file = readFileSync(resolve(FIXTURES_DIR, nome))
      const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
      return dimensioneDecompressa(buffer) > MAX_DECOMPRESSO_BYTE / 4
    })
    expect(oltre).toEqual([])
  })
})
