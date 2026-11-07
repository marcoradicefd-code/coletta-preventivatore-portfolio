/**
 * La regola della password (L29): una fonte sola per la registrazione, la
 * nuova password e i messaggi d'errore.
 *
 * DEVE RESTARE UGUALE ALLE IMPOSTAZIONI DI SUPABASE (Authentication › Providers
 * › Email, produzione e coletta-dev, fatte da Marco il 16/10/2026): «Minimum
 * password length» 10 e «Password requirements» «Letters and digits». Se Marco
 * le cambia, si cambiano qui (rule `auth-supabase`). Il client non decide
 * niente: il controllo vero, compreso quello contro le password rubate
 * (Leaked Password Protection), resta sul server. Qui si aiuta chi scrive e si
 * evita una chiamata che il server rifiuterebbe.
 *
 * Funzioni pure, nessuna libreria: la password non esce mai da qui e non va
 * nei log.
 */

/** «Minimum password length» di Supabase. */
export const PASSWORD_MIN = 10
/** Da questa lunghezza in su il suggerimento della lunghezza è soddisfatto. */
export const PASSWORD_LUNGA = 14

/**
 * «Letters and digits» di Supabase: almeno una lettera ASCII e una cifra
 * (GoTrue vuole un carattere da ogni gruppo, e i gruppi sono `a-zA-Z` e `0-9`:
 * una «è» da sola non basta al server, quindi non basta nemmeno qui).
 */
const LETTERA = /[A-Za-z]/
const CIFRA = /\d/

export const TESTO_LUNGHEZZA = `Almeno ${PASSWORD_MIN} caratteri`
export const TESTO_LETTERE_CIFRE = 'Almeno una lettera e una cifra'
/** I messaggi d'errore dei due obbligatori, nel form e dagli errori di Supabase. */
export const MSG_PASSWORD_CORTA = `La password deve contenere almeno ${PASSWORD_MIN} caratteri.`
export const MSG_PASSWORD_CARATTERI = 'La password deve contenere almeno una lettera e una cifra.'

/**
 * Password comuni, italiane e inglesi, più le parole dell'azienda. Si
 * confrontano intere, in minuscolo, anche senza cifre e simboli in testa e in
 * coda («Coletta2026» è «coletta»). Breve apposta: la lista vera, quella delle
 * password rubate, la guarda Supabase.
 */
const PASSWORD_COMUNI = new Set([
  'password', 'passw0rd', 'qwerty', 'qwertyuiop', 'azerty', 'abc', 'abcdef', 'admin', 'administrator',
  'welcome', 'letmein', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'sunshine', 'princess',
  'master', 'secret', 'login', 'user', 'test', 'changeme',
  '123456', '1234567', '12345678', '123456789', '1234567890', '111111', '000000', '123123', '654321',
  'ciao', 'ciaociao', 'amore', 'amoremio', 'tiamo', 'casa', 'mamma', 'papa', 'segreto', 'parola',
  'parolachiave', 'benvenuto', 'juventus', 'napoli', 'milan', 'inter', 'roma', 'lazio', 'bari',
  'ferrari', 'italia', 'francesco', 'giuseppe', 'antonio', 'giovanni', 'mario', 'andrea', 'alessandro',
  'coletta', 'colettaebanisteria', 'ebanisteria', 'preventivo', 'preventivi', 'preventivatore',
  'cucina', 'cucine', 'arredi', 'porte', 'gres',
])

/** Righe in cui quattro caratteri di fila sono una sequenza ovvia, nei due versi. */
const RIGHE_SEQUENZE = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const LUNGHEZZA_SEQUENZA = 4

export type IdRequisito = 'lunghezza' | 'lettereCifre'
export type IdSuggerimento =
  | 'lunga'
  | 'maiuscoleMinuscole'
  | 'simbolo'
  | 'ripetizioni'
  | 'sequenze'
  | 'email'
  | 'comune'

export interface Voce<Id extends string> {
  id: Id
  testo: string
  ok: boolean
}

export type LivelloPassword = 0 | 1 | 2 | 3 | 4

export const ETICHETTE_LIVELLO: Readonly<Record<LivelloPassword, string>> = {
  0: 'Molto debole',
  1: 'Debole',
  2: 'Discreta',
  3: 'Buona',
  4: 'Ottima',
}

export interface ValutazionePassword {
  /** Bloccano: senza, il server rifiuterebbe la password. */
  obbligatori: Voce<IdRequisito>[]
  /** Alzano il livello, non bloccano. */
  suggerimenti: Voce<IdSuggerimento>[]
  /** I due obbligatori soddisfatti. */
  valida: boolean
  livello: LivelloPassword
  etichetta: string
}

