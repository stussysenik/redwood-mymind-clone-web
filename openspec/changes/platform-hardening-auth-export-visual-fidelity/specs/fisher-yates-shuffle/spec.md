## Capability: fisher-yates-shuffle

True Fisher-Yates (Knuth) shuffle with per-swap visual card position animation. The algorithm IS the animation — each swap in the array maps 1:1 to a visible card swap in the grid.

## Behavior

### Algorithm
```
for i from n-1 down to 1:
    j = random integer in [0, i]
    swap array[i] and array[j]
```

Each iteration produces one swap. Each swap produces one animation frame.

### Animation Sequence
1. User clicks "Shuffle" button (existing ShuffleModal or SerendipityClient).
2. System snapshots current card positions in the grid (getBoundingClientRect for each card).
3. Fisher-Yates begins. For each swap(i, j):
   a. Highlight cards[i] and cards[j] with a subtle glow (`box-shadow` pulse).
   b. Calculate (dx, dy) between their positions.
   c. Animate card[i] to card[j]'s position and vice versa via `transform: translate(dx, dy)` using `--ease-spring` (300ms).
   d. After transition completes, update the array order and reset transforms.
4. After all swaps complete, cards are in their final shuffled order.

### Speed Control
- **Fast**: 50ms per swap (blur through it, see the motion)
- **Normal**: 150ms per swap (follow individual swaps)
- **Slow**: 300ms per swap (study the algorithm)
- Speed selector: 3 toggle pills below the shuffle button.

### Mobile-First
- Single-column layout: swaps are vertical (cards slide up/down).
- Touch: "Shuffle" button is 48px minimum touch target.
- Reduced motion: If `prefers-reduced-motion` is set, skip animation and show final order instantly.
- Cap visible swaps: For arrays > 50 cards, run the full Fisher-Yates silently, then animate only 20 randomly-sampled swaps spread across the array (not the literal last 20 iterations, which would cluster at low indices). This gives the visual impression of a full shuffle without the wait.

### Integration Points
- **ShuffleModal**: After fetching `randomCards`, apply Fisher-Yates with animation before displaying.
- **SerendipityClient**: "Reshuffle with animation" button re-shuffles the already-fetched card set client-side (no new GraphQL fetch). Existing "Shuffle" button continues to re-fetch from server for a new random set.
- **CardGridClient**: New "Shuffle" action in the grid toolbar.

## Files Changed

| File | Change |
|------|--------|
| `web/src/lib/fisherYatesShuffle.ts` | New — pure algorithm + animation orchestrator |
| `web/src/hooks/useShuffleAnimation.ts` | New — hook that manages position snapshots, swap queue, and CSS transitions |
| `web/src/components/ShuffleModal/ShuffleModal.tsx` | Integrate shuffle animation on "Shuffle" action |
| `web/src/components/CardGridClient/CardGridClient.tsx` | Add shuffle button to toolbar |
| `web/src/index.css` | Add `.shuffle-swap` transition class and glow keyframe |

## Dependencies

None. Pure CSS transitions + requestAnimationFrame. No new packages.

## Acceptance Criteria

- [ ] Fisher-Yates produces a uniformly random permutation (verified by distribution test in unit test).
- [ ] Each swap in the algorithm corresponds to exactly one visual card swap.
- [ ] Speed control works: fast (50ms), normal (150ms), slow (300ms) per swap.
- [ ] Mobile single-column: cards swap vertically with spring easing.
- [ ] `prefers-reduced-motion`: animation skipped, final order shown instantly.
- [ ] Arrays > 50 cards: only last 20 swaps animated.
- [ ] No layout shift after animation completes — cards are in their final DOM order.
