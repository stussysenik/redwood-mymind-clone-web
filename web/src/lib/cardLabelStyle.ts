import { useCallback, useEffect, useState } from 'react'

export type CardLabelStyle = 'blend' | 'glass'

export interface CardLabelStyleInfo {
  id: CardLabelStyle
  label: string
  description: string
}

export const CARD_LABEL_STYLES: CardLabelStyleInfo[] = [
  {
    id: 'blend',
    label: 'Blend',
    description: 'Pure typography, auto-inverts against any image',
  },
  {
    id: 'glass',
    label: 'Liquid glass',
    description: 'Frosted pill with translucent backdrop',
  },
]

const STORAGE_KEY = 'byoa-card-label-style'
const DEFAULT_STYLE: CardLabelStyle = 'blend'
const CHANGE_EVENT = 'byoa-card-label-style-change'

function getStoredStyle(): CardLabelStyle {
  if (typeof window === 'undefined') return DEFAULT_STYLE
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && CARD_LABEL_STYLES.some((s) => s.id === stored)) {
    return stored as CardLabelStyle
  }
  return DEFAULT_STYLE
}

function applyStyle(style: CardLabelStyle) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-card-label-style', style)
}

export function useCardLabelStyle() {
  const [style, setStyleState] = useState<CardLabelStyle>(getStoredStyle)

  useEffect(() => {
    applyStyle(style)
    localStorage.setItem(STORAGE_KEY, style)
  }, [style])

  useEffect(() => {
    const handleChange = (event: Event) => {
      const next = (event as CustomEvent<CardLabelStyle>).detail
      if (next) setStyleState(next)
    }
    window.addEventListener(CHANGE_EVENT, handleChange)
    return () => window.removeEventListener(CHANGE_EVENT, handleChange)
  }, [])

  const setStyle = useCallback((next: CardLabelStyle) => {
    setStyleState(next)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }))
    }
  }, [])

  return { style, setStyle, styles: CARD_LABEL_STYLES }
}

/** Apply saved card label style on page load (call once at module scope) */
export function initCardLabelStyle() {
  if (typeof window === 'undefined') return
  applyStyle(getStoredStyle())
}
