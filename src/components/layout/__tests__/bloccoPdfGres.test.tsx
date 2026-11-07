import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ReactElement } from 'react'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { gresCompilato, sezioneNonVuota, sezioniDaDefinire } from '@/components/layout/sections'
import { bloccoPdfAdesso } from '@/hooks/useBloccoPdf'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { CucineRiepilogo } from '@/components/cucine/CucineRiepilogo'
import { PorteRiepilogo } from '@/components/porte/PorteRiepilogo'
import { SuMisuraRiepilogo } from '@/components/sumisura/SuMisuraRiepilogo'
import { ProgettoValoreRiepilogo } from '@/components/valore/ProgettoValoreRiepilogo'
import type { SezioniState } from '@/types/quote'
import type { ListinoMarmeria } from '@/types/marmeria'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { articoloPZ } from '@/test-utils/articoli'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'

// Listino cucine finto nello store, come dal bucket: i prezzi di vendita veri
// non entrano nei test (D7).
beforeEach(() => usePricelistStore.setState({ cucine: validatoPerTest(listinoCucinaFinto) }))

// HEUR-029 dell'audit UX del 06/10: senza listino Gres, il blocco Gres
// spariva dal PDF e dal totale senza dirlo, e il PDF si genera da uno
// qualunque degli altri riepiloghi. Ora "Genera" si ferma e dice perché. Da
// L21-B «Genera» sta nella barra del preventivo: il riepilogo mostra il motivo,
// e lo stesso controllo (`bloccoPdfAdesso`) ferma «Genera» al clic.

const rigaMateriale = {
  materialeKey: 'k',
  spessore: 13 as const,
  fascia: 'fino62' as const,
  profonditaCm: 60,
  qtaMq: 1,
  prezzoMq: 100,
  totale: 100,
}

const MOTIVO =
  'Listino Gres non caricato: il blocco Gres (1 riga) resterebbe fuori dal PDF e dal totale. Ricaricalo o svuota la sezione Gres.'

describe('gresCompilato — il gres ha contenuto, a prescindere dal listino', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())

  it('sezione vuota: falso', () => {
    expect(gresCompilato(useQuoteStore.getState().sezioni)).toBe(false)
  })

  it('la sola vasca inclusa basta', () => {
    useQuoteStore.getState().setVasca({ inclusa: true })
    expect(gresCompilato(useQuoteStore.getState().sezioni)).toBe(true)
  })

  it('una riga in una qualunque delle quattro tabelle basta', () => {
    const conRiga = (gres: Partial<NonNullable<SezioniState['gres']>>): SezioniState => ({
      ...useQuoteStore.getState().sezioni,
      gres: { ...useQuoteStore.getState().sezioni.gres!, ...gres },
    })
    expect(gresCompilato(conRiga({ righeMateriali: [{ id: 'm', ...rigaMateriale }] }))).toBe(true)
    expect(gresCompilato(conRiga({ righeAlzatine: [{ id: 'a', materialeKey: 'k', qtaMl: 1, prezzoMl: 10, totale: 10 }] }))).toBe(true)
    expect(gresCompilato(conRiga({ righeLavorazioniBordo: [{ lavorazioneId: 1, qtaMl: 1, prezzoMl: 10, totale: 10 }] }))).toBe(true)
    expect(gresCompilato(conRiga({ righeVarie: [{ descrizione: 'Foro', um: 'PEZZO', qta: 1, prezzoUnit: 30, totale: 30 }] }))).toBe(true)
  })
})

// Ogni riepilogo non-gres con la sua sezione compilata e il cliente valido:
// senza il gres "Genera" sarebbe acceso.
const RIEPILOGHI: { nome: string; Riepilogo: () => ReactElement; compila: () => void }[] = [
  { nome: 'Cucine', Riepilogo: () => <CucineRiepilogo />, compila: () => useQuoteStore.getState().setVoceQuantita('colonna-210-laccato', 1) },
  { nome: 'Porte', Riepilogo: () => <PorteRiepilogo />, compila: () => useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 }) },
  { nome: 'Arredi', Riepilogo: () => <SuMisuraRiepilogo onEdit={() => {}} onAggiungiElemento={() => {}} />, compila: () => useQuoteStore.getState().addArticoloSuMisura(articoloPZ) },
  {
    nome: 'Progetto a valore',
    Riepilogo: () => <ProgettoValoreRiepilogo />,
    compila: () => useQuoteStore.getState().addRigaProgettoValore({ descrizione: 'Voce', prezzo: 100 }),
  },
]

