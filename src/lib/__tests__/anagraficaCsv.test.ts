import { describe, it, expect } from 'vitest'
import { dividiCsv, leggiCsvAnagrafica, decodificaAnagrafica, INTESTAZIONI_ANAGRAFICA } from '@/lib/anagraficaCsv'
import { csvFinto, BOM, INTESTAZIONE_FINTA, RIGHE_FINTE } from '@/test-utils/anagraficaFinta'

/** Solo il CSV finto costruito nel test (`anagraficaFinta.ts`): il file vero non entra mai nella suite. */
describe('anagraficaCsv — il file pulito, e solo quello (L21, PR C)', () => {
  it('le intestazioni sono quelle del file pulito, nell’ordine', () => {
    expect(INTESTAZIONI_ANAGRAFICA.join(';')).toBe(INTESTAZIONE_FINTA)
  })

  it('legge BOM, `;`, virgolette, accentate, virgolette doppie e a capo dentro un campo', () => {
    const { righe, scartate } = leggiCsvAnagrafica(csvFinto(RIGHE_FINTE))
    expect(scartate).toEqual([])
    expect(righe.map((r) => r.riga)).toEqual([2, 3, 4, 5])
    expect(righe[0]).toMatchObject({ codice_gestionale: '101', ragione_sociale: 'Arch. Bianchi Prova', telefono: '000 1000001', provincia: 'XX' })
    expect(righe[1].ragione_sociale).toBe('Caffè Fittizio Snc')
    expect(righe[2].ragione_sociale).toBe('Niccolò Esempio')
    expect(righe[3]).toMatchObject({ ragione_sociale: 'Ditta "Le Querce" Prova', indirizzo: 'Via di Prova 1;\nscala B', cap: '00000' })
  })

  it('il nome col titolo resta in ragione_sociale; i campi vuoti sono null; le email in più restano nelle note', () => {
    const { righe } = leggiCsvAnagrafica(csvFinto(RIGHE_FINTE))
    expect(righe[0].ragione_sociale).toBe('Arch. Bianchi Prova')
    expect(righe[2]).toMatchObject({ telefono: null, email: null, indirizzo: null, note: null })
    expect(righe[1]).toMatchObject({ email: 'caffe@example.test', note: 'altra@example.test' })
  })

  it('la colonna `segnalazioni` si legge per l’anteprima ma non è un campo del cliente', () => {
    const { righe } = leggiCsvAnagrafica(csvFinto(RIGHE_FINTE))
    expect(righe[2].segnalazioni).toBe('nessun contatto')
    expect(righe[0].segnalazioni).toBeNull()
  })

  it('il CAP e i codici restano testo: lo zero davanti non si perde', () => {
    const { righe } = leggiCsvAnagrafica(csvFinto([{ codice: '0042', ragione: 'Prova Zero', cap: '00100' }]))
    expect(righe[0]).toMatchObject({ codice_gestionale: '0042', cap: '00100' })
  })

  it('un’intestazione diversa rifiuta il file col motivo, senza leggere nessuna riga', () => {
    const sbagliata = INTESTAZIONE_FINTA.replace('telefono', 'tel')
    expect(() => leggiCsvAnagrafica(csvFinto(RIGHE_FINTE, { intestazione: sbagliata }))).toThrow(
      /colonna 3 dell’intestazione: attesa «telefono»/
    )
    const corta = INTESTAZIONE_FINTA.replace(';segnalazioni', '')
    expect(() => leggiCsvAnagrafica(csvFinto(RIGHE_FINTE, { intestazione: corta }))).toThrow(/10 colonne invece di 11/)
    // Un file senza intestazione: la prima riga è un cliente, e il motivo non la ripete.
    const senza = csvFinto(RIGHE_FINTE).split('\r\n').slice(1).join('\r\n')
    try {
      leggiCsvAnagrafica(senza)
      expect.unreachable()
    } catch (e) {
      expect((e as Error).message).toMatch(/attesa «codice_gestionale»/)
      expect((e as Error).message).not.toContain('Bianchi')
    }
    expect(() => leggiCsvAnagrafica('')).toThrow(/vuoto/)
  })

  it('scarta col motivo le righe senza codice, senza ragione sociale, col codice ripetuto o coi campi sbagliati', () => {
    const testo = `${csvFinto([
      { codice: '201', ragione: 'Prova Uno' },
      { codice: '', ragione: 'Prova Senza Codice' },
      { codice: '203', ragione: '  ' },
      { codice: '201', ragione: 'Prova Uno Bis' },
    ])}"204";"Prova Corta"\r\n\r\n`
    const { righe, scartate } = leggiCsvAnagrafica(testo)
    expect(righe.map((r) => r.codice_gestionale)).toEqual(['201'])
    expect(scartate).toEqual([
      { riga: 3, motivo: 'codice gestionale mancante' },
      { riga: 4, motivo: 'ragione sociale vuota' },
      { riga: 5, motivo: 'codice gestionale ripetuto nel file (già alla riga 2)' },
      { riga: 6, motivo: '2 campi invece di 11' },
    ])
  })

  it('virgolette non chiuse: file rifiutato', () => {
    expect(() => leggiCsvAnagrafica(`${INTESTAZIONE_FINTA}\n"301";"Prova`)).toThrow(/virgolette non chiuse/)
  })

  it('dividiCsv: LF e CRLF, campi vuoti, virgolette in mezzo a un campo senza virgolette', () => {
    expect(dividiCsv('a;b\n;c\r\n"x""y";z"w')).toEqual([['a', 'b'], ['', 'c'], ['x"y', 'z"w']])
  })

  it('F5 (verdetto del 15/10). un file già rovinato, con il carattere di sostituzione U+FFFD, è rifiutato col motivo', () => {
    // Il carattere si costruisce (CLAUDE.md): è quello che lascia una conversione sbagliata, ed è UTF-8 valido.
    const rovinato = new TextEncoder().encode(`codice;Caff${String.fromCodePoint(0xfffd)} Prova`).buffer
    expect(() => decodificaAnagrafica(rovinato)).toThrow(/caratteri illeggibili.*CSV UTF-8/)
  })

  it('decodifica: UTF-8 con o senza BOM; un file che non è UTF-8 è rifiutato', () => {
    const enc = new TextEncoder()
    expect(decodificaAnagrafica(enc.encode(`${BOM}abc`).buffer)).toBe('abc')
    expect(decodificaAnagrafica(enc.encode('abc').buffer)).toBe('abc')
    // «è» in Windows-1252: un byte solo, 0xE8, che in UTF-8 non sta in piedi.
    expect(() => decodificaAnagrafica(new Uint8Array([0x63, 0x61, 0x66, 0x66, 0xe8]).buffer)).toThrow(/UTF-8/)
  })
})
