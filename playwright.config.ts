import { defineConfig, devices } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { leggiEnvLocale } from './src/test-utils/progettoE2e'

/**
 * Carica `.env.local` (gitignored) nel `process.env` di Playwright — senza
 * dipendenze (dotenv non è installato). Serve per `E2E_EMAIL`/`E2E_PASSWORD`
 * usate dagli e2e autenticati, che si auto-skippano se mancano. Non
 * sovrascrive variabili già presenti nell'ambiente, e salta `E2E_DB_SCRITTURA`.
 * NB: i segreti restano SOLO in `.env.local`, mai nel codice committato.
 */
const envFile = resolve(process.cwd(), '.env.local')
if (existsSync(envFile)) {
  // `E2E_DB_SCRITTURA` da qui non si legge: il consenso a scrivere nel database
  // si dà dalla shell, al lancio (S5, `src/test-utils/progettoE2e.ts`).
  const saltate = leggiEnvLocale(readFileSync(envFile, 'utf8'), process.env)
  if (saltate.length > 0) console.warn(`[playwright] ${saltate.join(', ')} in .env.local ignorata: si passa dalla shell.`)
}

/** Con il consenso a scrivere, mai un dev server già acceso (potrebbe puntare a un altro progetto). */
const scrittura = process.env.E2E_DB_SCRITTURA === 'si'

/**
 * Playwright config per i test end-to-end della Preventivatore.
 * Avvia il dev server Vite su localhost:5173 e lancia i test in chromium.
 */
export default defineConfig({
  testDir: './e2e',
  // Ignora i sidecar AppleDouble `._*` del volume esterno non-APFS (come fa
  // vitest con `**/._*`): altrimenti Playwright prova a parsarli come test.
  testIgnore: '**/._*',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI && !scrittura,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
