import { type ReactNode } from 'react'
import { useAuthStore } from '@/store/authStore'
import { LoginPage } from './LoginPage'
import { NuovaPasswordPage } from './NuovaPasswordPage'
import pittogramma from '@/assets/brand/pittogramma.png'

interface AuthGuardProps {
  children: ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const isLoading = useAuthStore((s) => s.isLoading)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const inRecupero = useAuthStore((s) => s.inRecupero)

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-navy">
        <img
          src={pittogramma}
          alt="Coletta"
          className="h-16 w-16 brightness-0 invert animate-pulse"
        />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  // Sessione di recupero password (L26): l'app non si apre finché non si sceglie la password.
  if (inRecupero) {
    return <NuovaPasswordPage />
  }

  return <>{children}</>
}
