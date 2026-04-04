// schema.ts — ThemeManifest type definitions, token lists, validation, and derivation

export interface ThemeManifest {
  /** URL-safe slug: 'nasa', 'brutalist', 'default' */
  name: string
  /** Human-readable display name: 'NASA Graphics Standards' */
  label: string
  colorMode: 'light' | 'dark'
  category: 'custom' | 'daisyui' | 'community'
  /** Hex color for UI swatch preview */
  preview: string
  /** Google Fonts @import URLs to inject */
  fonts?: string[]
  /** CSS variable values (without leading --) */
  tokens: Record<string, string>
  extras?: {
    /** Verbatim CSS appended inside the theme's [data-theme] block */
    customCSS?: string
  }
}

export interface ThemeInfo {
  name: string
  label: string
  colorMode: 'light' | 'dark'
  category: string
  preview: string
  fonts?: string[]
}

// ---------------------------------------------------------------------------
// Required token names — every theme JSON must supply all of these
// ---------------------------------------------------------------------------
export const REQUIRED_TOKENS: string[] = [
  'background',
  'background-secondary',
  'foreground',
  'foreground-muted',
  'card-bg',
  'border',
  'border-hover',
  'accent-primary',
  'accent-hover',
  'accent-light',
  'tag-green',
  'tag-red',
  'tag-blue',
  'tag-orange',
  'tag-purple',
  'tag-pink',
  'tag-cyan',
  'tag-amber',
  'font-display',
  'font-body',
  'radius-sm',
  'radius-md',
  'radius-lg',
  'radius-xl',
  'shadow-sm',
  'shadow-md',
  'shadow-lg',
]

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
export function validateTheme(manifest: ThemeManifest): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!manifest.name || !/^[a-z0-9-]+$/.test(manifest.name)) {
    errors.push(
      `"name" must be a lowercase slug (got: ${JSON.stringify(manifest.name)})`
    )
  }
  if (!manifest.label) {
    errors.push('"label" is required')
  }
  if (manifest.colorMode !== 'light' && manifest.colorMode !== 'dark') {
    errors.push(
      `"colorMode" must be "light" or "dark" (got: ${JSON.stringify(manifest.colorMode)})`
    )
  }
  if (!['custom', 'daisyui', 'community'].includes(manifest.category)) {
    errors.push(
      `"category" must be one of custom | daisyui | community (got: ${JSON.stringify(manifest.category)})`
    )
  }
  if (!manifest.preview) {
    errors.push('"preview" hex color is required')
  }

  for (const token of REQUIRED_TOKENS) {
    if (
      !manifest.tokens ||
      manifest.tokens[token] === undefined ||
      manifest.tokens[token] === ''
    ) {
      errors.push(`Missing required token: "${token}"`)
    }
  }

  return { valid: errors.length === 0, errors }
}

// ---------------------------------------------------------------------------
// Hex / RGBA helpers
// ---------------------------------------------------------------------------

/**
 * Parse a #RRGGBB or #RGB hex string into { r, g, b }.
 * Returns null if the string is not a recognisable hex colour.
 */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.trim()
  const short = /^#([0-9a-fA-F]{3})$/.exec(cleaned)
  if (short) {
    const [, h] = short
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    }
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(cleaned)
  if (full) {
    const [, h] = full
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    }
  }
  return null
}

