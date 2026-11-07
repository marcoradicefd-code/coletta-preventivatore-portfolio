/**
 * Condizioni contrattuali Coletta Ebanisteria.
 *
 * Fonte: "CONDIZIONI CONTRATTUALI COLETTA.docx" fornito dal cliente (giugno 2026).
 * Testo riportato fedelmente all'originale. Le sezioni sono pensate per essere
 * renderizzate nel PDF del preventivo (titolo + paragrafi).
 *
 * NOTA: trattandosi di testo contrattuale, NON modificare il contenuto senza
 * conferma esplicita del cliente. Eventuali refusi presenti nell'originale sono
 * stati mantenuti (vedere CHANGELOG/PR per l'elenco segnalato).
 */

export interface SezioneCondizioni {
  /** Titolo della sezione (es. "DURATA E REALIZZAZIONE DELL'OPERA"). */
  titolo: string;
  /** Paragrafi di testo della sezione, in ordine. */
  paragrafi: string[];
}

export const CONDIZIONI_CONTRATTUALI: readonly SezioneCondizioni[] = [
  {
    titolo: "DURATA E REALIZZAZIONE DELL'OPERA",
    paragrafi: [
      "I lavori inizieranno, previa sottoscrizione del preventivo indicato in oggetto e dei disegni progettuali, il giorno successivo al versamento dell'acconto, e presumibilmente termineranno il ………........ con la consegna dell'opera. Tale termine potrebbe slittare in caso di richieste di modifiche in corso d'opera. Tali modifiche potranno essere computate a discrezione dell'azienda produttrice. Inoltre ogni correzione e/o integrazione dovrà essere sottoscritta dal committente. Nel caso fossero necessari chiarimenti e modifiche vi invitiamo a contattare gli architetti/progettisti di riferimento. Qualora la data di inizio e fine dei lavori non venga rispettata dal Prestatore per causa ad esso non imputabile, questi non potrà essere considerato inadempiente verso la Committenza. Si considera causa non imputabile la difficoltà di reperimento e/o il ritardo nella consegna da parte dei fornitori delle materie prime con le quali deve essere realizzata l'opera. Si considera causa non imputabile ad annullamento del contratto i ritardi dovuti a festività, periodi di chiusura forzata o voluta da parte dell'azienda per eventi intrinsechi ed estrinsechi all'attività aziendale. Le parti convengono espressamente che la ritardata consegna non può essere, comunque, causa di annullamento dell'ordine. In caso di mancata cooperazione del Committente trovano applicazione gli artt. 1206 ss c.c..",
    ],
  },
  {
    titolo: "VARIAZIONI E AGGIUNTE IN CORSO D'OPERA",
    paragrafi: [
      "Nel corso dell'esecuzione dei lavori il committente si impegna a comunicare entro dieci giorni, in maniera scritta, dalla data di realizzazione di ogni singola opera al prestatore gli ulteriori lavori che richiede.",
      "Il prestatore si impegna a fare altrettanto per i lavori imprevisti che si rendano necessari rispetto a quelli preventivati, come sopra riportati o come descritti e che siano necessari alla corretta esecuzione dell'opera, nonché il loro costo (IVA inclusa).",
      "Tali lavori aggiuntivi, o in variazione, ed i relativi maggiori costi, dovranno essere espressamente accettati per iscritto dalle parti con postilla sottoscritta in calce al presente accordo.",
      "Il prestatore d'opera è esonerato da interventi riguardanti opere elettriche e idrauliche se non espressamente previste nel preventivo.",
    ],
  },
  {
    titolo: "CONSEGNA E ACCETTAZIONE DELL'OPERA",
    paragrafi: [
      "Al momento della consegna dell'opera, la stessa si intende accettata attraverso la sottoscrizione del modello \u201cDICHIARAZIONE DI INSTALLAZIONE A REGOLA D'ARTE\u201d ove il committente non la contesti a mezzo di raccomandata a/r entro quindici giorni dalla consegna. L'accettazione dell'opera da parte del Committente libera il prestatore dalla responsabilità per difformità o vizi se questi erano noti al Committente o se dallo stesso potevano essere facilmente riconoscibili, purché non dolosamente occultati.",
      "Il Committente deve a pena di decadenza denunciare le difformità e i vizi al Prestatore entro otto giorni dalla scoperta con lettera raccomandata. Il Committente può chiedere, tranne che i vizi siano tali da compromettere integralmente l'utilizzo dell'opera, che i vizi e i difetti siano eliminati dal Prestatore, a sua cura e spese. Se però i vizi e le difformità dell'opera sono tali da renderla sia completamente inutilizzabile sia completamente inadatta alla sua destinazione, il Committente può chiedere la risoluzione del contratto. E' fatto salvo il diritto al risarcimento del danno. L'azione giudiziale si prescrive entro un anno dalla consegna.",
    ],
  },
  {
    titolo: "RECESSO DEL COMMITTENTE DAL CONTRATTO E DEL PRESTATORE D'OPERA",
    paragrafi: [
      "In caso di recesso dal contratto (a lavoro non ancora iniziato), nell'ipotesi di progettazione eseguita nella ns sede con i ns architetti, sarà dovuto il 10% dell'intero importo quale corrispettivo per la progettazione, la consulenza tecnica e la preventivazione del lavoro stesso. Il Committente può recedere dal contratto con lettera raccomandata ancorché sia iniziata l'esecuzione dell'opera, dovendo però corrispondere al prestatore le spese sostenute, quanto dovuto per il lavoro fintanto eseguito, oltre ad una penale pari al 20% del corrispettivo previsto per il lavoro non eseguito.",
      "Il Prestatore d'opera può recedere dal contratto mediante lettera raccomandata da inviare almeno 20 giorni prima della data in cui il recesso deve avere esecuzione. In tal caso il Prestatore d'opera dovrà restituire l'anticipo eventualmente ricevuto e pagare una penale pari al 20% del corrispettivo previsto per il lavoro non eseguito.",
    ],
  },
  {
    titolo: "FINITURE E MATERIALI",
    paragrafi: [
      "Trattandosi di materiali naturali e/o comunque materiali compositi le cui formulazioni potrebbero essere variate nel corso del tempo, senza alcun preavviso da parte delle aziende fornitrici, le finiture potrebbero essere difformi a causa della materia prima o del prodotto verniciante. E' compito del prestatore d'opera mostrare al committente campionatura della finitura scelta, richiedendo espressa accettazione prima di procedere a finitura del manufatto.",
    ],
  },
  {
    titolo: "OPERE NON PREVISTE DAL CONTRATTO DI FINITURA E POSA",
    paragrafi: [
      "Non sono previste, salvo se espresso nel preventivo di vendita:",
      "- opere murarie quali demolizioni di pareti, rettifiche di intonaco, pitturazioni, ecc",
      "- opere elettriche: collegamenti di impianti elettrici, installazioni di dispositivi elettronici; collegamenti di apparecchi illuminanti;",
      "- opere idrauliche: collegamento di cappa e relativo tubo di espulsione (nemmeno la fornitura dello stesso); installazione di miscelatore e scarichi, installazione e collaudo di piano cottura (gas o induzione), installazione di lavastoviglie, asciugatrice, lavasciuga e similari.",
      "- elettrodomestici e accessori vari",
      "- opere accessorie ovvero quelle spettanti ad altre maestranze. Si intendono accessorie le sigillature dovute ad irregolarità evidenti dei muri o della pavimentazione. Il costo per tale intervento è di \u20ac 1,50+iva al ml. Nel caso di sigillatura sopra e sotto il battiscopa il costo è da considerarsi doppio (\u20ac 3+iva). Sono invece compresi i riempimenti con sigillante solo nel caso delle mostrine delle porte se di modeste entità (4/5mm) o listelli di tamponamento nel caso di rivestimenti bassi.",
      "- Non sono previste, anche nel caso in cui gli apparecchi/accessori (elettrodomestici, miscelatori, lavelli, corpi illuminanti) vengano forniti dalla nostra azienda al committente, il fissaggio su piani (top) o supporti non espressamenti inclusi nel suddetto contratto di fornitura. L'installazione degli stessi spetta dunque all'esecutore e/o posatore dell'opera (top cucina, top bagno, parete o soffitto in cartongesso). Nel caso gli elettrodomestici o gli accessori vengano acquistati dal committente, la nostra azienda si riserva la facoltà di porli in opera. Tale accordo va definito in fase di sottoscrizione del contratto e può essere soggetto a corrispettivo.",
    ],
  },
  {
    titolo: "PREVENTIVO-CAPITOLATO",
    paragrafi: [
      "Le parti allegano alla presente, che costituisce parte integrante del contratto:",
      "1) Un disegno/schema",
      "2) Una fotografia/immagine che riproduce verosimilmente come dovrà essere realizzato/a",
      "3) Preventivo n……..",
      "4) Altro……………………………………..",
    ],
  },
  {
    titolo: "ALTRE",
    paragrafi: [
      "Con la presente proposta/offerta la sottoscritta ditta/società dichiara di non essere disponibile ad applicare la nuova e aggiuntiva modalità di fruizione delle agevolazioni fiscali introdotta dall'art. 10 del Decreto Legge n. 34 del 30 aprile 2019 rubricato \u201cModifiche alla disciplina degli incentivi per gli interventi di efficienza energetica e di rischio sismico\u201d, convertito nella Legge 28 giugno 2019 n. 58, consistente nel riconoscimento - in favore dei beneficiari - di uno sconto immediato, in misura corrispondente alla detrazione fiscale, sul corrispettivo ad essa dovuto. Pertanto, il cliente dichiara di essere perfettamente consapevole che con l'accettazione della presente proposta/offerta non potrà esercitare tale facoltà di opzione nei confronti della sottoscritta ditta/società, e potrà avvalersi esclusivamente dell'utilizzo diretto delle detrazioni fiscali, qualora ne abbia diritto.",
      "Per quanto non previsto nel presente accordo si fa riferimento alle norme contenute nel Codice Civile in tema di appalto e contratto d'opera (foro competente BARI).",
      "Con la sottoscrizione del presente documento s'intende accettato il preventivo come conferma d'ordine e le condizioni contrattuali sopra citate.",
    ],
  },
];

/**
 * Etichette del blocco firma da mostrare in coda alle condizioni nel PDF.
 * Sono volutamente separate dal corpo testuale perché vanno renderizzate
 * come righe per la firma (con spazio sottostante), non come paragrafi.
 */
export const CONDIZIONI_FIRMA = {
  perAccettazione: "PER ACCETTAZIONE (DATA E FIRMA)",
  ilCommittente: "IL COMMITTENTE",
} as const;
