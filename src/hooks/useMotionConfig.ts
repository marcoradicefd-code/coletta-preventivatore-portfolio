import { useReducedMotion } from 'motion/react'
import { MOTION } from '@/styles/motion'
import type { Variants } from 'motion/react'

export function useMotionConfig() {
  const prefersReduced = useReducedMotion()

  return {
    transition: prefersReduced
      ? { duration: 0 }
      : { duration: MOTION.normal / 1000 },

    safeVariants: (variants: Variants): Variants =>
      prefersReduced
        ? { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } }
        : variants,

    prefersReduced,
  }
}
