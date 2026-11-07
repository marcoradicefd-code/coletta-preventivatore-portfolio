import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ListinoPorte } from '@/types/porte'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { PreventivoPrint } from '@/components/print/PreventivoPrint'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { articoloPZ } from '@/test-utils/articoli'
import {
  NOTE_PAGAMENTO_DEFAULT,
  DESCRIZIONE_CUCINA_DEFAULT,
  DESCRIZIONE_ARREDI_DEFAULT,
  descrizionePorteDefault,
} from '@/data/testiDefault'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'

// Listino cucine finto nello store, come dal bucket: i prezzi di vendita veri
// non entrano nei test (D7).
beforeEach(() => usePricelistStore.setState({ cucine: validatoPerTest(listinoCucinaFinto) }))

// I testi vivono in `@/data/testiDefault` e sono importati, MAI ricopiati qui:
// un test che duplica la stringa smette di accorgersi se il modulo cambia.
// Si asserisce su una porzione stabile e inequivocabile, perché il testo è
// multi-riga e il render lo spezza su più nodi.
const FRASE_PAGAMENTO = /40% alla stipula, 40% merce pronta, 20% fine lavori/
// Riga generica della lista note fissa: convive col placeholder, NON col testo vero.
const RIGA_GENERICA = 'Il pagamento avverrà secondo le modalità concordate.'

const LISTINO_PORTE: ListinoPorte = {
  modelli: [
    { nome: 'GIOTTO', prezzo2026: 700, h215: 900, h240: 1000 },
    { nome: 'RAFFAELLA', prezzo2026: 880, h215: 1060, h240: 1150 },
  ],
  optional: [],
  aggiornato: 'test',
}

describe('PreventivoPrint — note pagamento (document-level)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  it('di default il preventivo include le note pagamento', () => {
    // Simmetrico a `includiCondizioni`: la clausola di pagamento è standard e
    // deve stare nel documento scritto, salvo esclusione esplicita.
    expect(useQuoteStore.getState().preventivo.includiNotePagamento).toBe(true)
  })

  it('flag ON: stampa il TESTO vero (40/40/20), non un placeholder', () => {
    useQuoteStore.getState().setIncludiNotePagamento(true)
    render(<PreventivoPrint />)
    expect(screen.getByText(FRASE_PAGAMENTO)).toBeTruthy()
    // Il placeholder storico non deve sopravvivere da nessuna parte.
    expect(screen.queryByText(/testo da definire/)).toBeNull()
  })

  it('flag OFF: nessuna nota pagamento nel PDF', () => {
    useQuoteStore.getState().setIncludiNotePagamento(false)
    render(<PreventivoPrint />)
    expect(screen.queryByText(FRASE_PAGAMENTO)).toBeNull()
  })

  it('testo EDITATO: stampa quello dell utente, non il default', () => {
    const s = useQuoteStore.getState()
    s.setIncludiNotePagamento(true)
    s.setNotePagamento('50% alla firma, 50% alla consegna')
    render(<PreventivoPrint />)
    expect(screen.getByText('50% alla firma, 50% alla consegna')).toBeTruthy()
    expect(screen.queryByText(FRASE_PAGAMENTO)).toBeNull()
  })

  it('testo svuotato: torna al default (la casella vuota non cancella la clausola)', () => {
    const s = useQuoteStore.getState()
    s.setNotePagamento('qualcosa')
    s.setNotePagamento('   ')
    render(<PreventivoPrint />)
    expect(screen.getByText(FRASE_PAGAMENTO)).toBeTruthy()
  })

  it('NIENTE DOPPIA RIGA: col testo vero sparisce la riga generica sul pagamento', () => {
    // Con entrambe, il PDF direbbe due cose sul pagamento e la prima smentisce
    // la seconda ("modalità concordate" vs percentuali precise).
    useQuoteStore.getState().setIncludiNotePagamento(true)
    render(<PreventivoPrint />)
    expect(screen.queryByText(RIGA_GENERICA)).toBeNull()
  })

  it('senza note pagamento la riga generica resta (il PDF non perde nulla)', () => {
    useQuoteStore.getState().setIncludiNotePagamento(false)
    render(<PreventivoPrint />)
    expect(screen.getByText(RIGA_GENERICA)).toBeTruthy()
  })

  it('LEGACY: blob v4 col flag ancora su arredi → il testo compare lo stesso', () => {
    // `persist` NON rieseguirebbe il migrate su un blob già v4 (stessa version):
    // il fallback di LETTURA è l'unico che salva questi preventivi.
    useQuoteStore.setState((s) => ({
      preventivo: { ...s.preventivo, includiNotePagamento: undefined },
      sezioni: {
        ...s.sezioni,
        arredi: { ...s.sezioni.arredi!, includiNotePagamento: true },
      },
    }))
    render(<PreventivoPrint />)
    expect(screen.getByText(FRASE_PAGAMENTO)).toBeTruthy()
  })

  it('LEGACY: flag vecchio a false → resta escluso (la scelta dell utente vale)', () => {
    useQuoteStore.setState((s) => ({
      preventivo: { ...s.preventivo, includiNotePagamento: undefined },
      sezioni: {
        ...s.sezioni,
        arredi: { ...s.sezioni.arredi!, includiNotePagamento: false },
      },
    }))
    render(<PreventivoPrint />)
    expect(screen.queryByText(FRASE_PAGAMENTO)).toBeNull()
  })
})

