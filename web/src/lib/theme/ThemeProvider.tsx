/**
 * Theme Provider - Light/Dark mode with localStorage persistence
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const STORAGE_KEY = 'mymind-theme'
const DEFAULT_THEME: Theme = 'light'

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
}

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  const getSystemTheme = useCallback((): 'light' | 'dark' => {
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }, [])

  const computeResolvedTheme = useCallback(
    (t: Theme): 'light' | 'dark' => {
      return t === 'system' ? getSystemTheme() : t
    },
    [getSystemTheme]
  )

  const applyTheme = useCallback((resolved: 'light' | 'dark') => {
    if (typeof document === 'undefined') return

    const root = document.documentElement
    root.removeAttribute('data-theme')

    if (resolved === 'dark') {
      root.setAttribute('data-theme', 'dark')
    } else {
      root.setAttribute('data-theme', 'light')
    }

    root.style.colorScheme = resolved
  }, [])

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme)

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, newTheme)
      }

      const resolved = computeResolvedTheme(newTheme)
      setResolvedTheme(resolved)
      applyTheme(resolved)
    },
    [computeResolvedTheme, applyTheme]
  )

  const toggleTheme = useCallback(() => {
    const newTheme = resolvedTheme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
  }, [resolvedTheme, setTheme])

  // Initialize on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    const initial = stored || defaultTheme

    setThemeState(initial)
    const resolved = computeResolvedTheme(initial)
    setResolvedTheme(resolved)
    applyTheme(resolved)
  }, [defaultTheme, computeResolvedTheme, applyTheme])

  // Listen for system preference changes
  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = () => {
      if (theme === 'system') {
        const resolved = getSystemTheme()
        setResolvedTheme(resolved)
        applyTheme(resolved)
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme, getSystemTheme, applyTheme])

  const value: ThemeContextValue = {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  }

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export const themeScript = `
(function() {
  try {
    var theme = localStorage.getItem('${STORAGE_KEY}');
    var resolved = theme === 'dark' ? 'dark' :
                   theme === 'light' ? 'light' :
                   window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
  } catch (e) {}
})();
`