describe('Riepiloghi — "Genera" si ferma se il gres è compilato e il listino manca', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    useQuoteStore.getState().setCliente({ nome: 'Mario', cognome: 'Rossi' })
    usePricelistStore.setState({ marmeria: null })
  })
  afterEach(() => cleanup())

  it.each(RIEPILOGHI)('$nome: avviso bloccante, e «Genera» (nella barra) si ferma', ({ Riepilogo, compila }) => {
    compila()
    useQuoteStore.getState().addRigaMateriale(rigaMateriale)
    render(Riepilogo())
    expect(screen.getByRole('alert').textContent).toBe(MOTIVO)
    expect(bloccoPdfAdesso().bloccato).toBe(true)
  })

  it('senza gres compilato: nessun avviso, "Genera" acceso (presidio)', () => {
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    render(<PorteRiepilogo />)
    expect(screen.queryByText(/Listino Gres non caricato/)).toBeNull()
    expect(bloccoPdfAdesso().bloccato).toBe(false)
  })

  it('col listino e una lavorazione da definire: nessun avviso, "Genera" acceso (A2, come le porte)', () => {
    const listino: ListinoMarmeria = {
      materiali: [], lavorazioniBordo: [], lavorazioniVarie: [], vascheIntegrate: [],
      rilMontScaglioni: [], scontiDisponibili: [0], aggiornato: '',
    }
    usePricelistStore.setState({ marmeria: validatoPerTest(listino) })
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    useQuoteStore.getState().addRigaLavorazioneBordo({ lavorazioneId: 99, qtaMl: 2, prezzoMl: 10, totale: 20 })
    render(<PorteRiepilogo />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(bloccoPdfAdesso().bloccato).toBe(false)
    usePricelistStore.setState({ marmeria: null })
  })

  it('cucina con una voce fuori catalogo: nessun avviso, "Genera" acceso (O5, come le porte)', () => {
    useQuoteStore.getState().setVoceQuantita('colonna-210-laccato', 1)
    useQuoteStore.getState().setVoceQuantita('voce-tolta-dal-catalogo', 2)
    render(<CucineRiepilogo />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(bloccoPdfAdesso().bloccato).toBe(false)
  })
})

// Un solo predicato per "il totale del PDF è parziale": legge tutte le sezioni
// che possono avere importi da definire, così una terza lo eredita.
describe('sezioniDaDefinire — quali sezioni rendono parziale il totale', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())

  it('nessuna: lista vuota', () => {
    expect(sezioniDaDefinire(useQuoteStore.getState().sezioni, { cucineDaDefinire: 0, listinoCucine: true, listinoGres: true, porteDaDefinire: 0, gresLavorazioniDaDefinire: 0 })).toEqual([])
  })

  it('gres compilato senza listino e porte da definire: entrambe, nell ordine del PDF', () => {
    useQuoteStore.getState().addRigaMateriale(rigaMateriale)
    const sezioni = useQuoteStore.getState().sezioni
    expect(sezioniDaDefinire(sezioni, { cucineDaDefinire: 0, listinoCucine: true, listinoGres: false, porteDaDefinire: 2, gresLavorazioniDaDefinire: 0 })).toEqual(['gres', 'porte'])
    expect(sezioniDaDefinire(sezioni, { cucineDaDefinire: 0, listinoCucine: true, listinoGres: true, porteDaDefinire: 1, gresLavorazioniDaDefinire: 0 })).toEqual(['porte'])
  })

  it('gres col listino ma con una lavorazione da definire: gres (A2)', () => {
    const sezioni = useQuoteStore.getState().sezioni
    expect(sezioniDaDefinire(sezioni, { cucineDaDefinire: 0, listinoCucine: true, listinoGres: true, porteDaDefinire: 0, gresLavorazioniDaDefinire: 1 })).toEqual(['gres'])
  })

  it('cucina con voci fuori catalogo: cucine per prima, nell ordine del PDF (O5)', () => {
    useQuoteStore.getState().addRigaMateriale(rigaMateriale)
    const sezioni = useQuoteStore.getState().sezioni
    expect(sezioniDaDefinire(sezioni, { cucineDaDefinire: 1, listinoCucine: true, listinoGres: false, porteDaDefinire: 1, gresLavorazioniDaDefinire: 0 })).toEqual(['cucine', 'gres', 'porte'])
    expect(sezioniDaDefinire(sezioni, { cucineDaDefinire: 2, listinoCucine: true, listinoGres: true, porteDaDefinire: 0, gresLavorazioniDaDefinire: 0 })).toEqual(['cucine'])
  })

  it('la cucina di sole voci fuori catalogo non è vuota: il blocco va nel PDF (O5)', () => {
    useQuoteStore.getState().setVoceQuantita('voce-tolta-dal-catalogo', 2)
    expect(sezioneNonVuota('cucine', useQuoteStore.getState().sezioni)).toBe(true)
  })

  it('il gres di sole righe da definire (lordo 0) non è vuoto: il blocco va nel PDF (A2)', () => {
    const sezioni = useQuoteStore.getState().sezioni
    expect(sezioneNonVuota('gres', sezioni, { gresTotLordo: 0, gresDaDefinire: 1 })).toBe(true)
    expect(sezioneNonVuota('gres', sezioni, { gresTotLordo: 0, gresDaDefinire: 0 })).toBe(false)
  })
})

