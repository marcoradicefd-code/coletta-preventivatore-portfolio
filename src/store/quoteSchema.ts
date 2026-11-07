import { z } from 'zod'
import type { Preventivo } from '@/types/common'
import type { SezioniState } from '@/types/quote'
import type { PrezziCongelati } from '@/types/archivio'

/**
 * La forma di un preventivo letto da fuori dell'app: `preventivi.dati` dal
 * database, o il blob di «ricorda preventivo» dal localStorage (revisione
 * L15-L21, S3). Prima nessuno la controllava: un `dati` scritto male (da un
 * collega con gli strumenti dello sviluppatore, o da un bug di una versione
 * futura) entrava nello store, il PDF lanciava e l'app intera andava in
 * «Errore applicazione»; con «ricorda preventivo» anche a ogni riavvio.
 *
 * Si controlla ciò su cui engine e PDF contano: gli array che scorrono, i
 * numeri con cui calcolano, le stringhe che stampano. Gli oggetti sono
 * `looseObject`: una chiave in più (di una versione dopo, o un campo
 * deprecato) passa, così il controllo non rompe la compatibilità in avanti.
 * Una sezione `null` vale come assente (i lettori la sostituiscono col
 * fallback), e si toglie.
 */
const num = z.number()
const testo = z.string()
const testoOpz = testo.optional()
const flagOpz = z.boolean().optional()

const articolo = z.looseObject({
  id: testo,
  descrizione: testo,
  prezzoUnitario: num,
  um: z.enum(['MQ', 'ML', 'PZ']),
  larghezzaCm: num.nullish(),
  altezzaCm: num.nullish(),
  lunghezzaMl: num.nullish(),
  quantita: num.nullish(),
  profonditaOltre65: flagOpz,
  profonditaSotto40: flagOpz,
  finituraInterna: testoOpz,
  finituraEsterna: testoOpz,
  codiceFinitura: testoOpz,
  note: testoOpz,
  arredoId: testoOpz,
  combinazione: z.looseObject({ tipo: testo, interno: testo, esterno: testo }).optional(),
})

const arredi = z.looseObject({
  articoli: z.array(articolo),
  quotaProgettazione: z.boolean(),
  sconto: num,
  noteGenerali: testoOpz,
  mostraMqInPdf: flagOpz,
  descrizione: testoOpz,
  arredi: z.array(z.looseObject({ id: testo, nome: testo })).optional(),
})

const gres = z.looseObject({
  tipologiaMateriale: testo,
  righeMateriali: z.array(z.looseObject({ id: testo, materialeKey: testo, qtaMq: num, prezzoMq: num })),
  righeAlzatine: z.array(z.looseObject({ id: testo, materialeKey: testo, qtaMl: num, prezzoMl: num })),
  righeLavorazioniBordo: z.array(z.looseObject({ lavorazioneId: num, qtaMl: num })),
  righeVarie: z.array(z.looseObject({ descrizione: testo, qta: num })),
  sconto: num,
  includiRilMont: z.boolean(),
  vasca: z.looseObject({ inclusa: z.boolean(), prezzo: num }).nullish(),
})

const progettoValore = z.looseObject({
  righe: z.array(z.looseObject({ id: testo, descrizione: testo, prezzo: num })),
  sconto: num,
})

const porte = z.looseObject({
  righe: z.array(
    z.looseObject({
      id: testo,
      modelloNome: testo,
      altezzaCm: num,
      optionals: z.array(
        z.looseObject({ id: testo, nome: testo, unita: testo, quantita: num, prezzoManuale: num.nullable(), prezzoUnitario: num.optional() })
      ),
      prezziModello: z.looseObject({ prezzo2026: num, h215: num, h240: num }).optional(),
      descrizione: testo.nullish(),
      quantita: num.optional(),
      maniglia: z.looseObject({ qta: num, modello: testo, finitura: testo, prezzoUnitario: num.optional() }).optional(),
    })
  ),
  battiscopa: z
    .array(
      z.looseObject({
        id: testo,
        nome: testo,
        prezzoUnitario: num.optional(),
        altezzaCm: num.optional(),
        metriLineari: num.optional(),
        prezzoPosaMl: num.optional(),
        quantitaCm: num.optional(),
        quantita: num.optional(),
        descrizione: testo.nullish(),
      })
    )
    .optional(),
  sconto: num,
})

const cucine = z.looseObject({
  voci: z.array(z.looseObject({ voceId: testo, quantita: num })),
  casse: z.boolean(),
  ante: z.boolean(),
  // L25: assente nei preventivi salvati prima, vale false.
  profonditaOltre65: z.boolean().optional(),
  giorniExtra: num,
  extraManuale: z.looseObject({ descrizione: testo, importo: num }).nullable(),
  adeguamentoPct: num,
  descrizione: testoOpz,
  sconto: num,
})

