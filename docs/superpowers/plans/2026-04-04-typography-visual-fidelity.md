# Typography + Visual Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a 3-pairing typography system (Editorial/Technical/Warm) with settings UI, migrate all font vars, and restore natural aspect-ratio card images.

**Architecture:** CSS custom properties (`--font-display`, `--font-body`, `--font-ui`) replace `--font-serif`/`--font-sans` throughout the theme engine and component tree. Typography pairings are applied via `[data-typography]` attribute on `<html>`, persisted in localStorage. Card images use `aspect-ratio: auto` with CSS columns handling variable heights.

**Tech Stack:** CSS custom properties, Google Fonts (self-hosted), RedwoodJS, React, existing theme engine (`web/src/lib/themes/`)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `web/public/fonts/` (directory) | Self-hosted font files |
| Create | `web/src/lib/typography.ts` | Pairing definitions, `useTypography` hook |
| Modify | `web/src/index.css:2,58-59,294-295,327-329,419-420` | Replace Google Fonts import, update font vars, migrate `.font-serif` class |
| Modify | `web/src/lib/themes/engine/schema.ts:53-54` | Rename `font-serif`/`font-sans` to `font-display`/`font-body`, add `font-ui` |
| Modify | `web/src/lib/themes/definitions/*.json` (9 files) | Update token keys from `font-serif`/`font-sans` to `font-display`/`font-body` |
| Modify | `web/src/lib/themes/engine/cli.ts:138-139` | Update fallback token names |
| Modify | `web/src/components/ThemeEditor/ThemeEditor.tsx:377-378,619-625` | Update editor token references |
| Modify | `web/src/components/ThemeEditor/EditorPreview.tsx` (6 refs) | Update `var(--font-serif)` → `var(--font-display)` |
| Modify | `web/src/pages/SettingsPage/SettingsPage.tsx` | Add typography picker to Appearance section |
| Modify | `web/src/components/Card/Card.tsx:165,200,248` | Replace fixed aspect ratios with natural sizing |
| Modify | ~20 components using `font-serif` className | Replace with `font-display` class |
| Regenerate | `web/src/lib/themes/generated/themes.css` | Rebuild from updated definitions |

---

### Task 1: Download and Self-Host Font Files

**Files:**
- Create: `web/public/fonts/` directory with font files
- Modify: `web/src/index.css:2` (replace Google Fonts import)

We need 6 font families across 3 pairings. Only the active pairing loads at runtime, but all files must be available.

| Pairing | Display | Body | UI |
|---------|---------|------|----|
| Editorial (default) | Playfair Display | Inter | JetBrains Mono |
| Technical | IBM Plex Sans | IBM Plex Sans | JetBrains Mono |
| Warm | Fraunces | Source Sans 3 | JetBrains Mono |

- [ ] **Step 1: Create fonts directory and download all font files**

