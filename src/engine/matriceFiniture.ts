import type { ArticoloSuMisura, CombinazioneMatrice, RigaMatrice } from '@/types/sumisura'

/**
 * La chiave di confronto di una finitura o di un tipo della matrice FINITURE
 * (L20): minuscole, spazi collassati, trattini lunghi e corti con o senza spazi
 * intorno resi «-». «LAMINATO ABET-LAMICOLOR» e «LAMINATO ABET – LAMICOLOR»
 * sono la stessa finitura. La usano il parser (avviso sulle grafie), lo schema
 * (combinazioni doppie) e la ricerca del prezzo.
 */
export function chiaveMatrice(testo: string): string {
  return testo
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[–—]/g, '-')
    .replace(/ ?- ?/g, '-')
}

/** Le righe della matrice di tutti i fogli del listino, nell'ordine del file. */
export function righeMatrice(fogli: ReadonlyArray<{ matrice?: RigaMatrice[] }>): RigaMatrice[] {
  return fogli.flatMap((f) => f.matrice ?? [])
}

const stessa = (a: string, b: string) => chiaveMatrice(a) === chiaveMatrice(b)

/** Valori distinti per `chiaveMatrice`, con la prima grafia del file e nel suo ordine. */
function distinti(valori: readonly string[]): string[] {
  const visti = new Map<string, string>()
  for (const v of valori) if (!visti.has(chiaveMatrice(v))) visti.set(chiaveMatrice(v), v)
  return [...visti.values()]
}

/** I tipi di arredo della matrice. */
export function tipiMatrice(matrice: readonly RigaMatrice[]): string[] {
  return distinti(matrice.map((r) => r.tipo))
}

/**
 * Gli interni che esistono per un tipo. Vuoto ⇒ il tipo vale per qualsiasi
 * interno (telaio, mensole, boiserie): non c'è un interno da scegliere.
 */
export function interniMatrice(matrice: readonly RigaMatrice[], tipo: string): string[] {
  return distinti(matrice.filter((r) => stessa(r.tipo, tipo) && r.interno !== '').map((r) => r.interno))
}

/** Gli esterni che esistono per un tipo con quell'interno (o con «qualsiasi interno»). */
export function esterniMatrice(matrice: readonly RigaMatrice[], tipo: string, interno: string): string[] {
  return distinti(
    matrice
      .filter((r) => stessa(r.tipo, tipo) && (r.interno === '' || stessa(r.interno, interno)))
      .map((r) => r.esterno)
  )
}

/**
 * La riga della combinazione: prima quella con lo stesso interno, poi quella
 * per «qualsiasi interno». `null` se la combinazione non c'è.
 */
export function trovaInMatrice(
  matrice: readonly RigaMatrice[],
  tipo: string,
  interno: string,
  esterno: string
): RigaMatrice | null {
  const candidate = matrice.filter((r) => stessa(r.tipo, tipo) && stessa(r.esterno, esterno))
  return (
    candidate.find((r) => r.interno !== '' && stessa(r.interno, interno)) ??
    candidate.find((r) => r.interno === '') ??
    null
  )
}

/**
 * Il prezzo di listino di una combinazione (€ per l'unità della riga). `null`
 * vuol dire «da definire», mai 0: la combinazione non è nella matrice.
 */
export function prezzoDaMatrice(
  matrice: readonly RigaMatrice[],
  tipo: string,
  interno: string,
  esterno: string
): number | null {
  return trovaInMatrice(matrice, tipo, interno, esterno)?.prezzo ?? null
}

/** «ARMADIO/MOBILE CON ANTE» → «Armadio/mobile con ante»: il nome dell'elemento. */
function comeFrase(testo: string): string {
  const t = testo.trim().toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * I campi di un elemento nuovo dalla matrice (L20): descrizione dal tipo,
 * prezzo e unità della riga, combinazione con le grafie del listino. È lo
 * snapshot: il prezzo resta quello del momento della scelta. `null` se la
 * combinazione non è nella matrice.
 */
export function elementoDaMatrice(
  matrice: readonly RigaMatrice[],
  scelta: CombinazioneMatrice
): Pick<ArticoloSuMisura, 'origine' | 'descrizione' | 'prezzoUnitario' | 'um' | 'combinazione'> | null {
  const riga = trovaInMatrice(matrice, scelta.tipo, scelta.interno, scelta.esterno)
  if (riga === null) return null
  return {
    origine: 'listino',
    descrizione: comeFrase(riga.tipo),
    prezzoUnitario: riga.prezzo,
    um: riga.unita === 'PEZZO' ? 'PZ' : riga.unita,
    // Le etichette che l'utente ha scelto (la prima grafia del file), anche
    // quando il prezzo viene dalla riga «qualsiasi interno» di un tipo misto
    // (C7): l'elemento si riapre con l'interno scelto. Un interno che il tipo
    // non ha (un tipo tutto «qualsiasi interno») non si salva.
    combinazione: {
      tipo: scelta.tipo,
      interno: interniMatrice(matrice, scelta.tipo).some((i) => stessa(i, scelta.interno)) ? scelta.interno : '',
      esterno: scelta.esterno,
    },
  }
}

/**
 * La combinazione in parole, per la riga e per il PDF (L20):
 * «interno laminato bianco, esterno laccato opaco»; con «qualsiasi interno»
 * solo l'esterno.
 */
export function descrizioneCombinazione(c: CombinazioneMatrice): string {
  const minuscolo = (t: string) => t.trim().toLowerCase()
  return c.interno.trim() === ''
    ? `esterno ${minuscolo(c.esterno)}`
    : `interno ${minuscolo(c.interno)}, esterno ${minuscolo(c.esterno)}`
}
