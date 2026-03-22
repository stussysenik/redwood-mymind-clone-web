import { useState, useEffect } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    if (typeof window === 'undefined') return

    const media = window.matchMedia(query)
    setMatches(media.matches)

    const listener = (e: MediaQueryListEvent) => {
      setMatches(e.matches)
    }

    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])

  return hydrated ? matches : false
}

export function useBreakpoint() {
  const isXs = useMediaQuery('(max-width: 374px)')
  const isMidSm = useMediaQuery('(max-width: 450px)')
  const isSm = useMediaQuery('(max-width: 639px)')
  const isMd = useMediaQuery('(max-width: 767px)')
  const isLg = useMediaQuery('(max-width: 1023px)')

  return {
    isXs,
    isMidSm,
    isSm,
    isMd,
    isLg,
    isMobile: isMd,
    isDesktop: !isMd,
  }
}

export function useAtomicWeight() {
  const { isXs, isSm, isMd, isLg } = useBreakpoint()

  const isVisible = (weight: number): boolean => {
    if (isXs) return weight >= 9
    if (isSm) return weight >= 7
    if (isMd) return weight >= 5
    if (isLg) return weight >= 4
    return true
  }

  const getMinWeight = (): number => {
    if (isXs) return 9
    if (isSm) return 7
    if (isMd) return 5
    if (isLg) return 4
    return 1
  }

  const getWeightClass = (weight: number): string => {
    return `atomic-weight-${weight}`
  }

  return {
    isVisible,
    getMinWeight,
    getWeightClass,
    showCritical: true,
    showPrimary: isVisible(9),
    showPrimaryNav: isVisible(8),
    showSecondaryNav: isVisible(7),
    showContentSecondary: isVisible(6),
    showContentOptional: isVisible(5),
    showTertiary: isVisible(4),
    showDecorative: isVisible(3),
    showExtended: isVisible(2),
  }
}

export default useMediaQuery