```bash
mkdir -p web/public/fonts

# Playfair Display (Editorial display)
curl -L "https://fonts.google.com/download?family=Playfair+Display" -o /tmp/playfair.zip
unzip -o /tmp/playfair.zip -d /tmp/playfair
cp /tmp/playfair/static/PlayfairDisplay-Regular.ttf web/public/fonts/
cp /tmp/playfair/static/PlayfairDisplay-Bold.ttf web/public/fonts/
cp /tmp/playfair/static/PlayfairDisplay-Italic.ttf web/public/fonts/

# Inter (Editorial body — already loaded via Google Fonts, self-host it)
curl -L "https://fonts.google.com/download?family=Inter" -o /tmp/inter.zip
unzip -o /tmp/inter.zip -d /tmp/inter
cp /tmp/inter/static/Inter_18pt-Regular.ttf web/public/fonts/Inter-Regular.ttf
cp /tmp/inter/static/Inter_18pt-Medium.ttf web/public/fonts/Inter-Medium.ttf
cp /tmp/inter/static/Inter_18pt-SemiBold.ttf web/public/fonts/Inter-SemiBold.ttf

# JetBrains Mono (shared UI font across all pairings)
curl -L "https://fonts.google.com/download?family=JetBrains+Mono" -o /tmp/jetbrains.zip
unzip -o /tmp/jetbrains.zip -d /tmp/jetbrains
cp /tmp/jetbrains/static/JetBrainsMono-Regular.ttf web/public/fonts/
cp /tmp/jetbrains/static/JetBrainsMono-Medium.ttf web/public/fonts/

# IBM Plex Sans (Technical display + body)
curl -L "https://fonts.google.com/download?family=IBM+Plex+Sans" -o /tmp/plex.zip
unzip -o /tmp/plex.zip -d /tmp/plex
cp /tmp/plex/static/IBMPlexSans-Regular.ttf web/public/fonts/
cp /tmp/plex/static/IBMPlexSans-Medium.ttf web/public/fonts/
cp /tmp/plex/static/IBMPlexSans-SemiBold.ttf web/public/fonts/

# Fraunces (Warm display)
curl -L "https://fonts.google.com/download?family=Fraunces" -o /tmp/fraunces.zip
unzip -o /tmp/fraunces.zip -d /tmp/fraunces
cp /tmp/fraunces/static/Fraunces_72pt-Regular.ttf web/public/fonts/Fraunces-Regular.ttf
cp /tmp/fraunces/static/Fraunces_72pt-Bold.ttf web/public/fonts/Fraunces-Bold.ttf
cp /tmp/fraunces/static/Fraunces_72pt-Italic.ttf web/public/fonts/Fraunces-Italic.ttf

# Source Sans 3 (Warm body)
curl -L "https://fonts.google.com/download?family=Source+Sans+3" -o /tmp/sourcesans.zip
unzip -o /tmp/sourcesans.zip -d /tmp/sourcesans
cp /tmp/sourcesans/static/SourceSans3-Regular.ttf web/public/fonts/
cp /tmp/sourcesans/static/SourceSans3-Medium.ttf web/public/fonts/
cp /tmp/sourcesans/static/SourceSans3-SemiBold.ttf web/public/fonts/
```

- [ ] **Step 2: Verify font files are present**

```bash
ls -la web/public/fonts/
```

Expected: 17 .ttf files (3 Playfair, 3 Inter, 2 JetBrains, 3 IBM Plex, 3 Fraunces, 3 Source Sans)

- [ ] **Step 3: Replace Google Fonts import with @font-face declarations in index.css**

Replace line 2 of `web/src/index.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600&display=swap');
```

With self-hosted @font-face declarations (add to a new file to keep index.css clean):

