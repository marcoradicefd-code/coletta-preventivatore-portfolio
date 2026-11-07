/**
 * Tetto sulla somma delle dimensioni decompresse dichiarate di un listino
 * (O60). Il listino più grosso oggi sta sotto i 4 MB decompressi: 32 MiB è un
 * margine di 9 volte. Un file onesto più grosso costa secondi e gigabyte nel
 * worker, prima che il timeout possa fermarlo.
 */
export const MAX_DECOMPRESSO_BYTE = 32 * 1024 * 1024

const FIRMA_FINE_DIRECTORY = 0x06054b50
/** Byte della fine directory che servono: fino all'offset della directory (+16, 4 byte). */
const LETTI_FINE_DIRECTORY = 20
const LUNGHEZZA_VOCE_DIRECTORY = 46

/**
 * Dimensione che il listino occuperà una volta decompresso, letta dalla sola
 * central directory dello zip: nessuna decompressione, nessun `XLSX.read`, per
 * questo può girare sul main thread.
 *
 * Legge la stessa directory che legge `xlsx` 0.20.3 (`parse_zip`, con gli
 * stessi offset): firma di fine directory cercata a ritroso da `length - 4`, la
 * prima trovata; numero di voci da `fine + 8` (le voci su questo disco, non il
 * totale di `fine + 10`) e offset della directory da `fine + 16`; poi voce per
 * voce la dimensione decompressa dichiarata (+24). Una voce ZIP64
 * (`0xFFFFFFFF`) pesa 4 GiB e supera il tetto senza un ramo suo.
 *
 * Ritorna sempre un numero: per un buffer che non si legge come zip (`.xls` in
 * formato CFB, zip troncato, fine directory tagliata o directory fuori dal
 * buffer) vale la dimensione del file, e l'errore vero lo dà poi `XLSX.read`.
 *
 * Limite accettato: un archivio costruito per mentire nella directory passa.
 */
export function dimensioneDecompressa(buffer: ArrayBuffer): number {
  const byte = new Uint8Array(buffer)
  const vista = new DataView(buffer)
  const fileIntero = buffer.byteLength

  // Come `xlsx`: è uno zip se comincia con «PK».
  if (byte[0] !== 0x50 || byte[1] !== 0x4b) return fileIntero

  let fine = fileIntero - 4
  while (fine >= 0 && vista.getUint32(fine, true) !== FIRMA_FINE_DIRECTORY) fine--
  // Firma assente, o trovata così vicina alla fine che i campi non ci stanno.
  if (fine < 0 || fine + LETTI_FINE_DIRECTORY > fileIntero) return fileIntero

  const voci = vista.getUint16(fine + 8, true)
  let pos = vista.getUint32(fine + 16, true)
  let somma = 0
  for (let i = 0; i < voci; i++) {
    if (pos + LUNGHEZZA_VOCE_DIRECTORY > fileIntero) return fileIntero
    somma += vista.getUint32(pos + 24, true)
    pos +=
      LUNGHEZZA_VOCE_DIRECTORY +
      vista.getUint16(pos + 28, true) +
      vista.getUint16(pos + 30, true) +
      vista.getUint16(pos + 32, true)
  }
  return somma
}
