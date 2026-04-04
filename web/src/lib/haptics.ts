/**
 * Haptic feedback utility.
 * Uses the Web Vibration API — works on Android Chrome and iOS Safari (15.4+).
 * Silently no-ops on unsupported browsers/desktop.
 */
export function haptic(style: 'light' | 'medium' | 'heavy' | 'success' | 'error') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return

  const patterns: Record<typeof style, number | number[]> = {
    light: 8,
    medium: 16,
    heavy: 28,
    success: [10, 60, 15],
    error: [20, 40, 20, 40, 20],
  }

  navigator.vibrate(patterns[style])
}