Create `web/src/lib/fonts.css`:
```css
/* =============================================================================
   Self-hosted font faces — only active pairing is loaded via data-typography
   ============================================================================= */

/* --- Editorial: Playfair Display --- */
@font-face { font-family: 'Playfair Display'; font-weight: 400; font-style: normal; font-display: swap; src: url('/fonts/PlayfairDisplay-Regular.ttf') format('truetype'); }
@font-face { font-family: 'Playfair Display'; font-weight: 700; font-style: normal; font-display: swap; src: url('/fonts/PlayfairDisplay-Bold.ttf') format('truetype'); }
@font-face { font-family: 'Playfair Display'; font-weight: 400; font-style: italic; font-display: swap; src: url('/fonts/PlayfairDisplay-Italic.ttf') format('truetype'); }

/* --- Editorial/Technical/Warm: Inter (body for Editorial) --- */
@font-face { font-family: 'Inter'; font-weight: 400; font-style: normal; font-display: swap; src: url('/fonts/Inter-Regular.ttf') format('truetype'); }
@font-face { font-family: 'Inter'; font-weight: 500; font-style: normal; font-display: swap; src: url('/fonts/Inter-Medium.ttf') format('truetype'); }
@font-face { font-family: 'Inter'; font-weight: 600; font-style: normal; font-display: swap; src: url('/fonts/Inter-SemiBold.ttf') format('truetype'); }

/* --- Shared: JetBrains Mono (UI font for all pairings) --- */
@font-face { font-family: 'JetBrains Mono'; font-weight: 400; font-style: normal; font-display: swap; src: url('/fonts/JetBrainsMono-Regular.ttf') format('truetype'); }
@font-face { font-family: 'JetBrains Mono'; font-weight: 500; font-style: normal; font-display: swap; src: url('/fonts/JetBrainsMono-Medium.ttf') format('truetype'); }

/* --- Technical: IBM Plex Sans --- */
@font-face { font-family: 'IBM Plex Sans'; font-weight: 400; font-style: normal; font-display: swap; src: url('/fonts/IBMPlexSans-Regular.ttf') format('truetype'); }
@font-face { font-family: 'IBM Plex Sans'; font-weight: 500; font-style: normal; font-display: swap; src: url('/fonts/IBMPlexSans-Medium.ttf') format('truetype'); }
@font-face { font-family: 'IBM Plex Sans'; font-weight: 600; font-style: normal; font-display: swap; src: url('/fonts/IBMPlexSans-SemiBold.ttf') format('truetype'); }

/* --- Warm: Fraunces --- */
@font-face { font-family: 'Fraunces'; font-weight: 400; font-style: normal; font-display: swap; src: url('/fonts/Fraunces-Regular.ttf') format('truetype'); }
@font-face { font-family: 'Fraunces'; font-weight: 700; font-style: normal; font-display: swap; src: url('/fonts/Fraunces-Bold.ttf') format('truetype'); }
@font-face { font-family: 'Fraunces'; font-weight: 400; font-style: italic; font-display: swap; src: url('/fonts/Fraunces-Italic.ttf') format('truetype'); }

/* --- Warm: Source Sans 3 --- */
@font-face { font-family: 'Source Sans 3'; font-weight: 400; font-style: normal; font-display: swap; src: url('/fonts/SourceSans3-Regular.ttf') format('truetype'); }
@font-face { font-family: 'Source Sans 3'; font-weight: 500; font-style: normal; font-display: swap; src: url('/fonts/SourceSans3-Medium.ttf') format('truetype'); }
@font-face { font-family: 'Source Sans 3'; font-weight: 600; font-style: normal; font-display: swap; src: url('/fonts/SourceSans3-SemiBold.ttf') format('truetype'); }
```

Update `web/src/index.css` line 2:
```css
/* Remove: @import url('https://fonts.googleapis.com/...'); */
@import './lib/fonts.css';
```

- [ ] **Step 4: Verify dev server loads with self-hosted fonts**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8913/fonts/Inter-Regular.ttf
```

Expected: `200`

- [ ] **Step 5: Commit**

```bash
git add web/public/fonts/ web/src/lib/fonts.css web/src/index.css
git commit -m "feat(typography): self-host all font files for 3 pairings"
```

---

### Task 2: Add CSS Custom Property System

**Files:**
- Modify: `web/src/index.css:58-59,294-295,327-329,419-420`
- Modify: `web/src/lib/themes/engine/schema.ts:53-54`

- [ ] **Step 1: Replace font vars in `:root` block of index.css**

In `web/src/index.css`, replace lines 57-59:
```css
  /* Typography */
  --font-serif: 'Libre Baskerville', 'Georgia', 'Charter', serif;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
```

With:
```css
  /* Typography — pairing system (3 roles) */
  --font-display: 'Playfair Display', 'Georgia', 'Charter', serif;
  --font-body: 'Inter', system-ui, -apple-system, sans-serif;
  --font-ui: 'JetBrains Mono', 'Menlo', monospace;

  /* Legacy aliases (theme engine compat — will be removed after full migration) */
  --font-serif: var(--font-display);
  --font-sans: var(--font-body);
```

- [ ] **Step 2: Add `[data-typography]` selectors to index.css**

Add after the `:root` block (before the `@media (prefers-color-scheme: dark)` block):

```css
/* =============================================================================
   TYPOGRAPHY PAIRINGS
   ============================================================================= */

