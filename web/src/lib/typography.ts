import { useCallback, useEffect, useState } from 'react'

export type TypographyPairing = 'editorial' | 'technical' | 'warm' | 'helvetica' | 'inter'

export interface PairingInfo {
  id: TypographyPairing
  label: string
  display: string
  body: string
  ui: string
  specimen: string
}

export const PAIRINGS: PairingInfo[] = [
  {
    id: 'editorial',
    label: 'Editorial',
    display: 'Playfair Display',
    body: 'Inter',
    ui: 'JetBrains Mono',
    specimen: 'The quick brown fox',
  },
  {
    id: 'technical',
    label: 'Technical',
    display: 'IBM Plex Sans',
    body: 'IBM Plex Sans',
    ui: 'JetBrains Mono',
    specimen: 'The quick brown fox',
  },
  {
    id: 'warm',
    label: 'Warm',
    display: 'Fraunces',
    body: 'Source Sans 3',
    ui: 'JetBrains Mono',
    specimen: 'The quick brown fox',
  },
  {
    id: 'helvetica',
    label: 'Helvetica',
    display: 'Helvetica Neue',
    body: 'Helvetica Neue',
    ui: 'JetBrains Mono',
    specimen: 'The quick brown fox',
  },
  {
    id: 'inter',
    label: 'Inter',
    display: 'Inter',
    body: 'Inter',
    ui: 'JetBrains Mono',
    specimen: 'The quick brown fox',
  },
]

const STORAGE_KEY = 'byoa-typography'

function getStoredPairing(): TypographyPairing {
  if (typeof window === 'undefined') return 'editorial'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && PAIRINGS.some((p) => p.id === stored)) {
    return stored as TypographyPairing
  }
  return 'editorial'
}

function applyPairing(pairing: TypographyPairing) {
  const root = document.documentElement
  if (pairing === 'editorial') {
    root.removeAttribute('data-typography')
  } else {
    root.setAttribute('data-typography', pairing)
  }
}

export function useTypography() {
  const [pairing, setPairingState] = useState<TypographyPairing>(getStoredPairing)

  useEffect(() => {
    applyPairing(pairing)
    localStorage.setItem(STORAGE_KEY, pairing)
  }, [pairing])

  const setPairing = useCallback((p: TypographyPairing) => {
    setPairingState(p)
  }, [])

  return { pairing, setPairing, pairings: PAIRINGS }
}

/** Apply saved typography on page load (call once in App or layout) */
export function initTypography() {
  if (typeof window === 'undefined') return
  applyPairing(getStoredPairing())
}
