# Come aggiornare un listino — Guida per Antonio

*Preventivatore Coletta — ultima revisione: ottobre 2026*

## Per caricare un listino nuovo

1. Salva il file in formato **.xlsx** (Excel normale) o **.xls**.
   Non usare .ods (LibreOffice): non viene accettato.
2. **Il nome del file decide dove va:**
   - contiene la parola **MARMERIA** → listino gres/marmo
   - contiene la parola **PORTE** → listino porte
   - contiene la parola **CUCINA** (o **CUCINE**) → listino cucine: i
     prezzi delle voci della cucina, la tariffa dei giorni extra e il
     prezzo della vasca in gres
   - qualunque altro nome → listino **arredi su misura**

   Per questo: **mai caricare file di prova o altri Excel**. Un Excel
   che non ha la struttura del listino (una tabella colori, un elenco
   laminati) viene **rifiutato** prima di entrare in archivio; ma uno
   che ce l'ha, anche se è una prova, verrebbe preso per il listino arredi.

   Se il nome contiene **più di una** di queste parole (es. "listino porte e
   marmeria.xlsx") vince la prima di questo ordine: **PORTE**, poi
   **MARMERIA**, poi **CUCINA**. L'app te lo dice prima di caricare: se
   volevi l'altro listino, rinomina il file togliendo la parola di troppo.
3. Non serve cancellare il listino vecchio: **vale sempre l'ultimo
   caricato** di ogni tipo. Il vecchio resta in archivio come "Non attivo".
4. Vai su **Gestione Listini** nell'app e trascina il file.
5. **Per il listino arredi su misura** ti verrà mostrato l'elenco dei
   fogli trovati nel file: **togli la spunta a quelli che NON sono
   listino** (prove, preventivi compilati, appunti), poi conferma.
   Solo i fogli spuntati diventano listino.
6. **Dopo il caricamento, guarda il riepilogo** — il riquadro
   *"Cosa è caricato in memoria"*: dice quali fogli sono entrati e quante
   voci ha letto per ciascuno (per il gres: materiali, lavorazioni bordo,
   lavorazioni varie e scaglioni di rilievo e montaggio; per le cucine:
   voci con prezzo, vasca, tariffa giorni extra). Per le cucine sotto
   compaiono anche gli **avvisi**, che non bloccano il caricamento: righe
   del file che l'app non conosce (non si useranno), voci dell'app che
   mancano nel file (resteranno "da definire"), percentuali diverse da
   quelle dell'app (l'app usa le sue).
7. **Chi ha l'app già aperta deve ricaricare la pagina (F5)** per vedere
   i prezzi nuovi. Nessun avviso automatico: dopo un aggiornamento,
   avvisa tu chi sta lavorando.

## Arredi su misura: la tabella FINITURE (tipo × interno × esterno)

Nel listino arredi il foglio **FINITURE** dà il prezzo al metro quadro (o
al metro lineare, per le mensole) di ogni combinazione: un **tipo di
arredo**, un **interno** e un **esterno**. Nella pagina Arredi, con
**"Nuovo elemento da matrice"**, si sceglie il tipo, poi l'interno, poi
l'esterno, e il prezzo si mette da solo.

**Per aggiungere una combinazione** aggiungi una riga al foglio FINITURE,
sotto le altre, e compila:

| Colonna | Cosa scrivere |
|---|---|
| **TIPO ARREDO** | il tipo, scritto **uguale** alle righe dello stesso tipo (es. *ARMADIO/MOBILE CON ANTE*) |
| **INTERNO** | la finitura interna; **vuota** se il prezzo vale per qualsiasi interno (telai, mensole, boiserie) |
| **ESTERNO** | la finitura esterna (sempre) |
| **PREZZO** | un numero maggiore di zero, senza "€" |
| **U.MISURA** | **MQ**, **ML** o **PEZZO** |

Poi ricarica il file da **Gestione Listini**, con FINITURE e ACCESSORI
spuntati, e guarda il riepilogo: dice *"FINITURE, combinazioni lette: N"*
e quante per ogni tipo. La combinazione nuova deve far crescere il numero
di una.

Cosa controlla l'app:

- **Una riga senza tipo o senza esterno** non è una combinazione: diventa
  una voce normale del foglio (così sono le lavorazioni millerighi e la
  quota progettazione).
- **La stessa combinazione due volte** (stesso tipo, interno ed esterno),
  un prezzo che non è un numero maggiore di zero o un'unità diversa da
  MQ, ML, PEZZO: il file viene **rifiutato** e il messaggio dice la cella
  (es. *"FINITURE!A12: combinazione doppia, è già in FINITURE!A9"*). Il
  listino in uso resta quello di prima.
- **Due modi di scrivere la stessa finitura** (es. *ABET-LAMICOLOR* e
  *ABET – LAMICOLOR*): l'app li legge come una sola e lo dice fra gli
  avvisi, senza bloccare. Meglio scriverle uguali.
- **Non rinominare le intestazioni** della riga TIPO ARREDO / INTERNO /
  ESTERNO / PREZZO / U.MISURA: senza, il foglio non si riconosce.

I preventivi già fatti **non cambiano** quando carichi un listino nuovo:
ogni elemento tiene il prezzo del momento in cui l'hai aggiunto.

La riga sotto il titolo del foglio (le regole: minimo 3 mq, profondità
sotto 40 cm −10%) compare nel riepilogo di Gestione Listini. Le regole
le applica l'app: +20% sotto 3 mq, +15% oltre 65 cm, −10% sotto 40 cm
(le ultime due non insieme).

## Da non fare mai (rompe il caricamento o sbaglia i prezzi)

