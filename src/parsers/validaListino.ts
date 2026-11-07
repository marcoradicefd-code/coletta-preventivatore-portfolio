import { validaListinoMarmeria } from './marmeriaSchema'
import { validaListinoPorte } from './porteSchema'
import { validaListinoSuMisura } from './suMisuraSchema'
import { validaListinoCucina } from './cucinaSchema'
import type { ListinoSuMisura } from '@/types/sumisura'
import type { ListinoMarmeria } from '@/types/marmeria'
import type { ListinoPorte } from '@/types/porte'
import type { ListinoCucina } from '@/types/cucina'

/**
 * ── LA PORTA D'INGRESSO DEI LISTINI ──
 *
 * Un listino entra nel `pricelistStore` SOLO se è passato di qui. Non è una
 * convenzione da rispettare: è il compilatore. I campi dello store hanno tipo
 * `Validato<T>`, e l'unico posto che può produrre quel tipo è questo file →
 * `usePricelistStore.setState({ marmeria: parsedGrezzo })` NON compila.
 *
 * Perché serviva: `setState` di zustand è pubblico, quindi chiunque poteva
 * scrivere nello store. E qualcuno lo faceva — l'upload manuale scavalcava Zod
 * (`useExcelLoader`, E2 dell'audit) con codice che sembrava giusto. Nessuna
 * disciplina chiude un buco così: o lo chiude il tipo, o si riapre da solo.
 *
 * Per scavalcare oggi bisogna scrivere `as` a mano: un gesto deliberato,
 * greppabile, visibile in review. Prima il bypass aveva l'aspetto del codice
 * corretto.
 */

// `declare` = esiste solo per il compilatore. Nessun Symbol viene allocato, il
// bundle non cresce di un byte: è una firma nel sistema dei tipi, non un dato.
declare const marchioValidato: unique symbol

/**
 * Un listino che ha superato il suo validatore.
 *
 * Il marchio è FANTASMA (vedi `declare` qui sopra). È un'intersezione, quindi
 * `Validato<ListinoMarmeria>` resta assegnabile a `ListinoMarmeria`: i lettori
 * (calcMarmeria, i componenti) non cambiano di una riga. Il vincolo è solo in
 * scrittura, che è dove serve.
 */
export type Validato<T> = T & { readonly [marchioValidato]: true }

export type Categoria = 'sumisura' | 'marmeria' | 'porte' | 'cucine'

type Listino = ListinoSuMisura | ListinoMarmeria | ListinoPorte | ListinoCucina

/** Verdetto di un validatore: esito + messaggio in italiano, già leggibile in UI. */
type Verdetto = { ok: true } | { ok: false; errore: string }

export type Esito<T> = { ok: true; data: Validato<T> } | { ok: false; errore: string }

export function validaListino(categoria: 'sumisura', listino: ListinoSuMisura): Esito<ListinoSuMisura>
export function validaListino(categoria: 'marmeria', listino: ListinoMarmeria): Esito<ListinoMarmeria>
export function validaListino(categoria: 'porte', listino: ListinoPorte): Esito<ListinoPorte>
export function validaListino(categoria: 'cucine', listino: ListinoCucina): Esito<ListinoCucina>
export function validaListino(categoria: Categoria, listino: Listino): Esito<Listino> {
  let verdetto: Verdetto
  switch (categoria) {
    case 'marmeria':
      verdetto = validaListinoMarmeria(listino)
      break
    case 'porte':
      verdetto = validaListinoPorte(listino)
      break
    case 'sumisura':
      verdetto = validaListinoSuMisura(listino)
      break
    case 'cucine':
      verdetto = validaListinoCucina(listino)
      break
  }

  if (!verdetto.ok) return verdetto

  // ── L'UNICO cast del percorso di ingestione ──
  // Vive qui, nel file il cui mestiere è essere il cancello, e solo dopo che il
  // validatore ha dato l'ok. L'altro cast del progetto è `validatoPerTest` nei
  // test-utils. Se ne compare un terzo, il meccanismo è stato aggirato.
  return { ok: true, data: listino as Validato<Listino> }
}
