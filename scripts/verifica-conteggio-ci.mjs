#!/usr/bin/env node
/**
 * Pretende il conteggio ESATTO dei test su un clone pulito (la CI).
 *
 * Perché non basta l'exit code di vitest: vitest esce 0 anche se una suite
 * intera smette di essere raccolta, o se qualcuno aggiunge uno `skipIf` che si
 * porta via dei test. Il gate direbbe verde senza aver guardato — la famiglia di
 * falsi verdi che CLAUDE.md elenca. Qui i numeri sono attesi, non osservati.
 *
 * Gli skipped (13 dalla #58) NON sono un difetto tollerato: sono le suite golden, che si
 * auto-skippano perché le fixture (`src/parsers/__tests__/fixtures/`) sono i
 * listini commerciali VERI di Antonio e stanno fuori dal repo (.gitignore:32).
 * Sono attesi, quindi sono asseriti: se fossero di più qualcuno ha spento
 * dell'altro, se diventassero 0 qualcuno ha committato i prezzi del cliente.
 *
 * I numeri vengono da una misura, non da una stima: fixture parcheggiate,
 * suite eseguita, fixture rimesse.
 */
import { readFileSync } from 'node:fs'

const ATTESO = {
  // +52 dalla PR "battiscopa a corpo", DERIVATI dalla baseline 473:
  // 16 in `calcPorte.test.ts` (4 di PRESIDIO — il battiscopa già salvato fra
  // gli optional vale esattamente quanto ieri, moltiplicatore compreso — più
  // `calcRigaBattiscopa` e l'aggregazione con lo sconto dopo), 14 nel nuovo
  // `src/data/__tests__/battiscopa.test.ts` (il predicato elenca cosa nasconde
  // dalla select E cosa no, un caso per nome), 8 in `porteSnapshot.test.ts`
  // (snapshot del €/cm alla scelta), 2 in `quoteMigrate.test.ts` (forward-compat
  // punto fisso) e 12 nel nuovo `PreventivoPrintBattiscopa.test.tsx` (tabella,
  // tri-stato della descrizione, sezioneNonVuota col solo battiscopa).
  // Tutti SINTETICI: nessuno tocca le fixture, quindi girano anche in CI e il
  // canary si muove su totale e passati, non sugli skip.
  // 473 + 52 = 525 totali; 462 + 52 = 514 passati; gli 11 skipped non si muovono.
  //
  // +3 dalla PR "gres subito dopo la cucina", DERIVATI dalla baseline 525: il
  // describe dell'ordine delle sezioni in `PreventivoPrint.test.tsx` (con cucina,
  // senza cucina, cucina senza gres). Sintetici, girano anche in CI.
  // 525 + 3 = 528 totali; 514 + 3 = 517 passati; gli 11 skipped non si muovono.
  //
  // +5 nella stessa PR, DERIVATI da 528: i rami del blocco Gres in
  // `PreventivoPrint.test.tsx` (sconto, rilievo e montaggio al 15%, alzatine,
  // materiale dal listino o chiave grezza, lavorazione bordo sparita dal listino).
  // 528 + 5 = 533 totali; 517 + 5 = 522 passati; gli 11 skipped non si muovono.
  //
  // +15 dalla PR "maniglia inclusa", DERIVATI da 533: 3 in `calcPorte.test.ts`
  // (predicato `manigliaInclusa`, totale invariato, forward-compat), 6 in
  // `PreventivoPrintPorteQta.test.tsx` (legacy identico, inclusa, voce "inclusa",
  // prezzo 0, extra, modello vuoto), 1 in `quoteMigrate.test.ts`, 3 in
  // `PortaConfigModal.test.tsx` (Aggiungi disabilitato, aggiunta senza prezzo,
  // prezzo scritto e svuotato) e 2 in `PortePage.test.tsx`. Sintetici.
  // 533 + 15 = 548 totali; 522 + 15 = 537 passati; gli 11 skipped non si muovono.
  //
  // +5 dalla PR "pdf-silenzi" (commit qty), DERIVATI da 548: il nuovo
  // `src/components/shared/__tests__/QtyInput.test.tsx` (limite con messaggio,
  // messaggio che resta, che sparisce nel limite, presidio dentro il limite,
  // unità ml e pezzi). Sintetici.
  // 548 + 5 = 553 totali; 537 + 5 = 542 passati; gli 11 skipped non si muovono.
  //
  // +11 (commit gres), DERIVATI da 553: il nuovo
  // `src/components/layout/__tests__/bloccoPdfGres.test.tsx` (3 su `gresCompilato`,
  // 4 riepiloghi bloccati, 1 presidio) e 3 in `PreventivoPrint.test.tsx` (blocco
  // gres da definire, totale parziale, presidio col listino). Sintetici.
  // 553 + 11 = 564 totali; 542 + 11 = 553 passati; gli 11 skipped non si muovono.
  //
  // +9 (commit sconto), DERIVATI da 564: 2 su `formatPercent` in
  // `format.test.ts`, 2 in `PreventivoPrint.test.tsx` (etichetta 12,5%, presidio
  // sull'importo) e 5 nel nuovo `src/components/__tests__/scontoDecimaleRiepiloghi.test.tsx`
  // (un caso per riepilogo). Sintetici.
  // 564 + 9 = 573 totali; 553 + 9 = 562 passati; gli 11 skipped non si muovono.
  //
  // +5 (commit totale parziale), DERIVATI da 573: 2 su `sezioniDaDefinire` in
  // `bloccoPdfGres.test.tsx` e 3 in `PreventivoPrintPorteQta.test.tsx` (porta
  // irrisolvibile, gres e porte insieme, presidio). Sintetici.
  // 573 + 5 = 578 totali; 562 + 5 = 567 passati; gli 11 skipped non si muovono.
  //
  // PR "battiscopa a metri lineari" (specifica di Antonio, 06/10). SALDO della
  // PR, derivato da 578: 17 nuovi (engine 5, store 1, ui 7, pdf 4), 2 eliminati
  // ("vani × 2" nel motore e "2 vani" nel PDF: la forma nuova non moltiplica per
  // i vani), 14 riscritti (engine 6, store 2, pdf 6). 578 + 17 − 2 = 593 totali;
  // 567 + 15 = 582 passati. Dettaglio per commit qui sotto.
  // Commit engine.
  // Saldo DERIVATO da 578: in `calcPorte.test.ts` 5 nuovi (posa assente, vani
  // ignorati, riga #33 da completare, forward-compat, da completare in
  // daDefinire), 1 eliminato (vani × 2: la forma nuova non li moltiplica),
  // 6 riscritti; in `PreventivoPrintBattiscopa.test.tsx` 1 eliminato ("2 vani",
  // stessa ragione). 578 + 5 − 1 − 1 = 581 totali; 567 + 3 = 570 passati.
  // Commit store: in `porteSnapshot.test.ts` 1 nuovo (completamento della riga
  // #33), 2 riscritti. 581 + 1 = 582 totali; 570 + 1 = 571 passati.
  // Commit ui: 7 nuovi in `PortePage.test.tsx` (calcolo, campi, +20%, avviso
  // #33, riga senza misure, prezzo da definire, rimozione).
  // 582 + 7 = 589 totali; 571 + 7 = 578 passati.
  // Commit pdf: in `PreventivoPrintBattiscopa.test.tsx` 4 nuovi (intestazioni,
  // senza posa, riga #33 da completare, riga senza misure), 6 riscritti.
  // 589 + 4 = 593 totali; 578 + 4 = 582 passati.
  //
  // PR "sonar-triage". Commit listini: 3 nuovi in `GestioneListini.test.tsx`
  // (upload che lancia, file illeggibile, elenco che lancia). Sintetici.
  // 593 + 3 = 596 totali; 582 + 3 = 585 passati; gli 11 skipped non si muovono.
  // Commit a11y: 1 nuovo in `GestioneListini.test.tsx` e 1 in
  // `FileUploadCard.test.tsx` (drop zone da tastiera). Sintetici.
  // 596 + 2 = 598 totali; 585 + 2 = 587 passati.
  // Commit ordine/totale: 1 nel nuovo `MaterialSelector.test.tsx` (ordine
  // alfabetico italiano) e 1 in `PreventivoPrint.test.tsx` (rowheader del
  // totale). Sintetici. 598 + 2 = 600 totali; 587 + 2 = 589 passati.
  // Commit copertura: 2 in `GestioneListini.test.tsx` (drop, "Aggiorna") e 1 in
  // `FileUploadCard.test.tsx` (drop). Sintetici.
  // 600 + 3 = 603 totali; 589 + 3 = 592 passati.
  // Commit button nativo: 2 nuovi in `FileUploadCard.test.tsx` (errore in
  // role="alert" e successo in role="status", fuori dal bottone); i 2 test da
  // tastiera RISCRITTI, non aggiunti. 603 + 2 = 605 totali; 592 + 2 = 594 passati.
  //
  // PR "lint-gate". Commit set-state-in-effect: 1 in `AppShell.test.tsx`
  // (presidio: chi riottiene admin torna sulla tab admin) e 2 nel nuovo
  // `src/hooks/__tests__/useStoreHydration.test.ts`. Sintetici.
  // 605 + 3 = 608 totali; 594 + 3 = 597 passati.
  // Commit FinituraCombobox: 4 nel nuovo
  // `src/components/sumisura/__tests__/FinituraCombobox.test.tsx` (frecce e
  // Invio, cima della lista, lista accorciata, Esc). Sintetici.
  // 608 + 4 = 612 totali; 597 + 4 = 601 passati.
  //
  // PR "rilievo senza top" (A1 della review del 07/10). Commit gres: 2 in
  // `calcMarmeria.test.ts` (lordo 0 con spunta → 0; sconto 100% → fascia minima),
  // 4 nel nuovo `PreventivoPrintTotale.test.tsx` (gres mai compilato, svuotato,
  // a quantità 0; presidio dello sconto 100%) e 1 nel nuovo
  // `MarmeriaRiepilogo.test.tsx`. Sintetici.
  // 612 + 7 = 619 totali; 601 + 7 = 608 passati; gli 11 skipped non si muovono.
  // Commit cucine: 1 in `calcCucina.test.ts` (extra negativo → 0). Sintetico.
  // 619 + 1 = 620 totali; 608 + 1 = 609 passati.
  // Commit test: 1 in `PreventivoPrintTotale.test.tsx` (400 stati con seme fisso,
  // totale = Σ blocchi stampati). Sintetico. 620 + 1 = 621 totali; 609 + 1 = 610 passati.
  //
  // PR "minimo 2 mq" (A5 della review del 07/10). Commit engine: 6 in
  // `calcMarmeria.test.ts` (1,2 mq; continuità 1,99/2,00; Σ = 0; più materiali;
  // alzatine; sconto e rilievo). Sintetici.
  // 621 + 6 = 627 totali; 610 + 6 = 616 passati; gli 11 skipped non si muovono.
  // Commit UI: 1 in `PreventivoPrint.test.tsx` (riga d'integrazione e lordo), 1 in
  // `MarmeriaRiepilogo.test.tsx`, 1 nel nuovo `TopTable.test.tsx` (niente badge).
  // Il test a proprietà controlla anche lordo e scontato del gres: stesso test,
  // non uno nuovo. Sintetici. 627 + 3 = 630 totali; 616 + 3 = 619 passati.
  //
  // PR "lavorazioni non disponibili" (A2 della review del 07/10). Commit «da
  // definire»: 2 in `calcMarmeria.test.ts` (N/D o sparita contata; gres di sole
  // righe da definire), 3 in `bloccoPdfGres.test.tsx` (sezioniDaDefinire,
  // sezioneNonVuota, «Genera» acceso) e 1 in `PreventivoPrint.test.tsx` (blocco di
  // sole righe da definire). Riscritti, non aggiunti: «ritorna 0» → null, «sparita
  // dal listino» → prezzo da definire, «senza chiave vasca» col campo nuovo.
  // Sintetici. 630 + 6 = 636 totali; 619 + 6 = 625 passati.
  // Commit cambio tipologia: 1 in `quoteStore.test.ts` (righe tolte e restituite)
  // e 1 nel nuovo `TipologiaSelector.test.tsx` (avviso). Sintetici.
  // 636 + 2 = 638 totali; 625 + 2 = 627 passati.
  // Commit «Togli»: 2 in `LavorazioniTables.test.tsx` (bordo e varie: riga N/D con
  // quantità e riga non più nel listino). Sintetici. 638 + 2 = 640; 627 + 2 = 629.
  //
  // PR "intestazioni e guardia" (A3 + A4 della review del 07/10). Commit
  // intestazioni: 4 in `parseMarmeria.test.ts` (costante fissata coi letterali,
  // GAMMA con colonna inserita, varianti 12/13, MASTER diversa). Sintetici.
  // 640 + 4 = 644 totali; 629 + 4 = 633 passati.
  // Commit guardia: 6 in `GestioneListini.test.tsx` (marmeria con colonna
  // spostata, porte fuori schema, su misura con parse fallito, non-listino
  // sintetico, un solo parse per upload, upload in errore). Sintetici.
  // 644 + 6 = 650 totali; 633 + 6 = 639 passati.
  // Commit O8: 1 in `GestioneListini.test.tsx` (categoria non caricata: nessun
  // «In uso», «Non caricato», niente «da eliminare»). 650 + 1 = 651; 639 + 1 = 640.
  // Commit golden: 2 golden sul Rev_83 in `parsers.golden.test.ts` (conteggi e
  // intestazioni lette). Leggono il listino VERO: in CI sono skippati, quindi
  // crescono i totali e gli skipped, non i passati.
  // 651 + 2 = 653 totali; 640 passati; 11 + 2 = 13 skipped.
  //
  // PR "avviso di uscita" (A6 della review del 07/10): 54 nel nuovo
  // `quoteHaDati.test.ts` (4 sullo stato iniziale, data e reset, 9 su campi
  // tornati al default, 41 uno per campo che conta) e 3 in `AppShell.test.tsx`
  // (conferma con preventDefault e returnValue, stato iniziale, «Ricorda»).
  // Sintetici. 653 + 57 = 710 totali; 640 + 57 = 697 passati.
  //
  // PR "upload locale solo admin" (D5 della review del 07/10): 3 in
  // `AppShell.test.tsx` (non admin in sola lettura, admin apre la modale,
  // ruolo perso con la modale aperta). Sintetici. 710 + 3 = 713; 697 + 3 = 700.
  //
  // PR "quick wins" (O1, O2, O18, O27, O34 della review del 07/10), tutti
  // sintetici: O1 2 in `rilMont.test.ts` (basi float da 3.200 e 3.000 esatti);
  // O2 1 in `PreventivoPrint.test.tsx` (quantità nelle 4 tabelle gres); O18 3
  // (adeguamento 12,5% in `PreventivoPrint.test.tsx` e `CucinePage.test.tsx`,
  // tendina sconto in `MarmeriaRiepilogo.test.tsx`; i test di format e parser
  // cambiano valore, non numero); O27 1 in `authStorage.test.ts`; O34 3 nel
  // nuovo `ClientForm.test.tsx` (vuoto, 0, 60). O13 e O38 non hanno test vitest.
  // 713 + 10 = 723 totali; 700 + 10 = 710 passati.
  //
  // PR "euro intero" (O3 + D4 della review del 07/10), tutti sintetici: 8 nel
  // nuovo `arrotondaEuro.test.ts`; negli engine 3 progetto a valore, 3 arredi,
  // 2 porte, 4 cucina, 7 gres; 3 sul totale persistito e la riga a valore
  // (2 in `PreventivoPrint.test.tsx`, 1 in `TopTable.test.tsx`); 2 sui
  // riepiloghi (`CucinePage.test.tsx`, `PortaConfigModal.test.tsx`); 1 sul
  // plurale dell'avviso in `TipologiaSelector.test.tsx`. Il test a proprietà
  // cambia contenuto, non numero; i test con attese cambiate non si contano.
  // 723 + 33 = 756 totali; 710 + 33 = 743 passati.
  //
  // PR "catalogo cucina come parametro" (10a: O5 + test sul catalogo finto),
  // tutti sintetici: in `catalogoCucina.test.ts` +1 (tolti i 2 che asserivano
  // prezzi veri, aggiunti quello sui kind di LED e isole e i 2 sul catalogo
  // finto: stessa struttura, nessun prezzo vero); 5 in `calcCucina.test.ts`
  // (voci fuori catalogo); 3 in `bloccoPdfGres.test.tsx` (ordine del predicato,
  // blocco non vuoto, «Genera» acceso); 5 in `PreventivoPrint.test.tsx` (totale
  // parziale, plurale, sole voci fuori catalogo, con il gres senza listino,
  // presidio); 3 in `CucinePage.test.tsx` (pannello, «Togli», presidio). Il test
  // a proprietà cambia contenuto (I3), non numero.
  // 756 + 17 = 773 totali; 743 + 17 = 760 passati.
  //
  // PR "listino cucine" (10b-1): 53 test. Sintetici, 48: 16 nel nuovo
  // `parseCucina.test.ts`, 7 nel nuovo `cucinaSchema.test.ts`, 2 sulla struttura
  // senza prezzi in `catalogoCucina.test.ts`, 15 in `pricelistStore.test.ts`
  // (categoria, loadDefaults, avvisi del referto, esame su misura), 7 in
  // `GestioneListini.test.tsx`, 1 in `AppShell.test.tsx`. Golden, 5: 4 sul
  // listino cucine vero in `parsers.golden.test.ts` e 1 sul vecchio APR26 in
  // `pricelistStore.test.ts`. Leggono i file VERI: in CI sono skippati, quindi
  // crescono totali e skipped, non i passati.
  // 773 + 53 = 826 totali; 760 + 48 = 808 passati; 13 + 5 = 18 skipped.
  //
  // PR "prezzi di cucina e vasca fuori dal bundle" (10b-2): 31 test. Sintetici,
  // 29: 3 in `strutturaCucina.test.ts` (da 9 a 12: struttura senza prezzi,
  // composizione, listino finto allineato; il controllo «nessun prezzo finto è
  // vero» passa nel golden), 2 in `calcCucina.test.ts` (giorni senza tariffa),
  // 10 in `CucinePage.test.tsx` (5) e `PreventivoPrint.test.tsx` (2 giorni + 3
  // cucina senza listino), 8 in `bloccoPdfGres.test.tsx` (catalogo assente
  // contro ogni predicato), 2 in `quoteStore.test.ts` e 3 in `VascaGres.test.tsx`
  // (vasca dal listino), 1 in `bundleMarkers.test.ts` (forma D7 su dist/, gira
  // in CI dopo il build). Golden, 2: «riproduce il foglio» in
  // `parsers.golden.test.ts` e la coppia nome-prezzo su dist/ in
  // `bundleMarkers.test.ts`; skippati in CI. Il golden che confrontava il
  // listino col catalogo statico è sostituito da «nessun prezzo finto è vero»:
  // numero invariato. I 2 test della 10b-1 sull'assenza muta cambiano attesa.
  // 826 + 31 = 857 totali; 808 + 29 = 837 passati; 18 + 2 = 20 skipped.
  //
  // PR "hook guard-git" (L0): 87 nel nuovo `src/__tests__/guardGit.test.ts`,
  // contati dai casi scritti: gh 5, push forzato 8, push su main 13, add 13,
  // commit 16 (12 + 4 sul file di -F), segmenti 14, opzioni globali e maiuscole 9,
  // neutri 5, filo stdin → exit code 4. Sintetici: nessun git vero.
  // 857 + 87 = 944 totali; 837 + 87 = 924 passati; i 20 skipped non si muovono.
  //
  // PR "porta senza altezza da completare" (L1, O4 + O19): 10, contati dai casi
  // scritti. `PortePage.test.tsx` 3 (porta irrisolvibile, porta senza altezza,
  // etichetta del riepilogo; il primo copre due righe prima senza test),
  // `calcPorte.test.ts` 3 (altezze non valide, precedenza del prezzo,
  // aggregazione con lo sconto), `PreventivoPrintPorte.test.tsx` 3 (riga da
  // completare, TOTALE PARZIALE, maniglia senza importo), `PortaConfigModal.test.tsx`
  // 1 (altezza svuotata). Sintetici, girano anche in CI.
  // 944 + 10 = 954 totali; 924 + 10 = 934 passati; i 20 skipped non si muovono.
  //
  // PR "idratazione del preventivo" (L2, O10): 12, contati dai casi scritti.
  // `quoteMigrate.test.ts` 1 (preventivo null è assente), nel nuovo
  // `quoteIdratazioneGuasta.test.ts` 6 (blob non JSON, copia e log senza
  // contenuto, migrate che lancia, toggle spento dopo il reset, blob v4 buono,
  // localStorage inaccessibile in lettura), `quoteHydration.test.ts` 2 (copia
  // tolta da `resetAll` e da `clearStorage`), `useStoreHydration.test.ts` 1
  // (quota al salvataggio dopo il migrate), `AppShell.test.tsx` 2 (i due testi
  // dell'avviso). Sintetici, nessuno tocca le fixture: girano anche in CI.
  // 954 + 12 = 966 totali; 934 + 12 = 946 passati; i 20 skipped non si muovono.
  //
  // PR "fine sessione" (L3, O11 + O26): 9, contati dai casi scritti.
  // `authStore.test.ts` 7: 3 sul logout (signOut che rigetta, signOut con
  // { error }, ordine di signOut) e 4 sul listener (SIGNED_OUT con utente,
  // SIGNED_OUT con utente nullo, getSession e INITIAL_SESSION senza sessione,
  // SIGNED_IN e TOKEN_REFRESHED); nel nuovo `Sidebar.test.tsx` 2 (avviso con
  // errore, nessun avviso). Sintetici, nessuno tocca le fixture: girano anche in CI.
  // 966 + 9 = 975 totali; 946 + 9 = 955 passati; i 20 skipped non si muovono.
  //
  // PR "selezione fogli e loadDefaults" (L4, O9 + O30): 16, contati dai casi
  // scritti. Commit della corsa di `loadDefaults` (O30): 6 in
  // `pricelistStore.test.ts` (A lenta e B veloce, A prima di B ma partita
  // prima, errore di A che non tocca errors né loadingDefaults, upload a metà
  // corsa, attesa della vincente, vincente già finita). Commit dell'avviso nel
  // referto (O9, store): 7, cioè 4 in `selezioneFogli.store.test.ts` (sidecar
  // elencato con download in errore, download che lancia, elenco fogli vuoto,
  // stantio con un foglio solo), 2 in `pricelistStore.test.ts` (avviso nel
  // referto con più fogli, assente con uno) e 1 in `FileUploadCard.test.tsx`
  // (caricamento locale). Commit della notifica (O9, UI): 3 in
  // `AppShell.test.tsx`. Sintetici, nessuno tocca le fixture: girano anche in CI.
  // 975 + 16 = 991 totali; 955 + 16 = 971 passati; i 20 skipped non si muovono.
  //
  // PR "worker Excel: timeout e tetto decompresso" (L5, O24 + O60): 12, contati
  // dai casi scritti. Commit del timeout (O24): 6 nel nuovo
  // `src/lib/__tests__/excelWorker.test.ts` (risposta nei tempi, onerror,
  // timeout, onmessageerror, risposta tardiva, postMessage che lancia). Commit
  // del tetto (O60): 3 nel nuovo `src/lib/__tests__/dimensioneZip.test.ts`
  // (xlsx vero piccolo, somma di due voci, buffer non zip), 2 in
  // `excelWorker.test.ts` (zip sopra il tetto, non zip sopra il tetto) e 1
  // golden in `parsers.golden.test.ts` («nessun listino vero supera un quarto
  // del tetto»), che legge i file VERI: in CI è skippato.
  // 991 + 12 = 1003 totali; 971 + 11 = 982 passati; 20 + 1 = 21 skipped.
  // Correzione del revisore sulla stessa PR: +1 in `dimensioneZip.test.ts`
  // («legge la directory come xlsx: voci su questo disco da fine+8, firma
  // cercata da length-4»), sintetico, gira in CI.
  // 1003 + 1 = 1004 totali; 982 + 1 = 983 passati; i 21 skipped non si muovono.
  //
  // +11 dalla PR "porte, modelli senza prezzo" (L6, O6 + O37), DERIVATI da 1004
  // dagli `it` scritti. 5 in `parsePorte.test.ts` per la regex di `pctM` (un
  // `it.each` di 5 righe), 3 in `parsePorte.test.ts` per i modelli senza prezzo
  // e 2 in `pricelistStore.test.ts` (avvisi nel referto): sintetici, girano in
  // CI. 1 golden in `parsers.golden.test.ts` («nessun modello scartato per
  // prezzo mancante»), che legge il file VERO: in CI è skippato.
  // 1004 + 11 = 1015 totali; 983 + 10 = 993 passati; 21 + 1 = 22 skipped.
  //
  // +11 dalla PR "Su Misura, intestazioni per etichetta" (L7, O7 + O16),
  // DERIVATI da 1015 dagli `it` scritti. 5 in `parseSuMisura.test.ts` per
  // l'intestazione dei fogli standard, 3 in `parseSuMisura.test.ts` per RETI
  // LETTO e 1 in `pricelistStore.test.ts` (avvisi nel referto): sintetici,
  // girano in CI. 2 golden in `parsers.golden.test.ts` sul prospetto 2026
  // (conteggi delle voci, prezzi cliente invariati con una colonna inserita),
  // che leggono il file VERO: in CI sono skippati.
  // 1015 + 11 = 1026 totali; 993 + 9 = 1002 passati; 22 + 2 = 24 skipped.
  //
  // +6 dalla PR "Gestione Listini, eliminazione e categorie" (L8, O29 + N5),
  // DERIVATI da 1026 dagli `it` scritti, tutti in `GestioneListini.test.tsx`:
  // 5 per l'eliminazione (data vuota, remove che lancia, delete Porte riuscita,
  // delete Su Misura col sidecar dopo il file, sidecar che lancia) e 1 di
  // allineamento del riquadro delle categorie. Sintetici, girano in CI.
  // 1026 + 6 = 1032 totali; 1002 + 6 = 1008 passati; i 24 skipped non si muovono.
  //
  // +12 dalla PR "conferma di «Genera» senza numero" (L9, N3 + O32), DERIVATI
  // da 1032 dagli `it` scritti. 2 in `validation.test.ts` (il predicato
  // `numeroPreventivoMancante`), 6 nel nuovo `usePrint.test.tsx` (4 sulla
  // conferma, 2 sui toast d'errore, con `react-to-print` mockato), 3 nel nuovo
  // `ConfermaGenera.test.tsx` e 1 in `AppShell.test.tsx` (da Progetto a valore).
  // Tutti sintetici: nessuno tocca le fixture, quindi girano anche in CI.
  // 1032 + 12 = 1044 totali; 1008 + 12 = 1020 passati; i 24 skipped non si muovono.
  //
  // +1 dalla PR "autoComplete del cliente" (L10, O35), DERIVATO da 1044 dagli
  // `it` scritti: 1 in `ClientForm.test.tsx` (i sei campi del cliente senza
  // `off` né token riconosciuti dal browser). Sintetico, gira in CI.
  // 1044 + 1 = 1045 totali; 1020 + 1 = 1021 passati; i 24 skipped non si muovono.
  //
  // +14 dalla PR "ritocchi UI e PDF" (L17), DERIVATI da 1045 dagli `it` scritti.
  // 2 in `PreventivoPrint.test.tsx` (la cucina in stampa con il solo totale, pieno
  // e parziale; altri 4 `it` riscritti, non aggiunti), 1 in
  // `PreventivoPrintBattiscopa.test.tsx` (descrizione null), 1 in
  // `PortePage.test.tsx` (il campo descrizione del battiscopa), 6 nel nuovo
  // `src/utils/__tests__/ricerca.test.ts` (normalizzazione della ricerca) e 4 in
  // `CucinePage.test.tsx` (la lente sulle voci). Il test a proprietà resta uno.
  // Tutti sintetici, sul listino cucine finto: girano anche in CI.
  // 1045 + 14 = 1059 totali; 1021 + 14 = 1035 passati; i 24 skipped non si muovono.
  //
  // +29 dalla PR "IVA per riga" (L18), DERIVATI da 1059 dagli `it` scritti.
  // 9 nel nuovo `src/engine/__tests__/iva.test.ts` (aliquote ammesse, una e tre
  // aliquote, ripartizione con sconto e col resto negativo, riga che eredita la
  // sezione, progettazione sui soli Arredi, sezione vuota, totale parziale), 3 nel
  // nuovo `src/store/__tests__/quoteIva.test.ts` (setter di sezione e di riga, il
  // blob di prima di L18 al 22%), 6 casi in `quoteHaDati.test.ts` (cinque sezioni
  // con un'aliquota, una tornata al 22%), 5 nel nuovo
  // `src/components/shared/__tests__/SelettoreIva.test.tsx` (selettori e
  // riepilogo per aliquota) e 6 nel nuovo `PreventivoPrintIva.test.tsx` (totali,
  // colonna, sconto diviso, parziale, nota, blob di prima stampato al 22%). Il
  // test a proprietà resta uno (con l'invariante I4 in più). Tutti sintetici:
  // girano anche in CI.
  // 1059 + 29 = 1088 totali; 1035 + 29 = 1064 passati; i 24 skipped non si muovono.
  //
  // +24 dalla PR "arredi raggruppati" (L19), DERIVATI da 1088 dagli `it`
  // scritti. 6 nel nuovo `src/store/__tests__/quoteArredi.test.ts` (setter
  // degli arredi e il blob di prima che si apre senza arredi, con gli stessi
  // totali), 2 casi in `quoteHaDati.test.ts` (arredo vuoto sì, creato e tolto
  // no), 5 in `calcSuMisura.test.ts` (`raggruppaPerArredo`: gruppi e ordine,
  // «Altre voci», arredo vuoto, senza arredi, presidio dei totali), 7 nel nuovo
  // `src/components/sumisura/__tests__/SuMisuraArredi.test.tsx` (la pagina) e
  // 4 nel nuovo `PreventivoPrintArredi.test.tsx` (blocchi per arredo, «Altre
  // voci», colonna IVA, blob di prima). Il test a proprietà resta uno (con
  // l'invariante I5 in più). Tutti sintetici: girano anche in CI.
  // 1088 + 24 = 1112 totali; 1064 + 24 = 1088 passati; i 24 skipped non si muovono.
  //
  // +40 dalla PR "matrice FINITURE" (L20), DERIVATI da 1112 dagli `it`
  // scritti. Sintetici, 35: 1 in `PreventivoPrintArredi.test.tsx` (titolo e
  // subtotale dell'arredo integri in stampa, note della #94); 8 in
  // `parseSuMisura.test.ts` (3 sul foglio FINITURE riconosciuto e su
  // ACCESSORI, 5 sulla matrice); 4 in `suMisuraSchema.test.ts` (matrice valida,
  // prezzo, unità, combinazione doppia); 2 in `pricelistStore.test.ts` (referto
  // per tipo, FINITURE non selezionato); 1 in `GestioneListini.test.tsx`
  // (selezione e referto del rev1 finto); 3 in `calcSuMisura.test.ts` (−10%
  // sotto 40 cm); 6 nel nuovo `matriceFiniture.test.ts`; 3 nel nuovo
  // `quoteMatrice.test.ts` (snapshot e blob di prima); 6 nel nuovo
  // `SuMisuraMatrice.test.tsx` (la pagina); 1 in `PreventivoPrintArredi.test.tsx`
  // (l'elemento da matrice nel PDF). Golden, 5, in `parsers.golden.test.ts` sul
  // rev1 vero: leggono il file VERO, in CI sono skippati, quindi crescono
  // totali e skipped, non i passati.
  // 1112 + 40 = 1152 totali; 1088 + 35 = 1123 passati; 24 + 5 = 29 skipped.
  //
  // +58 dalla PR "clienti e preventivi nel database" (L21, PR A), DERIVATI da
  // 1152 dagli `it` scritti. 10 nel nuovo `src/__tests__/schemaClientiPreventivi.test.ts`
  // (contratto della migration 0003, letta dal repo); 10 nel nuovo
  // `src/lib/__tests__/clientiDb.test.ts` e 12 nel nuovo `preventiviDb.test.ts`
  // (Supabase finto, con i presidi dei log); 10 nel nuovo
  // `src/components/clienti/__tests__/ClientiPage.test.tsx` (pagina, form,
  // presidio); 7 nel nuovo `PreventiviPage.test.tsx`; 2 nel nuovo
  // `src/engine/__tests__/calcPreventivo.test.ts`; 3 nel nuovo
  // `src/store/__tests__/quoteArchivio.test.ts`; 3 nel nuovo
  // `PreventivoPrintNumero.test.tsx`; 1 in `usePrint.test.tsx`. Tutti sintetici,
  // nessuna rete né fixture: girano anche in CI. Misurato con le fixture
  // parcheggiate: 1210 / 1181 / 0 falliti / 29 skipped.
  // 1152 + 58 = 1210 totali; 1123 + 58 = 1181 passati; i 29 skipped non si muovono.
  //
  // +39 dalla PR "fondamenta per i dati veri e salvataggio reso semplice"
  // (L21, PR B), DERIVATI da 1210 commit per commit: test(db) +13 (2 nel
  // contratto della 0003, 11 nel nuovo `schemaFondamenta.test.ts`); fix(auth)
  // +4 (`authStore.test.ts`, la bozza legata all'utente); fix(db) +7
  // (`clientiDb.test.ts` +3, `preventiviDb.test.ts` +2, `ClientiPage.test.tsx`
  // +1, `quoteArchivio.test.ts` +1); feat(ui) +3 (il nuovo `Conferma.test.tsx`);
  // feat(ui) +3 (il nuovo `BarraPreventivo.test.tsx` 5, `PreventiviPage.test.tsx`
  // −3 + 1); feat(preventivi) +8 (`usePrint.test.tsx` da 7 a 10, il nuovo
  // `SceltaCliente.test.tsx` 6, `ClientiPage.test.tsx` +2, `PreventiviPage.test.tsx`
  // +3, `PreventivoPrintNumero.test.tsx` +1, `AppShell.test.tsx` +1; tolti
  // `ConfermaGenera.test.tsx` −3 e `validation.test.ts` −5); refactor(ui) +1
  // (`AppShell.test.tsx`, i nomi del menu). Tutti sintetici, nessuna rete né
  // fixture: girano anche in CI. Misurato con le fixture parcheggiate.
  // 1210 + 39 = 1249 totali; 1181 + 39 = 1220 passati; i 29 skipped non si muovono.
  //
  // +20 dalla revisione funzionale del 14/10 sulla stessa PR (L21-B, #97),
  // DERIVATI da 1249, un test per difetto: fix(preventivi) +9
  // (`BarraPreventivo.test.tsx` +4, `usePrint.test.tsx` +1,
  // `preventiviDb.test.ts` +1, `PreventiviPage.test.tsx` +3); fix(ui) +1
  // (`BarraPreventivo.test.tsx`, la barra e i riepiloghi); fix(clienti) +10
  // (`SceltaCliente.test.tsx` +6, `ClientiPage.test.tsx` +2,
  // `ClientForm.test.tsx` +2); refactor(clienti) 0 (`datiDaCliente` non aveva
  // test). Nessun test tolto. Tutti sintetici: girano anche in CI. Misurato
  // con le fixture parcheggiate.
  // 1249 + 20 = 1269 totali; 1220 + 20 = 1240 passati; i 29 skipped non si muovono.
  //
  // +106 dalla PR "correzioni della revisione L15-L21" (L22, #98), DERIVATI
  // da 1269 commit per commit: test(db) +24 (11 nel nuovo
  // `schemaCorrezioni.test.ts`, 13 nel nuovo `schemaMigrazioni.test.ts`);
  // fix(db) +9 (`clientiDb.test.ts` +1, `SceltaCliente.test.tsx` +1,
  // `preventiviDb.test.ts` +2, `quoteIdratazioneGuasta.test.ts` +1, il nuovo
  // `progettoE2e.test.ts` 3, `schemaCorrezioni.test.ts` +1); feat(preventivi)
  // +27 (il nuovo `salvataggioStradaA.test.ts` 6, il nuovo
  // `PreventivoPrintCongelati.test.tsx` 6, `usePrint.test.tsx` +5,
  // `BarraPreventivo.test.tsx` +2, `PreventiviPage.test.tsx` +2,
  // `preventiviDb.test.ts` +2, il nuovo `vistaPrezzi.test.ts` 3,
  // `quoteIdratazioneGuasta.test.ts` +1); fix(pdf) +8 (`quoteArchivio.test.ts`
  // +2, il nuovo `PreventivoPrintImpaginazione.test.tsx` 4,
  // `matriceFiniture.test.ts` +1, il nuovo `SceltaMatrice.test.tsx` 1);
  // fix(ui) +38 (il nuovo `contrasti.test.ts` 11, `Sidebar.test.tsx` +1, il
  // nuovo `CampoRicerca.test.tsx` 2, `Toast.test.tsx` +1, il nuovo
  // `AppMovimento.test.tsx` 1, `PreventiviPage.test.tsx` +4, il nuovo
  // `ArticoloConfigModal.test.tsx` 4, `FinituraCombobox.test.tsx` +1, il nuovo
  // `SuMisuraUsabilita.test.tsx` 5, `ClientiPage.test.tsx` +5,
  // `BarraPreventivo.test.tsx` +1, `ClientForm.test.tsx` +1,
  // `SceltaCliente.test.tsx` +1). Nessun test tolto. Tutti sintetici, nessuna
  // rete né fixture: girano anche in CI. Misurato con le fixture parcheggiate.
  // 1269 + 106 = 1375 totali; 1240 + 106 = 1346 passati; i 29 skipped non si muovono.
  //
  // +2 dalla revisione di Marco sulla stessa PR (#98), DERIVATI da 1375:
  // test(utils) +1 (`vistaPrezzi.test.ts`, l'ordine canonico delle chiavi
  // indipendente dalla lingua); fix(preventivi) +1 (il nuovo
  // `salvataggioRiavvio.test.ts`, niente falso «modificato» dopo un riavvio).
  // Il commit Sonar (83762cb) non aggiunge né toglie test.
  // 1375 + 2 = 1377 totali; 1346 + 2 = 1348 passati; i 29 skipped non si muovono.
  //
  // +16 dal verdetto sulla #98 (N1-N4, O1), DERIVATI da 1377: fix(db) +2
  // (`schemaCorrezioni.test.ts`: N3 rollback eseguibile, N4 apostrofo);
  // fix(ui) +8 (`Toast.test.tsx` +6, N1; `contrasti.test.ts` +2, O1: la regola
  // sul testo vero e la coppia ink-tertiary su surface-secondary);
  // fix(preventivi) +6 (`salvataggioStradaA.test.ts` +5 e `usePrint.test.tsx`
  // +1, N2). Nessun test tolto. Sintetici: girano anche in CI.
  // 1377 + 16 = 1393 totali; 1348 + 16 = 1364 passati; i 29 skipped non si muovono.
  //
  // +55 dalla PR dell'import dell'anagrafica (L21, PR C), DERIVATI da 1393:
  // feat(db) +4 (`schemaMigrazioni.test.ts`: le quattro regole di ogni
  // migration, ora anche sulla 0006); test(db) +8 (il nuovo
  // `schemaImportAnagrafica.test.ts`); feat(import), lettura e confronto, +22
  // (il nuovo `anagraficaCsv.test.ts` 10, il nuovo
  // `confrontoAnagrafica.test.ts` 9, il nuovo `excelParser.worker.test.ts`
  // 2, `excelWorker.test.ts` +1); feat(import), pagina e scrittura, +21 (il
  // nuovo `importAnagrafica.test.ts` 12, il nuovo
  // `ImportaAnagrafica.test.tsx` 8, `AppShell.test.tsx` +1). Nessun test
  // tolto. Tutti sintetici, sul CSV finto di `src/test-utils/anagraficaFinta.ts`:
  // girano anche in CI. Misurato con le fixture parcheggiate.
  // 1393 + 55 = 1448 totali; 1364 + 55 = 1419 passati; i 29 skipped non si muovono.
  //
  // +16 dal verdetto del 15/10 sulla stessa PR (#99), DERIVATI da 1448:
  // fix(import) chiavi e lettura +6 (`confrontoAnagrafica.test.ts` +5: F1,
  // F2 due, F3, F4; `anagraficaCsv.test.ts` +1: F5); fix(import) scrittura ed
  // errori +8 (`importAnagrafica.test.ts` +7: DB-1 due, DB-2 cinque;
  // `ImportaAnagrafica.test.tsx` +1: l'import fermato nel report); fix(ui)
  // +1 (`confrontoAnagrafica.test.ts`: F6, `riassuntoScelte`; le asserzioni
  // di F3, F6 e F7 sulla pagina stanno in test che c'erano); chore(db) +1
  // (`schemaImportAnagrafica.test.ts`: DB-3). Il ritorno ai cicli in serie
  // (dopo a50b731) non aggiunge né toglie test. Nessun test tolto, tutti
  // sintetici. 1448 + 16 = 1464 totali; 1419 + 16 = 1435 passati; i 29 skipped
  // non si muovono.
  //
  // +1 da «Sigg.ri» fra i titoli (#99, richiesta di Marco), DERIVATO da 1464:
  // `confrontoAnagrafica.test.ts` +1. Sintetico. 1464 + 1 = 1465 totali;
  // 1435 + 1 = 1436 passati; i 29 skipped non si muovono.
  //
  // +15 dalla PR del titolo del PDF e delle porte (L23), DERIVATI da 1465:
  // fix(pdf) +14 (il nuovo `titoloPdf.test.ts` 11; `usePrint.test.tsx` +3:
  // primo «Genera» col numero appena assegnato e la spia della console,
  // annullato stampato, nuova revisione di un annullato); fix(porte) +1
  // (`PreventivoPrintPorteQta.test.tsx`: due test riscritti, «n.2» fuori dal
  // testo, e uno nuovo, la descrizione a mano con «n.2» resta). Nessun test
  // tolto, tutti sintetici: girano anche in CI. Misurato con le fixture
  // parcheggiate. 1465 + 15 = 1480 totali; 1436 + 15 = 1451 passati; i 29
  // skipped non si muovono.
  //
  // +16 dalla PR dei campi numerici e dei nomi dei listini (L24), DERIVATI da
  // 1480: fix(ui) +12 (il nuovo `CampoNumero.test.tsx`: Progetto a valore 4,
  // selezione al focus in quattro sezioni 5, rotella 2, presidio del punto
  // unico 1); fix(listini) +4 (`GestioneListini.test.tsx`: ETICHETTA,
  // riquadro, badge e referto, «Non caricare il file»); fix(pdf) +0 (l'e2e
  // `sfondo-pdf.spec.ts` non è in vitest). I test che leggevano i nomi vecchi
  // sono aggiornati, nessuno tolto. Tutti sintetici: girano anche in CI.
  // Misurato con le fixture parcheggiate. 1480 + 16 = 1496 totali;
  // 1451 + 16 = 1467 passati; i 29 skipped non si muovono.
  //
  // +22 dalla PR della quota spalmata e della profondità della cucina (L25),
  // DERIVATI da 1496: feat(pdf) +14 (`calcSuMisura.test.ts` +11: ripartisciQuota
  // 8 — proporzione, resti maggiori, ordine a resti uguali, righe a 0, riga
  // sola, quota 0, riga negativa, nessuna riga positiva — e prezzoUnitarioConQuota
  // 3; `PreventivoPrintArredi.test.tsx` +3: righe con la quota, «progettazione»
  // solo nella descrizione, PDF senza quota identico; il test a proprietà resta
  // un `it` solo, con l'invariante sulle tabelle degli articoli dentro I5);
  // feat(cucine) +8 (`calcCucina.test.ts` +4, `quoteCucine.test.ts` +2: setter
  // e blob senza il campo, `quoteHaDati.test.ts` +1 caso, `CucinePage.test.tsx`
  // +1). Nessun test tolto, tutti sintetici: girano anche in CI. Misurato con
  // le fixture parcheggiate. 1496 + 22 = 1518 totali; 1467 + 22 = 1489
  // passati; i 29 skipped non si muovono.
  //
  // +36 dalla PR «Password dimenticata?» e avviso di sessione scaduta (L26),
  // DERIVATI da 1518: feat(auth) «Password dimenticata?» +8 (il nuovo
  // `PasswordDimenticata.test.tsx`: redirectTo, stesso messaggio per 4 esiti,
  // 429, rete, attesa di 60 s); feat(auth) pagina nuova password +14 (il nuovo
  // `NuovaPassword.test.tsx`); feat(auth) avviso +6 (il nuovo
  // `SessioneScaduta.test.tsx`); fix(auth) PKCE +8 (il nuovo
  // `supabaseRecupero.test.ts` +4, col client vero e la fetch finta;
  // `NuovaPassword.test.tsx` +4: link forgiato, code che non diventa sessione,
  // errore nella query e code senza verifier; uno riscritto, nessuno tolto).
  // L'e2e `recupero-password.spec.ts` non è in vitest. Tutti sintetici: girano
  // anche in CI. Misurato con le fixture parcheggiate. 1518 + 36 = 1554
  // totali; 1489 + 36 = 1525 passati; i 29 skipped non si muovono.
  //
  // +6 dall'aggiunta di Marco sulla stessa PR (L26, testi della pagina di
  // accesso), DERIVATI da 1554: fix(auth) +6 (il nuovo `TestiAccesso.test.tsx`:
  // segnaposto e domini assenti in «Accedi» e «Registrati» 2, stesso avviso per
  // dominio fuori lista, account esistente e registrazione con conferma 3,
  // password corta uguale col dominio ammesso o no 1). Nessun test tolto;
  // `PasswordDimenticata.test.tsx` legge l'email dall'etichetta invece che dal
  // segnaposto, stesso numero. Sintetici: girano anche in CI. Misurato con le
  // fixture parcheggiate. 1554 + 6 = 1560 totali; 1525 + 6 = 1531 passati; i
  // 29 skipped non si muovono.
  //
  // +2 dalla terza aggiunta e dal test del logo (L26, stessa PR), DERIVATI da
  // 1560: fix(ui) +1 (il nuovo `CartaAccesso.test.tsx`: la card di accesso
  // senza `shadow-apple-xl`); test(email) +1 (il nuovo
  // `src/__tests__/logoEmail.test.ts`: `public/email/logo-coletta.png`
  // identico a `src/assets/brand/logo-coletta.png`, file entrambi versionati,
  // nessuna fixture). Nessun test tolto, girano anche in CI. Misurato con le
  // fixture parcheggiate. 1560 + 2 = 1562 totali; 1531 + 2 = 1533 passati; i
  // 29 skipped non si muovono.
  //
  // +5 dalla quarta aggiunta (L26, messaggi leggibili sul navy), DERIVATI da
  // 1562: fix(ui) +5 (`contrasti.test.ts` +2: success-su-navy ed
  // error-su-navy sul proprio riquadro della card di accesso;
  // `CartaAccesso.test.tsx` +3: riquadro d'errore e di successo coi token su
  // navy, nessun text-success/text-error in src/components/auth). Nessun test
  // tolto, girano anche in CI. Misurato con le fixture parcheggiate.
  // 1562 + 5 = 1567 totali; 1533 + 5 = 1538 passati; i 29 skipped non si
  // muovono.
  //
  // +73 dalla PR della password robusta (L29, con le due aggiunte), DERIVATI
  // da 1567: feat(auth) regola +41 (il nuovo `regolaPassword.test.ts` +40;
  // `TestiAccesso.test.tsx` +1, solo lettere); feat(ui) barra +12 (il nuovo
  // `IndicatorePassword.test.tsx` +8; `contrasti.test.ts` +4, i quattro
  // colori della barra); fix(auth) registrazione +14 (il nuovo
  // `Registrazione.test.tsx`: 8 errori, signUp che rigetta, spinner, 60 s per
  // i tre esiti neutri, nessuna attesa dopo signup_disabled); feat(auth)
  // template +6 (il nuovo `templateEmail.test.ts`: logo e variabili dei tre
  // template). Nessun test tolto. L'e2e `registrazione.spec.ts` non è in
  // vitest. Sintetici: girano anche in CI. Misurato con le fixture
  // parcheggiate. 1567 + 73 = 1640 totali; 1538 + 73 = 1611 passati; i 29
  // skipped non si muovono.
  numTotalTests: 1640,
  numPassedTests: 1611,
  numFailedTests: 0,
  /** Le suite golden senza fixture. Vedi il commento sopra prima di cambiarlo. */
  numPendingTests: 29,
}