/** Build an rgba() string from a hex colour + alpha. Falls back to the raw value if not parseable. */
function hexWithAlpha(hex: string, alpha: number): string {
  const c = parseHex(hex)
  if (!c) return hex
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`
}

/**
 * Estimate the relative luminance of a colour string.
 * Supports #RRGGBB and rgba(r,g,b,...) forms.
 * Returns a value in [0, 1]; higher = lighter.
 */
function estimateLuminance(color: string): number {
  const hex = parseHex(color)
  if (hex) {
    // Standard relative luminance (sRGB)
    const toLinear = (c: number) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return (
      0.2126 * toLinear(hex.r) +
      0.7152 * toLinear(hex.g) +
      0.0722 * toLinear(hex.b)
    )
  }
  // Try rgba(r,g,b,a)
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color)
  if (m) {
    const r = parseInt(m[1], 10)
    const g = parseInt(m[2], 10)
    const b = parseInt(m[3], 10)
    const toLinear = (c: number) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  }
  // Default to mid-luminance (treat as light)
  return 0.5
}

// ---------------------------------------------------------------------------
// Optional token derivation
// ---------------------------------------------------------------------------

/**
 * Given the required tokens for a theme, derive all optional / computed tokens.
 * These can be overridden by explicit values in the theme JSON because
 * `compiler.ts` merges as: { ...deriveOptionalTokens(t), ...t }.
 */
export function deriveOptionalTokens(
  tokens: Record<string, string>
): Record<string, string> {
  const bg = tokens['background'] ?? '#ffffff'
  const fg = tokens['foreground'] ?? '#000000'
  const cardBg = tokens['card-bg'] ?? '#ffffff'
  const accent = tokens['accent-primary'] ?? '#000000'
  const border = tokens['border'] ?? 'rgba(0,0,0,0.06)'
  const shadowSm = tokens['shadow-sm'] ?? '0 1px 3px rgba(0,0,0,0.04)'
  const shadowLg = tokens['shadow-lg'] ?? '0 4px 16px rgba(0,0,0,0.08)'

  const luminance = estimateLuminance(bg)
  const isDark = luminance < 0.18

  // surface-elevated: slightly lighter/darker than card-bg
  // We attempt to nudge the hex value; fall back to card-bg if not parseable.
  let surfaceElevated = cardBg
  const cardHex = parseHex(cardBg)
  if (cardHex) {
    if (isDark) {
      // lighten slightly
      const nudge = (c: number) => Math.min(255, c + 12)
      const r = nudge(cardHex.r).toString(16).padStart(2, '0')
      const g = nudge(cardHex.g).toString(16).padStart(2, '0')
      const b = nudge(cardHex.b).toString(16).padStart(2, '0')
      surfaceElevated = `#${r}${g}${b}`
    } else {
      // darken slightly
      const nudge = (c: number) => Math.max(0, c - 8)
      const r = nudge(cardHex.r).toString(16).padStart(2, '0')
      const g = nudge(cardHex.g).toString(16).padStart(2, '0')
      const b = nudge(cardHex.b).toString(16).padStart(2, '0')
      surfaceElevated = `#${r}${g}${b}`
    }
  }

  const surfaceOverlay = isDark
    ? 'rgba(3, 6, 15, 0.76)'
    : 'rgba(0, 0, 0, 0.6)'

  // border-subtle: try to lower the opacity of the border token
  let borderSubtle = border
  const borderRgbaMatch = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/.exec(
    border
  )
  if (borderRgbaMatch) {
    const [, r, g, b, a] = borderRgbaMatch
    const lowerAlpha = Math.max(0, parseFloat(a) * 0.6).toFixed(2)
    borderSubtle = `rgba(${r}, ${g}, ${b}, ${lowerAlpha})`
  } else {
    const borderHex = parseHex(border)
    if (borderHex) {
      borderSubtle = `rgba(${borderHex.r}, ${borderHex.g}, ${borderHex.b}, 0.04)`
    }
  }

  // border-emphasis: raise the opacity of the border token
  let borderEmphasis = border
  if (borderRgbaMatch) {
    const [, r, g, b, a] = borderRgbaMatch
    const higherAlpha = Math.min(1, parseFloat(a) * 2).toFixed(2)
    borderEmphasis = `rgba(${r}, ${g}, ${b}, ${higherAlpha})`
  } else {
    const borderHex = parseHex(border)
    if (borderHex) {
      borderEmphasis = `rgba(${borderHex.r}, ${borderHex.g}, ${borderHex.b}, 0.18)`
    }
  }

  // shadow-xs: shadow-sm with halved spread/blur (best-effort string replacement)
  // shadow-xl: shadow-lg with increased spread/blur
  // We keep them as simple copies when we cannot parse the shadow syntax.
  const shadowXs = shadowSm.replace(
    /(\d+)px/g,
    (_, n) => `${Math.max(0, Math.floor(parseInt(n, 10) / 2))}px`
  )
  const shadowXl = shadowLg.replace(
    /(\d+)px/g,
    (_, n) => `${Math.round(parseInt(n, 10) * 1.6)}px`
  )

  return {
    // surface palette
    'surface-primary': bg,
    'surface-secondary': tokens['background-secondary'] ?? bg,
    'surface-card': cardBg,
    'surface-elevated': surfaceElevated,
    'surface-floating': hexWithAlpha(cardBg, 0.88),
    'surface-soft': hexWithAlpha(fg, 0.04),
    'surface-hover': hexWithAlpha(fg, 0.06),
    'surface-active': hexWithAlpha(fg, 0.1),
    'surface-accent': hexWithAlpha(accent, 0.12),
    'surface-accent-strong': hexWithAlpha(accent, 0.18),
    'surface-success': 'rgba(34, 197, 94, 0.12)',
    'surface-warning': 'rgba(245, 158, 11, 0.14)',
    'surface-danger': 'rgba(239, 68, 68, 0.14)',
    'surface-overlay': surfaceOverlay,
    // header & card
    'header-backdrop': hexWithAlpha(bg, 0.78),
    'card-action-bg': hexWithAlpha(cardBg, 0.92),
    // accent glow
    'glow-accent': hexWithAlpha(accent, 0.14),
    // borders
    'border-subtle': borderSubtle,
    'border-default': border,
    'border-emphasis': borderEmphasis,
    // misc
    'platform-border-width': '3px',
    // scrollbar
    'scrollbar-thumb': hexWithAlpha(fg, 0.15),
    'scrollbar-thumb-hover': hexWithAlpha(fg, 0.24),
    // shimmer
    'shimmer-base': hexWithAlpha(fg, 0.05),
    'shimmer-highlight': hexWithAlpha(bg, 0.72),
    // shadows
    'shadow-xs': shadowXs,
    'shadow-xl': shadowXl,
    // radius
    'radius-full': '9999px',
  }
}
