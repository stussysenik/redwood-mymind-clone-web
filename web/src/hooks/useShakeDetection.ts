import { useEffect, useRef } from 'react'

interface ShakeOptions {
  threshold?: number
  shakeCount?: number
  timeWindow?: number
}

const PERMISSION_KEY = 'byoa-shake-permission'

async function requestMotionPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
    return false
  }

  const DM = DeviceMotionEvent as any
  if (typeof DM.requestPermission !== 'function') {
    return true
  }

  if (localStorage.getItem(PERMISSION_KEY) === 'granted') {
    return true
  }

  try {
    const result = await DM.requestPermission()
    if (result === 'granted') {
      localStorage.setItem(PERMISSION_KEY, 'granted')
      return true
    }
    return false
  } catch {
    return false
  }
}

export function useShakeDetection(
  onShake: () => void,
  options: ShakeOptions = {}
): void {
  const { threshold = 25, shakeCount = 3, timeWindow = 500 } = options
  const callbackRef = useRef(onShake)
  callbackRef.current = onShake

  const shakeState = useRef({ last: 0, count: 0 })

  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      return
    }

    let mounted = true
    requestMotionPermission().then((granted) => {
      if (!mounted || !granted) return
    })

    const handler = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity
      if (!acc?.x || !acc?.y || !acc?.z) return

      const force = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z)
      const now = Date.now()

      if (force > threshold) {
        if (now - shakeState.current.last < timeWindow) {
          shakeState.current.count++
          if (shakeState.current.count >= shakeCount) {
            callbackRef.current()
            shakeState.current.count = 0
          }
        } else {
          shakeState.current.count = 1
        }
        shakeState.current.last = now
      }
    }

    window.addEventListener('devicemotion', handler)
    return () => {
      mounted = false
      window.removeEventListener('devicemotion', handler)
    }
  }, [threshold, shakeCount, timeWindow])
}
