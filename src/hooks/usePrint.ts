import { useRef, useCallback, useEffect } from 'react'
import { useReactToPrint } from 'react-to-print'
import { useQuoteStore } from '@/store/quoteStore'
import {
  haModificheNonSalvate,
  inEsclusiva,
  prezziDaAggiornare,
  revisioneAperto,
  salvaAperto,
  statoInviato,
} from '@/store/salvataggioStore'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/shared/toastContext'
import { sezioneNonVuota, vociGres } from '@/components/layout/sections'
import { bloccoPdfAdesso } from '@/hooks/useBloccoPdf'
import { ETICHETTA_STATO, formatNumeroPreventivo } from '@/utils/numeroPreventivo'
import { titoloPdf } from '@/store/quoteSelectors'
import { STILE_PAGINA_STAMPA } from '@/hooks/stilePaginaStampa'
import type { PreventivoSalvato } from '@/types/archivio'
import type { Esito } from '@/lib/erroriDb'
import type { Domanda } from '@/components/shared/Conferma'
import type { ScopoScelta } from '@/hooks/useSceltaCliente'

interface DipendenzeGenera {
  /** La conferma del design system (`useConferma`). */
  chiedi: (d: Domanda) => Promise<string | null>
  /** La scelta del cliente (`useSceltaCliente`): `true` se un cliente è stato collegato. */
  scegliCliente: (scopo: ScopoScelta) => Promise<boolean>
}

export const MSG_PREVENTIVO_VUOTO = 'Il preventivo è vuoto: aggiungi almeno una voce in una sezione, poi «Genera Preventivo».'

/** Il preventivo non ha niente da stampare in nessuna delle cinque sezioni? */
function preventivoVuoto(): boolean {
  const { sezioni } = useQuoteStore.getState()
  const conValore = (['arredi', 'cucine', 'porte', 'progettoValore'] as const).some((id) => sezioneNonVuota(id, sezioni))
  return !conValore && vociGres(sezioni) === 0
}

/** Il render dopo un salvataggio: il PDF deve avere il numero appena arrivato dal database. */
const dopoIlRender = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * Il titolo del PDF (nome del file proposto e intestazione di ogni pagina),
 * letto dallo store al momento della stampa e non nel render. `react-to-print`
 * 3.3.0 accetta una funzione e la chiama dentro `print()`
 * (`typeof documentTitle == "function" ? documentTitle() : documentTitle`),
 * mentre la funzione di stampa che «Genera» chiama è nata nel render di prima:
 * un titolo calcolato lì non avrebbe il numero arrivato nello stesso gesto.
 * Contiene il nome del cliente: non va mai nella console.
 */
const titoloAllaStampa = (): string => {
  const { preventivo, archivio } = useQuoteStore.getState()
  return titoloPdf(preventivo, archivio)
}

