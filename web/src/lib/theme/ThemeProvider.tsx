/**
 * Theme Provider - Light/Dark mode with localStorage persistence
 * and theme pack (custom CSS variable sets) support.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'

import { getThemes, getTheme } from 'src/lib/themes'
import type { ThemeInfo } from 'src/lib/themes'

import { getSkins } from 'src/lib/themes/skins'
import type { SkinInfo } from 'src/lib/themes/skins'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  // Existing
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  // Theme packs
  themePack: string
  setThemePack: (pack: string) => void
  availableThemes: ThemeInfo[]
  // Skins
  skin: string
  setSkin: (skin: string) => void
  availableSkins: SkinInfo[]
}

const STORAGE_KEY = 'byoa-theme'
const DEFAULT_THEME: Theme = 'light'

const PACK_STORAGE_KEY = 'byoa-theme-pack'
export const DEFAULT_PACK = 'byoa'
/** The sentinel value meaning "no custom theme pack, just light/dark" */
export const NO_PACK = 'default'

const SKIN_STORAGE_KEY = 'byoa-skin'
export const DEFAULT_SKIN = 'native'
/** The sentinel value meaning "no skin override" */
export const NO_SKIN = 'default'

// Migrate old localStorage keys from mymind-* to byoa-*
if (typeof localStorage !== 'undefined') {
  const migrations: [string, string][] = [
    ['mymind-theme', 'byoa-theme'],
    ['mymind-theme-pack', 'byoa-theme-pack'],
    ['mymind-skin', 'byoa-skin'],
  ]
  for (const [oldKey, newKey] of migrations) {
    const old = localStorage.getItem(oldKey)
    if (old && !localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, old)
      localStorage.removeItem(oldKey)
    }
  }
}

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
  const [themePack, setThemePackState] = useState<string>(DEFAULT_PACK)
  const [skin, setSkinState] = useState<string>(DEFAULT_SKIN)

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

  const setThemePack = useCallback(
    (pack: string) => {
      setThemePackState(pack)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PACK_STORAGE_KEY, pack)
      }

      const root = document.documentElement
      if (pack === NO_PACK) {
        // Remove theme pack — fall back to light/dark system
        const resolved = computeResolvedTheme(theme)
        root.setAttribute('data-theme', resolved)
        root.style.colorScheme = resolved
      } else {
        // Apply the theme pack
        root.setAttribute('data-theme', pack)
        const themeInfo = getTheme(pack)
        if (themeInfo) {
          root.style.colorScheme = themeInfo.colorMode
        }
      }

      // Load fonts if needed
      const themeInfo = getTheme(pack)
      if (themeInfo?.fonts) {
        themeInfo.fonts.forEach((url) => {
          if (!document.querySelector(`link[href="${url}"]`)) {
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = url
            document.head.appendChild(link)
          }
        })
      }
    },
    [theme, computeResolvedTheme]
  )

  const setSkin = useCallback((newSkin: string) => {
    setSkinState(newSkin)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SKIN_STORAGE_KEY, newSkin)
    }
    const root = document.documentElement
    if (newSkin === NO_SKIN) {
      root.removeAttribute('data-skin')
    } else {
      root.setAttribute('data-skin', newSkin)
    }
  }, [])

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme)

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, newTheme)
      }

      const resolved = computeResolvedTheme(newTheme)
      setResolvedTheme(resolved)

      // Only apply light/dark to DOM when no custom pack is active
      if (themePack === NO_PACK) {
        applyTheme(resolved)
      }
    },
    [computeResolvedTheme, applyTheme, themePack]
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

    // Read and apply stored skin
    const storedSkin = localStorage.getItem(SKIN_STORAGE_KEY) || DEFAULT_SKIN
    setSkinState(storedSkin)
    const root = document.documentElement
    if (storedSkin !== NO_SKIN) {
      root.setAttribute('data-skin', storedSkin)
    } else {
      root.removeAttribute('data-skin')
    }

    // Read and apply stored theme pack
    const storedPack = localStorage.getItem(PACK_STORAGE_KEY) || DEFAULT_PACK
    setThemePackState(storedPack)

    if (storedPack !== NO_PACK) {
      root.setAttribute('data-theme', storedPack)
      const themeInfo = getTheme(storedPack)
      if (themeInfo) {
        root.style.colorScheme = themeInfo.colorMode
      }
      // Load fonts for the stored pack
      if (themeInfo?.fonts) {
        themeInfo.fonts.forEach((url) => {
          if (!document.querySelector(`link[href="${url}"]`)) {
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = url
            document.head.appendChild(link)
          }
        })
      }
    } else {
      applyTheme(resolved)
    }
  }, [defaultTheme, computeResolvedTheme, applyTheme])

  // Listen for system preference changes
  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = () => {
      if (theme === 'system') {
        const resolved = getSystemTheme()
        setResolvedTheme(resolved)
        // Only update DOM when no custom pack is active
        if (themePack === NO_PACK) {
          applyTheme(resolved)
        }
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme, themePack, getSystemTheme, applyTheme])

  const availableThemes = getThemes()
  const availableSkins = getSkins()

  const value: ThemeContextValue = {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    themePack,
    setThemePack,
    availableThemes,
    skin,
    setSkin,
    availableSkins,
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
    var pack = localStorage.getItem('${PACK_STORAGE_KEY}') || '${DEFAULT_PACK}';
    if (pack !== '${NO_PACK}') {
      document.documentElement.setAttribute('data-theme', pack);
    } else {
      var theme = localStorage.getItem('${STORAGE_KEY}');
      var resolved = theme === 'dark' ? 'dark' :
                     theme === 'light' ? 'light' :
                     window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.style.colorScheme = resolved;
    }
    var skin = localStorage.getItem('${SKIN_STORAGE_KEY}') || '${DEFAULT_SKIN}';
    if (skin !== '${NO_SKIN}') {
      document.documentElement.setAttribute('data-skin', skin);
    }
  } catch (e) {}
})();
`
