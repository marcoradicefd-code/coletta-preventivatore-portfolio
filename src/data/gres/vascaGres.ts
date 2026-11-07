/*
 * Vasca integrata in gres.
 *
 * **NON viene dal listino De Bari, e non può venirne.** Il Rev_82 ha una sezione
 * "VASCHE INTEGRATE SANTA MARGHERITA" (`MASTER_LAVORAZIONI` r24-r30) con 6 voci,
 * ma sono in **quarzo resina** e per il Gres sono tutte **"Non Disp."**: De Bari
 * non fa vasche in gres. Il foglio `MODELLO VASCA` esiste ed è **vuoto**.
 *
 * È un **prezzo commerciale di Coletta**, deciso da Antonio sul preventivo reale
 * 1147 (SPEC_FASE2 §A.5 #2), e SENSIBILE (D7): non sta nel codice. Lo porta il
 * listino cucine, riga «VASCA INTEGRATA IN GRES» (`ListinoCucina.vascaGres`,
 * PR 10b-2). È un **default**, non una costante di calcolo: `setVasca` lo
 * snapshotta nella voce alla prima inclusione e da lì è editabile per-preventivo.
 * L'engine legge sempre il prezzo dalla voce.
 */

/**
 * Descrizione commerciale: fonte unica per la checkbox in UI e per la riga del
 * PDF — le due non devono driftare, è il testo che legge il cliente.
 *
 * Il riepilogo in sidebar NON la usa: lì la riga è "Vasca", allineata ai
 * subtotali fratelli ("Materiali", "Alzatine", …) e alla larghezza della colonna.
 */
export const VASCA_DESCRIZIONE = 'Vasca integrata in gres'
