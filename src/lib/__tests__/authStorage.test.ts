import { describe, it, expect, beforeEach } from 'vitest'
import {
  isRememberSession,
  setRememberSession,
  authStorageAdapter,
  clearSupabaseAuthStorage,
  ERROR_LOG_KEY,
  migrateLegacyAuthStorage,
} from '@/lib/authStorage'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('flag Ricordami', () => {
  it('default false; setRememberSession aggiorna la preferenza', () => {
    expect(isRememberSession()).toBe(false)
    setRememberSession(true)
    expect(isRememberSession()).toBe(true)
    setRememberSession(false)
    expect(isRememberSession()).toBe(false)
  })
})

describe('authStorageAdapter — routing per flag', () => {
  it('remember ON → scrive e legge da localStorage (non sessionStorage)', () => {
    setRememberSession(true)
    authStorageAdapter.setItem('sb-proj-auth-token', 'tok')
    expect(localStorage.getItem('sb-proj-auth-token')).toBe('tok')
    expect(sessionStorage.getItem('sb-proj-auth-token')).toBeNull()
    expect(authStorageAdapter.getItem('sb-proj-auth-token')).toBe('tok')
  })

  it('remember OFF → scrive e legge da sessionStorage (non localStorage)', () => {
    setRememberSession(false)
    authStorageAdapter.setItem('sb-proj-auth-token', 'tok')
    expect(sessionStorage.getItem('sb-proj-auth-token')).toBe('tok')
    expect(localStorage.getItem('sb-proj-auth-token')).toBeNull()
    expect(authStorageAdapter.getItem('sb-proj-auth-token')).toBe('tok')
  })

  it('removeItem rimuove dallo store corrente', () => {
    setRememberSession(true)
    authStorageAdapter.setItem('sb-x-auth-token', 'tok')
    authStorageAdapter.removeItem('sb-x-auth-token')
    expect(localStorage.getItem('sb-x-auth-token')).toBeNull()
  })
})

describe('clearSupabaseAuthStorage (logout)', () => {
  it('rimuove i token sb-* da ENTRAMBI gli store e azzera il flag', () => {
    setRememberSession(true)
    localStorage.setItem('sb-a-auth-token', '1')
    sessionStorage.setItem('sb-b-auth-token', '2')
    localStorage.setItem('coletta-quote-v1', 'keep') // non-sb: va preservato

    clearSupabaseAuthStorage()

    expect(localStorage.getItem('sb-a-auth-token')).toBeNull()
    expect(sessionStorage.getItem('sb-b-auth-token')).toBeNull()
    expect(localStorage.getItem('coletta-quote-v1')).toBe('keep')
    expect(isRememberSession()).toBe(false)
  })

  it('cancella anche il log dei crash di ErrorBoundary (O27)', () => {
    localStorage.setItem(ERROR_LOG_KEY, '[{"message":"boom"}]')

    clearSupabaseAuthStorage()

    expect(localStorage.getItem(ERROR_LOG_KEY)).toBeNull()
    expect(ERROR_LOG_KEY).toBe('coletta-error-log') // la chiave che ErrorBoundary scrive da sempre
  })
})

describe('migrateLegacyAuthStorage (pulizia one-time)', () => {
  it('rimuove i token legacy in localStorage una sola volta', () => {
    localStorage.setItem('sb-legacy-auth-token', 'old')

    migrateLegacyAuthStorage()
    expect(localStorage.getItem('sb-legacy-auth-token')).toBeNull()

    // Marker impostato → una seconda chiamata non tocca i token nuovi
    // (es. una sessione "Ricordami" scritta in localStorage dopo la migrazione).
    localStorage.setItem('sb-new-auth-token', 'new')
    migrateLegacyAuthStorage()
    expect(localStorage.getItem('sb-new-auth-token')).toBe('new')
  })
})
