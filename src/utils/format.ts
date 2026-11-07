// ── UNICA FONTE DI FORMATTAZIONE NUMERICA it-IT ──
// Importi → `formatEur`, quantità → `formatNum`, date → `formatDate`. MAI
// `toLocaleString` / `Intl.NumberFormat` / `toFixed` a mano nei componenti: il
// default `useGrouping: "auto"` segue il CLDR italiano (`minimumGroupingDigits=2`)
// e NON raggruppa sotto 10.000, mentre `toFixed` emette il punto decimale inglese.
// Sono bug silenziosi — il codice "sembra" giusto e passa la review.
//
// Non è teoria, è già successo, e non una volta sola:
//   · `TotalDisplay` chiamava `toLocaleString` a mano e mostrava "€ 1300,00" nel
//     totale di TUTTI e 5 i riepiloghi (fascia 1.000-9.999), due centimetri sotto
//     righe che dicevano "1.300,00". Pinnato in `__tests__/format.test.ts` e in
//     `components/layout/__tests__/TotalDisplay.test.tsx`.
//   · `print/PreventivoPrint` stampava i mq col `toFixed` ("0.72 mq") accanto a
//     importi con la virgola, nel PDF che va al cliente. Pinnato in
//     `components/print/__tests__/PreventivoPrint.test.tsx`.
//   · `sumisura/ArticoloConfigModal` stessa cosa sulle quantità ("2.50 MQ").
// Tutti e tre CORRETTI: sono istanze della stessa classe, non casi isolati.
//
// Escluse legittimamente: date/ora e dimensioni file in `admin/GestioneListini`
// (non sono numeri di dominio in it-IT). Sono le UNICHE esclusioni.

/** Returns 0 if value is NaN, Infinity, or -Infinity */
export function safeFin(n: number): number {
  return Number.isFinite(n) ? n : 0
}

export function formatEur(value: number): string {
  return safeFin(value).toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    // useGrouping:true FORZA il separatore delle migliaia da 1.000 in su. Senza,
    // il default moderno "auto" segue il CLDR italiano (minimumGroupingDigits=2),
    // che raggruppa solo da 10.000: 1300 → "1300,00" invece di "1.300,00" (in Node
    // E nel browser). Vedi src/utils/__tests__/format.test.ts.
    useGrouping: true,
  })
}

export function formatDate(isoDate: string): string {
  // Interpreta la parte YYYY-MM-DD nel fuso LOCALE, non UTC: `new Date("2026-05-28")`
  // sarebbe mezzanotte UTC e nei fusi a ovest scivolerebbe al giorno precedente.
  // Costruendo la Date dai componenti la ancoriamo al calendario locale.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(isoDate)
  return d.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatNum(value: number, decimals = 2): string {
  return value.toLocaleString('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true, // coerente con formatEur (vedi nota lì).
  })
}

const FORMATO_PERCENTUALE = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 2 })

/**
 * Frazione → percentuale italiana: "12,5%", "13%". Gli sconti decimali sono
 * ammessi (decisione del 06/10), quindi l'etichetta deve dire lo sconto che si
 * sta applicando: `Math.round` stampava "13%" accanto a un importo al 12,5%.
 * Due decimali, come il parser degli sconti (4 decimali di frazione): 12,34%.
 * Intl, non arrotondamenti a mano: niente rumore dei float (0,07 → "7%").
 */
export function formatPercent(frazione: number): string {
  return FORMATO_PERCENTUALE.format(frazione)
}

/** Lo stesso valore per un campo `type="number"`: esatto al centesimo di punto. */
export function percentualePerCampo(frazione: number): number {
  return Math.round(frazione * 10000) / 100
}

/** Misure (cm, ml) all'italiana, senza zeri inutili: 5,5 · 100 · 0,75. */
export function formatQuantita(valore: number): string {
  return safeFin(valore).toLocaleString('it-IT', { maximumFractionDigits: 2, useGrouping: true })
}

/**
 * La data di oggi in Italia, `AAAA-MM-GG` (C3, revisione L15-L21): quella di
 * un preventivo nuovo. Non `toISOString()`, che è in UTC (fra mezzanotte e
 * le due d'estate darebbe il giorno prima), e calcolata quando serve, non al
 * caricamento della pagina (un'app aperta da giorni darebbe una data vecchia).
 */
export function dataOggiItalia(adesso: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(adesso)
}