const REPORT = process.argv[2] ?? 'vitest-report.json'

let report
try {
  report = JSON.parse(readFileSync(REPORT, 'utf8'))
} catch (e) {
  console.error(`Impossibile leggere il report vitest da "${REPORT}": ${e.message}`)
  process.exit(1)
}

const scarti = Object.entries(ATTESO)
  .filter(([campo, atteso]) => report[campo] !== atteso)
  .map(([campo, atteso]) => `  ${campo}: atteso ${atteso}, ottenuto ${report[campo]}`)

if (scarti.length > 0) {
  console.error('Conteggio test diverso dall atteso su clone pulito:\n' + scarti.join('\n'))
  console.error(
    '\nSe hai aggiunto o tolto test, aggiorna ATTESO in questo file — DERIVANDO il numero\n' +
      '(baseline + quelli che aggiungi), non copiando quello che stampa la CI.\n' +
      'Se `numPendingTests` e sceso a 0, controlla che nessuno abbia committato\n' +
      'le fixture: sono i listini prezzi reali del cliente.'
  )
  process.exit(1)
}

console.log(
  `Conteggio come atteso: ${report.numPassedTests} passed, ${report.numFailedTests} failed, ` +
    `${report.numPendingTests} skipped (suite golden senza fixture), ${report.numTotalTests} totali.`
)
