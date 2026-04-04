#!/usr/bin/env tsx
// cli.ts — Developer CLI for the headless theme engine.
//
// Usage (from repo root):
//   npx tsx web/src/lib/themes/engine/cli.ts build
//   npx tsx web/src/lib/themes/engine/cli.ts list
//   npx tsx web/src/lib/themes/engine/cli.ts create <name>
//   npx tsx web/src/lib/themes/engine/cli.ts validate [file]
//   npx tsx web/src/lib/themes/engine/cli.ts export <name> [--format css|json]

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  copyFileSync,
} from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileThemes } from './compiler'
import { validateTheme, deriveOptionalTokens } from './schema'
import type { ThemeManifest, ThemeInfo } from './schema'

// ---------------------------------------------------------------------------
// Path resolution — works whether invoked from any cwd
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Directories relative to this CLI file:
//   cli.ts lives at  web/src/lib/themes/engine/cli.ts
//   definitions at   web/src/lib/themes/definitions/
//   generated at     web/src/lib/themes/generated/
const THEMES_ROOT = resolve(__dirname, '..')
const DEFINITIONS_DIR = join(THEMES_ROOT, 'definitions')
const GENERATED_DIR = join(THEMES_ROOT, 'generated')
const MANIFEST_PATH = join(GENERATED_DIR, 'manifest.json')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readManifest(filePath: string): ThemeManifest {
  const raw = readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as ThemeManifest
}

function readGeneratedManifest(): ThemeInfo[] {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`manifest.json not found at ${MANIFEST_PATH}`)
    console.error('Run: npx tsx .../cli.ts build')
    process.exit(1)
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as ThemeInfo[]
}

function printUsage(): void {
  console.log(`
Theme Engine CLI

Commands:
  build                    Compile all definitions/*.json → generated/
  list                     List all compiled themes from manifest.json
  create <name>            Scaffold a new theme definition file
  validate [file]          Validate one or all theme JSON files
  export <name> [--format css|json]
                           Print a theme to stdout (default: css)

Examples:
  npx tsx web/src/lib/themes/engine/cli.ts build
  npx tsx web/src/lib/themes/engine/cli.ts list
  npx tsx web/src/lib/themes/engine/cli.ts create brutalist
  npx tsx web/src/lib/themes/engine/cli.ts validate
  npx tsx web/src/lib/themes/engine/cli.ts validate definitions/brutalist.json
  npx tsx web/src/lib/themes/engine/cli.ts export default --format css
`)
}

// ---------------------------------------------------------------------------
// Command: build
// ---------------------------------------------------------------------------
function cmdBuild(): void {
  console.log(`[theme-cli] Building themes…`)
  console.log(`  definitions: ${DEFINITIONS_DIR}`)
  console.log(`  output:      ${GENERATED_DIR}`)
  compileThemes(DEFINITIONS_DIR, GENERATED_DIR)
}

// ---------------------------------------------------------------------------
// Command: list
// ---------------------------------------------------------------------------
function cmdList(): void {
  const themes = readGeneratedManifest()
  if (themes.length === 0) {
    console.log('No themes compiled yet. Run: build')
    return
  }
  const pad = Math.max(...themes.map((t) => t.name.length))
  console.log(`\n${'NAME'.padEnd(pad + 2)} MODE   CATEGORY    LABEL`)
  console.log('-'.repeat(60))
  for (const t of themes) {
    console.log(
      `${t.name.padEnd(pad + 2)} ${t.colorMode.padEnd(6)} ${t.category.padEnd(11)} ${t.label}`
    )
  }
  console.log(`\nTotal: ${themes.length} theme(s)`)
}

// ---------------------------------------------------------------------------
// Command: create <name>
// ---------------------------------------------------------------------------
const TEMPLATE: ThemeManifest = {
  name: 'PLACEHOLDER',
  label: 'New Theme',
  colorMode: 'light',
  category: 'custom',
  preview: '#000000',
  tokens: {
    background: '#ffffff',
    'background-secondary': '#f5f5f5',
    foreground: '#111111',
    'foreground-muted': '#666666',
    'card-bg': '#ffffff',
    border: 'rgba(0, 0, 0, 0.08)',
    'border-hover': 'rgba(0, 0, 0, 0.16)',
    'accent-primary': '#000000',
    'accent-hover': '#333333',
    'accent-light': 'rgba(0, 0, 0, 0.1)',
    'tag-green': '#00A99D',
    'tag-red': '#FF48B0',
    'tag-blue': '#2B579A',
    'tag-orange': '#FF6B4A',
    'tag-purple': '#9D7AD2',
    'tag-pink': '#FD7BB9',
    'tag-cyan': '#00A99D',
    'tag-amber': '#FFE800',
    'font-display': "'Georgia', serif",
    'font-body': "'Inter', system-ui, sans-serif",
    'radius-sm': '6px',
    'radius-md': '10px',
    'radius-lg': '14px',
    'radius-xl': '18px',
    'shadow-sm': '0 1px 3px rgba(0, 0, 0, 0.04)',
    'shadow-md': '0 2px 8px rgba(0, 0, 0, 0.06)',
    'shadow-lg': '0 4px 16px rgba(0, 0, 0, 0.08)',
  },
}

