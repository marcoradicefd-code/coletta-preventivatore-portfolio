import { describe, it, expect } from 'vitest'
import { leggiEnvLocale, motivoSenzaScrittura, REF_COLETTA_DEV } from '@/test-utils/progettoE2e'

/**
 * S5 (revisione L15-L21): gli e2e che scrivono nel database partono solo
 * contro coletta-dev, e il consenso `E2E_DB_SCRITTURA=si` viene dalla shell,
 * mai da `.env.local` (dove resterebbe acceso per sempre). URL finti.
 */
const CREDENZIALI = { E2E_EMAIL: 'prova@example.test', E2E_PASSWORD: 'finta' }
const DEV = `https://${REF_COLETTA_DEV}.supabase.co`

describe('e2e che scrivono: consenso e progetto (S5)', () => {
  it('il caso del report: consenso dato ma URL di un altro progetto = niente scrittura, e il motivo lo dice', () => {
    const motivo = motivoSenzaScrittura({ ...CREDENZIALI, E2E_DB_SCRITTURA: 'si', VITE_SUPABASE_URL: 'https://prodexample0000.supabase.co' })
    expect(motivo).toMatch(/coletta-dev/)
    expect(motivo).toMatch(/prodexample0000/)
  })

  it('scrive solo con credenziali, consenso e URL di coletta-dev', () => {
    expect(motivoSenzaScrittura({ ...CREDENZIALI, E2E_DB_SCRITTURA: 'si', VITE_SUPABASE_URL: DEV })).toBeNull()
    expect(motivoSenzaScrittura({ ...CREDENZIALI, VITE_SUPABASE_URL: DEV })).toMatch(/E2E_DB_SCRITTURA/)
    expect(motivoSenzaScrittura({ E2E_DB_SCRITTURA: 'si', VITE_SUPABASE_URL: DEV })).toMatch(/E2E_EMAIL/)
    expect(motivoSenzaScrittura({ ...CREDENZIALI, E2E_DB_SCRITTURA: 'si', VITE_SUPABASE_URL: 'non un url' })).toMatch(/coletta-dev/)
    expect(motivoSenzaScrittura({ ...CREDENZIALI, E2E_DB_SCRITTURA: 'si', VITE_SUPABASE_URL: `https://${REF_COLETTA_DEV}.example.test` })).toMatch(/coletta-dev/)
  })

  it('.env.local: le chiavi entrano, tranne E2E_DB_SCRITTURA; l’ambiente della shell vince', () => {
    const testo = ['# commento', 'E2E_EMAIL=prova@example.test', 'E2E_DB_SCRITTURA=si', `VITE_SUPABASE_URL="${DEV}"`, 'VUOTA'].join('\n')
    const env: Record<string, string | undefined> = { E2E_EMAIL: 'shell@example.test' }
    const ignorate = leggiEnvLocale(testo, env)
    expect(env).toEqual({ E2E_EMAIL: 'shell@example.test', VITE_SUPABASE_URL: DEV })
    expect(ignorate).toEqual(['E2E_DB_SCRITTURA'])
  })
})
