import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { dimensioneDecompressa, MAX_DECOMPRESSO_BYTE } from '@/lib/dimensioneZip'
import { dichiaraDimensioni, posizioneFineDirectory, vociDirectory, xlsxMinimo } from '@/test-utils/zipSintetico'

const MIB = 1024 * 1024

describe('dimensioneDecompressa', () => {
  it('un xlsx vero e piccolo pesa più di zero e meno del tetto', () => {
    const zip = xlsxMinimo()
    const dimensione = dimensioneDecompressa(zip)

    // Oracolo: i contenuti che `xlsx` decomprime davvero. `CFB.read` aggiunge
    // una voce sua (nome che comincia col carattere 1), che nello zip non c'è.
    const sentinella = String.fromCharCode(1)
    const voci: { type: number; name: string; content?: ArrayLike<number> }[] = XLSX.CFB.read(
      new Uint8Array(zip),
      { type: 'array' }
    ).FileIndex
    const contenuti = voci
      .filter((f) => f.type === 2 && !f.name.startsWith(sentinella))
      .reduce((somma, f) => somma + (f.content?.length ?? 0), 0)

    expect(dimensione).toBeGreaterThan(0)
    expect(dimensione).toBeLessThan(MAX_DECOMPRESSO_BYTE)
    expect(dimensione).toBe(contenuti)
  })

  it('somma le dimensioni di tutte le voci: due voci da 20 MiB superano il tetto anche se ciascuna lo rispetta', () => {
    const zip = xlsxMinimo()
    const gonfio = dichiaraDimensioni(zip, [20 * MIB, 20 * MIB])

    expect(20 * MIB).toBeLessThan(MAX_DECOMPRESSO_BYTE)
    expect(dimensioneDecompressa(gonfio)).toBeGreaterThan(MAX_DECOMPRESSO_BYTE)
  })

  it('un buffer che non è zip leggibile pesa quanto il file', () => {
    // .xls: formato CFB, firma D0 CF 11 E0.
    const xls = new Uint8Array(4096)
    xls.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    expect(dimensioneDecompressa(xls.buffer)).toBe(4096)

    // Zip troncato prima della central directory: nessuna firma di fine directory.
    const zip = xlsxMinimo()
    const troncato = zip.slice(0, vociDirectory(zip)[0])
    expect(dimensioneDecompressa(troncato)).toBe(troncato.byteLength)

    // Firma presente, ma la directory dichiarata cade fuori dal buffer.
    const fuori = zip.slice(0)
    new DataView(fuori).setUint32(posizioneFineDirectory(fuori) + 16, fuori.byteLength, true)
    expect(dimensioneDecompressa(fuori)).toBe(fuori.byteLength)
  })

  it('legge la directory come xlsx: voci su questo disco da fine+8, firma cercata da length-4', () => {
    const zip = xlsxMinimo()
    const [prima] = vociDirectory(zip)
    const dimensionePrima = new DataView(zip).getUint32(prima + 24, true)

    // La seconda voce dichiara 40 MiB, ma la fine directory dice «1 voce su
    // questo disco» (+8) e lascia il totale (+10) com'è: xlsx legge solo la prima.
    const gonfio = dichiaraDimensioni(zip, [dimensionePrima, 40 * MIB])
    const vista = new DataView(gonfio)
    const fine = posizioneFineDirectory(gonfio)
    vista.setUint16(fine + 8, 1, true)
    expect(vista.getUint16(fine + 10, true)).toBeGreaterThan(1)

    const sentinella = String.fromCharCode(1)
    const vistiDaXlsx = XLSX.CFB.read(new Uint8Array(gonfio), { type: 'array' }).FileIndex.filter(
      (f: { type: number; name: string }) => f.type === 2 && !f.name.startsWith(sentinella)
    )
    expect(vistiDaXlsx).toHaveLength(1)
    expect(dimensioneDecompressa(gonfio)).toBe(dimensionePrima)

    // Una firma di fine directory negli ultimi 4 byte è la prima che xlsx trova
    // da length-4: i suoi campi non ci stanno, quindi vale la dimensione del file
    // e non la directory vera più indietro, che dichiara 40 MiB.
    const sopra = dichiaraDimensioni(zip, [40 * MIB])
    const coda = new Uint8Array(sopra.byteLength + 4)
    coda.set(new Uint8Array(sopra))
    new DataView(coda.buffer).setUint32(sopra.byteLength, 0x06054b50, true)
    expect(dimensioneDecompressa(sopra)).toBeGreaterThan(MAX_DECOMPRESSO_BYTE)
    expect(dimensioneDecompressa(coda.buffer)).toBe(coda.byteLength)
  })
})
