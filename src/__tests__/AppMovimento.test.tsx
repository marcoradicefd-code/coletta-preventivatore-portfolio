import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// U20 (revisione L15-L21): con «riduci movimento» del sistema, modale e toast si
// muovevano lo stesso. Qui l'app si monta con una sonda al posto della shell,
// che legge la configurazione di Motion che le arriva.
vi.mock('@/lib/supabase', () => ({ supabase: { storage: { from: () => ({}) } }, LISTINI_BUCKET: 'Listini' }))
vi.mock('@/hooks/useStoreHydration', () => ({ useStoreHydration: () => true }))
vi.mock('@/components/auth/AuthGuard', () => ({ AuthGuard: ({ children }: { children: unknown }) => children }))
vi.mock('@/components/layout/AppShell', async () => {
  const { useContext } = await import('react')
  const { MotionConfigContext } = await import('motion/react')
  return {
    AppShell: function Sonda() {
      return <p>movimento ridotto: {String(useContext(MotionConfigContext).reducedMotion)}</p>
    },
  }
})

import App from '@/App'

afterEach(() => cleanup())

describe('App e movimento ridotto (U20)', () => {
  it('tutta l’app segue la preferenza del sistema (MotionConfig reducedMotion="user")', () => {
    render(<App />)
    expect(screen.getByText('movimento ridotto: user')).toBeTruthy()
  })
})
