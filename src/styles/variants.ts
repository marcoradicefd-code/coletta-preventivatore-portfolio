import type { Variants } from 'motion/react'
import { MOTION } from './motion'

export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: MOTION.normal / 1000 } },
  exit: { opacity: 0, transition: { duration: MOTION.exit / 1000 } },
}

export const slideUpVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: MOTION.normal / 1000, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: MOTION.exit / 1000 } },
}

export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: MOTION.springModal },
  exit: { opacity: 0, scale: 0.97, transition: { duration: MOTION.exit / 1000 } },
}

export const listContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.035,
      delayChildren: 0.05,
    },
  },
}

export const listItemVariants: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: MOTION.springGentle },
  exit: { opacity: 0, x: 12, transition: { duration: MOTION.exit / 1000 } },
}

export const toastVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: MOTION.spring },
  exit: { opacity: 0, y: -10, scale: 0.97, transition: { duration: MOTION.exit / 1000 } },
}
