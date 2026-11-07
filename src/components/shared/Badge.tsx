import type { VoceSuMisura } from '@/types/sumisura'

const BADGE_STYLES: Record<VoceSuMisura['unitaMisura'], string> = {
  MQ: 'bg-brand-red-light text-brand-red',
  ML: 'bg-brand-navy/8 text-brand-navy',
  PEZZO: 'bg-brand-navy/8 text-brand-navy',
  VALORE: 'bg-brand-red-light text-brand-red',
}

interface BadgeProps {
  um: string
  className?: string
}

export function Badge({ um, className = '' }: BadgeProps) {
  const style = BADGE_STYLES[um as keyof typeof BADGE_STYLES] ?? 'bg-brand-navy/8 text-brand-navy'

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none ${style} ${className}`}
    >
      {um}
    </span>
  )
}
