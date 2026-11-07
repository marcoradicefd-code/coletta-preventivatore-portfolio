/**
 * Il `pageStyle` che `usePrint` passa a `react-to-print`. Sta in un file suo,
 * senza dipendenze, perché lo legge anche l'e2e della stampa
 * (`e2e/sfondo-pdf.spec.ts`): una copia nel test potrebbe divergere.
 *
 * Sfondo bianco (L24, punto 5): `index.css` dà al `body` lo sfondo della pagina
 * (#F7F7F8) e `print-color-adjust: exact` lo faceva stampare, grigio sotto tutto
 * il contenuto. Nell'iframe di `react-to-print` gli stili della pagina arrivano
 * DOPO questo, quindi `html body` vince per specificità, non per ordine. Gli
 * sfondi voluti (il navy del totale, i riquadri) sono sui loro elementi e
 * restano.
 */
export const STILE_PAGINA_STAMPA = `
      @page {
        size: A4;
        margin: 10mm;
      }
      @media print {
        html body {
          background-color: #fff;
        }
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `
