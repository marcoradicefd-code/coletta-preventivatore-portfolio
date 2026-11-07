import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ReactElement } from 'react'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { CucineRiepilogo } from '@/components/cucine/CucineRiepilogo'
import { PorteRiepilogo } from '@/components/porte/PorteRiepilogo'
import { SuMisuraRiepilogo } from '@/components/sumisura/SuMisuraRiepilogo'
import { ProgettoValoreRiepilogo } from '@/components/valore/ProgettoValoreRiepilogo'
import { MarmeriaRiepilogo } from '@/components/marmeria/MarmeriaRiepilogo'
import type { ListinoMarmeria } from '@/types/marmeria'
import type { ListinoPorte } from '@/types/porte'
import { articoloPZ } from '@/test-utils/articoli'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'

// Listino cucine finto nello store, come dal bucket: i prezzi di vendita veri
// non entrano nei test (D7).
beforeEach(() => usePricelistStore.setState({ cucine: validatoPerTest(listinoCucinaFinto) }))

// Sconti decimali (decisione del 06/10): etichetta e campo mostrano il valore
// vero. Prima "Sconto (13%)" e un campo con 13 per uno sconto del 12,5%.

const LISTINO_PORTE: ListinoPorte = {
  modelli: [{ nome: 'GIOTTO', prezzo2026: 700, h215: 900, h240: 1000 }],
  optional: [],
  aggiornato: 'test',
}

const LISTINO_GRES: ListinoMarmeria = {
  materiali: [],
  lavorazioniBordo: [],
  lavorazioniVarie: [],
  vascheIntegrate: [],
  rilMontScaglioni: [],
  scontiDisponibili: [0, 0.125],
  aggiornato: '',
}

const CASI: { nome: string; monta: () => ReactElement; compila: () => void; haCampo: boolean }[] = [
  {
    nome: 'Cucine',
    monta: () => <CucineRiepilogo />,
    compila: () => {
      useQuoteStore.getState().setVoceQuantita('colonna-210-laccato', 1)
      useQuoteStore.getState().setScontoSezione('cucine', 0.125)
    },
    haCampo: true,
  },
  {
    nome: 'Porte',
    monta: () => <PorteRiepilogo />,
    compila: () => {
      useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
      useQuoteStore.getState().setScontoSezione('porte', 0.125)
    },
    haCampo: true,
  },
  {
    nome: 'Arredi',
    monta: () => <SuMisuraRiepilogo onEdit={() => {}} onAggiungiElemento={() => {}} />,
    compila: () => {
      useQuoteStore.getState().addArticoloSuMisura(articoloPZ)
      useQuoteStore.getState().setScontoSezione('arredi', 0.125)
    },
    haCampo: true,
  },
  {
    nome: 'Progetto a valore',
    monta: () => <ProgettoValoreRiepilogo />,
    compila: () => {
      useQuoteStore.getState().addRigaProgettoValore({ descrizione: 'Voce', prezzo: 100 })
      useQuoteStore.getState().setScontoSezione('progettoValore', 0.125)
    },
    haCampo: true,
  },
  {
    nome: 'Gres',
    monta: () => <MarmeriaRiepilogo />,
    compila: () => {
      useQuoteStore.getState().addRigaMateriale({
        materialeKey: 'k',
        spessore: 13,
        fascia: 'fino62',
        profonditaCm: 60,
        qtaMq: 1,
        prezzoMq: 100,
        totale: 100,
      })
      useQuoteStore.getState().setScontoSezione('gres', 0.125)
    },
    haCampo: false, // il gres sceglie lo sconto da una select del listino
  },
]

describe('Riepiloghi — sconto decimale mostrato com è', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({
      porte: validatoPerTest(LISTINO_PORTE),
      marmeria: validatoPerTest(LISTINO_GRES),
    })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ porte: null, marmeria: null })
  })

  it.each(CASI)('$nome: etichetta "Sconto (12,5%)" e campo a 12,5', ({ monta, compila, haCampo }) => {
    compila()
    render(monta())
    expect(screen.getByText('Sconto (12,5%)')).toBeTruthy()
    if (haCampo) expect(screen.getByDisplayValue('12.5')).toBeTruthy()
  })
})
