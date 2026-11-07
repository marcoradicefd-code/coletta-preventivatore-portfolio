import type { Validato } from '@/parsers/validaListino'

/**
 * Marchia un listino-fixture come validato, **solo nei test**.
 *
 * I campi di `pricelistStore` hanno tipo `Validato<T>`: fuori di qui l'unico
 * modo di produrlo è passare da `validaListino` (vedi il commento in testa a
 * `src/parsers/validaListino.ts`). Un test che vuole popolare lo store con un
 * fixture non ha un file Excel da far parsare, quindi ha bisogno di questa
 * scorciatoia.
 *
 * È il SECONDO e ultimo cast del progetto — l'altro è dentro `validaListino`,
 * dopo il verdetto. Sono entrambi in file il cui mestiere dichiarato è quello.
 * Se ne compare un terzo, in produzione, il meccanismo è stato aggirato: quello
 * è il segnale da cercare in review, non i `setState` (che ora non compilano).
 *
 * NB: questa funzione NON valida. Marchia e basta. Un fixture strutturalmente
 * assurdo entra: è voluto — un test che vuole verificare il comportamento a
 * valle non deve essere costretto a costruire un listino De Bari completo. Ma
 * un test che vuole verificare la VALIDAZIONE deve chiamare `validaListino` o
 * `ingestListino`, non questa.
 */
export function validatoPerTest<T>(listino: T): Validato<T> {
  return listino as Validato<T>
}