- **Non rinominare i fogli** dentro il file marmeria o porte. Devono
  chiamarsi esattamente come nel listino precedente.
- **Non spostare o riordinare le colonne** rispetto al listino precedente.
  Per il listino gres l'app ora controlla le intestazioni delle colonne
  che legge: se una colonna è spostata o ne è stata aggiunta una, il file
  viene **rifiutato** e il messaggio dice quale colonna (es. *"Foglio
  GAMMA_COLORI, colonna T: intestazione attesa …, trovata …"*). Il
  listino in uso resta quello di prima. Serve un aggiornamento dell'app:
  chiama Marco.
- **Non rinominare i modelli** nel listino porte. I preventivi già fatti
  tengono il prezzo che avevi promesso al cliente — l'app lo congela nel
  momento in cui aggiungi la porta — ma il modello col nome vecchio
  sparisce dall'elenco, e per i preventivi nuovi non lo trovi più.
- Nel listino porte la colonna dei prezzi deve chiamarsi **PREZZO**
  seguito dall'anno — es. **PREZZO 2027**. Se il file ne contiene più
  d'una (perché tieni sia il vecchio sia il nuovo), vale quella con
  l'anno più recente. Il listino nuovo si carica da solo, senza
  aggiornamenti dell'app.
- **Listino cucine: il nome del file deve contenere "cucina".** Senza,
  l'app lo prende per un listino arredi e lo rifiuta con il messaggio
  *"…sembra il listino cucine, non un listino Su Misura. Rinominalo con
  «cucina» nel nome e ricaricalo."*
- **Listino cucine: non cambiare l'unità di una voce** (colonna C: pezzo,
  ml, mq, anta, coppia). Con un'unità diversa lo stesso numero vorrebbe
  dire un altro prezzo, quindi il file viene **rifiutato** e il messaggio
  dice la cella. Il listino in uso resta quello di prima.
- **Listino cucine: non rinominare le voci** (colonna A). Una voce col nome
  nuovo l'app non la riconosce: compare fra gli avvisi, e la voce col nome
  vecchio resta "da definire" nei preventivi. Serve un aggiornamento
  dell'app: chiama Marco.
- Non rinominare un file qualunque in ".xlsx": l'app controlla il
  contenuto vero del file e lo rifiuta.
- File massimo 10 MB.

## Quantità: limiti per riga

Nel gres ogni riga ha un **massimo**: **20 mq** per top, schienali e
fianchi, **50 ml** per alzatine e lavorazioni bordo, **50 pezzi** per le
lavorazioni varie. Se scrivi di più, il campo si ferma al massimo e sotto
compare: *"Massimo 20 mq per riga: aggiungi una riga per quantità
maggiori"*. Il prezzo è calcolato sul numero che vedi nel campo.
Il massimo è per riga, non per preventivo: per un lavoro più grande
aggiungi un'altra riga dello stesso materiale.

## Se qualcosa va storto

- Se il file viene **rifiutato al caricamento**, il motivo resta scritto
  nella pagina finché non lo chiudi: leggi il messaggio. Un file
  rifiutato **non entra in archivio**: il listino in uso resta quello di
  prima, per tutti.
- Se nella Gestione Listini un file è segnato **"Non caricato"** (in
  rosso), è quello che l'app ha provato a usare senza riuscirci: carica
  un listino buono. Finché resta così **non eliminare gli altri file**
  di quel tipo: uno di loro potrebbe essere quello buono.
- Se dopo un caricamento una sezione dell'app segnala un **errore sul
  listino**, l'avviso resta a schermo finché il problema non è risolto:
  di solito basta ricaricare il file giusto.
- Se in un preventivo una porta mostra **"prezzo da definire"** invece di
  una cifra, vuol dire che il suo modello non è più nel listino e l'app
  non sa più quanto costava: quella riga **non viene contata nel totale**,
  e il totale si dichiara *parziale*. Rimetti il prezzo a mano prima di
  mandare il preventivo, o chiama Marco.
- Se il **listino gres non è caricato** e il preventivo ha righe di gres,
  il pulsante **Genera Preventivo** resta spento e dice perché: ricarica
  il listino (o svuota la sezione Gres) prima di stampare. Il PDF non
  toglie mai il gres in silenzio: se manca il prezzo, scrive "da
  definire" e il totale finale diventa **TOTALE PARZIALE**.
- Se il **listino cucine non è caricato**, la pagina Cucine dice *"Listino
  Cucine non caricato"* al posto delle voci; se il preventivo ha già una
  cucina, il pulsante **Genera Preventivo** resta spento e dice perché, e
  la casella della **vasca in gres** è disattivata (una vasca già inclusa
  resta col suo prezzo). Ricarica il listino cucine.
- Se in un preventivo una voce della cucina compare fra le **"Voci senza
  prezzo nel listino caricato"** o le **"Voci non più a catalogo"**, non
  viene contata nel totale, che si dichiara *parziale*: toglila o chiama
  Marco.
- Un **battiscopa del vecchio formato** (salvato prima di ottobre, quando
  si scriveva la lunghezza in cm) compare come *"da completare"* ed è
  fuori dal totale: scrivi **altezza** e **metri lineari** e la riga
  torna a contare. Il prezzo ora è altezza × €/cm = €/ml, per i metri.

## La regola d'oro

**Dopo ogni caricamento, apri un preventivo di prova e controlla 2-3
prezzi che conosci a memoria.** E guarda il riepilogo: se il numero di
fogli o di voci è molto diverso dall'ultima volta (es. "3 voci" dove
erano 51), il file ha qualcosa che non va — non usare l'app e chiama
Marco.
