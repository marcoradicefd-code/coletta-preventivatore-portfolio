/**
 * Il battiscopa: predicato di riconoscimento e maggiorazione della variante.
 *
 * Sta in un file suo, e non inline in un componente, perché è la SORGENTE UNICA
 * di una decisione che vive in due posti lontani: la `<select>` degli optional
 * (dove le voci battiscopa non devono più comparire) e il pulsante dedicato
 * (dove devono essere le uniche a comparire). Due predicati che divergono
 * darebbero una voce invisibile da entrambe le parti, o presente in tutte e due.
 *
 * **Riconoscimento per NOME, e i nomi vengono da De Bari.** Se il fornitore
 * rinomina la voce, il predicato smette di riconoscerla e il battiscopa
 * ricompare fra gli optional: fallimento BENIGNO, si torna al comportamento di
 * prima della PR C. Il rischio da evitare è l'opposto — un predicato largo che
 * nasconde voci che non c'entrano — ed è per questo che
 * `src/data/__tests__/battiscopa.test.ts` elenca esplicitamente cosa nasconde e
 * cosa no: quel test è il modo sicuro di cambiare questa funzione.
 */

/** Maggiorazione della "LAVORAZIONE EXTRA BATTISCOPA" del listino: +20%. */
export const BATTISCOPA_EXTRA_PCT = 0.2

/**
 * La voce del listino è un battiscopa (base o variante +20%)?
 *
 * Match su sottostringa normalizzata: il listino non garantisce maiuscole né
 * spaziatura, e la variante si chiama "LAVORAZIONE EXTRA BATTISCOPA" — il
 * battiscopa non è sempre in testa al nome.
 */
export function isVoceBattiscopa(nome: string): boolean {
  return nome.trim().toLowerCase().includes('battiscopa')
}
