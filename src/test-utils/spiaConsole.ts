import { vi, type MockInstance } from 'vitest'

const METODI = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table', 'dir'] as const

/**
 * Presidio dei log (L21): spia ogni metodo di `console` e dice se un argomento,
 * serializzato, contiene un testo (email, telefono, ragione sociale finti). Le righe dei
 * clienti non devono finire nella console, in sviluppo come in produzione.
 */
export function spiaConsole() {
  let spie: MockInstance[] = []
  const testi = (): string[] =>
    spie.flatMap((s) =>
      s.mock.calls.flat().map((a) => {
        if (typeof a === 'string') return a
        try {
          // `JSON.stringify(undefined)` è `undefined`, non una stringa (un `error.code` assente, L29).
          return a instanceof Error ? `${a.name} ${a.message}` : (JSON.stringify(a) ?? String(a))
        } catch {
          // Un argomento circolare non si serializza: lo si guarda come stringa.
          return String(a)
        }
      })
    )
  return {
    avvia() {
      spie = METODI.map((m) => vi.spyOn(console, m).mockImplementation(() => undefined))
    },
    contiene(testo: string): boolean {
      return testi().some((t) => t.includes(testo))
    },
    /** I testi cercati che compaiono nei log (vuoto = nessuno). */
    trovati(cercati: readonly string[]): string[] {
      const tutti = testi()
      return cercati.filter((c) => tutti.some((t) => t.includes(c)))
    },
    svuota() {
      for (const s of spie) s.mockClear()
    },
    ripristina() {
      for (const s of spie) s.mockRestore()
      spie = []
    },
  }
}