describe('PreventivoPrint — testi descrittivi di default', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  it('CUCINA mai toccata: stampa il testo di default del DOCX', () => {
    useQuoteStore.getState().setVoceQuantita('colonna-210-laccato', 1)
    render(<PreventivoPrint />)
    // Riga interna al testo, sufficiente a identificarlo senza incollarlo tutto.
    expect(screen.getByText(/Altezza cucina 270/)).toBeTruthy()
  })

  it('CUCINA editata: stampa il testo dell utente, non il default', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('colonna-210-laccato', 1)
    s.setDescrizioneCucina('Cucina lineare 360 cm su misura')
    render(<PreventivoPrint />)
    expect(screen.getByText('Cucina lineare 360 cm su misura')).toBeTruthy()
    expect(screen.queryByText(/Altezza cucina 270/)).toBeNull()
  })

  it('ARREDI mai toccati: stampa il testo di default del DOCX', () => {
    useQuoteStore.getState().addArticoloSuMisura(articoloPZ)
    render(<PreventivoPrint />)
    expect(screen.getByText(/CARATTERISTICHE GENERALI/)).toBeTruthy()
  })

  it('ARREDI: il refuso del DOCX è corretto ("fresata o", non "fresatao")', () => {
    expect(DESCRIZIONE_ARREDI_DEFAULT).toContain('maniglia fresata o')
    expect(DESCRIZIONE_ARREDI_DEFAULT).not.toContain('fresatao')
  })

  it('CUCINA: refuso del DOCX corretto e spazio fra numero e unità ("40/70 kg. Altezza")', () => {
    expect(DESCRIZIONE_CUCINA_DEFAULT).not.toContain('40/70kg.Altezza')
    expect(DESCRIZIONE_CUCINA_DEFAULT).not.toContain('40/70kg')
    expect(DESCRIZIONE_CUCINA_DEFAULT).toContain('portata 40/70 kg. Altezza cucina 270')
  })

  it('ARREDI editati: stampa il testo dell utente, non il default', () => {
    const s = useQuoteStore.getState()
    s.addArticoloSuMisura(articoloPZ)
    s.setDescrizioneArredi('Libreria a ponte su misura, rovere naturale')
    render(<PreventivoPrint />)
    expect(screen.getByText('Libreria a ponte su misura, rovere naturale')).toBeTruthy()
    expect(screen.queryByText(/CARATTERISTICHE GENERALI/)).toBeNull()
  })

  it('sezione VUOTA: nessun testo di default trapela nel PDF', () => {
    // Il default non deve resuscitare una sezione che l'utente non ha aperto.
    render(<PreventivoPrint />)
    expect(screen.queryByText(/CARATTERISTICHE GENERALI/)).toBeNull()
    expect(screen.queryByText(/Altezza cucina 270/)).toBeNull()
  })

  it('i default NON finiscono nello store (restano di sola lettura)', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('colonna-210-laccato', 1)
    s.addArticoloSuMisura(articoloPZ)
    render(<PreventivoPrint />)
    // Se il default entrasse nello store, un domani cambiarlo non cambierebbe
    // i preventivi salvati: resterebbe congelata una copia muta.
    expect(useQuoteStore.getState().sezioni.cucine!.descrizione).toBe('')
    expect(useQuoteStore.getState().sezioni.arredi!.descrizione).toBeUndefined()
  })
})