// PR 10b-2: i prezzi della cucina vengono dal listino cucine. Cucina compilata
// senza listino: «Genera» spento in ogni riepilogo, PDF «da definire» e totale
// parziale. Provato contro ogni predicato che ne decide (lezione della PR 4).
describe('Cucina compilata senza listino cucine', () => {
  const MOTIVO_CUCINE =
    'Listino Cucine non caricato: la cucina resterebbe da definire nel PDF e fuori dal totale. Ricaricalo o svuota la sezione Cucine.'

  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    useQuoteStore.getState().setCliente({ nome: 'Mario', cognome: 'Rossi' })
    usePricelistStore.setState({ cucine: null, marmeria: null })
  })
  afterEach(() => cleanup())

  it.each(RIEPILOGHI.filter((r) => r.nome !== 'Cucine'))('$nome: avviso bloccante, e «Genera» (nella barra) si ferma', ({ Riepilogo, compila }) => {
    compila()
    useQuoteStore.getState().setVoceQuantita('colonna-210-laccato', 1)
    render(Riepilogo())
    expect(screen.getByRole('alert').textContent).toBe(MOTIVO_CUCINE)
    expect(bloccoPdfAdesso().bloccato).toBe(true)
  })

  it('anche i soli giorni extra o il solo extra a corpo bastano a bloccare', () => {
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    useQuoteStore.getState().setGiorniExtra(2)
    render(<PorteRiepilogo />)
    expect(screen.getByRole('alert').textContent).toBe(MOTIVO_CUCINE)
    cleanup()
    useQuoteStore.getState().setGiorniExtra(0)
    useQuoteStore.getState().setExtraManuale({ descrizione: 'Maniglie', importo: 100 })
    render(<PorteRiepilogo />)
    expect(screen.getByRole('alert').textContent).toBe(MOTIVO_CUCINE)
  })

  it('cucina e gres senza listino: i due motivi insieme, nell ordine del PDF', () => {
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    useQuoteStore.getState().setVoceQuantita('colonna-210-laccato', 1)
    useQuoteStore.getState().addRigaMateriale(rigaMateriale)
    render(<PorteRiepilogo />)
    expect(screen.getByRole('alert').textContent).toBe(`${MOTIVO_CUCINE} ${MOTIVO}`)
    expect(bloccoPdfAdesso().bloccato).toBe(true)
  })

  it('presidio: cucina vuota senza listino cucine, nessun avviso e «Genera» acceso', () => {
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    render(<PorteRiepilogo />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(bloccoPdfAdesso().bloccato).toBe(false)
  })

  it('sezioniDaDefinire: compilata senza listino → cucine; vuota o col listino → niente', () => {
    const calc = { cucineDaDefinire: 0, listinoGres: true, porteDaDefinire: 0, gresLavorazioniDaDefinire: 0 }
    expect(sezioniDaDefinire(useQuoteStore.getState().sezioni, { ...calc, listinoCucine: false })).toEqual([])
    useQuoteStore.getState().setVoceQuantita('colonna-210-laccato', 1)
    const sezioni = useQuoteStore.getState().sezioni
    expect(sezioniDaDefinire(sezioni, { ...calc, listinoCucine: false })).toEqual(['cucine'])
    expect(sezioniDaDefinire(sezioni, { ...calc, listinoCucine: true })).toEqual([])
  })

  it('sezioneNonVuota non dipende dal listino: soli giorni extra o solo extra → non vuota', () => {
    useQuoteStore.getState().setGiorniExtra(1)
    expect(sezioneNonVuota('cucine', useQuoteStore.getState().sezioni)).toBe(true)
    useQuoteStore.getState().resetAll()
    useQuoteStore.getState().setExtraManuale({ descrizione: 'X', importo: 10 })
    expect(sezioneNonVuota('cucine', useQuoteStore.getState().sezioni)).toBe(true)
  })
})
