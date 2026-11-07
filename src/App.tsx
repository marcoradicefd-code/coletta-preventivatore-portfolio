import { MotionConfig } from 'motion/react'
import { useStoreHydration } from '@/hooks/useStoreHydration'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { AppShell } from '@/components/layout/AppShell'
import { AuthGuard } from '@/components/auth/AuthGuard'
import pittogramma from '@/assets/brand/pittogramma.png'

export default function App() {
  const hydrated = useStoreHydration()

  if (!hydrated) {
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

  // U20 (revisione L15-L21): ogni animazione di Motion segue «riduci
  // movimento» del sistema, anche quelle senza `useReducedMotion` (modali, toast).
  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary fallbackTitle="Errore applicazione">
        <AuthGuard>
          <AppShell />
        </AuthGuard>
      </ErrorBoundary>
    </MotionConfig>
  )
}
