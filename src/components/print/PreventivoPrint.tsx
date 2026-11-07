import { forwardRef, Fragment } from 'react'
import { useQuoteStore } from '@/store/quoteStore'
import { FALLBACK_ARREDI, FALLBACK_GRES, FALLBACK_PROGETTO_VALORE, FALLBACK_PORTE, FALLBACK_CUCINE } from '@/store/quoteFallbacks'
import { sezioneNonVuota, sezioniDaDefinire, type SezioneId } from '@/components/layout/sections'
import { calcArticolo, prezzoUnitarioConQuota, raggruppaPerArredo, ripartisciQuota, type ArticoloCalcolato } from '@/engine/calcSuMisura'
import { descrizioneCombinazione } from '@/engine/matriceFiniture'
import { importoRiga } from '@/engine/calcMarmeria'
import { importoRigaValore } from '@/engine/calcProgettoValore'
import { manigliaInclusa, origineValorizzata, type FasciaAltezza, type RigaPortaCalcolata, type RigaBattiscopaCalcolata } from '@/engine/calcPorte'
import { nomeManiglia } from '@/data/testiDefault'
import { aliquotaIvaSezione, aliquotaIvaValida, type AliquotaIva } from '@/engine/iva'
import { numeroDaStampare } from '@/utils/numeroPreventivo'
import { usePrezziPreventivo } from '@/hooks/usePrezziPreventivo'
import logoColetta from '@/assets/brand/logo-coletta.png'
import { formatEur, formatDate, formatNum, formatPercent, formatQuantita } from '@/utils/format'
import type { ArticoloSuMisura } from '@/types/sumisura'
import { CONDIZIONI_CONTRATTUALI, CONDIZIONI_FIRMA } from '@/data/condizioniContrattuali'
import { VASCA_DESCRIZIONE } from '@/data/gres/vascaGres'
import {
  includiNotePagamentoDi,
  testoNotePagamentoDi,
  descrizioneArrediDi,
  descrizioneCucinaDi,
  descrizionePortaDi,
  nomeClienteDi,
  descrizioneBattiscopaDi,
} from '@/store/quoteSelectors'

// ── Inline styles — no Tailwind dependency for print ──
const S = {
  page: {
    fontFamily: '"SF Pro Text", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
    fontSize: 13,
    color: '#111621',
    lineHeight: 1.5,
    padding: 32,
    maxWidth: 794, // A4-ish
  } as const,
  display: {
    fontFamily: '"DM Serif Display", Georgia, serif',
  } as const,
  mono: {
    fontFamily: '"SF Mono", ui-monospace, monospace',
    fontVariantNumeric: 'tabular-nums' as const,
  } as const,
  header: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    paddingBottom: 16,
    borderBottom: '2px solid #111621',
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: '"DM Serif Display", Georgia, serif',
    fontSize: 16,
    fontWeight: 700 as const,
    marginTop: 28,
    marginBottom: 12,
    color: '#111621',
    // C6: il titolo di sezione non resta solo in fondo alla pagina.
    breakAfter: 'avoid' as const,
    pageBreakAfter: 'avoid' as const,
  },
  /** Nome dell'arredo (L19), sottotitolo dentro la sezione Arredi. Mai orfano a fine pagina. */
  titoloArredo: {
    fontSize: 13,
    fontWeight: 700 as const,
    color: '#111621',
    marginTop: 12,
    marginBottom: 6,
    breakAfter: 'avoid' as const,
    pageBreakAfter: 'avoid' as const,
  },
  /** «Subtotale <nome>» dell'arredo: non si spezza fra due pagine, e non si stacca dalla sua tabella (C6). */
  subtotaleArredo: {
    maxWidth: 360,
    marginLeft: 'auto' as const,
    marginTop: -8,
    marginBottom: 12,
    breakInside: 'avoid' as const,
    pageBreakInside: 'avoid' as const,
    breakBefore: 'avoid' as const,
    pageBreakBefore: 'avoid' as const,
  },
  table: {
    width: '100%' as const,
    borderCollapse: 'collapse' as const,
    fontSize: 12,
    marginBottom: 16,
  } as const,
  th: {
    textAlign: 'left' as const,
    padding: '8px 10px',
    borderBottom: '2px solid #111621',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    color: '#3D4252',
  },
  thRight: {
    textAlign: 'right' as const,
    padding: '8px 10px',
    borderBottom: '2px solid #111621',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    color: '#3D4252',
  },
  td: {
    padding: '7px 10px',
    borderBottom: '1px solid #E2E4E9',
    verticalAlign: 'top' as const,
  },
  /** Una cella d'importo: mai a capo (C4: «€» da solo sopra il numero). */
  tdRight: {
    padding: '7px 10px',
    borderBottom: '1px solid #E2E4E9',
    textAlign: 'right' as const,
    whiteSpace: 'nowrap' as const,
    fontFamily: '"SF Mono", ui-monospace, monospace',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  totalRow: {
    background: '#111621',
    color: '#FFFFFF',
    fontWeight: 700,
  } as const,
  totalCell: {
    padding: '10px 10px',
    color: '#FFFFFF',
    fontWeight: 700,
  },
  totalCellRight: {
    padding: '10px 10px',
    color: '#FFFFFF',
    fontWeight: 700,
    textAlign: 'right' as const,
    fontFamily: '"SF Mono", ui-monospace, monospace',
    fontSize: 14,
    whiteSpace: 'nowrap' as const,
  },
  subtotalRow: {
    fontWeight: 600 as const,
    borderTop: '1px solid #111621',
  },
  label: {
    fontSize: 11,
    color: '#6B7385',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    marginBottom: 2,
  },
  value: {
    fontSize: 13,
    color: '#111621',
  },
  signatureLine: {
    borderBottom: '1px dashed #A8AFBE',
    width: 200,
    height: 40,
    marginBottom: 4,
  },
  // ── Condizioni contrattuali (annex, stampa) ──
  // L'annex parte su pagina nuova; ogni sezione resta integra (break-inside:
  // avoid) e i titoli non rimangono orfani a fine pagina (break-after: avoid).
  condizioniBlock: {
    breakBefore: 'page' as const,
    pageBreakBefore: 'always' as const,
    marginTop: 32,
  },
  condizioniSezione: {
    breakInside: 'avoid' as const,
    pageBreakInside: 'avoid' as const,
    // Lo stacco tra sezioni è dato dal marginTop applicato per-sezione (tranne
    // la prima) nel render: il margine in cima alla pagina viene troncato in
    // stampa, quindi non lascia gap sui page-break.
    marginBottom: 0,
  },
  condizioniTitolo: {
    fontSize: 12,
    fontWeight: 700 as const,
    color: '#111621',
    letterSpacing: '0.02em',
    marginBottom: 6,
    breakAfter: 'avoid' as const,
    pageBreakAfter: 'avoid' as const,
  },
  condizioniParagrafo: {
    fontSize: 11,
    color: '#3D4252',
    lineHeight: 1.55,
    margin: '0 0 6px 0',
    textAlign: 'justify' as const,
  },
  condizioniFirma: {
    breakInside: 'avoid' as const,
    pageBreakInside: 'avoid' as const,
    marginTop: 28,
  },
}

