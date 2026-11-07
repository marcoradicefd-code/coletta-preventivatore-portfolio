import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { strutturaCucina } from '@/data/cucina/strutturaCucina'
import { parseCucina } from '@/parsers/parseCucina'
import { VASCA_DESCRIZIONE } from '@/data/gres/vascaGres'

/**
 * Test di CLASSE, non di istanza: verifica che il bundle prodotto contenga
 * davvero il codice dell'applicazione.
 *
 * Il 30/06 il build usciva 0 spedendo un guscio da ~399 kB (contro 843 kB) con
 * zero codice applicativo: un throw statico in cima a `lib/supabase.ts` rendeva
 * irraggiungibile `render(<App/>)` e rolldown potava l'intero albero. Nessun
 * errore, da nessuna parte. Le due env sono ora presidiate a monte
 * (`assertSupabaseEnv` in vite.config.ts), ma questo test copre la CATEGORIA:
 * fallisce se l'app evapora dal chunk per qualunque causa futura.
 *
 * Si auto-skippa (come le suite golden) in due casi, perché un verde su prove
 * assenti o scadute sarebbe esattamente la bugia silenziosa che stiamo curando:
 *   1. `dist/` non esiste — nessun `npm run build` (dist/ è gitignored)
 *   2. `dist/` è più vecchio dei sorgenti — asserirebbe su un bundle superato
 * In CI usare `npm run build && npm test`, così il chunk è fresco e il test gira.
 */

const DIST_ASSETS = resolve(process.cwd(), 'dist/assets')
const SRC = resolve(process.cwd(), 'src')

function chunkPrincipale(): string | null {
  if (!existsSync(DIST_ASSETS)) return null
  const file = readdirSync(DIST_ASSETS).find((f) => /^index-.*\.js$/.test(f))
  return file ? join(DIST_ASSETS, file) : null
}

/** mtime del sorgente applicativo più recente. I test non finiscono nel bundle → esclusi. */
function mtimeSorgentePiuRecente(): number {
  let max = 0
  for (const rel of readdirSync(SRC, { recursive: true, encoding: 'utf8' })) {
    if (rel.includes('__tests__') || /\.test\.[tj]sx?$/.test(rel)) continue
    const stat = statSync(join(SRC, rel))
    if (stat.isFile() && stat.mtimeMs > max) max = stat.mtimeMs
  }
  return max
}

// Marker da sorgenti indipendenti: testo legale statico (condizioniContrattuali)
// e copy dell'UI. Se l'app evapora spariscono ENTRAMBI, quindi ne basta uno per
// provare che il codice applicativo è nel chunk — così un refactor del testo
// legale non fa fallire il test da solo.
const MARKER = ['COMMITTENTE', 'Preventivo']

const chunk = chunkPrincipale()
const stantio = chunk !== null && mtimeSorgentePiuRecente() > statSync(chunk).mtimeMs

describe.skipIf(chunk === null || stantio)("bundle — il codice dell'app è nel chunk", () => {
  it('contiene almeno un marker applicativo', () => {
    const codice = readFileSync(chunk!, 'utf8')
    const trovati = MARKER.filter((m) => codice.includes(m))

    expect(
      trovati.length,
      `Nessuno dei marker ${MARKER.join(' / ')} è nel chunk (${codice.length} byte). ` +
        `L'app è stata potata dal bundle: controlla i throw a livello di modulo ` +
        `nelle dipendenze di main.tsx.`
    ).toBeGreaterThan(0)
  })
})

// ── D7 (PR 10b-2): i prezzi di cucina e vasca non stanno nel bundle ──

/** Il letterale di una voce della struttura nel chunk (da `id:` alla `}`), o null. */
function letteraleVoce(codice: string, id: string): string | null {
  const m = new RegExp(`\\{id:[\`"']${id}[\`"'][^}]*\\}`).exec(codice)
  return m ? m[0] : null
}

// (a) In CI: la FORMA. Le voci della struttura sono nel chunk (la pagina le usa),
// ma nessuna porta un prezzo, e la vasca non ha un prezzo di default letterale.
describe.skipIf(chunk === null || stantio)('bundle — D7: forma senza prezzi di cucina e vasca', () => {
  it('ogni voce della cucina è nel chunk senza prezzo; nessun «inclusa:!1,prezzo:<cifra>» per la vasca', () => {
    const codice = readFileSync(chunk!, 'utf8')
    const letterali = strutturaCucina.map((v) => ({ id: v.id, testo: letteraleVoce(codice, v.id) }))
    // Senza le voci il controllo sotto sarebbe vuoto: prima si prova che ci sono.
    expect(letterali.filter((l) => l.testo === null).map((l) => l.id)).toEqual([])
    expect(letterali.filter((l) => /prezzo/.test(l.testo!)).map((l) => l.id)).toEqual([])
    expect(codice.match(/inclusa:!1,prezzo:\d/g) ?? []).toEqual([])
  })
})

// (b) In locale: il golden. Nessun prezzo VERO del listino cucine accanto alla sua
// voce, alla vasca o ai giorni extra. Si salta senza il file vero (CI, cloni).
const LISTINO_CUCINE = resolve(process.cwd(), 'src/parsers/__tests__/fixtures/LISTINO CUCINA COLETTA.xls')

describe.skipIf(chunk === null || stantio || !existsSync(LISTINO_CUCINE))('bundle — D7: nessuna coppia nome-prezzo del listino cucine vero', () => {
  it('nessun prezzo vero dentro il letterale della sua voce, né vicino a vasca e giorni extra', () => {
    const codice = readFileSync(chunk!, 'utf8')
    const wb = XLSX.read(readFileSync(LISTINO_CUCINE), { type: 'buffer', cellFormula: true })
    const listino = parseCucina(wb, strutturaCucina)
    const numero = (n: number) => new RegExp(`(^|[^0-9.])${String(n).replace('.', '\\.')}([^0-9]|$)`)

    // Il nome può contenere cifre (210, 900, 25\40): si cerca fuori dal nome. I nomi
    // col backslash sono `String.raw`, quindi nel chunk compaiono come a runtime.
    const letterali = listino.prezzi.map((p) => ({
      ...p,
      nome: strutturaCucina.find((v) => v.id === p.id)!.nome,
      testo: letteraleVoce(codice, p.id) ?? '',
    }))
    // Se il formato dei nomi nel chunk cambiasse, togliere il nome non toglierebbe niente.
    expect(letterali.filter((l) => !l.testo.includes(l.nome)).map((l) => l.id)).toEqual([])
    const coppie = letterali.filter((l) => numero(l.prezzo).test(l.testo.replace(l.nome, '')))
    expect(coppie.map((p) => p.id)).toEqual([])

    // Vasca e giorni: niente letterale col valore vero nei dintorni del loro testo.
    const dintorni = (ancora: string) => {
      const out: string[] = []
      for (let i = codice.indexOf(ancora); i !== -1; i = codice.indexOf(ancora, i + 1)) {
        out.push(codice.slice(Math.max(0, i - 300), i + 300))
      }
      return out
    }
    expect(listino.vascaGres).not.toBeNull()
    expect(listino.giornoRate).not.toBeNull()
    expect(dintorni(VASCA_DESCRIZIONE).filter((t) => numero(listino.vascaGres!).test(t))).toEqual([])
    expect(dintorni('Giorni extra').filter((t) => numero(listino.giornoRate!).test(t))).toEqual([])
    // Legge l'xls vero: circa 1 s a macchina scarica, oltre i 5 s di default quando è carica.
  }, 30_000)
})
