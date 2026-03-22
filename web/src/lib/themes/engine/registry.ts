// registry.ts — Runtime theme registry (runs in the browser).
// Wraps the build-time generated manifest.json with typed accessor functions.

import type { ThemeInfo } from './schema'
import manifestData from '../generated/manifest.json'

// Cast the imported JSON to ThemeInfo[]. The compiler guarantees this shape.
const themes: ThemeInfo[] = manifestData as ThemeInfo[]

/**
 * Return all registered themes.
 */
export function getThemes(): ThemeInfo[] {
  return themes
}

/**
 * Look up a theme by its slug name.
 * Returns `undefined` if no theme with that name exists.
 */
export function getTheme(name: string): ThemeInfo | undefined {
  return themes.find((t) => t.name === name)
}

/**
 * Return all themes that belong to `category`
 * (one of: 'custom' | 'daisyui' | 'community').
 */
export function getThemesByCategory(category: string): ThemeInfo[] {
  return themes.filter((t) => t.category === category)
}
