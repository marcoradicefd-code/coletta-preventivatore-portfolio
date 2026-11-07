import { componiCatalogoCucina } from '@/data/cucina/strutturaCucina'
import { PROG_PCT, ADEG_DEFAULT, type CatalogoCucina, type ListinoCucina } from '@/types/cucina'

/** Prezzo finto della vasca in gres, per i test che la includono. */
export const VASCA_PREZZO_FINTO = 1240

/** Tariffa finta dei giorni extra, €/giorno. */
export const GIORNO_RATE_FINTO = 170

/**
 * Listino cucine FINTO per i test: le 54 voci con prezzo della struttura del
 * codice, con prezzi INVENTATI, più tariffa dei giorni e vasca inventate.
 * Nessuno è un prezzo vero: lo verifica il golden sul listino vero, in locale.
 * I test non devono portare nel repo i prezzi di vendita della cucina (D7).
 *
 * I test che renderizzano componenti lo mettono nello store
 * (`usePricelistStore.setState({ cucine: validatoPerTest(listinoCucinaFinto) })`),
 * come farebbe il caricamento dal bucket; l'engine gira su `catalogoCucinaFinto`.
 */
export const listinoCucinaFinto: ListinoCucina = {
  prezzi: [
    { id: 'base-pensile-laminato', prezzo: 260 },
    { id: 'base-pensile-laminato-900', prezzo: 120 },
    { id: 'base-pensile-laccato', prezzo: 140 },
    { id: 'base-pensile-laccato-900', prezzo: 160 },
    { id: 'base-pensile-finitura-speciale', prezzo: 180 },
    { id: 'base-pensile-finitura-speciale-900', prezzo: 240 },
    { id: 'base-pensile-impiallacciato', prezzo: 280 },
    { id: 'base-pensile-impiallacciato-900', prezzo: 320 },
    { id: 'colonna-210-laminato', prezzo: 360 },
    { id: 'colonna-210-laccato', prezzo: 1260 },
    { id: 'colonna-210-impiallacciato', prezzo: 380 },
    { id: 'colonna-extra-210-laminato', prezzo: 420 },
    { id: 'colonna-extra-210-laccato', prezzo: 440 },
    { id: 'colonna-extra-210-impiallacciato', prezzo: 480 },
    { id: 'colonna-fuorimisura', prezzo: 1640 },
    { id: 'base-pensile-angolo-laccato-impiallacciato', prezzo: 520 },
    { id: 'base-pensile-angolo-laminato', prezzo: 460 },
    { id: 'anta-vetro-visarm', prezzo: 170 },
    { id: 'gola-alluminio-legno', prezzo: 540 },
    { id: 'maniglia-su-anta', prezzo: 580 },
    { id: 'maniglia-metallo-custom', prezzo: 620 },
    { id: 'cassetto-cestone', prezzo: 660 },
    { id: 'cassetto-blum-alluminio', prezzo: 680 },
    { id: 'cassetto-120-70kg', prezzo: 720 },
    { id: 'cassetto-coda-di-rondine', prezzo: 740 },
    { id: 'cesto-estrazione-300-sige', prezzo: 760 },
    { id: 'blum-revego-anta-scomparsa', prezzo: 780 },
    { id: 'portapattumiera-differenziata', prezzo: 820 },
    { id: 'cestello-corner-vibo', prezzo: 840 },
    { id: 'colonna-vibo-metalstyle-galaxy', prezzo: 860 },
    { id: 'scolapiatti', prezzo: 880 },
    { id: 'tubo-espulsione-cappa', prezzo: 900 },
    { id: 'presa-italia-schuco-eubiq', prezzo: 920 },
    { id: 'portaposate-acciaio-legno', prezzo: 940 },
    { id: 'striscia-led', prezzo: 70 },
    { id: 'sensore-incasso-led', prezzo: 960 },
    { id: 'trasformatore', prezzo: 980 },
    { id: 'faretto-led', prezzo: 1020 },
    { id: 'multipresa-evoline', prezzo: 1040 },
    { id: 'braccetto-salice-wind-pacta', prezzo: 1060 },
    { id: 'fianco-finitura-doppia', prezzo: 1080 },
    { id: 'struttura-giorno-laminato-25-40', prezzo: 1100 },
    { id: 'struttura-giorno-impiallaccio-25-40', prezzo: 560 },
    { id: 'struttura-giorno-laccato-25-40', prezzo: 1120 },
    { id: 'struttura-giorno-impiallaccio-50-60', prezzo: 1140 },
    { id: 'struttura-giorno-laccato-50-60', prezzo: 1160 },
    { id: 'isola-laminato-240x90', prezzo: 1180 },
    { id: 'isola-laminato-fuorimisura', prezzo: 340 },
    { id: 'isola-laccato-impiallacciato-240x90', prezzo: 1220 },
    { id: 'isola-laccato-impiallacciato-fuorimisura', prezzo: 640 },
    { id: 'pannello-retro-isola', prezzo: 1240 },
    { id: 'cappa-su-misura-falmec', prezzo: 1280 },
    { id: 'cornice-chiusura', prezzo: 1300 },
    { id: 'pannello-stampato-decorprint', prezzo: 1320 },
  ],
  percentuali: { casse: 0.1, ante: 0.2, progettazione: PROG_PCT, adeguamento: ADEG_DEFAULT },
  giornoRate: GIORNO_RATE_FINTO,
  vascaGres: VASCA_PREZZO_FINTO,
  vociMancanti: [],
  righeSconosciute: [],
  aggiornato: 'LISTINO CUCINA FINTO.xls',
}

/** Il catalogo dell'engine composto dal listino finto. */
export const catalogoCucinaFinto: CatalogoCucina = componiCatalogoCucina(listinoCucinaFinto)
