import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'

// Sidebar → stores → supabase: mock minimale per restare hermetici, come in AppShell.test.tsx.
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { Sidebar } from '@/components/layout/Sidebar'
import { ToastProvider } from '@/components/shared/Toast'
import { useAuthStore, MSG_USCITA_NON_CONFERMATA } from '@/store/authStore'

afterEach(cleanup)

async function esciCon(esito: { error?: string }) {
  const logout = vi.fn().mockResolvedValue(esito)
  useAuthStore.setState({ logout })
  render(
    <ToastProvider>
      <Sidebar activeTab="cliente" onTabChange={() => {}} onOpenUpload={() => {}} />
    </ToastProvider>
  )
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Esci' }))
  })
  expect(logout).toHaveBeenCalledTimes(1)
}

describe('Sidebar, «Esci»', () => {
  it('logout con errore: avviso con il testo dello store', async () => {
    await esciCon({ error: MSG_USCITA_NON_CONFERMATA })

    expect(screen.getByRole('alert').textContent).toContain(
      'Sei uscito da questo dispositivo, ma il server non ha confermato la chiusura della sessione.'
    )
  })

  it('logout riuscito: nessun avviso', async () => {
    await esciCon({})

    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Sidebar, la voce attiva (U9)', () => {
  it('il menu ha un nome e la voce attiva è annunciata con aria-current="page", le altre no', () => {
    render(
      <ToastProvider>
        <Sidebar activeTab="cliente" onTabChange={() => {}} onOpenUpload={() => {}} />
      </ToastProvider>
    )
    const menu = screen.getAllByRole('navigation', { name: 'Menu principale' })[0]
    const attiva = [...menu.querySelectorAll('button')].filter((b) => b.getAttribute('aria-current') === 'page')
    expect(attiva.map((b) => b.textContent)).toEqual(['Dati preventivo'])
  })
})
