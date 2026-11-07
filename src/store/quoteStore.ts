import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import { usePricelistStore } from '@/store/pricelistStore'
import { prezzoMlLavorazioneBordo, prezzoLavorazioneVaria } from '@/engine/calcMarmeria'
import type { Preventivo, Cliente } from '@/types/common'
import type { ArticoloSuMisura } from '@/types/sumisura'
import type {
  RigaMateriale,
  RigaAlzatina,
  RigaLavorazioneBordo,
  RigaLavorazioneVaria,
  TipologiaMateriale,
  VascaGres,
  LavorazioneTolta,
} from '@/types/marmeria'
import type {
  SezioniState,
  RigaProgettoValore,
  RigaPorta,
  OptionalScelto,
  PrezziModelloSnapshot,
  ManigliaPorta,
  RigaBattiscopa,
} from '@/types/quote'
import { FALLBACK_ARREDI, FALLBACK_GRES, FALLBACK_PROGETTO_VALORE, FALLBACK_PORTE, FALLBACK_CUCINE, INITIAL_SEZIONI } from '@/store/quoteFallbacks'
import { migrateQuoteState } from '@/store/quoteMigrations'
import { dataOggiItalia } from '@/utils/format'
import { prezziValidi, preventivoValido, sezioniValide } from '@/store/quoteSchema'
import type { AliquotaIva } from '@/engine/iva'
import type { CollegamentoArchivio, NumeroRiservato, PrezziCongelati, PreventivoSalvato } from '@/types/archivio'
import { nuovoUuid } from '@/utils/uuid'

/** Nessun legame col database (L21): bozza locale, nessun cliente scelto. */
export const ARCHIVIO_VUOTO: CollegamentoArchivio = Object.freeze({ clienteId: null, preventivo: null })

/**
 * Versione del formato del preventivo: quella di `persist` e quella scritta in
 * `preventivi.dati` (L21). Un preventivo salvato con una versione vecchia si
 * apre passando da `migrateQuoteState`, come un blob del localStorage.
 */
export const QUOTE_VERSION = 4

/**
 * La terna di fascia del modello, letta dal listino CARICATO ORA (E3).
 * `undefined` se il listino manca o non contiene quel nome: non si inventa un
 * prezzo, e la riga resterà `irrisolvibile` finché il nome non ricompare.
 */
function snapshotModello(modelloNome: string): PrezziModelloSnapshot | undefined {
  const m = usePricelistStore.getState().porte?.modelli.find((x) => x.nome === modelloNome)
  if (!m) return undefined
  return { prezzo2026: m.prezzo2026, h215: m.h215, h240: m.h240 }
}

/**
 * Il rate €/unità dell'optional dal listino di adesso. MANUALE non ne ha uno (il
 * suo prezzo è già sulla scelta). `prezzo: null` nel listino = non determinabile
 * → niente da congelare, e l'engine dichiarerà la riga irrisolvibile.
 */
function snapshotOptional(nome: string, unita: OptionalScelto['unita']): number | undefined {
  if (unita === 'MANUALE') return undefined
  return usePricelistStore.getState().porte?.optional.find((o) => o.nome === nome)?.prezzo ?? undefined
}

// Esportato perché `quoteHaDati` (avviso di uscita) confronta col default. La
// `data` qui è quella del caricamento del modulo: un preventivo nuovo prende
// quella del giorno in cui nasce (`preventivoNuovo`, C3), e `quoteHaDati` non
// conta come lavoro né l'una né l'altra.
export const initialPreventivo: Preventivo = {
  numero: '',
  data: dataOggiItalia(),
  validitaGiorni: 30,
  cliente: {
    nome: '',
    cognome: '',
    indirizzo: '',
    citta: '',
    telefono: '',
    email: '',
  },
  oggettoPreventivo: '',
  note: '',
  // Condizioni contrattuali incluse di default nel PDF (document-level).
  includiCondizioni: true,
  // Note pagamento incluse di default, come le condizioni: è la clausola
  // standard del preventivo Coletta, non un extra. Il TESTO non si mette qui —
  // resta `undefined` e il PDF legge `NOTE_PAGAMENTO_DEFAULT`, così un domani
  // cambiarlo cambia anche i preventivi già salvati.
  includiNotePagamento: true,
}

/** Un documento nuovo, con la data di oggi in Italia (C3): per «Nuovo preventivo» e `resetAll`. */
function preventivoNuovo(): Preventivo {
  return { ...initialPreventivo, data: dataOggiItalia() }
}

// Stato per-sezione (Fase 2 / FASE 1): `sezioni.arredi` (ex Su Misura) e
// `sezioni.gres` (ex Marmeria) sono gli unici reali; cucine/porte/progettoValore
// restano placeholder undefined. I setter mantengono le firme storiche (Opzione 2)
// reindirizzando alla sezione corrispondente, così i consumer cambiano solo le
// righe di LETTURA (`s.marmeria.X` → `s.sezioni.gres ?? FALLBACK_GRES`).
interface QuoteState {
  preventivo: Preventivo
  sezioni: SezioniState
  ricordaPreventivo: boolean
  /** Il legame col database (L21): cliente dell'anagrafica scelto. */
  archivio: CollegamentoArchivio
  /**
   * L'id dell'utente che ha scritto questa bozza (L21-B). Va e viene col
   * preventivo; al login, se è un altro, la bozza si scarta (`authStore`).
   */
  autore: string | null

  setRicordaPreventivo: (v: boolean) => void
  impostaAutore: (id: string) => void
  setCliente: (c: Partial<Cliente>) => void
  /**
   * Lega il preventivo a un cliente dell'anagrafica (`null` lo slega). Con
   * `cliente`, i campi del cliente del preventivo diventano quelli: è ciò che
   * il PDF stampa.
   */
  collegaCliente: (clienteId: string | null, cliente?: Cliente) => void
  /**
   * Dopo un salvataggio: il preventivo nel database (numero, revisione, lock).
   * Con `prezzi`, quelli appena scritti in `dati` (strada A); senza (un cambio
   * del solo stato, un annullo) restano quelli di prima.
   */
  impostaSalvato: (salvato: PreventivoSalvato, prezzi?: PrezziCongelati) => void
  /** L'impronta canonica dello stato salvato (vedi `CollegamentoArchivio.impronta`). */
  impostaImprontaSalvata: (impronta: string) => void
  /** Il numero avuto per il primo salvataggio, finché la riga non è salvata (idempotenza). */
  riservaNumero: (r: NumeroRiservato) => void
  /** «Apri» dalla pagina Preventivi: sostituisce il preventivo aperto. */
  apriDaArchivio: (preventivo: Preventivo, sezioni: SezioniState, archivio: CollegamentoArchivio) => void
  /**
   * «Nuovo preventivo»: documento, sezioni e legame col database da capo. Non è
   * `resetAll`: la copia del blob illeggibile resta fino al logout (O10).
   */
  nuovoPreventivo: () => void
  setPreventivo: (p: Partial<Preventivo>) => void