export function usePrint({ chiedi, scegliCliente }: DipendenzeGenera) {
  const contentRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  // `react-to-print` lo chiama solo per i guasti che segnala lui: una
  // `onBeforePrint` o una `print` che rigettano, e noi non passiamo né l'una né
  // l'altra. Gli altri (iframe non caricato, nessun contenuto) li scrive solo
  // nella console, e l'annullamento del dialogo di stampa non è un errore per
  // nessuno. Il testo dell'eccezione non finisce a schermo. Stabile con
  // `useCallback`, o `reactToPrint` cambierebbe a ogni render e con lui il
  // valore di `PrintContext`.
  const onPrintError = useCallback(() => {
    showToast('La stampa non è riuscita. Riprova.', 'error')
  }, [showToast])

  const reactToPrint = useReactToPrint({
    contentRef,
    documentTitle: titoloAllaStampa,
    onPrintError,
    pageStyle: STILE_PAGINA_STAMPA,
  })

  const stampa = useCallback(async () => {
    await dopoIlRender()
    // `react-to-print` con il ref vuoto scrive «There is nothing to print» nella
    // console e basta. Con `PreventivoPrint` sempre montato fuori schermo non
    // dovrebbe succedere, ma se succede "Genera" non resta muto.
    if (!contentRef.current) {
      showToast('Il preventivo non è pronto per la stampa. Riprova.', 'error')
      return
    }
    reactToPrint()
  }, [reactToPrint, showToast])

  /**
   * «Genera Preventivo» salva sempre prima di stampare (L21-B, § 3.2, strada 1):
   * il PDF esce solo con un numero del database. I rami, nell'ordine:
   *  - un listino che manca, o un preventivo vuoto: non stampa, e dice perché;
   *  - nessun cliente: si apre «Scegli il cliente per generare il preventivo»;
   *    scelto, si prosegue nello stesso gesto; chiusa la finestra, niente;
   *  - annullato: «Fai una nuova revisione» (la salva e la stampa) o «Stampa
   *    con la dicitura ANNULLATO»;
   *  - modifiche non salvate o mai salvato: salva (col lock), «Salvato come
   *    N. …», poi stampa; se il salvataggio non riesce (conflitto, rete) non
   *    stampa: l'errore, con «Riprova», lo mostra la barra;
   *  - già salvato e senza modifiche: stampa subito.
   *
   * Tutto il gesto passa da `inEsclusiva`: un secondo tocco mentre il primo è
   * in corso non fa niente (revisione del 14/10, difetto 10: due stampe). Se il
   * salvataggio fallisce, «Riprova» nella barra rifà il gesto intero, salva e
   * stampa (difetto 2).
   */
  // «Riprova» dopo un salvataggio fallito: il gesto intero, di nuovo in
  // esclusiva. Un ref aggiornato dopo il render, perché `genera` non può
  // nominare sé stesso mentre si dichiara.
  const rigenera = useRef<() => void>(() => undefined)
  const rifai = useCallback(() => rigenera.current(), [])

  /**
   * Strada A (Marco, 14/10): un preventivo inviato o accettato non si
   * riscrive. Con modifiche, «Salva» e «Genera» chiedono: «Fai una nuova
   * revisione» (primario), «Correggi questo preventivo» solo per l'admin (il
   * cliente ha già la versione inviata), «Torna indietro».
   */
  const chiediSuInviato = useCallback(
    (salvato: PreventivoSalvato): Promise<string | null> => {
      const admin = useAuthStore.getState().isAdmin
      const stato = ETICHETTA_STATO[salvato.stato].toLowerCase()
      return chiedi({
        titolo: `Questo preventivo è ${stato}`,
        testo:
          `Il preventivo N. ${formatNumeroPreventivo(salvato)} è ${stato} e non si riscrive: le modifiche vanno in una nuova revisione, in bozza, coi prezzi di adesso.` +
          (admin ? ' Da amministratore puoi anche correggerlo così com’è, ma il cliente ha già la versione inviata.' : ''),
        azioni: [
          { valore: 'indietro', etichetta: 'Torna indietro', tipo: 'secondario' },
          ...(admin ? [{ valore: 'correggi', etichetta: 'Correggi questo preventivo', tipo: 'secondario' as const }] : []),
          { valore: 'revisione', etichetta: 'Fai una nuova revisione', tipo: 'primario' },
        ],
      })
    },
    [chiedi]
  )

  /** Una scrittura scelta su un inviato: la revisione, o la correzione dell'admin. */
  const scriviScelta = useCallback(async (scelta: string | null, riprova?: () => void) => {
    if (scelta === 'revisione') return revisioneAperto(riprova)
    if (scelta === 'correggi') return salvaAperto(undefined, riprova, { correggi: true })
    return null
  }, [])

  /** Prima di tutto: un listino che manca, un preventivo vuoto, il cliente. `false` = non si stampa. */
  const pronto = useCallback(async (): Promise<boolean> => {
    const blocco = bloccoPdfAdesso()
    if (blocco.bloccato) {
      showToast(blocco.motivo ?? 'Il preventivo non si può generare.', 'error')
      return false
    }
    if (preventivoVuoto()) {
      showToast(MSG_PREVENTIVO_VUOTO, 'error')
      return false
    }
    return Boolean(useQuoteStore.getState().archivio?.clienteId) || scegliCliente('generare')
  }, [scegliCliente, showToast])

  /**
   * La scrittura prima della stampa, secondo lo stato del preventivo aperto.
   * `true` = si stampa (scritto, o niente da scrivere); `false` = no (scrittura
   * fallita o rinunciata; per un annullato stampato così com'è la stampa è già
   * avvenuta qui).
   */
  const scriviPrimaDiStampare = useCallback(async (): Promise<boolean> => {
    const salvato = useQuoteStore.getState().archivio?.preventivo
    let esito: Esito<PreventivoSalvato> | null
    if (salvato?.stato === 'annullato') {
      const scelta = await chiedi({
        titolo: 'Questo preventivo è annullato',
        testo: `Il preventivo N. ${formatNumeroPreventivo(salvato)} è annullato e non si modifica più. Puoi farne una nuova revisione, oppure stamparlo così com'è, con la dicitura ANNULLATO.`,
        azioni: [
          { valore: 'stampa', etichetta: 'Stampa con la dicitura ANNULLATO', tipo: 'secondario' },
          { valore: 'revisione', etichetta: 'Fai una nuova revisione', tipo: 'primario' },
        ],
      })
      if (scelta === 'stampa') await stampa()
      esito = scelta === 'revisione' ? await revisioneAperto(rifai) : null
    } else if (salvato && statoInviato(salvato.stato) && haModificheNonSalvate()) {
      esito = await scriviScelta(await chiediSuInviato(salvato), rifai)
    } else if (haModificheNonSalvate() || (salvato?.stato === 'bozza' && prezziDaAggiornare())) {
      // Bozza: «Genera» ricalcola, e se i prezzi sono cambiati col listino salva
      // prima di stampare (C2): database e PDF coincidono sempre.
      esito = await salvaAperto(undefined, rifai)
    } else {
      return true
    }
    if (!esito?.ok) return false
    showToast(`Salvato come N. ${formatNumeroPreventivo(esito.dato)}`)
    return true
  }, [chiedi, chiediSuInviato, rifai, scriviScelta, showToast, stampa])

  const genera = useCallback(async (): Promise<void> => {
    await inEsclusiva(async () => {
      if ((await pronto()) && (await scriviPrimaDiStampare())) await stampa()
    })
  }, [pronto, scriviPrimaDiStampare, stampa])

  /**
   * «Salva» della barra, quando c'è un cliente e qualcosa da scrivere: su un
   * inviato o accettato con modifiche, la stessa domanda di «Genera» (strada
   * A); altrimenti il salvataggio di sempre.
   */
  const salva = useCallback(async (): Promise<void> => {
    await inEsclusiva(async () => {
      const salvato = useQuoteStore.getState().archivio?.preventivo
      if (salvato && statoInviato(salvato.stato) && haModificheNonSalvate()) {
        const esito = await scriviScelta(await chiediSuInviato(salvato))
        if (esito?.ok) showToast(`Salvato come N. ${formatNumeroPreventivo(esito.dato)}`)
        return
      }
      await salvaAperto()
    })
  }, [chiediSuInviato, scriviScelta, showToast])

  const handlePrint = useCallback(() => void genera(), [genera])
  useEffect(() => {
    rigenera.current = handlePrint
  }, [handlePrint])

  return { contentRef, handlePrint, handleSalva: salva }
}
