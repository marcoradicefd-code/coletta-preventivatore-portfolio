/**
 * Presidio env di Supabase, invocato da `vite.config.ts` al build.
 *
 * Perché esiste: `import.meta.env.VITE_*` è sostituito da Vite a build-time con
 * una costante. Se le env mancano, la guardia in `src/lib/supabase.ts` si ripiega
 * in un ramo statico e il bundle esce **senza l'applicazione** (~399 kB di solo
 * runtime, contro 843 kB) con exit code 0: pagina bianca in produzione, build
 * verde, nessun errore da nessuna parte. In una SPA Vite le env sono costanti di
 * compilazione: ciò che manca qui manca per sempre nel bundle, non è recuperabile
 * a runtime. L'unico momento utile per accorgersene è il build.
 *
 * Vive in un modulo separato (e non inline in `vite.config.ts`) per essere una
 * funzione pura testabile da vitest senza avviare un build.
 */

/** Le uniche env lette a livello di modulo dall'app (`src/lib/supabase.ts`). */
const RICHIESTE = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const

/**
 * Lancia se manca (o è vuota) anche una sola env Supabase, nominandola.
 *
 * @param env tipicamente l'output di `loadEnv(mode, process.cwd(), 'VITE_')`,
 *            che unisce i file `.env*` e le variabili già in `process.env`
 *            (dove Vercel inietta quelle del dashboard), con precedenza a queste.
 */
export function assertSupabaseEnv(env: Record<string, string | undefined>): void {
  const mancanti = RICHIESTE.filter((chiave) => !env[chiave]?.trim())
  if (mancanti.length === 0) return

  throw new Error(
    `Build interrotto: variabili di ambiente Supabase mancanti — ${mancanti.join(', ')}.\n` +
      `In locale: definiscile in .env.local. Su Vercel: Project Settings → Environment Variables.\n` +
      `Senza, il bundle verrebbe prodotto senza l'applicazione (pagina bianca in produzione).`
  )
}
