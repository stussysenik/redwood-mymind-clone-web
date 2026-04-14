## Capability: enrichment-review-surface

A dedicated `/review` route where the user makes judgment calls on the 0.6–0.9 confidence band — accepting, rejecting, editing, or skipping proposed titles and descriptions one card at a time. Designed to the iA Writer standard: editorial density, system fonts, zero decorative chrome, full CSS interaction state coverage, WCAG 2.1 AA compliance.

## ADDED Requirements

### Requirement: Users can review and resolve medium-confidence proposals

The web app SHALL expose a `/review` route that renders cards queued by the enrichment pipeline one at a time, showing the current value, the proposed value, the critic's reasoning, and four resolution actions: accept, reject, edit, skip.

#### Scenario: Visiting /review shows the oldest pending item

Given an authenticated user visits `/review`,
And at least one `EnrichmentReviewItem` with `resolvedAt=null` exists for a card owned by the user,
When the page loads,
Then the oldest unresolved item MUST render first, showing current value, proposed value, critic reasoning, and the source content snippet,
And the next item MUST be prefetched in the background.

#### Scenario: Accepting applies the proposed value in one transaction

Given the user taps the accept button or presses `a`,
When the `resolveEnrichmentReviewItem` mutation runs with `resolution='accept'`,
Then the mutation MUST write the proposed value to the card and flip the review item to `resolved` in a single Prisma transaction,
And the client cache MUST optimistically remove the item and advance to the next,
And the card collapses via a `grid-template-rows` animation that honors `prefers-reduced-motion`.

#### Scenario: Rejecting preserves the current value

Given the user taps reject or presses `r`,
When the mutation runs with `resolution='reject'`,
Then the review item MUST be flipped to resolved with the rejection recorded,
And the card MUST NOT be touched,
And the item MUST be excluded from future sweeps until a user explicitly resets it.

#### Scenario: Editing writes the user's text and sets the tombstone

Given the user taps edit or presses `e`,
When the inline edit field appears pre-filled with the proposed value,
And the user modifies the text and saves,
Then the mutation MUST write the edited value (not the original proposal) to the card,
And MUST set the corresponding `title_edited_at` or `description_edited_at` tombstone,
And future pipeline sweeps MUST skip the card for that field entirely.

#### Scenario: Skipping defers the item to the end of the queue

Given the user taps skip or presses `s`,
When the mutation runs with `resolution='skip'`,
Then the item MUST remain unresolved,
And the client MUST advance to the next item without touching the card,
And the skipped item MUST reappear at the tail of the queue on a subsequent visit.

### Requirement: Every interactive surface implements the full CSS interaction state matrix

All buttons, links, and editable fields in the review surface SHALL render distinct visual states for `:hover`, `:focus-visible`, `:active`, `:focus-within`, and SHALL expose a `:target`-driven help overlay. These states are enforced by Playwright assertions, not styling afterthoughts.

#### Scenario: Pointer users see hover feedback

Given a pointer moves over any action button,
When the hover state applies,
Then the button MUST show a 2% accent-hue background tint,
And the change MUST reverse when the pointer leaves,
And hover MUST NOT apply to touch-only devices (honoring `@media (hover: hover)`).

#### Scenario: Keyboard users see focus rings, pointer users do not

Given a user tabs to any interactive surface,
When focus lands on the element,
Then the element MUST render a 2px outline offset by 2px in the `--focus-ring` color via `:focus-visible`,
And the outline MUST NOT render on pointer-click focus (`:focus:not(:focus-visible)` suppresses it).

#### Scenario: Active state provides tactile feedback

Given a user presses and holds any action button,
When the `:active` state applies,
Then the button MUST show a 4% accent-hue background tint and a `transform: scale(0.98)` with an 80ms transition,
And release MUST smoothly restore the default state.

#### Scenario: Edit mode highlights the parent review card

Given the inline edit field receives focus,
When the `:focus-within` state applies to its parent review card,
Then the card MUST gain a 1% accent background tint as a composition cue,
And the tint MUST clear when focus leaves the card subtree.

#### Scenario: Keyboard help overlay opens via URL hash

Given the user presses `?` or navigates to `/review#keyboard-help`,
When the URL hash matches `#keyboard-help`,
Then the help overlay MUST become visible via `#keyboard-help:target { display: block }`,
And the overlay MUST remain fully functional with JavaScript disabled as a progressive enhancement baseline.

### Requirement: Review surface meets WCAG 2.1 AA

The review surface SHALL be operable by keyboard alone, perceivable by screen readers, and remain fully functional under high-contrast and reduced-motion modes.

#### Scenario: Every resolution is announced to screen readers

Given the user resolves an item via any method,
When the mutation succeeds,
Then an `aria-live="polite"` region MUST announce the action taken in the form "Accepted. N of M remaining.",
And the next item's heading MUST receive focus programmatically so screen reader users do not lose their place.

#### Scenario: Motion is disabled under prefers-reduced-motion

Given the user's system is set to `prefers-reduced-motion: reduce`,
When any resolution animation would run,
Then all `transition-duration` values MUST be `0ms`,
And the interaction MUST remain fully functional.

#### Scenario: All actions have keyboard equivalents

Given the user loads `/review` on a desktop with a keyboard only,
When the user wants to accept, reject, edit, or skip the current item,
Then keyboard shortcuts `a`, `r`, `e`, and `s` MUST each trigger the corresponding action,
And `j` and `k` MUST navigate the queue (next / previous),
And `?` MUST toggle the keyboard help overlay.

### Requirement: Review surface typography follows iA Writer principles

The surface SHALL use the system font stack, editorial type hierarchy, and zero decorative chrome — no gradient text, no left-border accent stripes, no glass cards, no rounded drop shadows.

#### Scenario: Proposed value is highlighted without a side-stripe

Given the proposed title or description is rendered,
When the proposed value block styles are applied,
Then the block MUST use a 4% accent-hue background fill over its full bounds,
And MUST NOT use `border-left` or `border-right` greater than 1px regardless of color or opacity.

#### Scenario: No fonts outside the system stack

Given the review surface renders on any platform,
When fonts are applied,
Then all text MUST resolve via the `font-family: system-ui, ...` stack defined in `.impeccable.md`,
And no webfonts MAY be loaded for the review surface.

#### Scenario: Empty state is silent, not celebratory

Given the review queue has zero unresolved items,
When the empty state renders,
Then the page MUST show the 64px diamond icon, a single line "All caught up. N cards improved this week.", and a muted text link back to `/`,
And MUST NOT include illustrations, confetti, or "great job!" copy.