function cmdCreate(name: string): void {
  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    console.error('Theme name must be a lowercase slug (e.g. "brutalist")')
    process.exit(1)
  }
  const dest = join(DEFINITIONS_DIR, `${name}.json`)
  if (existsSync(dest)) {
    console.error(`Theme already exists: ${dest}`)
    process.exit(1)
  }
  const template = { ...TEMPLATE, name, label: name.replace(/-/g, ' ') }
  writeFileSync(dest, JSON.stringify(template, null, 2) + '\n', 'utf-8')
  console.log(`Created: ${dest}`)
  console.log(`Edit the file then run: build`)
}

// ---------------------------------------------------------------------------
// Command: validate [file]
// ---------------------------------------------------------------------------
function cmdValidate(target?: string): void {
  let files: string[]

  if (target) {
    const abs = resolve(target)
    if (!existsSync(abs)) {
      console.error(`File not found: ${abs}`)
      process.exit(1)
    }
    files = [abs]
  } else {
    if (!existsSync(DEFINITIONS_DIR)) {
      console.error(`Definitions directory not found: ${DEFINITIONS_DIR}`)
      process.exit(1)
    }
    files = readdirSync(DEFINITIONS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => join(DEFINITIONS_DIR, f))
  }

  let anyError = false
  for (const file of files) {
    let manifest: ThemeManifest
    try {
      manifest = readManifest(file)
    } catch (err) {
      console.error(`FAIL  ${file}\n  JSON parse error: ${String(err)}`)
      anyError = true
      continue
    }
    const { valid, errors } = validateTheme(manifest)
    if (valid) {
      console.log(`OK    ${file}`)
    } else {
      console.error(`FAIL  ${file}`)
      for (const e of errors) {
        console.error(`      - ${e}`)
      }
      anyError = true
    }
  }

  if (anyError) process.exit(1)
}

// ---------------------------------------------------------------------------
// Command: export <name> [--format css|json]
// ---------------------------------------------------------------------------
function cmdExport(name: string, format: 'css' | 'json'): void {
  const filePath = join(DEFINITIONS_DIR, `${name}.json`)
  if (!existsSync(filePath)) {
    console.error(`Theme definition not found: ${filePath}`)
    process.exit(1)
  }

  const manifest = readManifest(filePath)
  const { valid, errors } = validateTheme(manifest)
  if (!valid) {
    console.error(`Theme "${name}" has validation errors:`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  if (format === 'json') {
    process.stdout.write(JSON.stringify(manifest, null, 2) + '\n')
    return
  }

  // CSS format
  const derived = deriveOptionalTokens(manifest.tokens)
  const merged = { ...derived, ...manifest.tokens }

  const declarations = Object.entries(merged)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n')

  const customCSS = manifest.extras?.customCSS
    ? `\n  ${manifest.extras.customCSS.trim()}`
    : ''

  let output = ''
  if (manifest.fonts && manifest.fonts.length > 0) {
    output += manifest.fonts.map((u) => `@import url('${u}');`).join('\n') + '\n\n'
  }
  output += `[data-theme="${manifest.name}"] {\n${declarations}${customCSS}\n}\n`

  process.stdout.write(output)
}

// ---------------------------------------------------------------------------
// Argument parsing + dispatch
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const command = args[0]

switch (command) {
  case 'build':
    cmdBuild()
    break

  case 'list':
    cmdList()
    break

  case 'create': {
    const name = args[1]
    if (!name) {
      console.error('Usage: create <name>')
      process.exit(1)
    }
    cmdCreate(name)
    break
  }

  case 'validate': {
    const file = args[1] // optional
    cmdValidate(file)
    break
  }

  case 'export': {
    const themeName = args[1]
    if (!themeName) {
      console.error('Usage: export <name> [--format css|json]')
      process.exit(1)
    }
    const formatFlag = args.indexOf('--format')
    const fmt = formatFlag !== -1 ? (args[formatFlag + 1] as 'css' | 'json') : 'css'
    if (fmt !== 'css' && fmt !== 'json') {
      console.error('--format must be css or json')
      process.exit(1)
    }
    cmdExport(themeName, fmt)
    break
  }

  default:
    printUsage()
    if (command && command !== '--help' && command !== '-h') {
      console.error(`Unknown command: ${command}`)
      process.exit(1)
    }
    break
}