  // ── Arredi (ex Su Misura) → sezioni.arredi ──
  addArticoloSuMisura: (a: Omit<ArticoloSuMisura, 'id'>) => void
  updateArticoloSuMisura: (id: string, patch: Partial<ArticoloSuMisura>) => void
  removeArticoloSuMisura: (id: string) => void
  /** «Ripristina» dopo «Rimuovi» (U18): l'articolo com'era, alla posizione di prima. */
  reinserisciArticoloSuMisura: (articolo: ArticoloSuMisura, indice: number) => void
  setQuotaProgettazione: (v: boolean) => void
  setNoteGeneraliSuMisura: (v: string) => void
  setIncludiCondizioni: (v: boolean) => void
  setIncludiNotePagamento: (v: boolean) => void
  /** Testo note pagamento (document-level). Vuoto/spazi ⇒ torna al default. */
  setNotePagamento: (t: string) => void
  setMostraMqInPdf: (v: boolean) => void
  /** Testo descrittivo in testa alla sezione Arredi nel PDF (DOCX 25/07). */
  setDescrizioneArredi: (t: string) => void
  /**
   * Arredi (L19): un nome che raggruppa articoli, in coda all'elenco. Restituisce
   * l'id del nuovo arredo. Un articolo si sposta con `updateArticoloSuMisura`
   * (`arredoId`, `undefined` ⇒ «Altre voci»).
   */
  addArredo: (nome: string) => string
  rinominaArredo: (id: string, nome: string) => void
  /**
   * Toglie l'arredo. I suoi articoli vanno in «Altre voci» (`'sposta'`) o si
   * eliminano (`'elimina'`): la scelta la fa la pagina, chiedendola.
   */
  removeArredo: (id: string, articoli: 'sposta' | 'elimina') => void

  // ── Gres (ex Marmeria) → sezioni.gres ──
  addRigaMateriale: (riga: Omit<RigaMateriale, 'id'>) => void
  updateRigaMateriale: (id: string, patch: Partial<RigaMateriale>) => void
  removeRigaMateriale: (id: string) => void

  addRigaAlzatina: (riga: Omit<RigaAlzatina, 'id'>) => void
  updateRigaAlzatina: (id: string, patch: Partial<RigaAlzatina>) => void
  removeRigaAlzatina: (id: string) => void

  addRigaLavorazioneBordo: (riga: RigaLavorazioneBordo) => void
  updateRigaLavorazioneBordo: (lavorazioneId: number, patch: Partial<RigaLavorazioneBordo>) => void
  removeRigaLavorazioneBordo: (lavorazioneId: number) => void

  addRigaVaria: (riga: RigaLavorazioneVaria) => void
  updateRigaVaria: (idx: number, patch: Partial<RigaLavorazioneVaria>) => void
  removeRigaVaria: (idx: number) => void

  setSconto: (v: number) => void
  setIncludiRilMont: (v: boolean) => void
  /**
   * Cambia tipologia e TOGLIE le lavorazioni bordo e varie che il listino non sa
   * prezzare per la nuova (risposta di Antonio, 08/10: opzione b). Ritorna le righe
   * tolte, per l'avviso; senza listino non toglie niente e ritorna [].
   */
  setTipologiaMateriale: (v: TipologiaMateriale) => LavorazioneTolta[]
  /** Vasca in gres: patch parziale. Includendola senza prezzo, snapshotta quello del listino cucine (senza, non si include). */
  setVasca: (patch: Partial<VascaGres>) => void

  // ── Progetto a valore (§B.5-bis) → sezioni.progettoValore ──
  addRigaProgettoValore: (riga: Omit<RigaProgettoValore, 'id'>) => void
  updateRigaProgettoValore: (id: string, patch: Partial<RigaProgettoValore>) => void
  removeRigaProgettoValore: (id: string) => void

  // ── Porte (§B.4) → sezioni.porte ── (righe con optional annidati)
  addRigaPorta: (riga: Pick<RigaPorta, 'modelloNome' | 'altezzaCm'>) => void
  /**
   * Patch di una riga porta. Il `Pick` è allargato a `quantita` una chiave alla
   * volta, ESPLICITAMENTE: mai `Partial<RigaPorta>`, perché è proprio questo
   * elenco a impedire a un chiamante di riscrivere `prezziModello` di straforo
   * — cioè di disfare la promessa di #22 passando da una porta di servizio.
   * `aliquotaIva` (L18): `undefined` torna «come la sezione».
   */
  updateRigaPorta: (
    id: string,
    patch: Partial<Pick<RigaPorta, 'modelloNome' | 'altezzaCm' | 'quantita' | 'aliquotaIva'>>
  ) => void
  removeRigaPorta: (id: string) => void
  addOptionalPorta: (rigaId: string, opt: Omit<OptionalScelto, 'id' | 'prezzoUnitario'>) => void
  updateOptionalPorta: (rigaId: string, optId: string, patch: Partial<OptionalScelto>) => void
  removeOptionalPorta: (rigaId: string, optId: string) => void
  /**
   * Descrizione commerciale della singola riga porta. Una stringa piena è una
   * PROMESSA (nessun cambio modello la ricompone); svuotare la casella scrive
   * `null` e la riporta automatica. Vedi `RigaPorta.descrizione`.
   */
  setDescrizionePorta: (rigaId: string, testo: string) => void
  /**
   * Maniglia della riga: prezzo a mano, nessuno snapshot (non c'è listino da
   * cui possa divergere). `null` la rimuove.
   */
  setManigliaPorta: (rigaId: string, maniglia: ManigliaPorta | null) => void

  // ── Battiscopa a corpo (PR C) → sezioni.porte.battiscopa ──
  /**
   * Aggiunge una riga battiscopa CONGELANDO il €/cm d'altezza dal listino di
   * adesso, come `addOptionalPorta` fa con gli optional. Nasce nella forma
   * nuova (altezza × metri lineari) e senza misure: le scrive l'utente, e
   * fino ad allora la riga è da completare.
   */
  addBattiscopa: (nome: string) => void
  /**
   * Patch di una riga battiscopa. Come `updateRigaPorta`, il `Pick` elenca
   * ESPLICITAMENTE i campi modificabili: `prezzoUnitario` non è fra questi
   * perché è la promessa congelata, e non si tocca da qui.
   * Una riga della #33 che riceve altezza E metri lineari passa alla forma
   * nuova: `quantitaCm` e `quantita` spariscono. Le chiavi legacy non sono
   * nel `Pick`: si leggono, non si scrivono più. `aliquotaIva` (L18):
   * `undefined` torna «come la sezione».
   */
  updateBattiscopa: (
    id: string,
    patch: Partial<Pick<RigaBattiscopa, 'altezzaCm' | 'metriLineari' | 'prezzoPosaMl' | 'extra' | 'aliquotaIva'>>
  ) => void
  removeBattiscopa: (id: string) => void
  /** Descrizione tri-stato della riga battiscopa (vuoto ⇒ null ⇒ automatica). */
  setDescrizioneBattiscopa: (id: string, testo: string) => void
  /**
   * Congela i prezzi delle righe porte che ne sono ancora prive (E3), leggendo il
   * listino attualmente caricato. Idempotente e punto fisso: le righe già
   * snapshottate sono PROMESSE e non si toccano mai, e un secondo giro senza
   * niente da fare non produce nessun oggetto nuovo.
   *
   * Va chiamata SOLO all'avvio, dopo `loadDefaults` (vedi AppShell). MAI dopo un
   * upload manuale: lì il listino è scientemente diverso, e congelare da lì
   * significherebbe promettere un prezzo che nessuno ha promesso.
   */
  snapshottaPortePendenti: () => void

