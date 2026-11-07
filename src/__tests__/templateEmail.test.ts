import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// L29, aggiunta 1: i tre template delle email di Supabase versionati in
// `supabase/templates/`. La dashboard deve restare uguale a quei file (rule
// `auth-supabase`), quindi i file si controllano qui: lo stesso logo, e le
// variabili giuste per il tipo. «Password cambiata» è una notifica, non ha un
// link da confermare: `{{ .ConfirmationURL }}` lì non esiste.
const LOGO = 'https://preventivi.colettaebanisteria.it/email/logo-coletta.png'

/** Le variabili che ogni template può usare; `link` = deve avere `{{ .ConfirmationURL }}`. */
const TEMPLATE = [
  { file: 'confirm-signup.html', link: true, ammesse: ['ConfirmationURL', 'Email', 'SiteURL'] },
  { file: 'reset-password.html', link: true, ammesse: ['ConfirmationURL', 'Email', 'SiteURL'] },
  { file: 'password-changed.html', link: false, ammesse: ['Email', 'SiteURL'] },
] as const

const leggi = (file: string) => readFileSync(resolve(process.cwd(), 'supabase/templates', file), 'utf8')

describe('template delle email di Supabase', () => {
  it.each(TEMPLATE)('$file: un solo logo, dall’indirizzo comune', ({ file }) => {
    const html = leggi(file)
    const sorgenti = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1])

    expect(sorgenti).toEqual([LOGO])
    // Il tag vero, non quello che GitHub mostra nei commenti.
    expect(html).not.toContain('&lt;img')
  })

  it.each(TEMPLATE)('$file: solo le variabili del suo tipo', ({ file, link, ammesse }) => {
    const usate = new Set([...leggi(file).matchAll(/\{\{\s*\.(\w+)\s*\}\}/g)].map((m) => m[1]))

    expect([...usate].filter((v) => !(ammesse as readonly string[]).includes(v))).toEqual([])
    expect(usate.has('ConfirmationURL')).toBe(link)
  })
})
