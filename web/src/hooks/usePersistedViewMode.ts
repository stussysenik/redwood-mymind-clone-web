import { useEffect, useState } from 'react'

export function usePersistedViewMode<T extends string>(
  key: string,
  allowedValues: readonly T[],
  defaultValue: T
) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return defaultValue
    }

    const saved = window.localStorage.getItem(key)
    return allowedValues.includes(saved as T) ? (saved as T) : defaultValue
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(key, value)
  }, [key, value])

  return [value, setValue] as const
}
