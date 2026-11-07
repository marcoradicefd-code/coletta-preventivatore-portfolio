#!/usr/bin/env node
/**
 * Verifica che il build FALLISCA senza le env Supabase.
 *
 * È il test d'integrazione del presidio in vite.config.ts: la funzione pura
 * `assertSupabaseEnv` è coperta da vitest, ma solo un build vero prova che Vite
 * la invochi davvero e che `loadEnv` dia precedenza a process.env sui file
 * .env* (è così che le env del dashboard Vercel arrivano al build).
 *
 * Fuori dalla suite vitest: un build costa ~30s. Uso manuale o in CI.
 *
 * Regressione coperta: prima di questo presidio il build usciva 0 e spediva un
 * guscio da ~399 kB senza l'applicazione — pagina bianca in produzione.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// outDir TEMPORANEO, obbligatorio: un build di prova non deve mai toccare dist/,
// che resterebbe svuotato dal --emptyOutDir.
const outDir = mkdtempSync(join(tmpdir(), 'coletta-envguard-'))

const esito = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
  // Env svuotate: simula la variabile cancellata o azzerata sul dashboard Vercel.
  // process.env ha precedenza su .env.local, quindi il guard scatta anche in locale.
  env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  encoding: 'utf8',
})

rmSync(outDir, { recursive: true, force: true })

const output = `${esito.stdout ?? ''}${esito.stderr ?? ''}`
const problemi = []

if (esito.status === 0) {
  problemi.push('il build è uscito 0 senza env: il guard NON ha fermato nulla')
}
for (const chiave of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
  if (!output.includes(chiave)) {
    problemi.push(`l'errore non nomina ${chiave}: il messaggio non è azionabile`)
  }
}

if (problemi.length > 0) {
  console.error('\n✗ verify:env-guard FALLITO\n')
  for (const p of problemi) console.error(`  · ${p}`)
  console.error(`\n--- output del build (exit ${esito.status}) ---\n${output}`)
  process.exit(1)
}

console.log(`✓ verify:env-guard — build fermato (exit ${esito.status}), errore che nomina entrambe le env`)
