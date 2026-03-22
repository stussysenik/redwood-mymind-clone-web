// index.ts — Public API for the headless theme engine.
// Import types and runtime helpers from here; never import engine internals directly.

export type { ThemeManifest, ThemeInfo } from './engine/schema'
export { getThemes, getTheme, getThemesByCategory } from './engine/registry'
