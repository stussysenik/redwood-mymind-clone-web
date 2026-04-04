/**
 * Haptic feedback via web-haptics library.
 * Singleton instance — import `haptic` and call directly.
 */
import { WebHaptics } from 'web-haptics'

let instance: WebHaptics | null = null

function getInstance(): WebHaptics {
  if (!instance) {
    instance = new WebHaptics()
  }
  return instance
}

type HapticStyle = 'soft' | 'light' | 'medium' | 'rigid' | 'heavy' | 'selection' | 'success' | 'warning' | 'error'

export function haptic(style: HapticStyle = 'light') {
  try {
    getInstance().trigger(style)
  } catch {
    // Silently fail on unsupported environments
  }
}
