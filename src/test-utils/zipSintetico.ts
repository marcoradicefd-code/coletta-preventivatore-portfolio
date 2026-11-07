import * as XLSX from 'xlsx'

/**
 * Zip sintetici per il tetto sulla dimensione decompressa (O60). Nessun MB
 * reale: si scrivono a mano i 4 byte «dimensione decompressa» delle voci della
 * central directory, e si prova il controllo, non la memoria.
 */

/** Un xlsx vero e minimo (una cella), scritto da `xlsx`: qualche KB. */
export function xlsxMinimo(): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'S')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

/** Posizione della firma di fine directory (`PK 05 06`), cercata dal fondo. */
export function posizioneFineDirectory(buffer: ArrayBuffer): number {
  const vista = new DataView(buffer)
  for (let i = buffer.byteLength - 22; i >= 0; i--) {
    if (vista.getUint32(i, true) === 0x06054b50) return i
  }
  throw new Error('firma di fine directory assente')
}

/** Posizioni delle voci della central directory (firma `PK 01 02`). */
export function vociDirectory(buffer: ArrayBuffer): number[] {
  const vista = new DataView(buffer)
  const fine = posizioneFineDirectory(buffer)
  const voci: number[] = []
  let pos = vista.getUint32(fine + 16, true)
  for (let i = 0; i < vista.getUint16(fine + 10, true); i++) {
    if (vista.getUint32(pos, true) !== 0x02014b50) throw new Error(`voce ${i} senza firma`)
    voci.push(pos)
    pos += 46 + vista.getUint16(pos + 28, true) + vista.getUint16(pos + 30, true) + vista.getUint16(pos + 32, true)
  }
  return voci
}

/** Copia dello zip con la dimensione decompressa dichiarata riscritta per le prime voci. */
export function dichiaraDimensioni(buffer: ArrayBuffer, dimensioni: readonly number[]): ArrayBuffer {
  const copia = buffer.slice(0)
  const vista = new DataView(copia)
  vociDirectory(copia)
    .slice(0, dimensioni.length)
    .forEach((pos, i) => vista.setUint32(pos + 24, dimensioni[i], true))
  return copia
}
