# BYOA Vision

**Build Your Own Algorithm** — a visual knowledge engine that feels native.

---

## Why BYOA Exists

The tools we use to save and organize inspiration should be as beautiful and tactile as the content itself. Bookmarking apps treat links as throwaway text. Social platforms bury what you saved under algorithmic noise. Your browser has 200 tabs open because nothing feels like a home for the things you find.

BYOA is not a bookmarking tool. It's a visual research platform where every interaction feels deliberate, every surface is alive, and the algorithm is yours — not a black box deciding what you see, but a knowledge graph you built by saving the things that matter to you.

---

## Design Pillars

### 1. Asset-First

Images, colors, and visual fidelity come first. Cards preserve original aspect ratios. Thumbnails load at every layer. No broken images — a 6-tier fallback chain ensures every card has a visual. Dominant colors are extracted and stored. The feed feels like a mood board, not a spreadsheet.

### 2. Native Feel

Haptic feedback on every interaction. Shake to shuffle. Swipe to navigate. 44px touch targets. Bottom navigation with a floating action button. The web app should feel indistinguishable from a native iOS app. No "web app jank" — every state transition is deliberate.

### 3. Connected Knowledge

Cards aren't isolated — they form a living graph through shared tags. The force-directed graph view reveals hidden patterns you didn't know existed. The list view makes connections browsable. Serendipity isn't random — it's powered by the topology of your own interests.

### 4. Speed as a Feature

Viewport culling. Level of Detail rendering. Web Workers for physics simulation. Optimistic mutations for instant feedback. The graph handles 1000+ nodes without jank. Every interaction responds in under 100ms. Speed isn't a metric — it's the soul of the product.

### 5. Zero Noise

No error banners. No loading skeletons that flash and disappear. No "enrichment failed" toasts. Silent re-extraction when images break. The infrastructure is completely invisible — users only see their content. If something fails, the system handles it gracefully in the background.

### 6. Your Algorithm

There is no recommendation engine deciding what you see. Your feed is everything you saved, organized by you. Spaces are your rules. The graph is your connections. Search finds what you meant, not what an ad model thinks you want. You are the algorithm.

---

## Target User

Creative professionals, visual researchers, and digital collectors who:

- Think in images, textures, and vibes — not folders and tags
- Save 50+ things a week from across the internet
- Need to rediscover content months later and find unexpected connections
- Care about how their tools look and feel as much as what they do
- Are frustrated by bookmarking tools that strip the visual context from links
- Want a personal knowledge base that grows more useful over time

---

## What BYOA Is Not

- **Not a link manager.** Raindrop, Pocket, and browser bookmarks manage URLs. BYOA is a visual corpus.
- **Not a note-taking app.** Notion, Obsidian, and Roam are text-first. BYOA is image-first.
- **Not a social platform.** Pinterest and Are.na are communities. BYOA is your private creative archive (collaboration comes later).
- **Not a read-later service.** BYOA doesn't care if you read it. It cares that you can find it, see it, and connect it to everything else you've saved.

---

## North Star Metrics

| Metric | Target | Why |
|---|---|---|
| Time to first card | < 3 seconds | Save should feel instant |
| Graph FPS at 500 nodes | > 30 | Knowledge graph must be smooth |
| Image coverage | > 95% of cards | Visual platform = every card needs a visual |
| Mobile Lighthouse Performance | > 90 | Native feel requires native-tier performance |
| Cards saved per active user/week | 10+ | The product is only valuable when used regularly |
| Re-discovery rate | 20%+ cards viewed again within 30 days | If users never revisit, the graph is dead weight |

---

## Design Principles in Practice

### Save anything, beautify everything
A raw URL becomes a rich card with images, metadata, colors, and AI-generated tags in seconds. The user pastes; the system does the rest.

### Show, don't tell
Cards display images at their natural aspect ratios. Platform-specific renderers (Twitter, YouTube, Instagram, Letterboxd) show content the way it was designed to be seen.

### Forgive mistakes
Archive isn't delete. Trash isn't permanent. Everything is recoverable. Re-extraction heals broken images silently. The system assumes good intent and protects against accidents.

### Reward exploration
The knowledge graph isn't a feature — it's a destination. Shake-to-shuffle surfaces forgotten content. Semantic search finds things by meaning. The more you save, the more interesting the connections become.

### Respect the craft
9 theme skins. 3 typography pairings. 8 accent colors. BYOA itself should be a beautiful object. If the tool doesn't inspire you to use it, it fails at its core mission.
