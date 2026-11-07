import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { ERROR_LOG_KEY } from '@/lib/authStorage'

interface Props {
  children: ReactNode
  fallbackTitle?: string
  fallbackMessage?: string
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logga anche in produzione: senza observability esterna (Sentry), il
    // console + ring buffer è l'unico modo per diagnosticare un crash via
    // screen-share con l'operatore.
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack)
    } else {
      console.error('[ErrorBoundary]', error.message)
    }
    try {
      const prev = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) ?? '[]') as unknown[]
      const entry = {
        ts: new Date().toISOString(),
        message: error.message,
        stack: error.stack?.slice(0, 1000),
        component: info.componentStack?.slice(0, 500),
      }
      localStorage.setItem(ERROR_LOG_KEY, JSON.stringify([entry, ...prev].slice(0, 5)))
    } catch {
      // Ring buffer best-effort: localStorage pieno/non disponibile → ignora.
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex flex-col items-center justify-center p-12 gap-4 text-center">
        <AlertTriangle className="h-12 w-12 text-brand-red" strokeWidth={1.5} />
        <h2 className="font-display text-xl font-bold text-ink-primary">
          {this.props.fallbackTitle ?? 'Qualcosa è andato storto'}
        </h2>
        <p className="text-sm text-ink-tertiary max-w-sm">
          {this.props.fallbackMessage ??
            'Si è verificato un errore imprevisto. Ricarica la pagina o contatta il supporto.'}
        </p>
        {import.meta.env.DEV && this.state.error && (
          <pre className="text-xs text-left bg-surface-tertiary p-3 rounded-sm max-w-lg overflow-auto text-error">
            {this.state.error.message}
          </pre>
        )}
        <button
          onClick={this.handleReset}
          className="flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-hover transition-colors duration-150"
        >
          <RefreshCw className="h-4 w-4" />
          Riprova
        </button>
      </div>
    )
  }
}