/**
 * Larghezze delle colonne con importi (C4): reggono «€ 99.999,00» e un prezzo
 * unitario a cinque cifre su una riga, in monospace a 12 px più il padding.
 */
const LARGHEZZA_IMPORTO = 104
const LARGHEZZA_PREZZO = 96

// Titolo di sezione nel PDF, per dire quali sezioni rendono parziale il totale.
const TITOLO_PDF: Record<SezioneId, string> = {
  cucine: 'Cucina',
  gres: 'Marmeria / Gres',
  arredi: 'Falegnameria Su Misura',
  porte: 'Porte',
  progettoValore: 'Progetto su misura',
}

// Etichetta fascia altezza per la tabella Porte (SPEC §B.4).
const FASCIA_PDF: Record<FasciaAltezza, string> = { base: '≤215', h215: '>215', h240: '>240' }

export const PreventivoPrint = forwardRef<HTMLDivElement>(function PreventivoPrint(_, ref) {
  const preventivo = useQuoteStore((s) => s.preventivo)
  const sezioni = useQuoteStore((s) => s.sezioni)
  const archivio = useQuoteStore((s) => s.archivio)
  // Salvato: il numero del database (`AAAA-NNN`, L21); bozza: quello scritto a mano.
  const numero = numeroDaStampare(preventivo, archivio)
  // L21-B: un preventivo annullato si può ristampare, ma lo dice in intestazione.
  const annullato = archivio?.preventivo?.stato === 'annullato'
  const quoteSM = sezioni.arredi ?? FALLBACK_ARREDI
  const quoteMM = sezioni.gres ?? FALLBACK_GRES
  const quotePV = sezioni.progettoValore ?? FALLBACK_PROGETTO_VALORE
  const quotePorte = sezioni.porte ?? FALLBACK_PORTE
  const quoteCucine = sezioni.cucine ?? FALLBACK_CUCINE
  // Strada A (Marco, 14/10): tutto ciò che viene dai listini passa da qui. Per
  // la bozza è il calcolo di adesso; per un inviato, accettato o annullato sono
  // i prezzi congelati al salvataggio (`dati.prezzi`), quindi il PDF esce
  // identico a quello mandato al cliente anche se il listino è cambiato. Lo
  // stesso calcolo (`calcolaPreventivo`) dà il totale imponibile salvato.
  // Senza listino gres o cucine quella sezione è `null`: il blocco dice «da definire».
  const { vista } = usePrezziPreventivo()
  const { resultSM, resultMM, resultPV, resultPorte, resultCucine, iva } = vista.calcolo

  // Predicato condiviso (sections.sezioneNonVuota): le sezioni vuote restano fuori
  // dal PDF. Comportamento INVARIATO — arredi: articoli>0; gres: totLordo>0 (come
  // prima `hasMarmeria`, qui via il calcolo passato in `gresTotLordo`).
  const hasSuMisura = sezioneNonVuota('arredi', sezioni)
  const hasPorte = sezioneNonVuota('porte', sezioni)
  const hasProgettoValore = sezioneNonVuota('progettoValore', sezioni)
  const hasMarmeria = sezioneNonVuota('gres', sezioni, {
    gresTotLordo: resultMM?.totLordo ?? 0,
    gresDaDefinire: resultMM?.lavorazioniDaDefinire ?? 0,
  })
  const hasCucine = sezioneNonVuota('cucine', sezioni)
  // Sezioni con importi da definire (cucina senza listino o con voci fuori
  // catalogo, gres senza listino, porte o battiscopa non valorizzati):
  // con almeno una, il totale finale si dichiara PARZIALE e dice perché. Il gres
  // senza listino ha anche "Genera" spento (useBloccoPdf); qui la seconda difesa,
  // perché il documento non lo escluda in silenzio.
  const daDefinire = sezioniDaDefinire(sezioni, {
    cucineDaDefinire: resultCucine?.vociDaDefinire ?? 0,
    listinoCucine: vista.listinoCucine,
    listinoGres: vista.listinoGres,
    porteDaDefinire: resultPorte.daDefinire,
    gresLavorazioniDaDefinire: resultMM?.lavorazioniDaDefinire ?? 0,
  })
  // Il blocco «Listino non disponibile» è solo per il gres SENZA listino: con il
  // listino e qualche lavorazione da definire il gres è nel blocco normale.
  const gresSenzaListino = !vista.listinoGres && daDefinire.includes('gres')
  const cucineSenzaListino = !vista.listinoCucine && daDefinire.includes('cucine')
  const totaleParziale = daDefinire.length > 0
  // Document-level, con fallback sul vecchio campo di sezione (vedi
  // includiNotePagamentoDi): decide sia il blocco in coda sia la riga generica
  // nella lista note, che non devono mai comparire insieme.
  const mostraNotePagamento = includiNotePagamentoDi(preventivo, sezioni.arredi)
  // IVA (L18): `iva` viene da `calcolaPreventivo`. Con sezioni da definire riceve
  // solo quello che il totale contiene, quindi l'IVA è quella del parziale e le
  // etichette lo dicono.
  const ivaArredi = aliquotaIvaSezione(quoteSM.aliquotaIva)
  const ivaPorte = aliquotaIvaSezione(quotePorte.aliquotaIva)
  // La colonna IVA nelle righe serve solo se il preventivo usa più di un'aliquota:
  // con una sola, il riepilogo finale la dice già.
  const piuAliquote = iva.righe.length > 1
  const thIva = piuAliquote ? <th style={{ ...S.th, textAlign: 'center', width: 44 }}>IVA</th> : null
  // Prima dell'importo, mai l'ultima colonna: l'ultima è sempre l'importo della riga.
  const tdIva = (aliquota: AliquotaIva) =>
    piuAliquote ? <td style={{ ...S.td, textAlign: 'center' }}>{aliquota}%</td> : null
  // Arredi (L19): con gli arredi, un blocco per arredo non vuoto (nome, le sue
  // righe, «Subtotale <nome>») e poi «Altre voci»; senza, la tabella di sempre.
  // Il riepilogo della sezione resta quello di prima: sconto e progettazione
  // sono di sezione, e la somma dei subtotali è il «Subtotale falegnameria».
  const gruppiArredi = (quoteSM.arredi?.length ?? 0) > 0
    ? raggruppaPerArredo(quoteSM.articoli, quoteSM.arredi).filter((g) => g.articoli.length > 0)
    : []
  // Quota progettazione spalmata nelle righe (L25, Antonio 15/10): ogni riga
  // esce col suo pezzo di quota (`ripartisciQuota`, all'euro, resti maggiori),
  // e la riga «Quota progettazione» non c'è. Gli importi della sezione non
  // cambiano: Subtotale falegnameria = subtotale + quota, Totale di sempre. Senza
  // quota i mostrati sono i totali delle righe, quindi il PDF è quello di prima.
  const mostrati = ripartisciQuota(quoteSM.articoli.map((a) => calcArticolo(a).totale), resultSM.quotaProgettazione)
  const totaliMostrati = new Map(quoteSM.articoli.map((a, i) => [a, mostrati[i]] as const))
  const quotaSpalmata = resultSM.quotaProgettazione > 0
  const tabellaArticoli = (articoli: ArticoloSuMisura[]) => (
    <table style={S.table}>
      <thead>
        <tr>
          <th style={S.th}>Descrizione</th>
          <th style={{ ...S.th, width: 150 }}>Dettaglio</th>
          <th style={{ ...S.thRight, width: LARGHEZZA_PREZZO }}>€/unit</th>
          {thIva}
          <th style={{ ...S.thRight, width: LARGHEZZA_IMPORTO }}>Totale</th>
        </tr>
      </thead>
      <tbody>
        {articoli.map((a) => {
          const c = calcArticolo(a)
          const totaleMostrato = totaliMostrati.get(a) ?? c.totale
          const finiture = [a.finituraInterna, a.finituraEsterna, a.codiceFinitura].filter(Boolean).join(' / ')
          const maggiorazioni = [c.applica20 && '+20% <3mq', c.applica15 && '+15% prof.', c.applica10 && '−10% prof.']
            .filter(Boolean)
            .join(' · ')
          return (
            <tr key={a.id}>
              <td style={S.td}>
                {/* Elemento da matrice (L20): «Armadio con ante — interno …, esterno …». */}
                <div>{a.combinazione ? `${a.descrizione} — ${descrizioneCombinazione(a.combinazione)}` : a.descrizione}</div>
                {finiture && <div style={{ fontSize: 10, color: '#6B7385' }}>{finiture}</div>}
                {a.note && <div style={{ fontSize: 10, color: '#6B7385', fontStyle: 'italic' }}>{a.note}</div>}
                {maggiorazioni && <div style={{ fontSize: 10, color: '#6B7385' }}>{maggiorazioni}</div>}
              </td>
              <td style={S.td}>{dettaglioArticolo(a, c, quoteSM.mostraMqInPdf)}</td>
              <td style={S.tdRight}>€ {formatEur(prezzoUnitarioConQuota(a.prezzoUnitario, c.totale, totaleMostrato))}</td>
              {tdIva(aliquotaIvaValida(a.aliquotaIva) ?? ivaArredi)}
              <td style={S.tdRight}>€ {formatEur(totaleMostrato)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
  const ivaGres = aliquotaIvaSezione(quoteMM.aliquotaIva)
  const ivaPV = aliquotaIvaSezione(quotePV.aliquotaIva)
  const { cliente } = preventivo

  return (
    <div ref={ref} style={S.page}>
      {/* ── HEADER ── */}
      <div style={S.header}>
        <div>
          <img src={logoColetta} alt="Coletta" style={{ height: 48, width: 'auto' }} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...S.display, fontSize: 22, color: '#C8102E' }}>
            PREVENTIVO
          </div>
          {annullato && (
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 2, color: '#DC2626', border: '2px solid #DC2626', padding: '2px 8px', marginTop: 4, display: 'inline-block' }}>
              ANNULLATO
            </div>
          )}
          <div style={{ fontSize: 12, color: '#3D4252', marginTop: 4 }}>
            N. {numero || '—'} del {preventivo.data ? formatDate(preventivo.data) : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#6B7385' }}>
            Validità: {preventivo.validitaGiorni} giorni
          </div>
        </div>
      </div>

      {/* ── CLIENTE ── */}
      <div style={{ display: 'flex', gap: 40, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={S.label}>Cliente</div>
          <div style={{ ...S.value, fontWeight: 600 }}>
            {nomeClienteDi(cliente)}
          </div>
          {cliente.indirizzo && <div style={S.value}>{cliente.indirizzo}</div>}
          {cliente.citta && <div style={S.value}>{cliente.citta}</div>}
          {cliente.telefono && <div style={{ ...S.value, fontSize: 11, color: '#6B7385', marginTop: 4 }}>Tel: {cliente.telefono}</div>}
          {cliente.email && <div style={{ ...S.value, fontSize: 11, color: '#6B7385' }}>{cliente.email}</div>}
        </div>
      </div>

      {/* ── OGGETTO ── */}
      {preventivo.oggettoPreventivo && (
        <div style={{ marginBottom: 20, padding: '10px 12px', background: '#F7F7F8', borderRadius: 6 }}>
          <div style={S.label}>Oggetto</div>
          <div style={S.value}>{preventivo.oggettoPreventivo}</div>
        </div>
      )}

      {/* ── SEZIONE CUCINA (per prima, ordine SPEC §A.2) ── */}
      {/* Descrizione "a corpo" VISIBILE; le ~60 voci restano NASCOSTE (richiesta
          Antonio): il body mostra solo la descrizione. Il summary stampa SOLO il
          totale, cioè l'imponibile (Antonio 12/10): sconto, progettazione,
          adeguamento, giorni ed extra li vede l'operatore in CucineRiepilogo. */}
      {hasCucine && resultCucine && vista.listinoCucine && (
        <SezioneBlock
          titolo="Cucina"
          summary={
            <>
              {/* Le voci fuori catalogo non sono sommate come zero (O5): il totale lo dice. */}
              <SummaryRow
                label={resultCucine.vociDaDefinire > 0 ? 'Totale parziale cucina' : 'Totale cucina'}
                value={resultCucine.imponibile}
                bold
              />
              {/* Nessun importo: segnala il buco che rende parziale il totale. */}
              {vista.giornoRateCucina === null && quoteCucine.giorniExtra > 0 && (
                <div style={{ fontSize: 12, color: '#8A8F98', textAlign: 'right' }}>
                  Giorni extra ({quoteCucine.giorniExtra}) — da definire
                </div>
              )}
              {resultCucine.vociDaDefinire > 0 && (
                <div style={{ fontSize: 10, color: '#8A8F98', textAlign: 'right', marginTop: 2 }}>
                  totale parziale — {resultCucine.vociDaDefinire}{' '}
                  {resultCucine.vociDaDefinire === 1 ? 'voce da definire' : 'voci da definire'}
                </div>
              )}
            </>
          }
        >
          {/* Niente guardia: la descrizione ha un default (DOCX 25/07), quindi
              esiste sempre. `whiteSpace: pre-wrap` tiene gli a-capo del testo. */}
          <div style={{ fontSize: 12, color: '#3D4252', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 8 }}>
            {descrizioneCucinaDi(quoteCucine)}
          </div>
        </SezioneBlock>
      )}

      {/* Cucina compilata senza listino: il blocco resta, con gli importi da
          definire (seconda difesa: «Genera» è già spento, useBloccoPdf). */}
      {cucineSenzaListino && (
        <SezioneBlock
          titolo="Cucina"
          summary={
            <div style={{ fontSize: 12, color: '#8A8F98', textAlign: 'right' }}>Totale Cucina — da definire</div>
          }
        >
          <div style={{ fontSize: 12, color: '#3D4252', marginBottom: 8 }}>
            Listino non disponibile: importi da definire
          </div>
        </SezioneBlock>
      )}

      {/* ── SEZIONE MARMERIA ── */}
      {hasMarmeria && resultMM && (
        <SezioneBlock
          titolo="Marmeria / Gres"
          summary={
            <>
              <SummaryRow label="Totale materiali" value={resultMM.totMateriali} />
              {/* Minimo fatturabile 2 mq: riga sua, così il lordo torna con le righe stampate. */}
              {resultMM.integrazioneMinimo > 0 && (
                <SummaryRow label="Integrazione ordine minimo 2 mq" value={resultMM.integrazioneMinimo} />
              )}
              <SummaryRow label="Totale alzatine" value={resultMM.totAlzatine} />
              <SummaryRow label="Totale lavorazioni bordo" value={resultMM.totLavorazioniBordo} />
              <SummaryRow label="Totale lavorazioni varie" value={resultMM.totLavorazioniVarie} />
              {/* Voce a corpo opzionale: riga solo se inclusa e valorizzata (una
                  riga da € 0,00 nel PDF del cliente sarebbe rumore). */}
              {resultMM.totVasca > 0 && (
                <SummaryRow label={VASCA_DESCRIZIONE} value={resultMM.totVasca} />
              )}
              <SummaryRow label="Totale lordo" value={resultMM.totLordo} bold />
              {resultMM.sconto > 0 && (
                <SummaryRow label={`Sconto (${formatPercent(quoteMM.sconto)})`} value={-resultMM.sconto} />
              )}
              <SummaryRow label="Totale scontato" value={resultMM.totScontato} bold />
              {resultMM.costoRilMont > 0 && (
                <SummaryRow label="Rilievo e montaggio" value={resultMM.costoRilMont} />
              )}
              <SummaryRow label="Totale Marmeria" value={resultMM.totaleFinale} bold />
              {resultMM.lavorazioniDaDefinire > 0 && (
                // Come le porte: le lavorazioni senza prezzo non sono sommate come zero.
                <div style={{ fontSize: 10, color: '#8A8F98', textAlign: 'right', marginTop: 2 }}>
                  totale parziale — {resultMM.lavorazioniDaDefinire}{' '}
                  {resultMM.lavorazioniDaDefinire === 1 ? 'lavorazione da definire' : 'lavorazioni da definire'}
                </div>
              )}
            </>
          }
        >

          {/* Materiali */}
          {quoteMM.righeMateriali.length > 0 && (
            <>
              <div style={{ ...S.label, marginBottom: 6, marginTop: 12 }}>Top — Schienali — Fianchi (€/mq)</div>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Materiale</th>
                    <th style={{ ...S.th, textAlign: 'center', width: 45 }}>mm</th>
                    <th style={{ ...S.thRight, width: 60 }}>Mq</th>
                    <th style={{ ...S.thRight, width: LARGHEZZA_PREZZO }}>€/mq</th>
                    {thIva}
                    <th style={{ ...S.thRight, width: LARGHEZZA_IMPORTO }}>Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteMM.righeMateriali.map((r) => {
                    return (
                      <tr key={r.id}>
                        <td style={S.td}>{vista.nomiMateriali[r.materialeKey] ?? r.materialeKey}</td>
                        <td style={{ ...S.td, textAlign: 'center' }}>{r.spessore}</td>
                        <td style={S.tdRight}>{formatQuantita(r.qtaMq)}</td>
                        <td style={S.tdRight}>€ {formatEur(r.prezzoMq)}</td>
                        {tdIva(ivaGres)}
                        {/* L'importo dell'engine, mai `r.totale` persistito: un
                            localStorage manomesso lo stampava diverso dal totale (A4). */}
                        <td style={S.tdRight}>€ {formatEur(importoRiga(r.qtaMq, r.prezzoMq))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}

          {/* Alzatine */}
          {quoteMM.righeAlzatine.length > 0 && (
            <>
              <div style={{ ...S.label, marginBottom: 6, marginTop: 12 }}>Alzatine (€/ml)</div>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Materiale</th>
                    <th style={{ ...S.thRight, width: 60 }}>Ml</th>
                    <th style={{ ...S.thRight, width: LARGHEZZA_PREZZO }}>€/ml</th>
                    {thIva}
                    <th style={{ ...S.thRight, width: LARGHEZZA_IMPORTO }}>Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteMM.righeAlzatine.map((r) => {
                    return (
                      <tr key={r.id}>
                        <td style={S.td}>{vista.nomiMateriali[r.materialeKey] ?? r.materialeKey}</td>
                        <td style={S.tdRight}>{formatQuantita(r.qtaMl)}</td>
                        <td style={S.tdRight}>€ {formatEur(r.prezzoMl)}</td>
                        {tdIva(ivaGres)}
                        <td style={S.tdRight}>€ {formatEur(importoRiga(r.qtaMl, r.prezzoMl))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}

          {/* Lavorazioni bordo */}
          {quoteMM.righeLavorazioniBordo.length > 0 && (
            <>
              <div style={{ ...S.label, marginBottom: 6, marginTop: 12 }}>Lavorazioni bordo (€/ml)</div>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Lavorazione</th>
                    <th style={{ ...S.thRight, width: 60 }}>Ml</th>
                    <th style={{ ...S.thRight, width: LARGHEZZA_PREZZO }}>€/ml</th>
                    {thIva}
                    <th style={{ ...S.thRight, width: LARGHEZZA_IMPORTO }}>Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteMM.righeLavorazioniBordo.map((r) => {
                    // Prezzo dallo stesso helper che usa calcMarmeria per il totale
                    // di sezione (`vistaPrezzi`, dal vivo o congelato con lui):
                    // righe e totale del PDF non possono divergere. Con
                    // `r.prezzoMl`/`r.totale` (snapshot) il documento si contraddiceva:
                    // le righe non sommavano al proprio totale dopo un cambio listino.
                    // `null` = il listino non sa prezzarla: «da definire», mai € 0,00 (A2).
                    const lav = vista.lavorazioniBordo[String(r.lavorazioneId)]
                    const prezzoMl = lav?.prezzoMl ?? null
                    return (
                      <tr key={r.lavorazioneId}>
                        <td style={S.td}>{lav?.descrizione ?? `Lavorazione #${r.lavorazioneId}`}</td>
                        <td style={S.tdRight}>{formatQuantita(r.qtaMl)}</td>
                        <td style={S.tdRight}>{prezzoMl === null ? '—' : `€ ${formatEur(prezzoMl)}`}</td>
                        {tdIva(ivaGres)}
                        <td style={S.tdRight}>
                          {prezzoMl === null ? 'prezzo da definire' : `€ ${formatEur(importoRiga(r.qtaMl, prezzoMl))}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}

          {/* Lavorazioni varie */}
          {quoteMM.righeVarie.length > 0 && (
            <>
              <div style={{ ...S.label, marginBottom: 6, marginTop: 12 }}>Lavorazioni varie</div>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Lavorazione</th>
                    <th style={{ ...S.thRight, width: 60 }}>Qtà</th>
                    <th style={{ ...S.thRight, width: LARGHEZZA_PREZZO }}>€/pz</th>
                    {thIva}
                    <th style={{ ...S.thRight, width: LARGHEZZA_IMPORTO }}>Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteMM.righeVarie.map((r, i) => {
                    // Stesso pattern del bordo qui sopra: prezzo dall'helper
                    // dell'engine (in `vistaPrezzi`), totale ricalcolato. Le varie si
                    // risolvono per descrizione (non hanno id), come in calcMarmeria.
                    const prezzoUnit = vista.lavorazioniVarie[r.descrizione] ?? null
                    return (
                      <tr key={i}>
                        <td style={S.td}>{r.descrizione}</td>
                        <td style={S.tdRight}>{formatQuantita(r.qta)}</td>
                        <td style={S.tdRight}>{prezzoUnit === null ? '—' : `€ ${formatEur(prezzoUnit)}`}</td>
                        {tdIva(ivaGres)}
                        <td style={S.tdRight}>
                          {prezzoUnit === null ? 'prezzo da definire' : `€ ${formatEur(importoRiga(r.qta, prezzoUnit))}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}

        </SezioneBlock>
      )}

      {gresSenzaListino && (
        <SezioneBlock
          titolo="Marmeria / Gres"
          summary={
            <div style={{ fontSize: 12, color: '#8A8F98', textAlign: 'right' }}>Totale Marmeria — da definire</div>
          }
        >
          <div style={{ fontSize: 12, color: '#3D4252', marginBottom: 8 }}>
            Listino non disponibile: importi da definire
          </div>
        </SezioneBlock>
      )}

      {/* ── SEZIONE SU MISURA ── */}
      {hasSuMisura && (
        <SezioneBlock
          titolo="Falegnameria Su Misura"
          summary={
            <>
              <SummaryRow label="Subtotale falegnameria" value={resultSM.subtotale + resultSM.quotaProgettazione} />
              {/* Lo sconto è sul lordo SENZA quota (BR-005): accanto a un subtotale
                  che la contiene la percentuale non tornerebbe, quindi con la
                  quota si stampa solo l'importo (L25, scelta confermata da Marco). */}
              {resultSM.sconto > 0 && (
                <SummaryRow
                  label={quotaSpalmata ? 'Sconto' : `Sconto (${formatPercent(quoteSM.sconto)})`}
                  value={-resultSM.sconto}
                />
              )}
              <SummaryRow label="Totale Su Misura" value={resultSM.totale} bold />
            </>
          }
        >
          {/* Testo descrittivo di sezione (DOCX 25/07): sopra le voci, come le
              caratteristiche generali del preventivo cartaceo. */}
          <div style={{ fontSize: 12, color: '#3D4252', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 10 }}>
            {descrizioneArrediDi(quoteSM)}
          </div>
          {gruppiArredi.length === 0
            ? tabellaArticoli(quoteSM.articoli)
            : gruppiArredi.map((g) => {
                const nome = g.arredo ? g.arredo.nome.trim() || 'Arredo senza nome' : 'Altre voci'
                return (
                  <div key={g.arredo?.id ?? 'altre-voci'}>
                    <div style={S.titoloArredo}>{nome}</div>
                    {tabellaArticoli(g.articoli)}
                    <div style={S.subtotaleArredo} data-subtotale-arredo="">
                      {/* La somma delle righe mostrate, quota compresa (L25). */}
                      <SummaryRow
                        label={`Subtotale ${nome}`}
                        value={g.articoli.reduce((t, a) => t + (totaliMostrati.get(a) ?? 0), 0)}
                      />
                    </div>
                  </div>
                )
              })}

        </SezioneBlock>
      )}

      {/* ── SEZIONE PORTE (tra arredi e progetto a valore — ordine SPEC §A.2) ── */}
      {hasPorte && (
        <SezioneBlock
          titolo="Porte"
          summary={
            <>
              <SummaryRow label="Subtotale" value={resultPorte.subtotale} />
              {resultPorte.sconto > 0 && (
                <SummaryRow label={`Sconto (${formatPercent(quotePorte.sconto)})`} value={-resultPorte.sconto} />
              )}
              <SummaryRow
                label={resultPorte.daDefinire > 0 ? 'Totale parziale Porte' : 'Totale Porte'}
                value={resultPorte.totale}
                bold
              />
              {resultPorte.daDefinire > 0 && (
                // Il totale è parziale e lo dice: le righe senza prezzo non sono
                // sommate come zero, che abbasserebbe il conto in silenzio.
                <div style={{ fontSize: 10, color: '#8A8F98', textAlign: 'right', marginTop: 2 }}>
                  totale parziale — {resultPorte.daDefinire}{' '}
                  {resultPorte.daDefinire === 1 ? 'voce da definire' : 'voci da definire'}
                </div>
              )}
            </>
          }
        >
          <table style={S.table}>
            <thead>
              <tr>
                {/* Formato del preventivo 1147: Quantità · Prezzo · Importo. */}
                <th style={S.th}>Modello</th>
                <th style={{ ...S.th, width: 110 }}>Altezza / fascia</th>
                <th style={S.th}>Optional</th>
                <th style={{ ...S.th, textAlign: 'center', width: 40 }}>Qtà</th>
                <th style={{ ...S.thRight, width: LARGHEZZA_IMPORTO }}>Prezzo unitario</th>
                {thIva}
                <th style={{ ...S.thRight, width: LARGHEZZA_IMPORTO }}>Importo</th>
              </tr>
            </thead>
            <tbody>
              {resultPorte.righe.map((r) => {
                const riga = quotePorte.righe.find((rr) => rr.id === r.id)
                const optional =
                  riga && riga.optionals.length > 0
                    ? riga.optionals.map((o) => o.nome).join(', ')
                    : '—'
                // Riga senza un importo vero (prezzo non ricostruibile o misure
                // mancanti): "€ 0,00" su un PDF che va al cliente è una promessa,
                // e quella porta gliel'avresti appena regalata.
                const nonValorizzata = !origineValorizzata(r.origine)
                return (
                  <tr key={r.id}>
                    <td style={S.td}>
                      <div>{r.modelloNome || '(nessun modello)'}</div>
                      {/* Descrizione della RIGA: scritta a mano, o composta dal
                          modello di questa riga (vedi RigaPorta.descrizione). */}
                      {riga && (
                        <div style={{ fontSize: 10, color: '#6B7385', marginTop: 2 }}>
                          {descrizionePortaDi(riga)}
                        </div>
                      )}
                      {/* Voce maniglia: quantità e importo PROPRI, perché sta
                          fuori dal moltiplicatore delle porte. Il testo di
                          default qui sopra la nomina già; questa riga dice cosa
                          costa, così il cliente non deve dedurlo dal totale.
                          Sotto una riga fuori dal subtotale la voce resta ma
                          senza importo: un € che non sta in nessun totale. */}
                      {riga?.maniglia && r.totaleManiglia > 0 && (
                        <div style={{ fontSize: 10, color: '#6B7385', marginTop: 2 }}>
                          + maniglia {[riga.maniglia.modello, riga.maniglia.finitura].filter((s) => s.trim() !== '').join(' ')}
                          {' '}× {riga.maniglia.qta}
                          {!nonValorizzata && ` = € ${formatEur(r.totaleManiglia)}`}
                        </div>
                      )}
                      {/* Maniglia senza prezzo = inclusa (Antonio 06/10): la voce
                          lo dice e non stampa importi, perché non ce ne sono.
                          Resta anche quando la descrizione è scritta a mano. */}
                      {riga?.maniglia && manigliaInclusa(riga.maniglia) && riga.maniglia.modello.trim() !== '' && (
                        <div style={{ fontSize: 10, color: '#6B7385', marginTop: 2 }}>
                          + maniglia {nomeManiglia(riga.maniglia)} — inclusa
                        </div>
                      )}
                    </td>
                    {/* Senza altezza la fascia non esiste: trattino, mai «0 cm · fascia base». */}
                    <td style={S.td}>{r.altezzaCm > 0 ? `${r.altezzaCm} cm · ${FASCIA_PDF[r.fascia]}` : '—'}</td>
                    <td style={S.td}>{optional}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>{r.quantita}</td>
                    <td style={S.tdRight}>
                      {nonValorizzata ? '—' : `€ ${formatEur(r.prezzoUnitarioRiga)}`}
                    </td>
                    {tdIva(aliquotaIvaValida(riga?.aliquotaIva) ?? ivaPorte)}
                    <td style={S.tdRight}>
                      {importoPorta(r)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Battiscopa a corpo: tabella propria, stesse colonne delle porte
              (formato 1147). Sta dentro il blocco Porte perché è la stessa
              sezione commerciale e lo stesso sconto, ma FUORI dalla tabella
              delle porte perché non è moltiplicato per la loro quantità. */}
          {resultPorte.battiscopa.length > 0 && (
            <>
              <div style={{ ...S.label, marginBottom: 6, marginTop: 12 }}>Battiscopa</div>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Voce</th>
                    <th style={{ ...S.th, textAlign: 'center', width: 60 }}>ml</th>
                    <th style={{ ...S.thRight, width: LARGHEZZA_IMPORTO }}>€/ml</th>
                    {thIva}
                    <th style={{ ...S.thRight, width: LARGHEZZA_IMPORTO }}>Importo</th>
                  </tr>
                </thead>
                <tbody>
                  {resultPorte.battiscopa.map((b) => {
                    const riga = quotePorte.battiscopa?.find((x) => x.id === b.id)
                    const valorizzata = origineValorizzata(b.origine)
                    const aliquota = aliquotaIvaValida(riga?.aliquotaIva) ?? ivaPorte
                    return (
                      <Fragment key={b.id}>
                        <tr>
                          <td style={S.td}>
                            <div>{b.nome}</div>
                            {riga && (
                              <div style={{ fontSize: 10, color: '#6B7385', marginTop: 2 }}>
                                {descrizioneBattiscopaDi(riga, b)}
                              </div>
                            )}
                          </td>
                          <td style={{ ...S.td, textAlign: 'center' }}>
                            {valorizzata ? formatQuantita(b.metriLineari) : '—'}
                          </td>
                          <td style={S.tdRight}>{valorizzata ? `€ ${formatEur(b.prezzoMl)}` : '—'}</td>
                          {tdIva(aliquota)}
                          <td style={S.tdRight}>{importoBattiscopa(b)}</td>
                        </tr>
                        {/* Posa: riga propria, solo se c'è. Non prende il +20%. */}
                        {valorizzata && b.posa > 0 && (
                          <tr>
                            <td style={S.td}>
                              Posa — {formatQuantita(b.metriLineari)} ml × {formatEur(b.prezzoPosaMl)} €/ml
                            </td>
                            <td style={{ ...S.td, textAlign: 'center' }}>{formatQuantita(b.metriLineari)}</td>
                            <td style={S.tdRight}>€ {formatEur(b.prezzoPosaMl)}</td>
                            {tdIva(aliquota)}
                            <td style={S.tdRight}>€ {formatEur(b.posa)}</td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </SezioneBlock>
      )}

      {/* ── SEZIONE PROGETTO A VALORE (ultima: il Gres sta dopo la Cucina, Antonio 09/09) ── */}
      {hasProgettoValore && (
        <SezioneBlock
          titolo="Progetto su misura"
          summary={
            <>
              <SummaryRow label="Subtotale" value={resultPV.subtotale} />
              {resultPV.sconto > 0 && (
                <SummaryRow label={`Sconto (${formatPercent(quotePV.sconto)})`} value={-resultPV.sconto} />
              )}
              <SummaryRow label="Totale progetto su misura" value={resultPV.totale} bold />
            </>
          }
        >
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Descrizione</th>
                {thIva}
                <th style={{ ...S.thRight, width: 110 }}>Prezzo</th>
              </tr>
            </thead>
            <tbody>
              {quotePV.righe.map((r) => (
                <tr key={r.id}>
                  <td style={S.td}>{r.descrizione}</td>
                  {tdIva(ivaPV)}
                  <td style={S.tdRight}>€ {formatEur(importoRigaValore(r))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SezioneBlock>
      )}

      {/* ── TOTALI (L18) ── imponibile, una riga IVA per aliquota, totale IVA compresa.
          L'imponibile è il «TOTALE GENERALE (IVA esclusa)» di prima, allo stesso euro. */}
      <table style={{ ...S.table, marginTop: 24 }}>
        <tbody>
          <tr>
            <th scope="row" style={{ ...S.td, textAlign: 'left', fontSize: 13, fontWeight: 600 }}>
              {totaleParziale ? 'Totale imponibile parziale' : 'Totale imponibile'}
            </th>
            <td style={{ ...S.tdRight, fontSize: 13, fontWeight: 600 }}>€ {formatEur(iva.totaleImponibile)}</td>
          </tr>
          {iva.righe.map((r) => (
            <tr key={r.aliquota}>
              <th scope="row" style={{ ...S.td, textAlign: 'left', fontSize: 13, fontWeight: 400 }}>
                IVA {r.aliquota}% su € {formatEur(r.imponibile)}
              </th>
              <td style={{ ...S.tdRight, fontSize: 13 }}>€ {formatEur(r.imposta)}</td>
            </tr>
          ))}
          <tr style={S.totalRow}>
            <th scope="row" style={{ ...S.totalCell, fontSize: 14, textAlign: 'left' }}>
              {totaleParziale ? 'TOTALE PARZIALE (IVA compresa)' : 'TOTALE (IVA compresa)'}
            </th>
            <td style={{ ...S.totalCellRight, fontSize: 18 }}>
              € {formatEur(iva.totaleIvato)}
            </td>
          </tr>
        </tbody>
      </table>
      {totaleParziale && (
        <div style={{ fontSize: 10, color: '#8A8F98', textAlign: 'right', marginTop: 2 }}>
          totale parziale — {daDefinire.map((id) => TITOLO_PDF[id]).join(', ')} da definire
        </div>
      )}

      {/* ── NOTE ── */}
      <div style={{ marginTop: 24, fontSize: 11, color: '#6B7385', lineHeight: 1.6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4, color: '#3D4252' }}>Note e condizioni</div>
        <ul style={{ paddingLeft: 16, margin: 0 }}>
          <li style={{ fontWeight: 600, color: '#3D4252' }}>
            Preventivo non vincolante: i prezzi indicati sono soggetti a verifica e
            conferma da parte di Coletta Ebanisteria prima dell'accettazione dell'ordine.
          </li>
          <li>Gli importi delle voci sono IVA esclusa; l'IVA è indicata nel riepilogo finale.</li>
          <li>Validità dell'offerta: {preventivo.validitaGiorni} giorni dalla data del preventivo.</li>
          <li>I tempi di consegna verranno concordati al momento della conferma d'ordine.</li>
          {/* Riga generica SOLO in assenza della clausola vera: con entrambe, il
              PDF direbbe due cose sul pagamento e la prima ("modalità
              concordate") smentirebbe la seconda (40/40/20). */}
          {!mostraNotePagamento && <li>Il pagamento avverrà secondo le modalità concordate.</li>}
        </ul>
        {preventivo.note && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: '#F7F7F8', borderRadius: 4 }}>
            {preventivo.note}
          </div>
        )}
      </div>

      {/* ── NOTE GENERALI / PAGAMENTO (Su Misura) ── */}
      {quoteSM.noteGenerali && (
        <div style={{ marginTop: 16, fontSize: 11, color: '#3D4252', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Note</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{quoteSM.noteGenerali}</div>
        </div>
      )}
      {mostraNotePagamento && (
        <div style={{ marginTop: 16, fontSize: 11, color: '#3D4252', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Note pagamento</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{testoNotePagamentoDi(preventivo)}</div>
        </div>
      )}

      {/* ── FIRMA — una sola, posizionata dopo le condizioni ──
          Se le condizioni sono incluse, la firma vive in coda all'annex
          (CONDIZIONI_FIRMA): il testo recita "s'intende accettato… e le
          condizioni contrattuali sopra citate", quindi la firma DEVE seguirle.
          Se le condizioni sono escluse, il documento resterebbe senza firma →
          fallback alla firma generica qui. */}
      {preventivo.includiCondizioni ? (
        <CondizioniContrattuali />
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={S.signatureLine} />
            <div style={{ fontSize: 11, color: '#6B7385' }}>Coletta Ebanisteria</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={S.signatureLine} />
            <div style={{ fontSize: 11, color: '#6B7385' }}>Firma per accettazione</div>
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid #E2E4E9', fontSize: 10, color: '#A8AFBE', display: 'flex', justifyContent: 'space-between' }}>
        <span>Preventivo N. {numero || '—'}</span>
        <span>Coletta Ebanisteria — Bari</span>
      </div>
    </div>
  )
})

/**
 * L'importo stampato di una riga porta. Switch esaustivo: un'origine nuova
 * senza un caso qui non compila.
 */
function importoPorta(r: RigaPortaCalcolata): string {
  switch (r.origine) {
    case 'snapshot':
    case 'live':
      return `€ ${formatEur(r.totale)}`
    case 'irrisolvibile':
      return 'prezzo da definire'
    case 'da-completare':
      return 'da completare'
    default: {
      const esaustivo: never = r.origine
      return esaustivo
    }
  }
}

/**
 * L'importo stampato di una riga battiscopa. Switch esaustivo: un'origine nuova
 * senza un caso qui non compila.
 */
function importoBattiscopa(b: RigaBattiscopaCalcolata): string {
  switch (b.origine) {
    case 'snapshot':
    case 'live':
      return `€ ${formatEur(b.prodotto)}`
    case 'irrisolvibile':
      return 'prezzo da definire'
    case 'da-completare':
      return 'da completare'
    default: {
      const esaustivo: never = b.origine
      return esaustivo
    }
  }
}

function dettaglioArticolo(a: ArticoloSuMisura, c: ArticoloCalcolato, mostraMq: boolean): string {
  switch (a.um) {
    case 'MQ': {
      const dims = `${a.larghezzaCm ?? 0}×${a.altezzaCm ?? 0} cm`
      // formatNum, non toFixed: nel PDF del cliente i mq uscivano col punto
      // inglese ("0.72 mq") accanto agli importi con la virgola.
      return mostraMq ? `${dims} = ${formatNum(c.quantitaCalcolata, 2)} mq` : dims
    }
    case 'ML':
      return `${a.lunghezzaMl ?? 0} ml`
    case 'PZ':
      return `${a.quantita ?? 0} pz`
  }
}

function CondizioniContrattuali() {
  return (
    <section style={S.condizioniBlock}>
      <div style={{ ...S.sectionTitle, marginTop: 0 }}>Condizioni contrattuali</div>
      {CONDIZIONI_CONTRATTUALI.map((sezione, i) => (
        <div
          key={sezione.titolo}
          // Respiro tra le sezioni: margine sopra ogni titolo TRANNE il primo
          // (apre la pagina dell'annex → non serve). Così ogni sezione si legge
          // come blocco distinto, non come un muro unico di testo.
          style={{ ...S.condizioniSezione, marginTop: i === 0 ? 0 : 24 }}
        >
          <div style={S.condizioniTitolo}>{sezione.titolo}</div>
          {sezione.paragrafi.map((paragrafo, j) => (
            <p key={j} style={S.condizioniParagrafo}>{paragrafo}</p>
          ))}
        </div>
      ))}

      {/* Blocco firma per accettazione delle condizioni */}
      <div style={S.condizioniFirma}>
        <div style={{ ...S.condizioniTitolo, marginBottom: 20 }}>
          {CONDIZIONI_FIRMA.perAccettazione}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 48 }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...S.signatureLine, width: '100%' }} />
            <div style={{ fontSize: 11, color: '#6B7385' }}>Data</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...S.signatureLine, width: '100%' }} />
            <div style={{ fontSize: 11, color: '#6B7385' }}>{CONDIZIONI_FIRMA.ilCommittente}</div>
          </div>
        </div>
      </div>
    </section>
  )
}

// Frame riusabile di una sezione del PDF: titolo + contenuto (tabelle) + riepilogo.
// Standardizza la struttura su cui si innestano le sezioni (arredi, gres, e in
// futuro porte/valore/cucine). Output DOM identico ai blocchi inline precedenti.
function SezioneBlock({
  titolo,
  summary,
  children,
}: {
  titolo: string
  summary: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <>
      <div style={S.sectionTitle}>{titolo}</div>
      {children}
      <SummaryBlock>{summary}</SummaryBlock>
    </>
  )
}

/** Il riepilogo di una sezione: resta intero su una pagina (C6). */
function SummaryBlock({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-riepilogo=""
      style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 0', maxWidth: 360, marginLeft: 'auto', breakInside: 'avoid', pageBreakInside: 'avoid' }}
    >
      {children}
    </div>
  )
}

function SummaryRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  const isNeg = value < 0
  return (
    // C5: con un nome lungo va a capo l'etichetta, mai l'importo.
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: 12, color: bold ? '#111621' : '#3D4252', fontWeight: bold ? 700 : 400, minWidth: 0, overflowWrap: 'anywhere' }}>
        {label}
      </span>
      <span style={{
        ...S.mono,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        fontSize: 12,
        color: isNeg ? '#16A34A' : bold ? '#111621' : '#3D4252',
        fontWeight: bold ? 700 : 400,
      }}>
        {isNeg ? '- ' : ''}€ {formatEur(Math.abs(value))}
      </span>
    </div>
  )
}