describe('PreventivoPrint — descrizione porte PER RIGA (tri-stato)', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO_PORTE) })
  })
  afterEach(() => cleanup())

  function primaRigaId(): string {
    return useQuoteStore.getState().sezioni.porte!.righe[0].id
  }

  it('mai editata: la descrizione si compone dal modello DELLA RIGA', () => {
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 200 })
    render(<PreventivoPrint />)
    expect(screen.getByText(descrizionePorteDefault('GIOTTO'))).toBeTruthy()
  })

  it('mai editata + cambio modello: RICOMPONE sul modello nuovo', () => {
    const s = useQuoteStore.getState()
    s.addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 200 })
    s.updateRigaPorta(primaRigaId(), { modelloNome: 'RAFFAELLA' })
    render(<PreventivoPrint />)
    expect(screen.getByText(descrizionePorteDefault('RAFFAELLA'))).toBeTruthy()
    expect(screen.queryByText(descrizionePorteDefault('GIOTTO'))).toBeNull()
  })

  it('EDITATA + cambio modello: NON ricompone (la promessa dell utente resta)', () => {
    // Stessa regola di `prezziModello` (#22): quello che l'utente ha scritto è
    // una promessa, nessun automatismo la sovrascrive in silenzio.
    const s = useQuoteStore.getState()
    s.addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 200 })
    const id = primaRigaId()
    s.setDescrizionePorta(id, 'Porta scorrevole a scomparsa, vetro acidato')
    s.updateRigaPorta(id, { modelloNome: 'RAFFAELLA' })
    render(<PreventivoPrint />)
    expect(screen.getByText('Porta scorrevole a scomparsa, vetro acidato')).toBeTruthy()
    expect(screen.queryByText(descrizionePorteDefault('RAFFAELLA'))).toBeNull()
  })

  it('editata e poi svuotata: torna automatica (ricompone dal modello)', () => {
    const s = useQuoteStore.getState()
    s.addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 200 })
    const id = primaRigaId()
    s.setDescrizionePorta(id, 'testo mio')
    s.setDescrizionePorta(id, '  ')
    expect(useQuoteStore.getState().sezioni.porte!.righe[0].descrizione).toBeNull()
    render(<PreventivoPrint />)
    expect(screen.getByText(descrizionePorteDefault('GIOTTO'))).toBeTruthy()
  })

  it('PER RIGA, non per sezione: due righe → due descrizioni diverse', () => {
    const s = useQuoteStore.getState()
    s.addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 200 })
    s.addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 200 })
    render(<PreventivoPrint />)
    expect(screen.getByText(descrizionePorteDefault('GIOTTO'))).toBeTruthy()
    expect(screen.getByText(descrizionePorteDefault('RAFFAELLA'))).toBeTruthy()
  })

  it('il default nomina il modello della riga', () => {
    expect(descrizionePorteDefault('GIOTTO')).toContain('Porta mod. GIOTTO')
    expect(NOTE_PAGAMENTO_DEFAULT).toBe('40% alla stipula, 40% merce pronta, 20% fine lavori')
  })
})
