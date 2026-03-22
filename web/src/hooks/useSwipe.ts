import { useRef, useCallback } from 'react'

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

export function useSwipe(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  threshold: number = 50
): SwipeHandlers {
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const touchEndX = e.changedTouches[0].clientX
      const touchEndY = e.changedTouches[0].clientY

      const diffX = touchEndX - touchStartX.current
      const diffY = touchEndY - touchStartY.current

      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
        if (diffX > 0) {
          onSwipeRight()
        } else {
          onSwipeLeft()
        }
      }
    },
    [onSwipeLeft, onSwipeRight, threshold]
  )

  return { onTouchStart, onTouchEnd }
}

export default useSwipe
