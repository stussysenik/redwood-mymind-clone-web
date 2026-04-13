// compiler.ts — Reads definitions/*.json, validates, derives tokens, writes CSS + manifest
// Runs in Node (not the browser). Import via cli.ts or a build script.

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import type { ThemeManifest, ThemeInfo } from './schema'
import { validateTheme, deriveOptionalTokens } from './schema'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readManifest(filePath: string): ThemeManifest {
  const raw = readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as ThemeManifest
}

function buildThemeCSS(manifest: ThemeManifest): string {
  const { name, tokens, extras } = manifest

  // Derive optional tokens first, then let explicit tokens win
  const derived = deriveOptionalTokens(tokens)
  const merged: Record<string, string> = { ...derived, ...tokens }

  // Build the CSS variable declarations
  const declarations = Object.entries(merged)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n')

  // Optional verbatim CSS block
  const customCSS = extras?.customCSS ? `\n  ${extras.customCSS.trim()}` : ''

  // @import statements are deliberately NOT emitted here. CSS requires every
  // `@import` to precede any other statement in the same file; since this
  // function is called once per theme and the results are concatenated,
  // inlining an @import next to a selector block guarantees an illegal
  // mid-file @import on the second theme onward. `compileThemes` collects
  // all fonts across themes and emits them once at the very top of the file.
  return `[data-theme="${name}"] {\n${declarations}${customCSS}\n}`
}

function buildThemeInfo(manifest: ThemeManifest): ThemeInfo {
  const info: ThemeInfo = {
    name: manifest.name,
    label: manifest.label,
    colorMode: manifest.colorMode,
    category: manifest.category,
    preview: manifest.preview,
  }
  if (manifest.fonts && manifest.fonts.length > 0) {
    info.fonts = manifest.fonts
  }
  return info
}

// ---------------------------------------------------------------------------
// DaisyUI theme metadata
// ---------------------------------------------------------------------------

const DAISYUI_DARK_THEMES = new Set([
  'dark',
  'synthwave',
  'halloween',
  'forest',
  'black',
  'luxury',
  'dracula',
  'business',
  'night',
  'coffee',
  'dim',
  'sunset',
])

const DAISYUI_THEME_PREVIEWS: Record<string, string> = {
  light: '#570DF8',
  dark: '#661AE6',
  cupcake: '#65C3C8',
  bumblebee: '#E0A82E',
  emerald: '#66CC8A',
  corporate: '#4B6BFB',
  synthwave: '#E779C1',
  retro: '#EF9995',
  cyberpunk: '#FF7598',
  valentine: '#E96D7B',
  halloween: '#F28C18',
  garden: '#5C7F67',
  forest: '#1EB854',
  aqua: '#09ECDF',
  lofi: '#808080',
  pastel: '#D1C1D7',
  fantasy: '#6E0B75',
  wireframe: '#B8B8B8',
  black: '#343232',
  luxury: '#DCA54C',
  dracula: '#FF79C6',
  cmyk: '#45AEEE',
  autumn: '#8C0327',
  business: '#1C4E80',
  acid: '#FF00F5',
  lemonade: '#519903',
  night: '#38BDF8',
  coffee: '#DB924B',
  winter: '#047AFF',
  dim: '#9FE88D',
  nord: '#5E81AC',
  sunset: '#FF865B',
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function buildDaisyUIThemeInfos(): ThemeInfo[] {
  return Object.entries(DAISYUI_THEME_PREVIEWS).map(([daisyName, preview]) => ({
    name: `daisy-${daisyName}`,
    label: `DaisyUI: ${capitalize(daisyName)}`,
    colorMode: DAISYUI_DARK_THEMES.has(daisyName) ? 'dark' : 'light',
    category: 'daisyui',
    preview,
  }))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile all theme JSON files in `definitionsDir` and write:
 *   - `outputDir/themes.css`   — concatenated [data-theme] CSS blocks
 *   - `outputDir/manifest.json` — array of ThemeInfo (metadata only, includes DaisyUI themes)
 */
export function compileThemes(
  definitionsDir: string,
  outputDir: string
): void {
  const absDefinitionsDir = resolve(definitionsDir)
  const absOutputDir = resolve(outputDir)

  if (!existsSync(absDefinitionsDir)) {
    throw new Error(`Definitions directory not found: ${absDefinitionsDir}`)
  }

  // Ensure output directory exists
  if (!existsSync(absOutputDir)) {
    mkdirSync(absOutputDir, { recursive: true })
  }

  const jsonFiles = readdirSync(absDefinitionsDir).filter((f) =>
    f.endsWith('.json')
  )

  if (jsonFiles.length === 0) {
    console.warn(`[theme-compiler] No JSON files found in ${absDefinitionsDir}`)
  }

  const cssBlocks: string[] = []
  const themeInfos: ThemeInfo[] = []
  const fontUrls = new Set<string>()
  let errorCount = 0

  for (const file of jsonFiles) {
    const filePath = join(absDefinitionsDir, file)

    let manifest: ThemeManifest
    try {
      manifest = readManifest(filePath)
    } catch (err) {
      console.error(`[theme-compiler] Failed to parse ${file}:`, err)
      errorCount++
      continue
    }

    const { valid, errors } = validateTheme(manifest)
    if (!valid) {
      console.error(
        `[theme-compiler] Validation failed for ${file}:\n` +
          errors.map((e) => `  - ${e}`).join('\n')
      )
      errorCount++
      continue
    }

    cssBlocks.push(buildThemeCSS(manifest))
    themeInfos.push(buildThemeInfo(manifest))
    if (manifest.fonts) {
      for (const url of manifest.fonts) fontUrls.add(url)
    }

    console.log(
      `[theme-compiler] ✓ ${manifest.name} (${manifest.colorMode}, ${manifest.category})`
    )
  }

  // Write themes.css — all @import statements hoisted to the top, once,
  // deduplicated across themes. Per the CSS spec, @imports must precede
  // every other statement in the file.
  const importHeader =
    fontUrls.size > 0
      ? Array.from(fontUrls)
          .map((url) => `@import url('${url}');`)
          .join('\n') + '\n\n'
      : ''
  const cssOutput = importHeader + cssBlocks.join('\n\n') + (cssBlocks.length ? '\n' : '')
  const cssPath = join(absOutputDir, 'themes.css')
  writeFileSync(cssPath, cssOutput, 'utf-8')
  console.log(`[theme-compiler] Wrote ${cssPath}`)

  // Append DaisyUI theme metadata (no CSS needed — handled by daisyui-bridge.css)
  const daisyInfos = buildDaisyUIThemeInfos()
  const allThemeInfos = [...themeInfos, ...daisyInfos]

  // Write manifest.json
  const manifestPath = join(absOutputDir, 'manifest.json')
  writeFileSync(manifestPath, JSON.stringify(allThemeInfos, null, 2), 'utf-8')
  console.log(`[theme-compiler] Wrote ${manifestPath}`)

  if (errorCount > 0) {
    console.warn(
      `[theme-compiler] Completed with ${errorCount} error(s). Check output above.`
    )
  } else {
    console.log(
      `[theme-compiler] Done — ${themeInfos.length} custom theme(s) + ${daisyInfos.length} DaisyUI theme(s) compiled.`
    )
  }
}