  // ── Cucine (§A.5 #1) → sezioni.cucine ── (configuratore sul listino cucine)
  /** Upsert quantità di una voce; q ≤ 0 deseleziona (rimuove). Vale anche per i
   *  toggle-fisso: selezione = presenza (add con q=1, deseleziona con q=0). */
  setVoceQuantita: (voceId: string, quantita: number) => void
  /** Flip di un moltiplicatore su primo totale (casse +10% / ante +20%, cumulabili). */
  toggleMoltiplicatore: (quale: 'casse' | 'ante') => void
  /** Profondità oltre 65 cm (L25): +20% del totale casse e ante. */
  setProfonditaOltre65: (attiva: boolean) => void
  setGiorniExtra: (n: number) => void
  setExtraManuale: (extra: { descrizione: string; importo: number } | null) => void
  setAdeguamentoCucina: (pct: number) => void
  setDescrizioneCucina: (t: string) => void

  /** Sconto per-sezione (regola A.3). Setter generico nuovo: gli altri setter
   *  restano (Opzione 2). `setSconto` resta l'alias storico per il gres. */
  setScontoSezione: (sez: 'arredi' | 'gres' | 'progettoValore' | 'porte' | 'cucine', v: number) => void
  /**
   * Aliquota IVA di sezione (L18): vale per le righe che non ne hanno una
   * propria, e per tutta la sezione in Gres, Cucine e Progetto a valore.
   */
  setAliquotaIvaSezione: (sez: 'arredi' | 'gres' | 'progettoValore' | 'porte' | 'cucine', aliquota: AliquotaIva) => void

  resetAll: () => void
  resetMarmeria: () => void
  resetSuMisura: () => void
  resetPorte: () => void
  resetCucine: () => void
}

// ID di riga via UUID: a prova di collisione anche tra sessioni persistite
// (un counter si azzererebbe al reload e potrebbe collidere con righe già
// salvate in localStorage). Gli ID vecchi (formato `r{n}_{ts}`) restano stringhe
// valide; solo i nuovi usano UUID.
function nextId(): string {
  return nuovoUuid()
}

// Sconto frazionario sempre clampato in [0,1]; NaN/∞ → 0 (difensivo vs input UI).
function clampSconto(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
}

// ── Reti dell'idratazione (O10) ──
//
// Con lo storage sincrono `persist` idrata DENTRO `create()`: il callback di
// `onRehydrateStorage` gira mentre `useQuoteStore` è ancora in TDZ. Se lo
// toccasse lancerebbe, zustand ingoierebbe l'eccezione e la rete sembrerebbe
// fatta senza fare niente. Per questo tutto ciò che il callback e le reti usano
// sta QUI, sopra `create()`, e non compare mai `useQuoteStore`.

const CHIAVE_PREVENTIVO = 'coletta-quote-v1'
/**
 * Dove finisce il blob illeggibile, com'era. Una sola copia: la nuova
 * sovrascrive la vecchia. La toglie `resetAll`, e `persist.clearStorage()`
 * (quindi il logout) insieme alla chiave principale. NON la toglie spegnere
 * «Ricorda preventivo»: è una copia di dati del cliente che sopravvive fino al
 * logout.
 */
const CHIAVE_COPIA_ILLEGGIBILE = 'coletta-quote-v1-illeggibile'

/** `copiato`: il blob è in `CHIAVE_COPIA_ILLEGGIBILE`. `non-copiato`: la scrittura non è riuscita (quota, storage chiuso). */
export type AvvisoBlobIlleggibile = 'copiato' | 'non-copiato'

let idratazioneFallita = false
let avvisoBlob: AvvisoBlobIlleggibile | null = null

/** `true` se l'idratazione è finita in errore (ultima rete): l'app prosegue lo stesso. Letta da `useStoreHydration`. */
export const haIdratazioneFallita = (): boolean => idratazioneFallita
/** Il blob salvato non era leggibile e l'app è ripartita da vuoto: lo mostra `AppShell`. `null` di norma. */
export const avvisoBlobIlleggibile = (): AvvisoBlobIlleggibile | null => avvisoBlob

/**
 * Cosa dell'errore può finire in un log: il nome e, solo dove serve, il
 * messaggio. Mai il blob: contiene i dati del cliente, e il messaggio di
 * `JSON.parse` ne cita un pezzo.
 */
function descrivi(e: unknown, conMessaggio = false): string {
  // Niente `instanceof Error`: un'eccezione di un altro realm (un DOMException in
  // jsdom, un iframe) non lo supera, e il log diventerebbe solo «object».
  if (typeof e !== 'object' || e === null) return typeof e
  const { name, message } = e as { name?: unknown; message?: unknown }
  const nome = typeof name === 'string' ? name : 'object'
  return conMessaggio && typeof message === 'string' ? `${nome}: ${message}` : nome
}

/**
 * Mette da parte il blob com'è nello storage PRIMA che qualcosa lo
 * sovrascriva: un `migrate` che ritorna fa scattare subito il `setItem`.
 * Non lancia: se non riesce l'avviso dice `non-copiato` e l'idratazione finisce
 * lo stesso. Ritorna se la copia è riuscita.
 */
function metteDaParte(): boolean {
  let copiato = false
  try {
    const grezzo = localStorage.getItem(CHIAVE_PREVENTIVO)
    if (grezzo !== null) {
      localStorage.setItem(CHIAVE_COPIA_ILLEGGIBILE, grezzo)
      copiato = true
    }
  } catch {
    // Quota o storage chiuso: niente da fare, lo dice l'avviso.
  }
  avvisoBlob = copiato ? 'copiato' : 'non-copiato'
  return copiato
}

/** Toglie la copia e spegne l'avviso. Non lancia. */
function scartaCopia(): void {
  avvisoBlob = null
  try {
    localStorage.removeItem(CHIAVE_COPIA_ILLEGGIBILE)
  } catch {
    // Storage chiuso: non c'è niente da togliere.
  }
}

type DatiPersistiti = Partial<Pick<QuoteState, 'ricordaPreventivo' | 'preventivo' | 'sezioni' | 'archivio' | 'autore'>>

