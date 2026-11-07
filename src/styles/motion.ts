export const MOTION = {
  instant: 100,
  fast: 150,
  normal: 220,
  slow: 350,
  exit: 160,

  easeOut: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  easeIn: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
  smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',

  spring: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 30,
  },
  springGentle: {
    type: 'spring' as const,
    stiffness: 260,
    damping: 20,
  },
  springModal: {
    type: 'spring' as const,
    stiffness: 350,
    damping: 28,
  },
} as const
