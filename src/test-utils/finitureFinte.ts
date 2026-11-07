/**
 * Un foglio FINITURE finto (L20), con la forma del rev1 del prospetto 2026:
 * titolo, nota di testata, intestazione in riga 3, righe della matrice, righe
 * senza tipo o senza esterno (lavorazione, quota progettazione) e TOTALE.
 * Prezzi finti e non tondi, scelti perché nessuno coincida con un prezzo del
 * rev1 vero (controllato contandoli, senza stamparli).
 *
 * Righe Excel: intestazione 3, prima riga della matrice 4.
 */
export const FINITURE_FINTE: unknown[][] = [
  ['', 'PROSPETTO SU MISURA DI PROVA'],
  ['', 'PREZZI DI PROVA. PER MOBILI CON PROFONDITA MINORE DI 40CM RIDUZIONE DEL 10%'],
  ['TIPO ARREDO', 'INTERNO', 'ESTERNO', 'PREZZO', 'U.MISURA', 'QUANTITA', 'TOTALE'],
  ['MOBILE A GIORNO', 'LACCATO OPACO', 'LACCATO OPACO', 413, 'MQ'],
  ['MOBILE A GIORNO', 'LAMINATO', 'LAMINATO', 317, 'MQ'],
  ['ARMADIO CON ANTE', 'LAMINATO BIANCO', 'LACCATO OPACO', 523, 'MQ'],
  ['ARMADIO CON ANTE', 'LAMINATO ABET-LAMICOLOR', 'LACCATO OPACO', 637, 'MQ'],
  ['ARMADIO CON ANTE', 'LAMINATO ABET – LAMICOLOR', 'ESSENZA', 743, 'MQ'],
  ['TELAIO CON ANTE', '', 'LACCATO OPACO', 853, 'MQ'],
  ['MENSOLE A MURO', '', 'LAMINATO', 57, 'ML'],
  ['LAVORAZIONE MILLERIGHI (MIN 1MQ)', '', '', 109, 'MQ'],
  ['', 'QUOTA PROGETTAZIONE', '', 0.08, 'VALORE'],
  ['', 'TOTALE', '', '', '', '', 0],
]

/** Il foglio ACCESSORI finto: un foglio standard con «ACCESSORI» in colonna 0. */
export const ACCESSORI_FINTI: unknown[][] = [
  ['PROSPETTO SU MISURA DI PROVA'],
  ['PREZZI DI PROVA'],
  ['ACCESSORI', 'PREZZO', 'U.MISURA', 'QUANTITA', 'TOTALE'],
  ['ILLUMINAZIONE LED', 27, 'ML'],
  ['CASSETTO', 97, 'PEZZO'],
  ['TOTALE', '', '', '', 0],
]
