/**
 * L'impronta di un valore JSON (strada A, prezzi congelati): stessa impronta =
 * stesso contenuto, qualunque sia l'ordine delle chiavi. Serve perché il
 * database (jsonb) riordina le chiavi: un `JSON.stringify` diretto darebbe due
 * testi diversi per le stesse sezioni prima e dopo il salvataggio.
 *
 * ponytail: FNV-1a a 32 bit sul JSON canonico, più la lunghezza. Basta per
 * dire «è lo stesso preventivo / lo stesso calcolo» fra due stati dell'app; non
 * è un controllo d'integrità contro chi scrive apposta un `dati` diverso.
 */
/**
 * L'ordine delle chiavi per unità di codice, uguale in ogni browser: non
 * `localeCompare`, che dipende dalla lingua e darebbe impronte diverse fra due
 * computer per lo stesso preventivo. `<` confronta unità UTF-16, che per le
 * chiavi di oggi (tutte nel piano BMP) coincide con l'ordine dei code point.
 */
export const perCodice = (a: string, b: string): number => {
  if (a === b) return 0
  return a < b ? -1 : 1
}

export function jsonCanonico(valore: unknown): string {
  return JSON.stringify(valore, (_chiave, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort(perCodice).map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v
  )
}

export function impronta(valore: unknown): string {
  const testo = jsonCanonico(valore) ?? 'undefined'
  let h = 0x811c9dc5
  for (let i = 0; i < testo.length; i++) {
    h ^= testo.codePointAt(i) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${h.toString(16).padStart(8, '0')}-${testo.length}`
}
