import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { useStoreHydration } from '@/hooks/useStoreHydration'
import { useQuoteStore } from '@/store/quoteStore'

// App.tsx non disegna niente finché il preventivo salvato non è tornato da
// localStorage: se questo hook restasse `false`, l'app resterebbe bianca.
describe('useStoreHydration', () => {
  it('store già idratato al montaggio: true subito', () => {
    expect(useQuoteStore.persist.hasHydrated()).toBe(true)
    const { result } = renderHook(() => useStoreHydration())
    expect(result.current).toBe(true)
  })

  it('segue una nuova idratazione fino alla fine', async () => {
    const { result } = renderHook(() => useStoreHydration())
    await act(async () => {
      await useQuoteStore.persist.rehydrate()
    })
    expect(result.current).toBe(true)
  })
})

// Il ramo di errore: zustand non segna mai l'idratazione finita se un passo
// lancia, quindi `hasHydrated()` resta falso. Il caso vero qui è la quota piena
// al `setItem` che riscrive il blob dopo un migrate riuscito (O33 per il resto).
describe('useStoreHydration — idratazione finita in errore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    vi.resetModules()
  })

  it('salvataggio che lancia dopo il migrate (quota): hasHydrated resta falso ma l\'hook è true', async () => {
    // Blob v3 buono: il migrate riesce, poi il `setItem` v4 lancia. L'idratazione
    // gira all'import dello store, quindi tutto si importa DOPO il reset dei
    // moduli, React compreso: due istanze di React danno «Invalid hook call».
    localStorage.setItem('coletta-quote-v1', JSON.stringify({ state: { ricordaPreventivo: false }, version: 3 }))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota piena', 'QuotaExceededError')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.resetModules()
    const { renderHook } = await import('@testing-library/react')
    const { useStoreHydration: hook } = await import('@/hooks/useStoreHydration')
    const { useQuoteStore: store } = await import('@/store/quoteStore')

    expect(store.persist.hasHydrated()).toBe(false)
    const { result } = renderHook(() => hook())

    expect(result.current).toBe(true)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('[quoteStore]')
  })
})
