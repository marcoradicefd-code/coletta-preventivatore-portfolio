import { z } from 'zod'
import type { ListinoMarmeria } from '@/types/marmeria'

/**
 * Validazione del listino Marmeria DOPO il parsing. Obiettivo: se il file Excel
 * del fornitore non è conforme (struttura cambiata, foglio vuoto, scaglioni
 * Rilievo/Montaggio incoerenti), fallire in modo EVIDENTE con un messaggio in
 * italiano leggibile nell'UI di caricamento, invece di alimentare silenziosamente
 * il modulo gres con un listino sbagliato.
 *
 * Schema "leggero" sui tipi base + `superRefine` con le regole di dominio e i
 * messaggi in italiano. Non modifica il listino: serve solo a dare un esito.
 */
const listinoMarmeriaSchema = z
  .object({
    materiali: z.array(z.unknown()),
    lavorazioniBordo: z.array(z.unknown()),
    lavorazioniVarie: z.array(z.unknown()),
    vascheIntegrate: z.array(z.unknown()),
    rilMontScaglioni: z.array(z.unknown()),
    scontiDisponibili: z.array(z.unknown()),
  })
  .superRefine((raw, ctx) => {
    const l = raw as unknown as ListinoMarmeria
    const segnala = (message: string) => ctx.addIssue({ code: 'custom', message })

    // ── Materiali (GAMMA_COLORI) ──
    if (l.materiali.length === 0) {
      segnala('nessun materiale letto dal foglio GAMMA_COLORI')
    }
    const senzaChiave = l.materiali.filter(
      (m) => !m?.coloreFinituraCompleto || String(m.coloreFinituraCompleto).trim() === ''
    ).length
    if (senzaChiave > 0) {
      segnala(`${senzaChiave} materiali senza colore/finitura (chiave mancante)`)
    }

    // Prezzi €/mq: numerici e positivi dove presenti; deve esisterne almeno uno
    // (zero prezzi numerici = struttura GAMMA_COLORI probabilmente cambiata).
    let prezziNumerici = 0
    let prezziNonPositivi = 0
    for (const m of l.materiali) {
      for (const sp of Object.values(m?.spessori ?? {})) {
        if (!sp) continue
        for (const v of [sp.prezziMq?.fino62, sp.prezziMq?.da63a70, sp.prezziMq?.oltre70]) {
          if (typeof v === 'number') {
            prezziNumerici++
            if (v <= 0) prezziNonPositivi++
          }
        }
      }
    }
    if (l.materiali.length > 0 && prezziNumerici === 0) {
      segnala('nessun prezzo €/mq numerico trovato: la struttura del foglio GAMMA_COLORI potrebbe essere cambiata')
    }
    if (prezziNonPositivi > 0) {
      segnala(`${prezziNonPositivi} prezzi €/mq non positivi`)
    }

    // ── Lavorazioni e sconti ──
    if (l.lavorazioniBordo.length === 0) {
      segnala('nessuna lavorazione bordo letta dal foglio MASTER_LAVORAZIONI')
    }
    if (l.scontiDisponibili.length === 0) {
      segnala('nessuna percentuale di sconto letta dal foglio PERCENTUALI SCONTO')
    }

    // ── RIL_MONT: fasce DA / A / IMPORTO coerenti ──
    if (l.rilMontScaglioni.length === 0) {
      segnala('nessuno scaglione Rilievo/Montaggio letto dal foglio RIL_MONT')
    } else {
      let importiPositivi = 0
      l.rilMontScaglioni.forEach((s, i) => {
        const n = i + 1
        const da = s?.da
        const a = s?.a
        const importo = s?.importo

        if (typeof da !== 'number' || !Number.isFinite(da) || da < 0) {
          segnala(`scaglione Rilievo/Montaggio #${n}: valore DA non valido`)
        }
        // L'importo può essere 0 (fascia senza addebito): vietati solo NaN/negativi.
        if (typeof importo !== 'number' || !Number.isFinite(importo) || importo < 0) {
          segnala(`scaglione Rilievo/Montaggio #${n}: IMPORTO non valido`)
        } else if (importo > 0) {
          importiPositivi++
        }

        // Una fascia a PERCENTUALE non ha un importo proprio: il suo `importo` è
        // il valore in cache della formula, tipicamente 0. Vale come fascia che
        // addebita — altrimenti un listino col solo montaggio percentuale
        // verrebbe rifiutato per "nessun importo > 0", che sarebbe falso.
        const pct = s?.percentuale
        if (pct !== undefined) {
          if (typeof pct !== 'number' || !Number.isFinite(pct) || pct <= 0 || pct >= 1) {
            segnala(`scaglione Rilievo/Montaggio #${n}: percentuale (${pct}) fuori range`)
          } else {
            importiPositivi++
          }
        }
        // `a` può essere null (fascia aperta); se valorizzato dev'essere ≥ da.
        if (a !== null && (typeof a !== 'number' || !Number.isFinite(a) || (typeof da === 'number' && a < da))) {
          segnala(`scaglione Rilievo/Montaggio #${n}: A (${a}) incoerente con DA (${da})`)
        }
      })

      for (let i = 1; i < l.rilMontScaglioni.length; i++) {
        const prev = l.rilMontScaglioni[i - 1]?.da
        const cur = l.rilMontScaglioni[i]?.da
        if (typeof prev === 'number' && typeof cur === 'number' && cur < prev) {
          segnala('scaglioni Rilievo/Montaggio non ordinati per DA crescente')
          break
        }
      }

      if (importiPositivi === 0) {
        segnala('nessuno scaglione Rilievo/Montaggio con importo > 0')
      }
    }
  })

/**
 * Valida un `ListinoMarmeria` parsato. Ritorna `{ ok: true }` se conforme,
 * altrimenti `{ ok: false, errore }` con un messaggio in italiano che aggrega i
 * problemi rilevati (deduplicati, max 6) — pronto da mostrare nell'UI.
 */
export function validaListinoMarmeria(
  listino: unknown
): { ok: true } | { ok: false; errore: string } {
  const res = listinoMarmeriaSchema.safeParse(listino)
  if (res.success) return { ok: true }

  const messaggi = [...new Set(res.error.issues.map((i) => i.message).filter(Boolean))]
  const errore = messaggi.length
    ? messaggi.slice(0, 6).join('; ') +
      (messaggi.length > 6 ? `; …(+${messaggi.length - 6} altri problemi)` : '')
    : 'struttura del listino non riconosciuta'

  return { ok: false, errore }
}
