import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { quoteHaDati } from '@/components/layout/sections'
import { useQuoteStore, initialPreventivo } from '@/store/quoteStore'
import { articoloPZ } from '@/test-utils/articoli'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'

// Listino cucine finto nello store, come dal bucket: il prezzo vero della vasca
// non entra nei test (D7).
beforeEach(() => usePricelistStore.setState({ cucine: validatoPerTest(listinoCucinaFinto) }))


// A6: l'avviso di uscita guardava solo nome/cognome, le 4 liste gres e gli
// articoli arredi, e cucine, porte, progetto a valore, vasca e contatti si
// perdevano senza conferma. Ora conta qualunque campo diverso dal default.

type Store = ReturnType<typeof useQuoteStore.getState>

const s = (): Store => useQuoteStore.getState()
const haDati = (): boolean => quoteHaDati(s().preventivo, s().sezioni)

const rigaMateriale = {
  materialeKey: 'k',
  spessore: 13 as const,
  fascia: 'fino62' as const,
  profonditaCm: 60,
  qtaMq: 1,
  prezzoMq: 100,
  totale: 100,
}

describe('quoteHaDati — con lo stato iniziale nessun avviso', () => {
  beforeEach(() => s().resetAll())
  afterEach(() => vi.useRealTimers())

  it('stato iniziale → nessun dato', () => {
    expect(haDati()).toBe(false)
  })

  it('data e validità iniziali non contano, nemmeno giorni dopo il caricamento', () => {
    // Da C3 (revisione L15-L21) il default della data si ricalcola: un reset il
    // giorno dopo dà la data di quel giorno, e l'avviso non deve scattare lo stesso.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2099-12-31T12:00:00Z'))
    s().resetAll()
    expect(s().preventivo.data).toBe('2099-12-31')
    expect(s().preventivo.validitaGiorni).toBe(initialPreventivo.validitaGiorni)
    expect(haDati()).toBe(false)
  })

  it('ClientForm che riscrive i campi del documento coi loro valori di default → nessun dato', () => {
    // `ClientForm` a ogni battuta patcha TUTTI i campi, anche quelli non toccati.
    s().setPreventivo({
      numero: '',
      data: initialPreventivo.data,
      validitaGiorni: initialPreventivo.validitaGiorni,
      oggettoPreventivo: '',
      note: '',
    })
    s().setCliente({ nome: '', cognome: '', indirizzo: '', citta: '', telefono: '', email: '' })
    expect(haDati()).toBe(false)
  })

  it('tutto compilato e poi resetAll → nessun dato', () => {
    s().setCliente({ nome: 'Mario', telefono: '333' })
    s().setVoceQuantita('base-pensile-laminato', 4)
    s().addRigaPorta({ modelloNome: 'Modello X', altezzaCm: 210 })
    s().addRigaProgettoValore({ descrizione: 'Progetto', prezzo: 5000 })
    s().setVasca({ inclusa: true })
    s().addArticoloSuMisura(articoloPZ)
    expect(haDati()).toBe(true)
    s().resetAll()
    expect(haDati()).toBe(false)
  })

  it.each<[string, () => void]>([
    ['voce cucina messa a 4 e poi a 0', () => { s().setVoceQuantita('base-pensile-laminato', 4); s().setVoceQuantita('base-pensile-laminato', 0) }],
    ['vasca inclusa e poi esclusa', () => { s().setVasca({ inclusa: true }); s().setVasca({ inclusa: false }) }],
    ['descrizione cucina scritta e poi cancellata', () => { s().setDescrizioneCucina('Cucina'); s().setDescrizioneCucina('') }],
    ['testi di soli spazi', () => { s().setCliente({ nome: '   ' }); s().setNotePagamento('  '); s().setDescrizioneArredi(' ') }],
    ['giorni extra a 3 e poi a 0', () => { s().setGiorniExtra(3); s().setGiorniExtra(0) }],
    ['extra manuale scritto e poi tolto', () => { s().setExtraManuale({ descrizione: 'x', importo: 10 }); s().setExtraManuale(null) }],
    ['sconto porte a 10% e poi a 0', () => { s().setScontoSezione('porte', 0.1); s().setScontoSezione('porte', 0) }],
    ['casse attivate e poi disattivate', () => { s().toggleMoltiplicatore('casse'); s().toggleMoltiplicatore('casse') }],
    ['riga porta aggiunta e poi tolta', () => { s().addRigaPorta({ modelloNome: 'X', altezzaCm: 210 }); s().removeRigaPorta(s().sezioni.porte!.righe[0].id) }],
    ['IVA arredi al 10% e poi al 22%, la predefinita', () => { s().setAliquotaIvaSezione('arredi', 10); s().setAliquotaIvaSezione('arredi', 22) }],
    ['arredo creato e poi eliminato', () => { s().removeArredo(s().addArredo('Ingresso'), 'sposta') }],
  ])('tornati al default: %s → nessun dato', (_nome, azione) => {
    azione()
    expect(haDati()).toBe(false)
  })
})

