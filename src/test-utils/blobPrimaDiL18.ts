/**
 * Un preventivo salvato prima di L18: forma v4 di `persist` (`{ state, version }`
 * sotto `coletta-quote-v1`), tutte e cinque le sezioni compilate, NESSUNA chiave
 * `aliquotaIva` né sulle sezioni né sulle righe. Serve al presidio «un blob di
 * prima si apre e vale 22% su tutto» (store e stampa).
 *
 * Valori sintetici e tondi; il cliente è un segnaposto. Le voci cucina sono del
 * listino finto (`catalogoCucinaFinto`), la porta ha la terna congelata inventata.
 */
export const CHIAVE_BLOB = 'coletta-quote-v1'

export const blobPrimaDiL18 = {
  version: 4,
  state: {
    ricordaPreventivo: true,
    preventivo: {
      numero: 'T-18',
      data: '2026-10-01',
      validitaGiorni: 30,
      cliente: { nome: 'Blob', cognome: 'Segnaposto', indirizzo: '', citta: '', telefono: '', email: '' },
      oggettoPreventivo: '',
      note: '',
      includiCondizioni: false,
      includiNotePagamento: true,
    },
    sezioni: {
      arredi: {
        articoli: [
          {
            id: 'a1',
            origine: 'manuale',
            descrizione: 'Mobile',
            prezzoUnitario: 100,
            um: 'PZ',
            larghezzaCm: null,
            altezzaCm: null,
            lunghezzaMl: null,
            quantita: 2,
            profonditaOltre65: false,
            finituraInterna: '',
            finituraEsterna: '',
            codiceFinitura: '',
            note: '',
          },
        ],
        quotaProgettazione: false,
        noteGenerali: '',
        mostraMqInPdf: false,
        sconto: 0,
      },
      gres: {
        tipologiaMateriale: 'GRES',
        righeMateriali: [
          { id: 'm1', materialeKey: 'k', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 3, prezzoMq: 100, totale: 300 },
        ],
        righeAlzatine: [],
        righeLavorazioniBordo: [],
        righeVarie: [],
        sconto: 0,
        includiRilMont: false,
      },
      porte: {
        righe: [
          {
            id: 'p1',
            modelloNome: 'GIOTTO',
            altezzaCm: 210,
            optionals: [],
            prezziModello: { prezzo2026: 700, h215: 900, h240: 1000 },
          },
        ],
        battiscopa: [{ id: 'b1', nome: 'BATTISCOPA MASSELLO', prezzoUnitario: 2, altezzaCm: 10, metriLineari: 5 }],
        sconto: 0,
      },
      progettoValore: { righe: [{ id: 'v1', descrizione: 'Progetto', prezzo: 500 }], sconto: 0 },
      cucine: {
        voci: [{ voceId: 'base-pensile-laminato', quantita: 1 }],
        casse: false,
        ante: false,
        giorniExtra: 0,
        extraManuale: null,
        adeguamentoPct: 0,
        descrizione: '',
        sconto: 0,
      },
    },
  },
}
