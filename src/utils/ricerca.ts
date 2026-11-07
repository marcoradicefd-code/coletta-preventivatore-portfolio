/**
 * Testo pronto per il confronto di una ricerca: minuscole, senza spazi agli
 * estremi e senza accenti («Lavèllo » → «lavello»). Gli accenti si tolgono
 * scomponendo (NFD) e scartando i segni combinanti, così «è» ed «e» combaciano
 * qualunque dei due scriva l'utente o il listino.
 */
export function normalizzaRicerca(testo: string): string {
  return testo.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/** Vero se `testo` contiene la ricerca `q`; una ricerca vuota o di soli spazi trova tutto. */
export function corrispondeRicerca(testo: string, q: string): boolean {
  return normalizzaRicerca(testo).includes(normalizzaRicerca(q))
}