describe('quoteHaDati — un campo diverso dal default basta', () => {
  beforeEach(() => s().resetAll())

  it.each<[string, () => void]>([
    // cliente: tutti i campi, non solo nome e cognome
    ['cliente · nome', () => s().setCliente({ nome: 'Mario' })],
    ['cliente · cognome', () => s().setCliente({ cognome: 'Rossi' })],
    ['cliente · indirizzo', () => s().setCliente({ indirizzo: 'Via Roma 1' })],
    ['cliente · città', () => s().setCliente({ citta: 'Bari' })],
    ['cliente · telefono', () => s().setCliente({ telefono: '3331234567' })],
    ['cliente · email', () => s().setCliente({ email: 'a@b.it' })],
    // documento
    ['documento · numero', () => s().setPreventivo({ numero: '2026-042' })],
    ['documento · data', () => s().setPreventivo({ data: '2020-01-01' })],
    ['documento · validità', () => s().setPreventivo({ validitaGiorni: 60 })],
    ['documento · oggetto', () => s().setPreventivo({ oggettoPreventivo: 'Cucina' })],
    ['documento · note', () => s().setPreventivo({ note: 'Nota' })],
    ['documento · condizioni escluse', () => s().setIncludiCondizioni(false)],
    ['documento · note pagamento escluse', () => s().setIncludiNotePagamento(false)],
    ['documento · testo note pagamento', () => s().setNotePagamento('30% acconto')],
    // cucine
    ['cucine · voce', () => s().setVoceQuantita('base-pensile-laminato', 4)],
    ['cucine · casse', () => s().toggleMoltiplicatore('casse')],
    ['cucine · ante', () => s().toggleMoltiplicatore('ante')],
    ['cucine · profondità oltre 65 cm', () => s().setProfonditaOltre65(true)],
    ['cucine · giorni extra', () => s().setGiorniExtra(3)],
    ['cucine · extra manuale', () => s().setExtraManuale({ descrizione: 'Trasporto', importo: 0 })],
    ['cucine · adeguamento', () => s().setAdeguamentoCucina(0.1)],
    ['cucine · descrizione', () => s().setDescrizioneCucina('Cucina su misura')],
    ['cucine · sconto', () => s().setScontoSezione('cucine', 0.1)],
    ['cucine · IVA', () => s().setAliquotaIvaSezione('cucine', 10)],
    // arredi
    ['arredi · articolo', () => s().addArticoloSuMisura(articoloPZ)],
    ['arredi · quota progettazione', () => s().setQuotaProgettazione(true)],
    ['arredi · note generali', () => s().setNoteGeneraliSuMisura('Nota')],
    ['arredi · mq nel PDF', () => s().setMostraMqInPdf(true)],
    ['arredi · sconto', () => s().setScontoSezione('arredi', 0.1)],
    ['arredi · descrizione', () => s().setDescrizioneArredi('Arredi')],
    ['arredi · IVA', () => s().setAliquotaIvaSezione('arredi', 4)],
    ['arredi · arredo vuoto', () => { s().addArredo('Ingresso') }],
    // porte
    ['porte · riga', () => s().addRigaPorta({ modelloNome: 'Modello X', altezzaCm: 210 })],
    ['porte · battiscopa', () => s().addBattiscopa('BATTISCOPA MASSELLO')],
    ['porte · sconto', () => s().setScontoSezione('porte', 0.1)],
    ['porte · IVA', () => s().setAliquotaIvaSezione('porte', 10)],
    // progetto a valore
    ['progetto a valore · riga', () => s().addRigaProgettoValore({ descrizione: 'Progetto', prezzo: 5000 })],
    ['progetto a valore · sconto', () => s().setScontoSezione('progettoValore', 0.1)],
    ['progetto a valore · IVA', () => s().setAliquotaIvaSezione('progettoValore', 4)],
    // gres: senza listino caricato, il lordo vale 0 e conta lo stesso
    ['gres · materiale', () => s().addRigaMateriale(rigaMateriale)],
    ['gres · alzatina', () => s().addRigaAlzatina({ materialeKey: 'k', qtaMl: 2, prezzoMl: 50, totale: 100 })],
    ['gres · lavorazione bordo', () => s().addRigaLavorazioneBordo({ lavorazioneId: 1, qtaMl: 2, prezzoMl: 10, totale: 20 })],
    ['gres · lavorazione varia', () => s().addRigaVaria({ descrizione: 'Foro', um: 'pz', qta: 1, prezzoUnit: 10, totale: 10 })],
    ['gres · vasca sola', () => s().setVasca({ inclusa: true })],
    ['gres · tipologia', () => s().setTipologiaMateriale('QUARZO')],
    ['gres · rilievo e montaggio', () => s().setIncludiRilMont(true)],
    ['gres · sconto', () => s().setScontoSezione('gres', 0.1)],
    ['gres · IVA', () => s().setAliquotaIvaSezione('gres', 10)],
  ])('%s → dati da non perdere', (_nome, azione) => {
    azione()
    expect(haDati()).toBe(true)
  })
})