const sezioniSchema = z.looseObject({
  arredi: arredi.nullish(),
  gres: gres.nullish(),
  cucine: cucine.nullish(),
  porte: porte.nullish(),
  progettoValore: progettoValore.nullish(),
})

const preventivoSchema = z.looseObject({
  numero: testoOpz,
  data: testoOpz,
  validitaGiorni: num.optional(),
  cliente: z
    .looseObject({ nome: testoOpz, cognome: testoOpz, indirizzo: testoOpz, citta: testoOpz, telefono: testoOpz, email: testoOpz })
    .optional(),
  oggettoPreventivo: testoOpz,
  note: testoOpz,
  includiCondizioni: flagOpz,
  includiNotePagamento: flagOpz,
  notePagamento: testoOpz,
})

const NOMI_SEZIONI = ['arredi', 'gres', 'cucine', 'porte', 'progettoValore'] as const

/**
 * Le sezioni, se hanno la forma che engine e PDF si aspettano; altrimenti
 * `null`. Le sezioni `null` si tolgono (valgono come assenti). Gli oggetti
 * restano quelli ricevuti: il controllo non li ricostruisce.
 */
export function sezioniValide(x: unknown): SezioniState | null {
  if (!sezioniSchema.safeParse(x).success) return null
  const sezioni = { ...(x as Record<string, unknown>) }
  for (const nome of NOMI_SEZIONI) if (sezioni[nome] === null) delete sezioni[nome]
  return sezioni as SezioniState
}

/** Il documento (cliente, data, note…), se ha la forma che il PDF si aspetta; altrimenti `null`. */
export function preventivoValido(x: unknown): Partial<Preventivo> | null {
  return preventivoSchema.safeParse(x).success ? (x as Partial<Preventivo>) : null
}

// ── Prezzi congelati (strada A) ──
// Il PDF di un inviato si costruisce da qui: un `dati.prezzi` scritto male non
// deve farlo lanciare. Si controllano gli importi e gli elenchi che il PDF
// stampa; un `prezzi` non valido vale come assente (il PDF va dal vivo, con la
// nota), il preventivo si apre lo stesso.
const numNull = num.nullable()
const totaliSezione = z.looseObject({ subtotale: num, sconto: num, totale: num })
const vistaSchema = z.looseObject({
  calcolo: z.looseObject({
    resultSM: totaliSezione.extend({ quotaProgettazione: num }),
    resultPV: totaliSezione,
    resultPorte: totaliSezione.extend({
      daDefinire: num,
      righe: z.array(
        z.looseObject({
          id: testo,
          origine: z.enum(['snapshot', 'live', 'irrisolvibile', 'da-completare']),
          modelloNome: testo,
          altezzaCm: num,
          fascia: z.enum(['base', 'h215', 'h240']),
          quantita: num,
          prezzoUnitarioRiga: num,
          totale: num,
          totaleManiglia: num,
        })
      ),
      battiscopa: z.array(
        z.looseObject({
          id: testo,
          nome: testo,
          origine: z.enum(['snapshot', 'live', 'irrisolvibile', 'da-completare']),
          metriLineari: num,
          prezzoMl: num,
          prodotto: num,
          posa: num,
          prezzoPosaMl: num,
        })
      ),
    }),
    resultMM: z
      .looseObject({
        totMateriali: num,
        integrazioneMinimo: num,
        totAlzatine: num,
        totLavorazioniBordo: num,
        totLavorazioniVarie: num,
        totVasca: num,
        totLordo: num,
        sconto: num,
        totScontato: num,
        costoRilMont: num,
        totaleFinale: num,
        lavorazioniDaDefinire: num,
      })
      .nullable(),
    resultCucine: z.looseObject({ imponibile: num, vociDaDefinire: num }).nullable(),
    iva: z.looseObject({
      righe: z.array(z.looseObject({ aliquota: num, imponibile: num, imposta: num })),
      totaleImponibile: num,
      totaleIvato: num,
    }),
  }),
  listinoGres: z.boolean(),
  listinoCucine: z.boolean(),
  giornoRateCucina: numNull,
  nomiMateriali: z.record(z.string(), testo),
  lavorazioniBordo: z.record(z.string(), z.looseObject({ descrizione: testo.nullable(), prezzoMl: numNull })),
  lavorazioniVarie: z.record(z.string(), numNull),
})
const prezziSchema = z.looseObject({
  calcolatiIl: testo,
  listini: z.looseObject({ gres: testo.nullable(), porte: testo.nullable(), cucine: testo.nullable() }),
  impronta: testo,
  sezioni: testo,
  vista: vistaSchema,
})

/** I prezzi congelati, se hanno la forma che il PDF si aspetta; altrimenti `null` (vale come assenti). */
export function prezziValidi(x: unknown): PrezziCongelati | null {
  return prezziSchema.safeParse(x).success ? (x as PrezziCongelati) : null
}
