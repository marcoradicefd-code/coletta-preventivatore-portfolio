import { categorizzaListino, ETICHETTA } from '@/store/pricelistStore'

/**
 * Nome file sicuro per lo Storage.
 *
 * `upload(path, file)` tratta il primo argomento come **path**, non come
 * etichetta: un separatore o un `..` scriverebbero il file fuori dalla cartella
 * attesa, dove `fetchFiles`/`loadDefaults` non lo troverebbero più. I browser
 * passano già il solo basename in `file.name` — questa è una rete di sicurezza
 * (finding Aikido), non la toppa a un bug osservato.
 *
 * Allowlist: lettere (accenti inclusi), numeri, spazi, `-`, `_`, `.`, `()` e
 * apostrofi (dritto e tipografico). Tutto il resto cade, **caratteri di
 * controllo compresi** — non sono né lettere né numeri, quindi l'allowlist li
 * copre senza una regola dedicata.
 *
 * Il criterio è: la più LARGA possibile senza separatori di path, non la più
 * stretta possibile. Parentesi e apostrofi non contano nulla per il traversal
 * né per la categorizzazione, e sono frequenti nei nomi veri — `D'Amico`, e i
 * download del browser tipo `Listino (1).xlsx`. Mutilarli sarebbe un costo
 * senza contropartita di sicurezza. L'apostrofo tipografico `'` è incluso col
 * dritto perché macOS lo sostituisce da solo (stesso problema già a verbale in
 * `parsePorte`, per "UNITA' DI MISURA").
 *
 * Due invarianti che il resto del sistema dà per buone:
 * - L'estensione sopravvive sempre (`.`, `x`, `l`, `s` sono tutti allowlisted),
 *   quindi un nome che passa `VALID_EXT` prima della sanitizzazione lo passa
 *   anche dopo.
 * - Le parole `porte`/`marmeria`/`cucina` sopravvivono sempre → la categorizzazione a
 *   valle, che legge il nome MEMORIZZATO (cioè questo), resta quella promessa
 *   dal banner. Un segmento di path NON può contrabbandare una categoria:
 *   `../porte/listino.xlsx` diventa `listino.xlsx` → Su misura, non Porte.
 */
export function sanitizeNomeFile(nome: string): string {
  const base = nome.split(/[/\\]/).pop() ?? '' // via i segmenti di path, `..` inclusi
  return base
    .replace(/[^\p{L}\p{N} ._()'’-]/gu, '')
    .replace(/\.{2,}/g, '.') // `..` residui senza separatore: inerti, ma normalizzati
    .trim()
}

/** Le parole-categoria, nell'ordine in cui `categorizzaListino` le controlla. */
const PAROLE_CATEGORIA: ReadonlyArray<readonly [RegExp, string]> = [
  [/porte/i, 'porte'],
  [/marmeria/i, 'marmeria'],
  [/cucin/i, 'cucina'],
]

/**
 * E10 — un nome che contiene PIÙ di una parola-categoria.
 *
 * `categorizzaListino` controlla `porte`, poi `marmeria`, poi `cucin`, quindi
 * "listino porte e marmeria.xlsx" finisce in Porte. Non è un bug: è un ordine, e
 * un ordine deve pur esserci. Il problema è che finora accadeva in SILENZIO —
 * Antonio caricava il listino della marmeria e lo vedeva sparire nelle porte
 * senza che niente glielo dicesse.
 *
 * Non blocca: dice. Il nome è suo, la scelta è sua.
 */
export function avvisoCollisioneCategoria(nomeFile: string): string | null {
  const presenti = PAROLE_CATEGORIA.filter(([re]) => re.test(nomeFile)).map(([, parola]) => `"${parola}"`)
  if (presenti.length < 2) return null
  const vince = ETICHETTA[categorizzaListino(nomeFile)]
  const elenco =
    presenti.length === 2
      ? `sia ${presenti[0]} sia ${presenti[1]}`
      : `${presenti.slice(0, -1).join(', ')} e ${presenti.at(-1)}`
  return (
    `"${nomeFile}" contiene ${elenco}: verrà caricato come ${vince}. ` +
    `Se volevi un'altra categoria, rinomina il file togliendo le parole di troppo.`
  )
}