/* Editorial (default) — already set in :root */

[data-typography="technical"] {
  --font-display: 'IBM Plex Sans', system-ui, sans-serif;
  --font-body: 'IBM Plex Sans', system-ui, sans-serif;
  --font-ui: 'JetBrains Mono', 'Menlo', monospace;
  --font-serif: var(--font-display);
  --font-sans: var(--font-body);
}

[data-typography="warm"] {
  --font-display: 'Fraunces', 'Georgia', serif;
  --font-body: 'Source Sans 3', system-ui, sans-serif;
  --font-ui: 'JetBrains Mono', 'Menlo', monospace;
  --font-serif: var(--font-display);
  --font-sans: var(--font-body);
}
```

- [ ] **Step 3: Update body and heading font-family references**

In `web/src/index.css`:
- Line 295: Change `font-family: var(--font-sans);` → `font-family: var(--font-body);`
- Lines 327-329: Change `font-family: var(--font-serif);` → `font-family: var(--font-display);`
- Lines 419-420: Change `.font-serif { font-family: var(--font-serif); }` → `.font-display { font-family: var(--font-display); }` and add `.font-serif { font-family: var(--font-display); }` as alias

- [ ] **Step 4: Update theme engine schema**

In `web/src/lib/themes/engine/schema.ts`, replace lines 53-54:
```typescript
  'font-serif',
  'font-sans',
