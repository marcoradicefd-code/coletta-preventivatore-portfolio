import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'
import path from 'path'
import { assertSupabaseEnv } from './src/lib/envGuard'

export default defineConfig(({ command, mode }) => {
  // Fail-loud: senza le env Supabase il build produrrebbe un guscio senza l'app
  // uscendo 0 (vedi envGuard.ts). Meglio un build rosso di un deploy silenzioso.
  // Solo su `build`: in dev il server parte comunque e l'errore è immediato.
  if (command === 'build') {
    assertSupabaseEnv(loadEnv(mode, process.cwd(), 'VITE_'))
  }

  return {
    plugins: [react(), tailwindcss(), svgr()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // CSP e header di sicurezza: in produzione li serve Vercel (vercel.json, rule deploy.md)
    // Not set here — @vitejs/plugin-react Fast Refresh requires inline scripts
    build: {
      sourcemap: false,
    },
  }
})
