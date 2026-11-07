import type { SezioneArredi, SezioneGres, SezioneProgettoValore, SezionePorte, SezioneCucine, SezioniState } from '@/types/quote'
import { ADEG_DEFAULT } from '@/types/cucina'

// ── Fallback STABILI per le sezioni opzionali del quoteStore ──
// I componenti leggono `s.sezioni.gres ?? FALLBACK_GRES`: il fallback DEVE essere
// un riferimento module-level fisso. Un literal inline (`?? {}` / `?? []`)
// creerebbe un nuovo oggetto a ogni render → Zustand rileverebbe un cambio di
// riferimento e rientrerebbe in render all'infinito (vedi ARCHITECTURE.md §4).
//
// Congelati con Object.freeze come rete di sicurezza contro mutazioni accidentali
// del riferimento condiviso. Tutti gli update dello store sono comunque immutabili
// (spread su nuovi oggetti/array), quindi gli array vuoti condivisi non vengono
// mai mutati in place.

const ARREDI_VUOTO: SezioneArredi = {
  articoli: [],
  quotaProgettazione: false,
  noteGenerali: '',
  includiNotePagamento: false,
  mostraMqInPdf: false,
  sconto: 0,
}

const GRES_VUOTO: SezioneGres = {
  tipologiaMateriale: 'GRES',
  righeMateriali: [],
  righeAlzatine: [],
  righeLavorazioniBordo: [],
  righeVarie: [],
  sconto: 0,
  includiRilMont: false,
}

const PROGETTO_VALORE_VUOTO: SezioneProgettoValore = {
  righe: [],
  sconto: 0,
}

const PORTE_VUOTO: SezionePorte = {
  righe: [],
  sconto: 0,
}

const CUCINE_VUOTO: SezioneCucine = {
  voci: [],
  casse: false,
  ante: false,
  profonditaOltre65: false,
  giorniExtra: 0,
  extraManuale: null,
  adeguamentoPct: ADEG_DEFAULT,
  descrizione: '',
  sconto: 0,
}

/** Sezione "Arredi" vuota — riferimento stabile per i selettori e per il reset. */
export const FALLBACK_ARREDI: SezioneArredi = Object.freeze(ARREDI_VUOTO)

/** Sezione "Gres" vuota (tipologia default GRES) — riferimento stabile. */
export const FALLBACK_GRES: SezioneGres = Object.freeze(GRES_VUOTO)

/** Sezione "Progetto a valore" vuota — riferimento stabile per selettori/reset. */
export const FALLBACK_PROGETTO_VALORE: SezioneProgettoValore = Object.freeze(PROGETTO_VALORE_VUOTO)

/** Sezione "Porte" vuota — riferimento stabile per selettori/reset. */
export const FALLBACK_PORTE: SezionePorte = Object.freeze(PORTE_VUOTO)

/** Sezione "Cucine" vuota (adeguamento al default) — riferimento stabile per selettori/reset. */
export const FALLBACK_CUCINE: SezioneCucine = Object.freeze(CUCINE_VUOTO)

/**
 * Stato sezioni iniziale dell'app fresca: `arredi` e `gres` pronti (vuoti),
 * placeholder (cucine/porte/progettoValore) `undefined`.
 */
export const INITIAL_SEZIONI: SezioniState = {
  arredi: FALLBACK_ARREDI,
  gres: FALLBACK_GRES,
}
