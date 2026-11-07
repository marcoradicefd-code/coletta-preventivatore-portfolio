/** Gli stili dei pulsanti delle finestre: 44 px di altezza, verbi espliciti. */
export const STILE_PULSANTE = {
  primario:
    'min-h-11 rounded-sm bg-brand-red px-4 py-2.5 text-sm font-semibold text-white shadow-red transition-colors hover:bg-brand-red-dark',
  secondario:
    'min-h-11 rounded-sm border border-separator-opaque bg-surface-secondary px-4 py-2.5 text-sm font-medium text-ink-primary transition-colors hover:bg-surface-tertiary',
  pericolo:
    'min-h-11 rounded-sm bg-error px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90',
} as const
