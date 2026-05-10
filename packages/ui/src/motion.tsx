export const motion = {
  duration: {
    fast: 140,
    base: 260,
    slow: 520,
  },
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

export function transition(
  property: string,
  duration: keyof typeof motion.duration = "base",
): string {
  return `${property} ${motion.duration[duration]}ms ${motion.easing}`;
}