function contieneSequenza(minuscola: string): boolean {
  for (const riga of RIGHE_SEQUENZE) {
    for (const verso of [riga, [...riga].reverse().join('')]) {
      for (let i = 0; i + LUNGHEZZA_SEQUENZA <= verso.length; i++) {
        if (minuscola.includes(verso.slice(i, i + LUNGHEZZA_SEQUENZA))) return true
      }
    }
  }
  return false
}

/** Le parti della email prima della `@` (intera e divisa da `.`, `_`, `-`, `+`), di almeno 3 caratteri. */
function partiEmail(email: string): string[] {
  const locale = email.trim().toLowerCase().split('@')[0] ?? ''
  return [locale, ...locale.split(/[._+-]/)].filter((p) => p.length >= 3)
}

function comune(minuscola: string): boolean {
  const nucleo = minuscola.replace(/^[^a-z]+/, '').replace(/[^a-z]+$/, '')
  return PASSWORD_COMUNI.has(minuscola) || PASSWORD_COMUNI.has(nucleo)
}

/**
 * Livello da 0 a 4. Con un obbligatorio mancante non supera 1: 0 se mancano
 * tutti e due (o la password è vuota), 1 se ne manca uno. Con i due
 * obbligatori: 4 se manca al più un suggerimento, 3 se ne mancano due o tre,
 * altrimenti 2.
 */
function livelloDa(obbligatoriMancanti: number, suggerimentiMancanti: number, vuota: boolean): LivelloPassword {
  if (vuota || obbligatoriMancanti >= 2) return 0
  if (obbligatoriMancanti === 1) return 1
  if (suggerimentiMancanti <= 1) return 4
  if (suggerimentiMancanti <= 3) return 3
  return 2
}

/**
 * Valuta la password mentre si scrive. `email`, se c'è, serve al
 * suggerimento «non contiene la parte prima della @»; senza, quel
 * suggerimento non compare.
 */
export function valutaPassword(password: string, email?: string): ValutazionePassword {
  const minuscola = password.toLowerCase()
  const obbligatori: Voce<IdRequisito>[] = [
    { id: 'lunghezza', testo: TESTO_LUNGHEZZA, ok: password.length >= PASSWORD_MIN },
    { id: 'lettereCifre', testo: TESTO_LETTERE_CIFRE, ok: LETTERA.test(password) && CIFRA.test(password) },
  ]
  const parti = email ? partiEmail(email) : []
  const suggerimenti: Voce<IdSuggerimento>[] = [
    { id: 'lunga', testo: `${PASSWORD_LUNGA} caratteri o più`, ok: password.length >= PASSWORD_LUNGA },
    {
      id: 'maiuscoleMinuscole',
      testo: 'Maiuscole e minuscole',
      ok: /\p{Lu}/u.test(password) && /\p{Ll}/u.test(password),
    },
    { id: 'simbolo', testo: 'Un simbolo, per esempio ! ? # @', ok: /[^\p{L}\p{N}\s]/u.test(password) },
    {
      id: 'ripetizioni',
      testo: 'Nessun carattere ripetuto 3 volte di fila',
      ok: password.length > 0 && !/(.)\1\1/u.test(password),
    },
    {
      id: 'sequenze',
      testo: 'Nessuna sequenza ovvia, come 1234, abcd o qwerty',
      ok: password.length > 0 && !contieneSequenza(minuscola),
    },
  ]
  if (parti.length > 0) {
    suggerimenti.push({
      id: 'email',
      testo: 'Non contiene il nome della tua email',
      ok: password.length > 0 && !parti.some((p) => minuscola.includes(p)),
    })
  }
  suggerimenti.push({
    id: 'comune',
    testo: 'Non è una password comune',
    ok: password.length > 0 && !comune(minuscola),
  })

  const obbligatoriMancanti = obbligatori.filter((v) => !v.ok).length
  const suggerimentiMancanti = suggerimenti.filter((v) => !v.ok).length
  const livello = livelloDa(obbligatoriMancanti, suggerimentiMancanti, password.length === 0)
  return {
    obbligatori,
    suggerimenti,
    valida: obbligatoriMancanti === 0,
    livello,
    etichetta: ETICHETTE_LIVELLO[livello],
  }
}

/** Il messaggio del primo obbligatorio mancante, o `null` se ci sono tutti e due. */
export function erroreRegolaPassword(password: string): string | null {
  const [lunghezza, caratteri] = valutaPassword(password).obbligatori
  if (!lunghezza.ok) return MSG_PASSWORD_CORTA
  if (!caratteri.ok) return MSG_PASSWORD_CARATTERI
  return null
}

/** Gli obbligatori mancanti, per il motivo accanto al pulsante spento: «almeno 10 caratteri; almeno una lettera e una cifra». */
export function testoMancanti(v: ValutazionePassword): string {
  return v.obbligatori
    .filter((o) => !o.ok)
    .map((o) => o.testo.charAt(0).toLowerCase() + o.testo.slice(1))
    .join('; ')
}
