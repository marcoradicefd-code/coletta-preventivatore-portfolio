import { describe, it, expect } from 'vitest'
import { assertSupabaseEnv } from '@/lib/envGuard'

const COMPLETE = {
  VITE_SUPABASE_URL: 'https://esempio.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
}

describe('assertSupabaseEnv', () => {
  it('non lancia con entrambe le variabili valorizzate', () => {
    expect(() => assertSupabaseEnv(COMPLETE)).not.toThrow()
  })

  it('ignora le altre variabili presenti', () => {
    expect(() => assertSupabaseEnv({ ...COMPLETE, VITE_ALTRO: 'x' })).not.toThrow()
  })

  it('lancia nominando la URL quando manca', () => {
    expect(() => assertSupabaseEnv({ VITE_SUPABASE_ANON_KEY: 'anon-key' })).toThrow(
      /VITE_SUPABASE_URL/
    )
  })

  it('lancia nominando la anon key quando manca', () => {
    expect(() => assertSupabaseEnv({ VITE_SUPABASE_URL: 'https://esempio.supabase.co' })).toThrow(
      /VITE_SUPABASE_ANON_KEY/
    )
  })

  it('nomina entrambe quando manca tutto', () => {
    try {
      assertSupabaseEnv({})
      throw new Error('doveva lanciare')
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).toContain('VITE_SUPABASE_URL')
      expect(msg).toContain('VITE_SUPABASE_ANON_KEY')
    }
  })

  // Il caso Vercel reale: la variabile ESISTE ma è vuota (cancellata dal
  // dashboard lasciando la chiave, o valorizzata a stringa vuota). Resta falsy
  // per la guardia in supabase.ts, quindi deve fallire il build come se mancasse.
  it('tratta stringa vuota e soli spazi come mancanti', () => {
    expect(() => assertSupabaseEnv({ ...COMPLETE, VITE_SUPABASE_URL: '' })).toThrow(
      /VITE_SUPABASE_URL/
    )
    expect(() => assertSupabaseEnv({ ...COMPLETE, VITE_SUPABASE_ANON_KEY: '   ' })).toThrow(
      /VITE_SUPABASE_ANON_KEY/
    )
  })

  it('il messaggio dice dove definirle (locale e Vercel)', () => {
    expect(() => assertSupabaseEnv({})).toThrow(/\.env\.local/)
    expect(() => assertSupabaseEnv({})).toThrow(/Vercel/)
  })
})
