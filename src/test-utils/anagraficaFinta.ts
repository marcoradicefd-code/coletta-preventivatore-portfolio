/**
 * Un'anagrafica FINTA nello stesso formato del file pulito del 12/10 (L21, PR C):
 * UTF-8 con BOM, separatore `;`, tutti i campi fra virgolette, intestazioni
 * esatte, la colonna `segnalazioni` in fondo. Nomi inventati, email
 * `@example.test` (RFC 2606), telefoni di zeri. Il file vero non entra mai nei
 * test: si costruisce qui, riga per riga.
 */
export const INTESTAZIONE_FINTA =
  'codice_gestionale;ragione_sociale;telefono;email;indirizzo;cap;localita;provincia;partita_iva;note;segnalazioni'

/** Il BOM si costruisce, non si incolla (CLAUDE.md, falsi verdi: i caratteri invisibili). */
export const BOM = String.fromCharCode(0xfeff)

export type CampiFinti = Partial<{
  codice: string
  ragione: string
  telefono: string
  email: string
  indirizzo: string
  cap: string
  localita: string
  provincia: string
  piva: string
  note: string
  segnalazioni: string
}>

const tra = (v: string) => `"${v.replaceAll('"', '""')}"`

/** Una riga del file, tutti i campi fra virgolette. */
export function rigaFinta(c: CampiFinti): string {
  return [
    c.codice ?? '',
    c.ragione ?? '',
    c.telefono ?? '',
    c.email ?? '',
    c.indirizzo ?? '',
    c.cap ?? '',
    c.localita ?? '',
    c.provincia ?? '',
    c.piva ?? '',
    c.note ?? '',
    c.segnalazioni ?? '',
  ]
    .map(tra)
    .join(';')
}

/** Il file intero: BOM, intestazione fra virgolette, righe, CRLF come lo scrive Excel. */
export function csvFinto(righe: CampiFinti[], opzioni: { intestazione?: string; bom?: boolean } = {}): string {
  const testa = (opzioni.intestazione ?? INTESTAZIONE_FINTA).split(';').map(tra).join(';')
  return `${opzioni.bom === false ? '' : BOM}${[testa, ...righe.map(rigaFinta)].join('\r\n')}\r\n`
}

/** Le righe tipiche: accentate, con titolo, con segnalazione, email multiple nelle note. */
export const RIGHE_FINTE: CampiFinti[] = [
  { codice: '101', ragione: 'Arch. Bianchi Prova', telefono: '000 1000001', email: 'bianchi.prova@example.test', localita: 'Paese di Prova', provincia: 'XX' },
  { codice: '102', ragione: 'Caffè Fittizio Snc', telefono: '000 1000002', email: 'caffe@example.test', note: 'altra@example.test' },
  { codice: '103', ragione: 'Niccolò Esempio', telefono: '', email: '', segnalazioni: 'nessun contatto' },
  { codice: '104', ragione: 'Ditta "Le Querce" Prova', indirizzo: 'Via di Prova 1;\nscala B', cap: '00000' },
]
