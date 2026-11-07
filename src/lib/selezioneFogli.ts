/**
 * ── SELEZIONE FOGLI: il sidecar ──
 *
 * `parseSuMisura` legge OGNI foglio del workbook, senza filtro sul nome (E14):
 * un foglio di lavoro lasciato nel file — un preventivo, una simulazione — ha la
 * stessa forma di un listino e le sue righe si mescolano ai prezzi veri.
 *
 * Non è risolvibile per euristica: il listino su misura REALE è esso stesso un
 * prospetto compilato (titolo "PROSPETTO CUCINA CALCOLATO", 7 righe con quantità
 * e totali valorizzati). Qualsiasi segnale "sembra un preventivo" lo scarterebbe.
 * Quindi la scelta la fa Antonio, all'upload, una volta per file.
 *
 * ── PERCHÉ UN SIDECAR ──
 *
 * La scelta deve sopravvivere ai mount successivi: `loadDefaults` ri-parsa il
 * file dal bucket a ogni avvio, e lì non c'è nessuno da interrogare. Quindi non
 * può essere effimera.
 *
 * Scartate: i custom metadata dell'oggetto (l'SDK li scrive ma `list()` non li
 * rende, servirebbe un `info()` per file e un cast sul dato più delicato) e la
 * riscrittura dell'.xlsx (il bucket deve restare bit-per-bit ciò che è stato
 * caricato). Resta il sidecar, che si legge con lo stesso `download()` del file.
 *
 * ── COME NON DIVERGE ──
 *
 * Sono due upload, quindi la divergenza è possibile e va gestita, non negata:
 *   1. si scrive PRIMA il sidecar, POI il file → una scelta orfana è inerte;
 *   2. il sidecar porta nome + dimensione del file a cui si riferisce, e chi
 *      legge VERIFICA che tornino → un sidecar stantio viene ignorato;
 *   3. in ogni caso di dubbio si degrada al comportamento di ieri: tutti i fogli,
 *      più una riga di referto che lo dice. Il peggio ammesso è "come prima",
 *      mai "listino assente".
 */

export const SIDECAR_SUFFISSO = '.meta.json'

/**
 * ── GLI AVVISI DI UNA SELEZIONE CHE NON SI APPLICA (O9) ──
 *
 * Degradare a "tutti i fogli" è la scelta giusta (il sidecar è un accessorio),
 * ma tacerla no: un foglio di lavoro dentro i prezzi è una scheda di Su Misura
 * come le altre, e chi sceglie una sua voce porta quel prezzo nel preventivo.
 * Il testo è per CHI COMPILA il preventivo, che non può correggere: lo dice a
 * chi può. I dettagli tecnici per l'amministratore stanno nelle `note` del
 * referto, non qui.
 */
export const AVVISO_SELEZIONE_NON_APPLICATA =
  "La scelta dei fogli non è stata applicata. Nei prezzi possono esserci anche fogli di lavoro. Avvisa l'amministratore: il listino va ricaricato da Gestione Listini."

/** Il caricamento locale (Sidebar, solo admin) non ha una scelta dei fogli: entrano tutti. */
export const AVVISO_CARICAMENTO_LOCALE =
  'Listino caricato a mano con tutti i fogli. Nei prezzi possono esserci fogli di lavoro. Per sceglierli, ricarica il file da Gestione Listini.'

/** `COLETTA_APR26.xlsx` → `COLETTA_APR26.xlsx.meta.json` */
export function nomeSidecar(nomeFile: string): string {
  return `${nomeFile}${SIDECAR_SUFFISSO}`
}

/** Un sidecar non è un listino: non deve mai finire nel listing dei listini. */
export function isSidecar(nome: string): boolean {
  return nome.endsWith(SIDECAR_SUFFISSO)
}

/**
 * Contenuto del sidecar. `v` c'è dal primo giorno: quando la forma cambierà, un
 * sidecar vecchio va riconosciuto e ignorato, non frainteso.
 */
export interface SelezioneFogli {
  v: 1
  /** Nomi dei fogli che Antonio ha marcato come listino. */
  fogli: string[]
  /** A quale file si riferisce. Serve a scoprire che è stantio, non a decorare. */
  file: {
    nome: string
    /** Dimensione in byte: fingerprint povero ma disponibile sia in upload
     *  (`File.size`) sia in lettura (`list()` → `metadata.size`), senza chiamate
     *  extra. Non è un hash: due file di pari dimensione lo ingannano. Il costo
     *  dell'inganno è "tutti i fogli come ieri", non un dato sbagliato. */
    size: number
  }
}

/**
 * Il corpo del sidecar, esattamente com'è caricato nel bucket.
 *
 * ── IL VINCOLO CHE NON VIVE QUI: L'ALLOWLIST MIME DEL BUCKET ──
 *
 * Il sidecar viaggia come `application/json` (`GestioneListini.tsx`, upload del
 * sidecar: Blob con `type` + `contentType`), quindi quel MIME **deve comparire in
 * `allowed_mime_types` del bucket `Listini`**. Non c'era: l'allowlist, scritta
 * da noi via SQL, ammetteva i soli due MIME Excel, e Storage rifiutava l'upload
 * con `mime type application/json is not supported`.
 *
 * È **configurazione server, NON coperta da nessun test locale**: la suite non
 * parla col bucket, quindi può essere tutta verde mentre questa riga è rotta.
 * Il conto si presenta al primo upload reale con selezione fogli — che è dove è
 * saltata fuori, il 31/07/2026.
 *
 * Ha retto l'ordine sidecar-PRIMA-del-file (punto 1 dell'intestazione): upload
 * fallito in testa, nessuno stato sporco nel bucket, listino precedente ancora
 * in uso. La sequenza era stata scelta per la divergenza tra i due file; ha
 * pagato su un errore che non c'entrava.
 */
export function serializzaSelezione(s: SelezioneFogli): string {
  return JSON.stringify(s, null, 2)
}

export type EsitoSelezione =
  | { stato: 'ok'; fogli: string[] }
  | { stato: 'assente' }
  | { stato: 'stantio'; motivo: string }
  | { stato: 'illeggibile'; motivo: string }

/**
 * Interpreta un sidecar scaricato. Non lancia mai: ogni forma imprevista è
 * `illeggibile`, che a valle degrada a "tutti i fogli".
 *
 * `sizeAttesa` è la dimensione del file COME RISULTA ORA dal bucket. Se non
 * combacia con quella registrata, il file è stato sostituito senza aggiornare la
 * scelta → stantio → si ignora.
 */
export function leggiSelezione(
  testo: string,
  nomeFileAttuale: string,
  sizeAttesa: number | undefined
): EsitoSelezione {
  let raw: unknown
  try {
    raw = JSON.parse(testo)
  } catch {
    return { stato: 'illeggibile', motivo: 'JSON non valido' }
  }

  if (typeof raw !== 'object' || raw === null) {
    return { stato: 'illeggibile', motivo: 'contenuto non riconosciuto' }
  }
  const s = raw as Partial<SelezioneFogli>

  if (s.v !== 1) {
    return { stato: 'illeggibile', motivo: `versione ${String(s.v)} non supportata` }
  }
  if (!Array.isArray(s.fogli) || s.fogli.some((f) => typeof f !== 'string')) {
    return { stato: 'illeggibile', motivo: 'elenco fogli non valido' }
  }
  // La UI vieta di salvare 0 fogli, ma un sidecar scritto a mano può averli. Un
  // elenco vuoto non sceglie niente e `esaminaListino` lo tratterebbe come "tutti
  // i fogli" senza dirlo: qui diventa una selezione non applicata, che si vede.
  if (s.fogli.length === 0) {
    return { stato: 'illeggibile', motivo: 'nessun foglio selezionato' }
  }
  if (!s.file || typeof s.file.nome !== 'string' || typeof s.file.size !== 'number') {
    return { stato: 'illeggibile', motivo: 'riferimento al file mancante' }
  }

  if (s.file.nome !== nomeFileAttuale) {
    return { stato: 'stantio', motivo: `si riferisce a "${s.file.nome}"` }
  }
  // `sizeAttesa` assente = il listing non l'ha data: non possiamo verificare,
  // quindi non ci fidiamo. Meglio "come ieri" che una scelta forse sbagliata.
  if (sizeAttesa === undefined) {
    return { stato: 'stantio', motivo: 'dimensione del file non verificabile' }
  }
  if (s.file.size !== sizeAttesa) {
    return {
      stato: 'stantio',
      motivo: `il file è cambiato dopo la selezione (${s.file.size} → ${sizeAttesa} byte)`,
    }
  }

  return { stato: 'ok', fogli: s.fogli }
}