// Storage proprio al posto di `createJSONStorage`, che fa `JSON.parse` senza
// rete: un blob non JSON lanciava dentro `persist`, e l'idratazione non finiva
// più (splash per sempre, 0 log). `setItem` è com'era: la scrittura che lancia
// (quota) è O33, fuori da qui.
const storagePreventivo: PersistStorage<DatiPersistiti> = {
  getItem: (name) => {
    try {
      const grezzo = localStorage.getItem(name)
      return grezzo === null ? null : (JSON.parse(grezzo) as StorageValue<DatiPersistiti>)
    } catch (e) {
      // `null` = come senza blob: `persist` prosegue e `hasHydrated` diventa vero.
      const copiato = metteDaParte()
      console.error(
        '[quoteStore] preventivo salvato non leggibile, riparte da vuoto:',
        descrivi(e),
        copiato ? '(copia messa da parte)' : '(copia non riuscita)'
      )
      return null
    }
  },
  setItem: (name, value) => localStorage.setItem(name, JSON.stringify(value)),
  removeItem: (name) => {
    // La copia per prima: è l'unica che non deve sopravvivere a un errore sull'altra.
    scartaCopia()
    localStorage.removeItem(name)
  },
}

export const useQuoteStore = create<QuoteState>()(
  persist(
    (set) => ({
      preventivo: initialPreventivo,
      sezioni: INITIAL_SEZIONI,
      ricordaPreventivo: false,
      archivio: ARCHIVIO_VUOTO,
      autore: null,

      setRicordaPreventivo: (v) => set({ ricordaPreventivo: v }),

      impostaAutore: (id) => set({ autore: id }),

      collegaCliente: (clienteId, cliente) =>
        set((s) => ({
          archivio: { ...(s.archivio ?? ARCHIVIO_VUOTO), clienteId },
          ...(cliente ? { preventivo: { ...s.preventivo, cliente: { ...cliente } } } : {}),
        })),

      impostaSalvato: (salvato, prezzi) =>
        set((s) => {
          const a = s.archivio ?? ARCHIVIO_VUOTO
          const r = a.riservato
          // Salvato: il numero riservato è nella riga e non serve più. Resta solo
          // l'id di una revisione dello stesso numero non ancora arrivata (un
          // «Salva» nel frattempo non deve fargliene generare uno nuovo).
          const revisionePendente = r && r.id !== salvato.id && r.anno === salvato.anno && r.numero === salvato.numero
          const congelati = prezzi ?? a.prezzi ?? null
          return {
            archivio: {
              clienteId: a.clienteId,
              preventivo: { ...salvato },
              ...(revisionePendente ? { riservato: { ...r } } : {}),
              ...(congelati ? { prezzi: congelati } : {}),
              ...(a.impronta ? { impronta: a.impronta } : {}),
            },
          }
        }),

      impostaImprontaSalvata: (impronta) => set((s) => ({ archivio: { ...(s.archivio ?? ARCHIVIO_VUOTO), impronta } })),

      riservaNumero: (r) => set((s) => ({ archivio: { ...(s.archivio ?? ARCHIVIO_VUOTO), riservato: { ...r } } })),

      apriDaArchivio: (preventivo, sezioni, archivio) => set({ preventivo, sezioni, archivio }),

      nuovoPreventivo: () => set({ preventivo: preventivoNuovo(), sezioni: INITIAL_SEZIONI, archivio: ARCHIVIO_VUOTO }),

      setCliente: (c) =>
        set((s) => ({
          preventivo: { ...s.preventivo, cliente: { ...s.preventivo.cliente, ...c } },
        })),

      setPreventivo: (p) =>
        set((s) => ({ preventivo: { ...s.preventivo, ...p } })),

      // ── Arredi (ex Su Misura) → sezioni.arredi ──
      addArticoloSuMisura: (a) =>
        set((s) => {
          const arredi = s.sezioni.arredi ?? FALLBACK_ARREDI
          return {
            sezioni: {
              ...s.sezioni,
              arredi: { ...arredi, articoli: [...arredi.articoli, { ...a, id: nextId() }] },
            },
          }
        }),

      updateArticoloSuMisura: (id, patch) =>
        set((s) => {
          const arredi = s.sezioni.arredi ?? FALLBACK_ARREDI
          return {
            sezioni: {
              ...s.sezioni,
              arredi: {
                ...arredi,
                articoli: arredi.articoli.map((a) => (a.id === id ? { ...a, ...patch } : a)),
              },
            },
          }
        }),

      reinserisciArticoloSuMisura: (articolo, indice) =>
        set((s) => {
          const arredi = s.sezioni.arredi ?? FALLBACK_ARREDI
          if (arredi.articoli.some((a) => a.id === articolo.id)) return {}
          const articoli = [...arredi.articoli]
          articoli.splice(Math.min(Math.max(indice, 0), articoli.length), 0, articolo)
          return { sezioni: { ...s.sezioni, arredi: { ...arredi, articoli } } }
        }),

      removeArticoloSuMisura: (id) =>
        set((s) => {
          const arredi = s.sezioni.arredi ?? FALLBACK_ARREDI
          return {
            sezioni: {
              ...s.sezioni,
              arredi: { ...arredi, articoli: arredi.articoli.filter((a) => a.id !== id) },
            },
          }
        }),

      setQuotaProgettazione: (v) =>
        set((s) => {
          const arredi = s.sezioni.arredi ?? FALLBACK_ARREDI
          return { sezioni: { ...s.sezioni, arredi: { ...arredi, quotaProgettazione: v } } }
        }),

      setNoteGeneraliSuMisura: (v) =>
        set((s) => {
          const arredi = s.sezioni.arredi ?? FALLBACK_ARREDI
          return { sezioni: { ...s.sezioni, arredi: { ...arredi, noteGenerali: v } } }
        }),

      // includiCondizioni è document-level: vive su `preventivo`, non sulle sezioni.
      setIncludiCondizioni: (v) =>
        set((s) => ({ preventivo: { ...s.preventivo, includiCondizioni: v } })),

      // Anche le note pagamento sono document-level: vivono su `preventivo`
      // accanto a `includiCondizioni`, non più sulla sezione arredi. Il campo
      // vecchio su `arredi` non viene più SCRITTO (resta letto come fallback per
      // i preventivi salvati prima dello spostamento).
      setIncludiNotePagamento: (v) =>
        set((s) => ({ preventivo: { ...s.preventivo, includiNotePagamento: v } })),

      setNotePagamento: (t) =>
        set((s) => ({ preventivo: { ...s.preventivo, notePagamento: t } })),

      setDescrizioneArredi: (t) =>
        set((s) => {
          const arredi = s.sezioni.arredi ?? FALLBACK_ARREDI
          return { sezioni: { ...s.sezioni, arredi: { ...arredi, descrizione: t } } }
        }),

      addArredo: (nome) => {
        const id = nextId()
        set((s) => {
          const arredi = s.sezioni.arredi ?? FALLBACK_ARREDI
          return {
            sezioni: { ...s.sezioni, arredi: { ...arredi, arredi: [...(arredi.arredi ?? []), { id, nome }] } },
          }
        })
        return id
      },

      rinominaArredo: (id, nome) =>
        set((s) => {
          const arredi = s.sezioni.arredi ?? FALLBACK_ARREDI
          return {
            sezioni: {
              ...s.sezioni,
              arredi: { ...arredi, arredi: (arredi.arredi ?? []).map((x) => (x.id === id ? { ...x, nome } : x)) },
            },
          }
        }),

      removeArredo: (id, articoli) =>
        set((s) => {
          const arredi = s.sezioni.arredi ?? FALLBACK_ARREDI
          return {
            sezioni: {
              ...s.sezioni,
              arredi: {
                ...arredi,
                arredi: (arredi.arredi ?? []).filter((x) => x.id !== id),
                articoli:
                  articoli === 'elimina'
                    ? arredi.articoli.filter((a) => a.arredoId !== id)
                    : arredi.articoli.map((a) => (a.arredoId === id ? { ...a, arredoId: undefined } : a)),
              },
            },
          }
        }),

      setMostraMqInPdf: (v) =>
        set((s) => {
          const arredi = s.sezioni.arredi ?? FALLBACK_ARREDI
          return { sezioni: { ...s.sezioni, arredi: { ...arredi, mostraMqInPdf: v } } }
        }),

      // ── Gres (ex Marmeria) → sezioni.gres ──
      addRigaMateriale: (riga) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          return {
            sezioni: {
              ...s.sezioni,
              gres: { ...gres, righeMateriali: [...gres.righeMateriali, { ...riga, id: nextId() }] },
            },
          }
        }),

      updateRigaMateriale: (id, patch) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          return {
            sezioni: {
              ...s.sezioni,
              gres: {
                ...gres,
                righeMateriali: gres.righeMateriali.map((r) =>
                  r.id === id ? { ...r, ...patch } : r
                ),
              },
            },
          }
        }),

      removeRigaMateriale: (id) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          return {
            sezioni: {
              ...s.sezioni,
              gres: { ...gres, righeMateriali: gres.righeMateriali.filter((r) => r.id !== id) },
            },
          }
        }),

      addRigaAlzatina: (riga) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          return {
            sezioni: {
              ...s.sezioni,
              gres: { ...gres, righeAlzatine: [...gres.righeAlzatine, { ...riga, id: nextId() }] },
            },
          }
        }),

      updateRigaAlzatina: (id, patch) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          return {
            sezioni: {
              ...s.sezioni,
              gres: {
                ...gres,
                righeAlzatine: gres.righeAlzatine.map((r) =>
                  r.id === id ? { ...r, ...patch } : r
                ),
              },
            },
          }
        }),

      removeRigaAlzatina: (id) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          return {
            sezioni: {
              ...s.sezioni,
              gres: { ...gres, righeAlzatine: gres.righeAlzatine.filter((r) => r.id !== id) },
            },
          }
        }),

      addRigaLavorazioneBordo: (riga) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          return {
            sezioni: {
              ...s.sezioni,
              gres: { ...gres, righeLavorazioniBordo: [...gres.righeLavorazioniBordo, riga] },
            },
          }
        }),

      updateRigaLavorazioneBordo: (lavorazioneId, patch) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          return {
            sezioni: {
              ...s.sezioni,
              gres: {
                ...gres,
                righeLavorazioniBordo: gres.righeLavorazioniBordo.map((r) =>
                  r.lavorazioneId === lavorazioneId ? { ...r, ...patch } : r
                ),
              },
            },
          }
        }),

      removeRigaLavorazioneBordo: (lavorazioneId) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          return {
            sezioni: {
              ...s.sezioni,
              gres: {
                ...gres,
                righeLavorazioniBordo: gres.righeLavorazioniBordo.filter(
                  (r) => r.lavorazioneId !== lavorazioneId
                ),
              },
            },
          }
        }),

      addRigaVaria: (riga) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          return {
            sezioni: {
              ...s.sezioni,
              gres: { ...gres, righeVarie: [...gres.righeVarie, riga] },
            },
          }
        }),

      updateRigaVaria: (idx, patch) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          return {
            sezioni: {
              ...s.sezioni,
              gres: {
                ...gres,
                righeVarie: gres.righeVarie.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
              },
            },
          }
        }),

      removeRigaVaria: (idx) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          return {
            sezioni: {
              ...s.sezioni,
              gres: { ...gres, righeVarie: gres.righeVarie.filter((_, i) => i !== idx) },
            },
          }
        }),

      setSconto: (v) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          return { sezioni: { ...s.sezioni, gres: { ...gres, sconto: clampSconto(v) } } }
        }),

      setIncludiRilMont: (v) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          return { sezioni: { ...s.sezioni, gres: { ...gres, includiRilMont: v } } }
        }),

      setVasca: (patch) =>
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          // Snapshot: il prezzo del listino cucine entra nella voce SOLO alla prima
          // inclusione. Da lì vive nel preventivo ed è editabile — un preventivo
          // salvato non cambia importo se il listino cambia o manca (D7, PR 10b-2).
          // Prima inclusione senza un prezzo né dal listino né dal chiamante: niente
          // (opzione A: la casella è disattivata, questa è la seconda difesa).
          const prezzo = usePricelistStore.getState().cucine?.vascaGres ?? patch.prezzo ?? null
          const precedente = gres.vasca ?? (prezzo === null ? null : { inclusa: false, prezzo })
          if (!precedente) return s
          return {
            sezioni: { ...s.sezioni, gres: { ...gres, vasca: { ...precedente, ...patch } } },
          }
        }),

      setTipologiaMateriale: (v) => {
        // `set` è sincrono: le righe tolte escono dalla closure dopo la chiamata.
        const tolte: LavorazioneTolta[] = []
        set((s) => {
          const gres = s.sezioni.gres ?? FALLBACK_GRES
          const listino = usePricelistStore.getState().marmeria
          if (!listino) {
            // Senza listino non si sa cosa sia disponibile: nessuna rimozione. Se
            // poi il listino non sa prezzarle, le righe sono «da definire» (A2).
            return { sezioni: { ...s.sezioni, gres: { ...gres, tipologiaMateriale: v } } }
          }
          // Cambiando tipologia i prezzi di bordo/varie cambiano: ri-mappo le
          // righe ricalcolando prezzo e totale dal listino (NEW-001), e tolgo
          // quelle che per la nuova tipologia non hanno prezzo (A2, opzione b).
          const righeLavorazioniBordo: RigaLavorazioneBordo[] = []
          for (const r of gres.righeLavorazioniBordo) {
            const prezzoMl = prezzoMlLavorazioneBordo(listino, r.lavorazioneId, v)
            if (prezzoMl === null) {
              const descrizione =
                listino.lavorazioniBordo.find((l) => l.id === r.lavorazioneId)?.descrizione ??
                `Lavorazione #${r.lavorazioneId}`
              tolte.push({ descrizione, quantita: r.qtaMl, unita: 'ml' })
              continue
            }
            righeLavorazioniBordo.push({ ...r, prezzoMl, totale: r.qtaMl * prezzoMl })
          }
          const righeVarie: RigaLavorazioneVaria[] = []
          for (const r of gres.righeVarie) {
            const prezzoUnit = prezzoLavorazioneVaria(listino, r.descrizione, v)
            if (prezzoUnit === null) {
              tolte.push({ descrizione: r.descrizione, quantita: r.qta, unita: 'pz' })
              continue
            }
            righeVarie.push({ ...r, prezzoUnit, totale: r.qta * prezzoUnit })
          }
          return {
            sezioni: {
              ...s.sezioni,
              gres: { ...gres, tipologiaMateriale: v, righeLavorazioniBordo, righeVarie },
            },
          }
        })
        return tolte
      },

      // ── Progetto a valore (§B.5-bis) → sezioni.progettoValore ──
      addRigaProgettoValore: (riga) =>
        set((s) => {
          const pv = s.sezioni.progettoValore ?? FALLBACK_PROGETTO_VALORE
          return {
            sezioni: {
              ...s.sezioni,
              progettoValore: { ...pv, righe: [...pv.righe, { ...riga, id: nextId() }] },
            },
          }
        }),

      updateRigaProgettoValore: (id, patch) =>
        set((s) => {
          const pv = s.sezioni.progettoValore ?? FALLBACK_PROGETTO_VALORE
          return {
            sezioni: {
              ...s.sezioni,
              progettoValore: {
                ...pv,
                righe: pv.righe.map((r) => (r.id === id ? { ...r, ...patch } : r)),
              },
            },
          }
        }),

      removeRigaProgettoValore: (id) =>
        set((s) => {
          const pv = s.sezioni.progettoValore ?? FALLBACK_PROGETTO_VALORE
          return {
            sezioni: {
              ...s.sezioni,
              progettoValore: { ...pv, righe: pv.righe.filter((r) => r.id !== id) },
            },
          }
        }),

      // ── Porte (§B.4) → sezioni.porte ── (righe con optional annidati)
      addRigaPorta: (riga) =>
        set((s) => {
          const porte = s.sezioni.porte ?? FALLBACK_PORTE
          // Lo snapshot nasce QUI, non lo passa il chiamante: una porta scelta
          // senza il suo prezzo non è rappresentabile, quindi non esiste un
          // chiamante che possa dimenticarselo.
          const prezziModello = snapshotModello(riga.modelloNome)
          return {
            sezioni: {
              ...s.sezioni,
              porte: {
                ...porte,
                righe: [...porte.righe, { ...riga, id: nextId(), optionals: [], prezziModello }],
              },
            },
          }
        }),

      updateRigaPorta: (id, patch) =>
        set((s) => {
          const porte = s.sezioni.porte ?? FALLBACK_PORTE
          return {
            sezioni: {
              ...s.sezioni,
              porte: {
                ...porte,
                righe: porte.righe.map((r) => {
                  if (r.id !== id) return r
                  const next: RigaPorta = { ...r, ...patch }
                  // Cambiare modello è una scelta NUOVA → ri-congela dal listino di
                  // adesso. Cambiare altezza no: la terna copre già le tre fasce.
                  if (patch.modelloNome !== undefined && patch.modelloNome !== r.modelloNome) {
                    next.prezziModello = snapshotModello(patch.modelloNome)
                  }
                  return next
                }),
              },
            },
          }
        }),

      removeRigaPorta: (id) =>
        set((s) => {
          const porte = s.sezioni.porte ?? FALLBACK_PORTE
          return {
            sezioni: {
              ...s.sezioni,
              porte: { ...porte, righe: porte.righe.filter((r) => r.id !== id) },
            },
          }
        }),

      snapshottaPortePendenti: () =>
        set((s) => {
          const listino = usePricelistStore.getState().porte
          const porte = s.sezioni.porte
          // Gira anche prima di loadDefaults e su preventivi senza porte: senza
          // listino non c'è niente da leggere, e non si inventa.
          if (!listino || !porte) return {}

          let cambiato = false
          const righe = porte.righe.map((r) => {
            let next = r
            // Le righe già snapshottate sono promesse: mai toccate. Solo quelle
            // senza prezzo vengono recuperate — è ciò che rende idempotente.
            if (r.prezziModello === undefined) {
              const m = listino.modelli.find((x) => x.nome === r.modelloNome)
              if (m) {
                next = { ...next, prezziModello: { prezzo2026: m.prezzo2026, h215: m.h215, h240: m.h240 } }
                cambiato = true
              }
            }
            let optCambiati = false
            const optionals = r.optionals.map((o) => {
              if (o.unita === 'MANUALE' || o.prezzoUnitario !== undefined) return o
              const live = listino.optional.find((x) => x.nome === o.nome)
              if (!live || live.prezzo === null) return o
              optCambiati = true
              return { ...o, prezzoUnitario: live.prezzo }
            })
            if (optCambiati) {
              next = { ...next, optionals }
              cambiato = true
            }
            return next
          })

          // Punto fisso: niente da congelare → nessun oggetto nuovo, quindi
          // nessun re-render e nessuna riscrittura di localStorage a ogni avvio.
          if (!cambiato) return {}
          return { sezioni: { ...s.sezioni, porte: { ...porte, righe } } }
        }),

      addOptionalPorta: (rigaId, opt) =>
        set((s) => {
          const porte = s.sezioni.porte ?? FALLBACK_PORTE
          // Anche l'optional è una scelta, quindi congela il suo rate: chiude la
          // stessa falla del modello, che viveva a calcPorte.ts:59.
          const prezzoUnitario = snapshotOptional(opt.nome, opt.unita)
          return {
            sezioni: {
              ...s.sezioni,
              porte: {
                ...porte,
                righe: porte.righe.map((r) =>
                  r.id === rigaId
                    ? { ...r, optionals: [...r.optionals, { ...opt, id: nextId(), prezzoUnitario }] }
                    : r
                ),
              },
            },
          }
        }),

      updateOptionalPorta: (rigaId, optId, patch) =>
        set((s) => {
          const porte = s.sezioni.porte ?? FALLBACK_PORTE
          return {
            sezioni: {
              ...s.sezioni,
              porte: {
                ...porte,
                righe: porte.righe.map((r) =>
                  r.id === rigaId
                    ? {
                        ...r,
                        optionals: r.optionals.map((o) =>
                          o.id === optId ? { ...o, ...patch } : o
                        ),
                      }
                    : r
                ),
              },
            },
          }
        }),

      removeOptionalPorta: (rigaId, optId) =>
        set((s) => {
          const porte = s.sezioni.porte ?? FALLBACK_PORTE
          return {
            sezioni: {
              ...s.sezioni,
              porte: {
                ...porte,
                righe: porte.righe.map((r) =>
                  r.id === rigaId
                    ? { ...r, optionals: r.optionals.filter((o) => o.id !== optId) }
                    : r
                ),
              },
            },
          }
        }),

      setManigliaPorta: (rigaId, maniglia) =>
        set((s) => {
          const porte = s.sezioni.porte ?? FALLBACK_PORTE
          return {
            sezioni: {
              ...s.sezioni,
              porte: {
                ...porte,
                righe: porte.righe.map((r) => {
                  if (r.id !== rigaId) return r
                  if (maniglia === null) {
                    // Rimozione vera: la chiave sparisce, non resta un oggetto a
                    // zero che il PDF stamperebbe come voce da 0,00 €.
                    const { maniglia: _rimossa, ...resto } = r
                    return resto
                  }
                  return { ...r, maniglia }
                }),
              },
            },
          }
        }),

      addBattiscopa: (nome) =>
        set((s) => {
          const porte = s.sezioni.porte ?? FALLBACK_PORTE
          // `ML` è l'unità con cui il battiscopa vive nel listino (il rate è
          // €/cm, vedi RigaBattiscopa): `snapshotOptional` cerca per nome, e
          // l'unità serve solo a escludere i MANUALE.
          const prezzoUnitario = snapshotOptional(nome, 'ML')
          const riga: RigaBattiscopa = { id: nextId(), nome, prezzoUnitario }
          return {
            sezioni: {
              ...s.sezioni,
              porte: { ...porte, battiscopa: [...(porte.battiscopa ?? []), riga] },
            },
          }
        }),

      updateBattiscopa: (id, patch) =>
        set((s) => {
          const porte = s.sezioni.porte ?? FALLBACK_PORTE
          return {
            sezioni: {
              ...s.sezioni,
              porte: {
                ...porte,
                battiscopa: (porte.battiscopa ?? []).map((b) => {
                  if (b.id !== id) return b
                  const aggiornata = { ...b, ...patch }
                  // Altezza e metri scritti: la riga è nella forma nuova, e le
                  // chiavi della #33 (lunghezza in cm, vani) non devono restare.
                  if (aggiornata.altezzaCm === undefined || aggiornata.metriLineari === undefined) return aggiornata
                  const formaNuova: RigaBattiscopa = { ...aggiornata }
                  delete formaNuova.quantitaCm
                  delete formaNuova.quantita
                  return formaNuova
                }),
              },
            },
          }
        }),

      removeBattiscopa: (id) =>
        set((s) => {
          const porte = s.sezioni.porte ?? FALLBACK_PORTE
          return {
            sezioni: {
              ...s.sezioni,
              porte: { ...porte, battiscopa: (porte.battiscopa ?? []).filter((b) => b.id !== id) },
            },
          }
        }),

      setDescrizioneBattiscopa: (id, testo) =>
        set((s) => {
          const porte = s.sezioni.porte ?? FALLBACK_PORTE
          const valore = testo.trim() === '' ? null : testo
          return {
            sezioni: {
              ...s.sezioni,
              porte: {
                ...porte,
                battiscopa: (porte.battiscopa ?? []).map((b) =>
                  b.id === id ? { ...b, descrizione: valore } : b
                ),
              },
            },
          }
        }),

      // Il tri-stato si decide QUI, in scrittura: una casella svuotata torna
      // `null` (= automatica), non stringa vuota. Così `descrizionePortaDi` non
      // deve distinguere "vuota per scelta" da "mai scritta", e l'utente ha un
      // modo ovvio di tornare al testo composto: cancellare.
      setDescrizionePorta: (rigaId, testo) =>
        set((s) => {
          const porte = s.sezioni.porte ?? FALLBACK_PORTE
          const valore = testo.trim() === '' ? null : testo
          return {
            sezioni: {
              ...s.sezioni,
              porte: {
                ...porte,
                righe: porte.righe.map((r) => (r.id === rigaId ? { ...r, descrizione: valore } : r)),
              },
            },
          }
        }),

      // ── Cucine (§A.5 #1) → sezioni.cucine ── (lazy-init da FALLBACK_CUCINE)
      setVoceQuantita: (voceId, quantita) =>
        set((s) => {
          const cucine = s.sezioni.cucine ?? FALLBACK_CUCINE
          // q ≤ 0 → deseleziona (rimuove); update in-place se già presente (preserva
          // l'ordine), altrimenti append. Presenza = selezionato (anche i toggle-fisso).
          const q = Number.isFinite(quantita) && quantita > 0 ? quantita : 0
          let voci: typeof cucine.voci
          if (q === 0) {
            voci = cucine.voci.filter((v) => v.voceId !== voceId)
          } else if (cucine.voci.some((v) => v.voceId === voceId)) {
            voci = cucine.voci.map((v) => (v.voceId === voceId ? { ...v, quantita: q } : v))
          } else {
            voci = [...cucine.voci, { voceId, quantita: q }]
          }
          return { sezioni: { ...s.sezioni, cucine: { ...cucine, voci } } }
        }),

      toggleMoltiplicatore: (quale) =>
        set((s) => {
          const cucine = s.sezioni.cucine ?? FALLBACK_CUCINE
          return { sezioni: { ...s.sezioni, cucine: { ...cucine, [quale]: !cucine[quale] } } }
        }),

      setProfonditaOltre65: (attiva) =>
        set((s) => {
          const cucine = s.sezioni.cucine ?? FALLBACK_CUCINE
          return { sezioni: { ...s.sezioni, cucine: { ...cucine, profonditaOltre65: attiva } } }
        }),

      setGiorniExtra: (n) =>
        set((s) => {
          const cucine = s.sezioni.cucine ?? FALLBACK_CUCINE
          const giorniExtra = Number.isFinite(n) && n >= 0 ? n : 0
          return { sezioni: { ...s.sezioni, cucine: { ...cucine, giorniExtra } } }
        }),

      setExtraManuale: (extra) =>
        set((s) => {
          const cucine = s.sezioni.cucine ?? FALLBACK_CUCINE
          return { sezioni: { ...s.sezioni, cucine: { ...cucine, extraManuale: extra } } }
        }),

      setAdeguamentoCucina: (pct) =>
        set((s) => {
          const cucine = s.sezioni.cucine ?? FALLBACK_CUCINE
          // Non-negativo, NON clampato a 1 (è un adeguamento prezzi, non uno sconto).
          const adeguamentoPct = Number.isFinite(pct) && pct >= 0 ? pct : 0
          return { sezioni: { ...s.sezioni, cucine: { ...cucine, adeguamentoPct } } }
        }),

      setDescrizioneCucina: (t) =>
        set((s) => {
          const cucine = s.sezioni.cucine ?? FALLBACK_CUCINE
          return { sezioni: { ...s.sezioni, cucine: { ...cucine, descrizione: t } } }
        }),

      setScontoSezione: (sez, v) =>
        set((s) => {
          const sconto = clampSconto(v)
          switch (sez) {
            case 'arredi': {
              const arredi = s.sezioni.arredi ?? FALLBACK_ARREDI
              return { sezioni: { ...s.sezioni, arredi: { ...arredi, sconto } } }
            }
            case 'gres': {
              const gres = s.sezioni.gres ?? FALLBACK_GRES
              return { sezioni: { ...s.sezioni, gres: { ...gres, sconto } } }
            }
            case 'progettoValore': {
              const pv = s.sezioni.progettoValore ?? FALLBACK_PROGETTO_VALORE
              return { sezioni: { ...s.sezioni, progettoValore: { ...pv, sconto } } }
            }
            case 'porte': {
              const porte = s.sezioni.porte ?? FALLBACK_PORTE
              return { sezioni: { ...s.sezioni, porte: { ...porte, sconto } } }
            }
            case 'cucine': {
              const cucine = s.sezioni.cucine ?? FALLBACK_CUCINE
              return { sezioni: { ...s.sezioni, cucine: { ...cucine, sconto } } }
            }
            default: {
              // Esaustività: se in futuro l'unione cresce senza un case qui, tsc
              // fallisce su questa riga (gate che ci ha obbligati ad aggiungere 'cucine').
              const _exhaustive: never = sez
              return _exhaustive
            }
          }
        }),

      setAliquotaIvaSezione: (sez, aliquotaIva) =>
        set((s) => {
          switch (sez) {
            case 'arredi':
              return { sezioni: { ...s.sezioni, arredi: { ...(s.sezioni.arredi ?? FALLBACK_ARREDI), aliquotaIva } } }
            case 'gres':
              return { sezioni: { ...s.sezioni, gres: { ...(s.sezioni.gres ?? FALLBACK_GRES), aliquotaIva } } }
            case 'progettoValore':
              return {
                sezioni: { ...s.sezioni, progettoValore: { ...(s.sezioni.progettoValore ?? FALLBACK_PROGETTO_VALORE), aliquotaIva } },
              }
            case 'porte':
              return { sezioni: { ...s.sezioni, porte: { ...(s.sezioni.porte ?? FALLBACK_PORTE), aliquotaIva } } }
            case 'cucine':
              return { sezioni: { ...s.sezioni, cucine: { ...(s.sezioni.cucine ?? FALLBACK_CUCINE), aliquotaIva } } }
            default: {
              const _exhaustive: never = sez
              return _exhaustive
            }
          }
        }),

      resetAll: () => {
        scartaCopia()
        set({ preventivo: preventivoNuovo(), sezioni: INITIAL_SEZIONI, archivio: ARCHIVIO_VUOTO, autore: null })
      },

      resetMarmeria: () => set((s) => ({ sezioni: { ...s.sezioni, gres: FALLBACK_GRES } })),

      resetSuMisura: () => set((s) => ({ sezioni: { ...s.sezioni, arredi: FALLBACK_ARREDI } })),

      resetPorte: () => set((s) => ({ sezioni: { ...s.sezioni, porte: FALLBACK_PORTE } })),

      resetCucine: () => set((s) => ({ sezioni: { ...s.sezioni, cucine: FALLBACK_CUCINE } })),
    }),
    {
      name: CHIAVE_PREVENTIVO,
      version: QUOTE_VERSION,
      // Migrazione estratta in `quoteMigrations.ts` (funzione pura, testabile
      // senza localStorage). Gradini storici (v1 reset suMisura, backfill
      // includiCondizioni) + v3→v4 (suMisura→arredi, marmeria→gres). Cast via
      // `unknown`: il migrate ritorna i soli campi-dato, le azioni le aggiunge il
      // merge di Zustand.
      //
      // Seconda rete: se lancia, `persist` non finirebbe di idratare. Si mette
      // da parte il blob PRIMA di ritornare (appena ritorna scatta il `setItem`
      // che lo sovrascrive) e si riparte da vuoto, SENZA `ricordaPreventivo`:
      // dopo il reset il toggle resta spento anche se il blob lo aveva acceso.
      migrate: (persisted, version) => {
        try {
          return migrateQuoteState(persisted, version) as unknown as QuoteState
        } catch (e) {
          const copiato = metteDaParte()
          console.error(
            '[quoteStore] migrazione del preventivo salvato fallita, riparte da vuoto:',
            descrivi(e, true),
            copiato ? '(copia messa da parte)' : '(copia non riuscita)'
          )
          return { sezioni: INITIAL_SEZIONI } as unknown as QuoteState
        }
      },
      storage: storagePreventivo,
      // Quarta rete (S3, revisione L15-L21): un blob che si legge e si migra ma
      // ha sezioni o documento di forma sbagliata (un `dati` aperto dal
      // database prima dello schema, un blob ritoccato) non entra: il PDF,
      // sempre montato, lancerebbe a ogni avvio. Come il `migrate` che lancia:
      // copia da parte, log senza il blob, si riparte da vuoto senza
      // «ricorda preventivo». Gira in `create()`: solo funzioni di modulo.
      merge: (persistito, attuale) => {
        const p = (persistito ?? {}) as DatiPersistiti
        const sezioniOk = p.sezioni === undefined || sezioniValide(p.sezioni) !== null
        const preventivoOk = p.preventivo === undefined || preventivoValido(p.preventivo) !== null
        if (sezioniOk && preventivoOk) {
          // Prezzi congelati di forma sbagliata: via solo quelli (il PDF va dal vivo).
          const prezzi = p.archivio?.prezzi
          if (prezzi && !prezziValidi(prezzi)) return { ...attuale, ...p, archivio: { ...p.archivio, prezzi: null } as CollegamentoArchivio }
          return { ...attuale, ...p }
        }
        const copiato = metteDaParte()
        console.error(
          '[quoteStore] preventivo salvato di forma non valida, riparte da vuoto',
          copiato ? '(copia messa da parte)' : '(copia non riuscita)'
        )
        return attuale
      },
      // Terza rete, per i residui (quota al `setItem` dopo un migrate riuscito,
      // un callback che lancia): zustand non segna l'idratazione finita nel ramo
      // di errore, quindi si alza il flag che legge `useStoreHydration`.
      // Gira in `create()`: vedi sopra, solo variabili di modulo.
      onRehydrateStorage: () => (_stato, errore) => {
        if (!errore) return
        idratazioneFallita = true
        console.error('[quoteStore] idratazione del preventivo fallita:', descrivi(errore, true))
      },
      // La preferenza `ricordaPreventivo` è sempre persistita (toggle sticky).
      // I dati del preventivo vengono persistiti solo se l'utente ha
      // esplicitamente attivato `ricordaPreventivo`; altrimenti riparte da
      // zero ad ogni apertura.
      partialize: (state) =>
        state.ricordaPreventivo
          ? {
              ricordaPreventivo: state.ricordaPreventivo,
              preventivo: state.preventivo,
              sezioni: state.sezioni,
              // Il legame col database va e viene col preventivo: senza, un
              // preventivo ricordato perderebbe il suo numero al riavvio.
              archivio: state.archivio,
              // Di chi è la bozza: al login di un altro utente si scarta.
              autore: state.autore,
            }
          : { ricordaPreventivo: state.ricordaPreventivo },
    }
  )
)