```

With:
```typescript
  'font-display',
  'font-body',
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit --project web/tsconfig.json 2>&1 | grep "error TS" | grep -v storybook
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add web/src/index.css web/src/lib/themes/engine/schema.ts
git commit -m "feat(typography): add 3-role CSS custom property system with pairing selectors"
```

---

### Task 3: Update Theme Engine Definitions

**Files:**
- Modify: `web/src/lib/themes/definitions/*.json` (9 theme files)
- Modify: `web/src/lib/themes/engine/cli.ts:138-139`
- Modify: `web/src/components/ThemeEditor/ThemeEditor.tsx:377-378,619-625`
- Modify: `web/src/components/ThemeEditor/EditorPreview.tsx` (6 refs)
- Regenerate: `web/src/lib/themes/generated/themes.css`

- [ ] **Step 1: Update all 9 theme definition JSON files**

For each file in `web/src/lib/themes/definitions/`, rename the keys:
- `"font-serif"` → `"font-display"`
- `"font-sans"` → `"font-body"`

Files to update:
1. `default.json`
2. `brutalist.json`
3. `byoa.json`
4. `glassmorphism.json`
5. `muji.json`
6. `nasa.json`
7. `neubrutalism.json`
8. `nord.json`
9. `retro-terminal.json`

Example for `default.json` — change:
```json
    "font-serif": "'Libre Baskerville', 'Georgia', 'Charter', serif",
    "font-sans": "'Inter', system-ui, -apple-system, sans-serif",
```
To:
```json
    "font-display": "'Playfair Display', 'Georgia', 'Charter', serif",
    "font-body": "'Inter', system-ui, -apple-system, sans-serif",
```

- [ ] **Step 2: Update cli.ts fallback values**

In `web/src/lib/themes/engine/cli.ts`, replace lines 138-139:
```typescript
    'font-serif': "'Georgia', serif",
    'font-sans': "'Inter', system-ui, sans-serif",
```
With:
```typescript
    'font-display': "'Georgia', serif",
    'font-body': "'Inter', system-ui, sans-serif",
```

- [ ] **Step 3: Update ThemeEditor token references**

In `web/src/components/ThemeEditor/ThemeEditor.tsx`:
- Line 377: `'font-sans'` → `'font-body'`
- Line 378: `'font-serif'` → `'font-display'`
- Line 619-620: Update `font-sans` label/key → `font-body`
- Line 624-625: Update `font-serif` label/key → `font-display`

- [ ] **Step 4: Update EditorPreview font references**

In `web/src/components/ThemeEditor/EditorPreview.tsx`, replace all 6 occurrences:
- `var(--font-serif)` → `var(--font-display)`
- `var(--font-sans)` → `var(--font-body)`

- [ ] **Step 5: Regenerate themes.css**

```bash
cd web && npx ts-node src/lib/themes/engine/cli.ts
```

If the CLI doesn't work as a direct command, check `package.json` scripts for theme generation. Alternatively:
```bash
npx tsx web/src/lib/themes/engine/cli.ts
```

Verify the generated file has `--font-display` and `--font-body` instead of the old var names:
```bash
grep "font-display\|font-body\|font-serif\|font-sans" web/src/lib/themes/generated/themes.css
```

Expected: only `font-display` and `font-body` appear (no `font-serif` or `font-sans`)

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit --project web/tsconfig.json 2>&1 | grep "error TS" | grep -v storybook
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/themes/ web/src/components/ThemeEditor/
git commit -m "feat(typography): migrate theme engine from font-serif/sans to font-display/body"
```

---

### Task 4: Create `useTypography` Hook

**Files:**
- Create: `web/src/lib/typography.ts`

- [ ] **Step 1: Write the typography hook with pairing definitions**

Create `web/src/lib/typography.ts`:
```typescript
import { useCallback, useEffect, useState } from 'react'

export type TypographyPairing = 'editorial' | 'technical' | 'warm'

export interface PairingInfo {
  id: TypographyPairing
  label: string
  display: string
  body: string
  ui: string
  /** Short specimen sentence */
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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit --project web/tsconfig.json 2>&1 | grep "error TS" | grep -v storybook
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/typography.ts
git commit -m "feat(typography): add useTypography hook with 3 pairing definitions"
```

---

### Task 5: Add Typography Picker to Settings

**Files:**
- Modify: `web/src/pages/SettingsPage/SettingsPage.tsx`

- [ ] **Step 1: Add typography picker to the Appearance section**

In `web/src/pages/SettingsPage/SettingsPage.tsx`:

Add import at top:
```typescript
import { useTypography, PAIRINGS } from 'src/lib/typography'
import { Type } from 'lucide-react'
```

Inside the component, after the `theme` state:
```typescript
const { pairing, setPairing } = useTypography()
```

After the theme toggle `</div>` (line 104), before the closing `</div>` of the Appearance card (line 105), add:

```tsx
            {/* Typography pairing */}
            <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
              <p className="text-sm mb-3" style={{ color: 'var(--foreground)' }}>Typography</p>
              <div className="grid gap-2">
                {PAIRINGS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPairing(p.id)}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-all"
                    style={{
                      backgroundColor: pairing === p.id ? 'var(--accent-light)' : 'var(--surface-soft)',
                      border: pairing === p.id
                        ? '1.5px solid var(--accent-primary)'
                        : '1px solid var(--border-subtle)',
                    }}
                  >
                    <Type className="h-4 w-4 shrink-0" style={{ color: pairing === p.id ? 'var(--accent-primary)' : 'var(--foreground-muted)' }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{p.label}</p>
                      <p
                        className="text-xs truncate"
                        style={{
                          color: 'var(--foreground-muted)',
                          fontFamily: `'${p.display}', serif`,
                        }}
                      >
                        {p.specimen}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
```

- [ ] **Step 2: Initialize typography on app load**

In `web/src/layouts/AppLayout/AppLayout.tsx`, add at the top of the file:
```typescript
import { initTypography } from 'src/lib/typography'
```

Call `initTypography()` at module scope (outside any component) so it runs on first import:
```typescript
initTypography()
```

- [ ] **Step 3: Type-check and verify**

```bash
npx tsc --noEmit --project web/tsconfig.json 2>&1 | grep "error TS" | grep -v storybook
```

Expected: no errors

- [ ] **Step 4: Visual verification**

Open http://localhost:8913/settings, navigate to Appearance section.
Verify: three typography buttons (Editorial, Technical, Warm) are visible.
Click each — headings and body text should change fonts immediately.
Refresh — selected pairing should persist.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/SettingsPage/SettingsPage.tsx web/src/layouts/AppLayout/AppLayout.tsx
git commit -m "feat(typography): add typography picker to Settings and init on app load"
```

---

### Task 6: Migrate Component Font Classes

**Files:**
- Modify: ~20 components that use `font-serif` class or `var(--font-serif)` inline

All instances of `className="...font-serif..."` should change to `className="...font-display..."`.
All instances of `fontFamily: 'var(--font-serif)'` should change to `fontFamily: 'var(--font-display)'`.
All instances of `var(--font-sans)` in inline styles should change to `var(--font-body)`.

- [ ] **Step 1: Add `.font-display` utility class to index.css**

In `web/src/index.css`, the existing `.font-serif` block (line 419-420):
```css
.font-serif {
  font-family: var(--font-serif);
}
```

Change to:
```css
.font-display {
  font-family: var(--font-display);
}

/* Legacy alias — kept for theme compat */
.font-serif {
  font-family: var(--font-display);
}
```

- [ ] **Step 2: Batch-replace `font-serif` className in all components**

Run search-and-replace across all `.tsx` files in `web/src/`:
- `className="font-serif ` → `className="font-display `
- `className="...font-serif"` → `className="...font-display"`
- `font-serif ` (in className strings) → `font-display `

Components to update (from grep results):
1. `web/src/pages/SerendipityPage/SerendipityPage.tsx:11`
2. `web/src/components/SpaceCell/SpaceCell.tsx:215,297`
3. `web/src/pages/TrashPage/TrashPage.tsx:12`
4. `web/src/pages/ArchivePage/ArchivePage.tsx:18`
5. `web/src/pages/SettingsPage/SettingsPage.tsx:59`
6. `web/src/pages/SpacesPage/SpacesPage.tsx:39`
7. `web/src/components/CardGridClient/CardGridClient.tsx:1001,1270`
8. `web/src/components/SettingsModal/SettingsModal.tsx:147`
9. `web/src/components/FeedCellShared/FeedCellShared.tsx:271,696`
10. `web/src/components/CardsCell/CardsCell.tsx:103`
11. `web/src/components/ShuffleModal/ShuffleModal.tsx:178,193,313`
12. `web/src/components/CardDetailModal/CardDetailModal.tsx:878,1127,1207,1217,1220,1268`
13. `web/src/components/FocusCard/FocusCard.tsx:173`
14. `web/src/components/AddModal/AddModal.tsx:581,783`
15. `web/src/components/CreateSpace/CreateSpace.tsx:86`
16. `web/src/components/CardCell/CardCell.tsx:75`
17. `web/src/components/SpacesCell/SpacesCell.tsx:44`

- [ ] **Step 3: Replace inline font-family references**

- `SearchBar.tsx:230`: `fontFamily: 'var(--font-serif)'` → `fontFamily: 'var(--font-display)'`
- `EditorPreview.tsx` (6 refs): `var(--font-serif)` → `var(--font-display)`, `var(--font-sans)` → `var(--font-body)`

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit --project web/tsconfig.json 2>&1 | grep "error TS" | grep -v storybook
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add -u web/src/
git commit -m "refactor(typography): migrate font-serif/sans to font-display/body across all components"
```

---

### Task 7: Fix Card Image Aspect Ratios

**Files:**
- Modify: `web/src/components/Card/Card.tsx:165,200,248`
- Modify: `web/src/components/FeedCellShared/FeedCellShared.tsx:318`

The goal: images render at their natural/intrinsic aspect ratio. Exceptions:
- YouTube: keep `aspect-video` (16:9)
- Movie, Goodreads, Letterboxd, StoryGraph: keep `aspect-[2/3]`
- VideoPlayer: keep `aspect-video`

- [ ] **Step 1: Update Card.tsx — remove forced aspect ratios on card images**

In `web/src/components/Card/Card.tsx`:

Line 165 — the main image block with `aspectRatio: '5/3'`:
Replace the image's style from:
```tsx
aspectRatio: '5/3'
```
To:
```tsx
aspectRatio: 'auto'
```

Line 200 — the screenshot fallback with `aspect-[1.618/1]`:
Replace:
```tsx
<div className="relative aspect-[1.618/1] w-full overflow-hidden bg-gray-50">
```
With:
```tsx
<div className="relative w-full overflow-hidden bg-gray-50">
```

Line 248 — the type icon placeholder with `aspect-[1.618/1]`:
Keep this one as-is — placeholders without images should have a fixed ratio.

- [ ] **Step 2: Update FeedCellShared visual aspect ratio**

In `web/src/components/FeedCellShared/FeedCellShared.tsx`, line 318:
Replace:
```tsx
aspectRatio: '4 / 3',
```
With:
```tsx
aspectRatio: 'auto',
```

- [ ] **Step 3: Add color placeholder for image loading**

In `web/src/components/Card/Card.tsx`, for the main image (near line 165), ensure the container has a background color derived from the card's extracted color:
```tsx
style={{
  backgroundColor: card.metadata?.colors?.[0] || 'var(--surface-secondary)',
}}
```

This shows a color swatch while the image loads at natural dimensions.

- [ ] **Step 4: Visual verification**

Open the library grid in browser. Verify:
- Images render at varied heights (not all the same ratio)
- Masonry columns accommodate variable heights without gaps
- YouTube cards still show 16:9
- Book/Movie cards still show 2:3 portrait
- No broken layouts on mobile (check at 375px width)

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Card/Card.tsx web/src/components/FeedCellShared/FeedCellShared.tsx
git commit -m "feat(typography): restore natural aspect-ratio card images"
```

---

### Task 8: Remove Legacy Font Vars and Final Cleanup

**Files:**
- Modify: `web/src/index.css` (remove `--font-serif`/`--font-sans` aliases)
- Modify: `web/src/components/GraphClient/GraphClient.tsx` (canvas font reference)

- [ ] **Step 1: Verify no remaining direct references to --font-serif or --font-sans**

```bash
grep -r "font-serif\|font-sans" web/src/ --include="*.tsx" --include="*.ts" --include="*.css" \
  | grep -v node_modules | grep -v ".backup" | grep -v "generated/themes.css" | grep -v "definitions/"
```

Expected: only the legacy aliases in `index.css` and the `.font-serif` class alias. If any component references remain, fix them first.

- [ ] **Step 2: Update GraphClient canvas font**

In `web/src/components/GraphClient/GraphClient.tsx`, find the canvas font line:
```typescript
ctx.font = `700 ${initialSize}px Inter, system-ui, sans-serif`;
```

This is fine to keep as-is — canvas rendering uses specific font names, not CSS vars. The canvas will pick up whichever font is loaded.

- [ ] **Step 3: Full type-check**

```bash
npx tsc --noEmit --project web/tsconfig.json 2>&1 | grep "error TS" | grep -v storybook
```

Expected: no errors

- [ ] **Step 4: Visual regression check**

Navigate through all major surfaces in the browser:
1. Library grid (/)
2. Search results
3. Spaces page
4. Archive page
5. Settings page
6. Card detail modal
7. Shuffle modal
8. Graph view

Verify fonts render correctly in each. Switch between all 3 pairings. Verify persistence across page reloads.

- [ ] **Step 5: Final commit**

```bash
git add -u
git commit -m "feat(typography): complete typography pairing system with visual fidelity improvements"
```

- [ ] **Step 6: Tag the feature**

```bash
git tag -a v0.6.0 -m "feat: typography + visual fidelity — 3-pairing font system with natural aspect ratios

MINOR: Self-hosted fonts, Editorial/Technical/Warm pairings,
settings picker, --font-display/body/ui vars, natural card images.

Closes: platform-hardening feature 1 of 5"
```
