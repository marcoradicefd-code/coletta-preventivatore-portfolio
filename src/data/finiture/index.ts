import {
  coloreFinituraSchema, laminatoAbetSchema,
  type ColoreFinitura, type LaminatoAbet, type SistemaColore,
} from './finitureSchema';
import { coloriFiniture } from './colori';
import { laminatiAbet } from './laminatiAbet';

export * from './finitureSchema';
export { coloriFiniture } from './colori';
export { laminatiAbet } from './laminatiAbet';

/** Colori filtrati per sistema (RAL / NCS / Sikkens). */
export function coloriPerSistema(sistema: SistemaColore): ColoreFinitura[] {
  return coloriFiniture.filter((c) => c.sistema === sistema);
}

/** Lookup esatto per sistema + codice (case-insensitive sul codice). */
export function trovaColorePerCodice(
  sistema: SistemaColore,
  codice: string,
): ColoreFinitura | undefined {
  const k = codice.trim().toLowerCase();
  return coloriFiniture.find(
    (c) => c.sistema === sistema && c.codice.toLowerCase() === k,
  );
}

/** Ricerca libera per codice o nome (substring, case-insensitive). */
export function cercaColore(query: string): ColoreFinitura[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return coloriFiniture.filter(
    (c) => c.codice.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q),
  );
}

/** Ricerca laminati per codice o descrizione (substring, case-insensitive). */
export function cercaLaminato(query: string): LaminatoAbet[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return laminatiAbet.filter(
    (l) =>
      l.codice.toLowerCase().includes(q) ||
      l.descrizione.toLowerCase().includes(q),
  );
}

/**
 * Validazione fail-loud dei dati statici: parse Zod di ogni record.
 * Pensata per i test (e opzionalmente per un check in dev). Lancia con
 * messaggio leggibile al primo record non conforme.
 */
export function validateFiniture(): void {
  coloriFiniture.forEach((c, i) => {
    const r = coloreFinituraSchema.safeParse(c);
    if (!r.success) {
      throw new Error(
        `Colore finitura non valido all'indice ${i} (${c.sistema} ${c.codice}): ${r.error.message}`,
      );
    }
  });
  laminatiAbet.forEach((l, i) => {
    const r = laminatoAbetSchema.safeParse(l);
    if (!r.success) {
      throw new Error(
        `Laminato ABET non valido all'indice ${i} (${l.codice}): ${r.error.message}`,
      );
    }
  });
}

// ── Opzioni per il combobox finiture (UI) ───────────────────────────────
// La stringa `value` è ciò che viene PERSISTITO nei campi finitura di
// ArticoloSuMisura (finituraInterna/Esterna/codiceFinitura) e che finisce nel
// PDF: per questo è "ricca" (codice + nome), auto-esplicativa, e i campi
// restano `string` (contratto invariato verso store/print).

export type GruppoFinitura = SistemaColore | 'Laminati ABET';

export interface OpzioneFinitura {
  /** Stringa display persistita, es. "RAL 9010 — Bianco puro". */
  value: string;
  /** Gruppo per le intestazioni nel listbox. */
  gruppo: GruppoFinitura;
  /** Colore swatch (#RRGGBB) per i colori; null per i laminati (chip neutro). */
  hex: string | null;
}

/** Etichetta ricca di un colore, es. "RAL 9010 — Bianco puro". */
export function etichettaColore(c: ColoreFinitura): string {
  return `${c.codice} — ${c.nome}`;
}

/** Etichetta ricca di un laminato, es. "ABET 1813 — MAGNOLIA". */
export function etichettaLaminato(l: LaminatoAbet): string {
  return `${l.azienda} ${l.codice} — ${l.descrizione}`;
}

export interface RisultatoFiniture {
  /** Opzioni già limitate a `cap` (per non montare centinaia di nodi). */
  opzioni: OpzioneFinitura[];
  /** Totale match prima del cap (per il messaggio "+X altri"). */
  totale: number;
}

/**
 * Ricerca unificata colori + laminati per il combobox. Query vuota → intero
 * catalogo (limitato a `cap`). Filtro substring case-insensitive su
 * codice/nome (colori) e codice/descrizione (laminati). Non lancia mai.
 */
export function cercaFiniture(query: string, cap = 50): RisultatoFiniture {
  const q = query.trim().toLowerCase();
  const colori = q === ''
    ? coloriFiniture
    : coloriFiniture.filter(
        (c) => c.codice.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q),
      );
  const laminati = q === ''
    ? laminatiAbet
    : laminatiAbet.filter(
        (l) => l.codice.toLowerCase().includes(q) || l.descrizione.toLowerCase().includes(q),
      );

  const opzioni: OpzioneFinitura[] = [
    ...colori.map((c): OpzioneFinitura => ({ value: etichettaColore(c), gruppo: c.sistema, hex: c.hex })),
    ...laminati.map((l): OpzioneFinitura => ({ value: etichettaLaminato(l), gruppo: 'Laminati ABET', hex: null })),
  ];

  return { opzioni: opzioni.slice(0, cap), totale: opzioni.length };
}
