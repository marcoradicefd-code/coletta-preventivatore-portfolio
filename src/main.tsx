import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LazyMotion, domAnimation } from 'motion/react'
import { ToastProvider } from '@/components/shared/Toast'
import { useAuthStore } from '@/store/authStore'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </LazyMotion>
  </StrictMode>,
)

// Inizializza la sessione Supabase + listener auth state. Una sola volta, DOPO
// il primo render: `isLoading` parte a true, quindi AuthGuard mostra subito il
// pittogramma e non c'è flash di LoginPage. Girava prima del render, ma quel
// pattern rendeva il render potabile da rolldown se un import lanciava in cima
// al proprio modulo — che è come l'app è evaporata dal bundle (vedi
// lib/supabase.ts e lib/envGuard.ts).
useAuthStore.getState().initialize()
