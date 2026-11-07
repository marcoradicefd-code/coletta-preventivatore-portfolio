import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authStorageAdapter, migrateLegacyAuthStorage } from '@/lib/authStorage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Placeholder non funzionanti, usati SOLO se le env mancano al build.
//
// Perché esistono, invece di un `throw` in cima al modulo: questo file è
// dipendenza transitiva di `main.tsx`, quindi nel bundle hoistato il suo corpo
// gira PRIMA di `render(<App/>)`. Un throw statico qui rende irraggiungibile il
// render e rolldown pota l'intero albero dell'app: build verde, guscio da
// ~399 kB, pagina bianca in produzione (incidente 30/06). Anche
// `createClient('', '')` lancerebbe — da cui un URL sintatticamente valido.
//
// Il presidio vero è `assertSupabaseEnv` in vite.config.ts, che fa fallire il
// build: questi valori non devono MAI raggiungere la produzione. Esistono solo
// perché il modulo resti importabile senza far evaporare l'applicazione.
const PLACEHOLDER_URL = 'https://env-supabase-mancanti.invalid'
const PLACEHOLDER_KEY = 'env-supabase-mancanti'

/**
 * Profilo utente caricato dalla tabella `profiles`.
 * Il ruolo determina l'accesso alla sezione Gestione Listini.
 */
export interface Profile {
  id: string
  role: 'admin' | 'user'
}

/**
 * Nome del bucket Supabase Storage che contiene i listini Excel.
 * Case-sensitive: "Listini" con L maiuscola.
 */
export const LISTINI_BUCKET = 'Listini'

// Pulizia one-time dei token legacy in localStorage PRIMA di creare il client
// (vedi authStorage): il client legge la sessione all'inizializzazione.
migrateLegacyAuthStorage()

export const supabase: SupabaseClient = createClient(
  supabaseUrl || PLACEHOLDER_URL,
  supabaseAnonKey || PLACEHOLDER_KEY,
  {
    auth: {
      // Storage adapter dinamico: la sessione vive in localStorage o
      // sessionStorage in base al flag "Ricordami" (vedi authStorage.ts).
      storage: authStorageAdapter,
      persistSession: true,
      autoRefreshToken: true,
      // PKCE (L26): il link di recupero porta un `code` che si scambia solo col
      // code_verifier salvato in QUESTO browser da resetPasswordForEmail. Col
      // flusso implicit (il default) i token viaggiano nel frammento, e un link
      // costruito con un altro account aprirebbe la sua sessione (login CSRF).
      flowType: 'pkce',
      // Il frammento implicit non si legge mai (`_isImplicitGrantCallback` dà
      // false); il `code` PKCE sì: auth-js lo scambia solo se trova il verifier
      // (`_isPKCECallback`) e la funzione, essendo «vera», non lo blocca
      // (GoTrueClient._initialize). Era `false`: nessuna lettura dell'URL.
      detectSessionInUrl: () => false,
    },
  }
)
