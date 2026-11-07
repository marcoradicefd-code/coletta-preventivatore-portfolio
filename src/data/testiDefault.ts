/**
 * Testi commerciali di default del preventivo (note pagamento + descrizioni di
 * sezione).
 *
 * Fonte: DOCX fornito da Antonio il 25/07/2026, più la call del 31/07/2026 per
 * le note pagamento. Come per `condizioniContrattuali.ts`, questo modulo è la
 * SORGENTE UNICA: non ricopiare queste stringhe altrove (né nei componenti, né
 * nei test) — importarle. Una copia smette di accorgersi quando l'originale
 * cambia, e il PDF del cliente andrebbe a due velocità.
 *
 * DUE REFUSI DELL'ORIGINALE SONO STATI CORRETTI, ed è l'unica libertà presa:
 *  - "maniglia fresatao gola"  → "maniglia fresata o gola"   (arredi)
 *  - "40/70kg.Altezza cucina"  → "40/70 kg. Altezza cucina"  (cucina; lo spazio
 *    fra numero e unità è un ritocco tipografico deciso da Marco il 06/10)
 * Ogni altra parola, maiuscola e a-capo è quella del DOCX. Per il resto vale la
 * regola delle condizioni contrattuali: NON modificare senza conferma esplicita
 * del cliente.
 *
 * Sono DEFAULT DI LETTURA, non valori iniziali dello store: entrano nel PDF
 * solo se l'utente non ha scritto niente. Se finissero dentro lo stato salvato,
 * un domani cambiare il testo qui non cambierebbe i preventivi già aperti —
 * resterebbe congelata una copia muta di questa versione.
 */

import type { ManigliaPorta } from '@/types/quote'
import { manigliaInclusa } from '@/engine/calcPorte'
import { formatEur, formatQuantita } from '@/utils/format'

/** Clausola di pagamento standard (call Antonio 31/07/2026). */
export const NOTE_PAGAMENTO_DEFAULT =
  '40% alla stipula, 40% merce pronta, 20% fine lavori'

/** Testo in testa alla sezione Cucina del preventivo. */
export const DESCRIZIONE_CUCINA_DEFAULT = `Fornitura e posa in opera di cucina con scocca interna in multistrato placcato laminato bianco o altra disponibilità cartella ABET LEGNO/COLOR
Ante in finitura con gola su cassa o maniglia applicata. Cerniere soft close. Cassetti in multistrato con guide soft close portata 40/70 kg. Altezza cucina 270. Profondità basi 63+2. Profondità pensili 38+2. Cerniere soft close. Zoccolo h 12 cm.
Accessori: illuminazione led sottopensile 3000k completa di profilo in alluminio e trasformatore, portaposate in acciaio, scolapiatti in acciaio, portapattumiera in acciaio.
Rilievo, progettazione, render 3d, messa in tavola inclusa nel prezzo`

/** Testo in testa alla sezione Arredi (Falegnameria Su Misura) del preventivo. */
export const DESCRIZIONE_ARREDI_DEFAULT = `CARATTERISTICHE GENERALI:
Struttura interna in multistrato placcato laminato ABET COLOR/LEGNO vs scelta
Ante in finitura laccato opaco/essenza rovere con maniglia fresata o gola su cassa, cerniere soft close.
Cassetti in multistrato in essenza o laccato con guide soft close.
Anta e ripiani in vetro visarm con cerniera saldata UV
Copiatura cassetta ed ispezioni.
Illuminazione led 3000k con profilo in alluminio completa di trasformatore
Fasce di chiusura perimetrali
Rilievo, progettazione, render 3d, messa in tavola inclusa nel prezzo`

/**
 * Descrizione di default di UNA riga porta, DERIVATA dalla riga: modello e
 * maniglia.
 *
 * È per riga e non per sezione perché il modello è di riga: il preventivo 1147
 * stampa una descrizione per voce, non una in testa al blocco.
 *
 * **La quantità non entra nel testo** (punto 5 di Antonio, 14/10: «la quantità
 * delle porte compare sia nella descrizione che nella colonna quantità»): sta
 * solo nella colonna Qtà del PDF. Fino a L23 il testo si apriva con «n.N » da
 * 2 porte in su.
 *
 * **Il testo non mente per costruzione.** La maniglia è la ragione per cui
 * questa funzione prende due argomenti invece di uno: la frase standard promette
 * "maniglia cromo satinato" come inclusa nel prezzo della porta. Se la riga
 * porta anche una maniglia a pagamento, quella promessa diventa falsa — il PDF
 * descriverebbe una maniglia inclusa e ne fatturerebbe un'altra. Derivandola,
 * il caso non è rappresentabile.
 *
 * **Senza maniglia il risultato è identico, carattere per carattere, alla
 * versione a un solo argomento.** È il contratto di non-regressione col PDF di
 * ieri, ed è asserito nei test.
 */
export function descrizionePorteDefault(modelloNome: string, maniglia?: ManigliaPorta): string {
  return `Porta mod. ${modelloNome}, in finitura laccato opaco bianco, completa di stipiti e mostrine da 8cm in multistrato. Serratura magnetica, cerniere a scomparsa, ${dettaglioManiglia(maniglia)}.`
}

/**
 * La maniglia nel testo della porta (regola di Antonio, 06/10):
 *  - nessuna maniglia, o modello vuoto e niente prezzo → la standard, "maniglia
 *    cromo satinato", identica a prima: i PDF già consegnati non si muovono;
 *  - senza prezzo → "maniglia mod. {modello} {finitura} inclusa";
 *  - con prezzo   → "maniglia mod. {modello} {finitura}", e la voce del PDF la
 *    prezza accanto. La finitura compare solo se compilata.
 */
function dettaglioManiglia(m?: ManigliaPorta): string {
  const inclusa = !m || manigliaInclusa(m)
  if (!m || (m.modello.trim() === '' && inclusa)) return 'maniglia cromo satinato'
  return ['maniglia', nomeManiglia(m), inclusa ? 'inclusa' : ''].filter((s) => s !== '').join(' ')
}

/** "mod. {modello} {finitura}", senza le parti vuote. Lo usa anche la voce del PDF. */
export function nomeManiglia(m: Pick<ManigliaPorta, 'modello' | 'finitura'>): string {
  const modello = m.modello.trim()
  return [modello === '' ? '' : `mod. ${modello}`, m.finitura.trim()].filter((s) => s !== '').join(' ')
}

/**
 * Descrizione di default di una riga battiscopa (specifica di Antonio, 06/10):
 * "Battiscopa {nome} H {alt} cm — {ml} ml × {€/ml} €/ml". Deriva altezza, metri
 * e €/ml dal calcolo, come `descrizionePorteDefault` deriva modello e quantità:
 * il testo non può descrivere una misura diversa da quella che si fattura.
 * Una riga senza misure è descritta col solo nome: l'importo dice "da completare".
 */
export function descrizioneBattiscopaDefault(
  nome: string,
  altezzaCm: number,
  metriLineari: number,
  prezzoMl: number
): string {
  if (altezzaCm <= 0 || metriLineari <= 0) return `Battiscopa ${nome}`
  return `Battiscopa ${nome} H ${formatQuantita(altezzaCm)} cm — ${formatQuantita(metriLineari)} ml × ${formatEur(prezzoMl)} €/ml`
}
