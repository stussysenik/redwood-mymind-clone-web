## Capability: typography-visual-fidelity

CSS custom property font system with 3 curated pairings selectable in settings, plus original-aspect-ratio card image rendering (Are.na philosophy).

## Behavior

### Typography Pairings

Three curated pairings, each defining three roles:

| Pairing | Display (headings, card titles) | Body (descriptions, content) | UI (labels, buttons, nav) |
|---------|-------------------------------|------------------------------|---------------------------|
| **Editorial** | Playfair Display (serif) | Inter (sans) | Inter (sans) |
| **Technical** | JetBrains Mono (monospace) | IBM Plex Sans (sans) | IBM Plex Sans (sans) |
| **Warm** | Fraunces (serif, optical size) | Source Sans 3 (sans) | Source Sans 3 (sans) |

Default: **Editorial** (closest to current Libre Baskerville + Inter, but upgraded).

### CSS Variables

```css
:root {
  --font-display: 'Playfair Display', serif;
  --font-body: 'Inter', sans-serif;
  --font-ui: 'Inter', sans-serif;
}

[data-typography="technical"] {
  --font-display: 'JetBrains Mono', monospace;
  --font-body: 'IBM Plex Sans', sans-serif;
  --font-ui: 'IBM Plex Sans', sans-serif;
}

[data-typography="warm"] {
  --font-display: 'Fraunces', serif;
  --font-body: 'Source Sans 3', sans-serif;
  --font-ui: 'Source Sans 3', sans-serif;
}
```

Applied to the `<html>` element via `data-typography` attribute, same pattern as the existing `data-theme`.

### Migration from Old Font Variables

The codebase currently uses `--font-serif` and `--font-sans`. These must be replaced:
- `--font-serif` → `--font-display` (used for headings, card titles)
- `--font-sans` → `--font-body` (used for body text, descriptions)
- All `font-family: var(--font-serif)` and `font-family: var(--font-sans)` references in CSS and components must be updated.
- After migration, remove the old `--font-serif` and `--font-sans` declarations from `index.css`.

### Typography Scale

In addition to font families, define a consistent type scale using CSS variables:

```css
:root {
  --text-xs: 0.75rem;      /* 12px — tags, badges */
  --text-sm: 0.8125rem;    /* 13px — card descriptions, metadata */
  --text-base: 0.9375rem;  /* 15px — body text */
  --text-lg: 1.125rem;     /* 18px — card titles */
  --text-xl: 1.5rem;       /* 24px — section headers */
  --text-2xl: 2rem;        /* 32px — page titles */

  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;

  --tracking-tight: -0.01em;
  --tracking-normal: 0;
  --tracking-wide: 0.025em;
}
```

### Settings UI

Settings → Appearance section (below existing theme toggle):

**"Typography" subsection** with 3 cards, each showing:
- Pairing name
- Sample text preview: a card title in the display font + a description line in the body font + a tag pill in the UI font
- Radio-style selection (active card has accent border)

Stored in `localStorage` key `byoa-typography` and synced via the existing theme provider pattern.

### Font Loading Strategy

Self-hosted in `/web/public/fonts/` to avoid Google Fonts external requests:
- Only load the active pairing's fonts (not all 3 at once).
- Use `font-display: swap` for instant text rendering.
- Preload the active pairing's display font for above-the-fold card titles.
- Subset fonts to latin + latin-extended (covers English + common European characters).

### Visual Fidelity: Original Aspect Ratio Images

**Current problem**: Card images are forced into fixed aspect ratios (`aspect-video`, golden ratio 1.618:1), cropping the original image.

**Solution**: Let images render at their natural/intrinsic aspect ratio within the masonry grid.

**Implementation**:
1. Remove fixed `aspect-ratio` constraints from card image containers.
2. Use `width: 100%; height: auto;` so images fill column width and determine their own height.
3. The CSS columns masonry layout already handles variable-height items via `break-inside: avoid`.
4. Add `aspect-ratio: auto` explicitly to prevent any inherited constraints.
5. For cards without images (note cards, text-only), keep the existing content-based sizing.
6. Loading placeholder: use the card's `metadata.colors[0]` as background with a shimmer, sized to a default ratio until the image loads and reveals its natural dimensions.

**Affected card components** (actual CSS classes to change):
- `Card.tsx:200` — remove `aspect-[1.618/1]` (golden ratio) on image container
- `Card.tsx:248` — remove `aspect-[1.618/1]` on fallback image container
- `TwitterCard.tsx:112` — remove `aspect-video` on tweet image
- `RedditCard.tsx:94` — remove `aspect-video` on post image
- `InstagramCard.tsx` — remove fixed aspect on carousel/single images
- **Keep as-is**: `YouTubeCard` (video embeds need 16:9), `MovieCard`/`GoodreadsCard`/`LetterboxdCard`/`StoryGraphCard` (poster art is intentionally 2:3), `VideoPlayer` (video players need aspect-video)

## Files Changed

| File | Change |
|------|--------|
| `web/src/index.css` | Add `--font-display`, `--font-body`, `--font-ui` variables, typography scale, `[data-typography]` selectors |
| `web/public/fonts/` | New — self-hosted font files for all 3 pairings |
| `web/src/pages/SettingsPage/SettingsPage.tsx` | Add Typography subsection in Appearance |
| `web/src/lib/theme/ThemeProvider.tsx` | Add typography attribute management alongside theme |
| `web/src/components/Card/Card.tsx` | Remove `aspect-[1.618/1]` on image containers (lines ~200, ~248), use natural height |
| `web/src/components/cards/TwitterCard.tsx` | Remove `aspect-video` on tweet image container (line ~112) |
| `web/src/components/cards/RedditCard.tsx` | Remove `aspect-video` on post image (line ~94) |
| `web/src/components/cards/InstagramCard.tsx` | Remove fixed aspect constraints on carousel/single images |
| `web/index.html` | Add font preload link for default pairing |

## Dependencies

None. Self-hosted fonts, CSS-only implementation.

## Acceptance Criteria

- [ ] Settings → Appearance shows 3 typography pairings with live preview.
- [ ] Selecting a pairing updates all card titles, descriptions, tags, and UI text immediately.
- [ ] Preference persists in `localStorage` and survives page reload.
- [ ] Editorial pairing is the default for new users.
- [ ] Fonts are self-hosted — no external Google Fonts requests in production.
- [ ] Only the active pairing's fonts are loaded (not all 3).
- [ ] Card images display at their original/natural aspect ratio in the masonry grid.
- [ ] No layout shift when images load (color placeholder sized appropriately).
- [ ] YouTube cards retain 16:9 aspect ratio (video embed exception).
- [ ] Mobile: typography scales appropriately, no horizontal overflow.
