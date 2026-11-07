import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-utils/setup.ts'],
    // `tmp/**`: scratch locali gitignorati, con test che oggi sono rossi apposta.
    exclude: ['node_modules', 'dist', 'e2e/**', '**/._*', 'tmp/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      // Scope sui moduli effettivamente sotto test (engine/parser/store/utils):
      // niente `all`, così il report riflette la logica coperta, non le UI.
      // `src/assets/**`: il PNG importato dal PDF finiva nell'lcov con LF:0, e
      // Sonar (che esclude la cartella) lo segnalava come path non risolto.
      exclude: ['**/__tests__/**', '**/*.d.ts', 'src/main.tsx', 'e2e/**', '**/._*', 'src/assets/**'],
    },
  },
})
