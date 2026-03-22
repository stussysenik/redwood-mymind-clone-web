/**
 * MyMind Clone - Tag Display Component
 *
 * Consistent tag/hashtag display with colored dots.
 * Used across all card types for visual consistency.
 *
 * @fileoverview Reusable tag display with colored indicators
 */

/**
 * Pastel color palette for AI-generated tags.
 *
 * Each entry pairs a soft background with a legible darker text color.
 * The palette is designed for visual traceability in a card grid: the same
 * tag name always resolves to the same color via `getTagColor()`.
 */
export const TAG_COLORS = [
  { bg: '#E8F5E9', text: '#2E7D32', dot: '#10B981' }, // green
  { bg: '#FFF3E0', text: '#E65100', dot: '#F97316' }, // orange
  { bg: '#E3F2FD', text: '#1565C0', dot: '#3B82F6' }, // blue
  { bg: '#FCE4EC', text: '#C62828', dot: '#EC4899' }, // red/pink
  { bg: '#F3E5F5', text: '#7B1FA2', dot: '#8B5CF6' }, // purple
  { bg: '#E0F7FA', text: '#00838F', dot: '#14B8A6' }, // cyan
  { bg: '#FFF8E1', text: '#F57F17', dot: '#EAB308' }, // amber
  { bg: '#EFEBE9', text: '#4E342E', dot: '#EF4444' }, // warm brown
]

/**
 * Deterministic hash-based color assignment for tags.
 *
 * Uses a simple string hash (djb2-like) so the same tag name always
 * resolves to the same color across every component in the app.
 * This is critical for visual traceability — users should be able to
 * spot "machine-learning" (always purple, say) at a glance.
 */
export function getTagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

interface TagDisplayProps {
  tags: string[];
  maxTags?: number;
  className?: string;
}

/**
 * Displays tags with colored dot indicators.
 * Consistent style: ● tag-name
 */
export function TagDisplay({ tags, maxTags = 5, className = '' }: TagDisplayProps) {
  if (!tags || tags.length === 0) return null;

  const displayTags = tags.slice(0, maxTags);

  return (
    <div data-testid="tag-display" className={`flex flex-wrap gap-x-3 gap-y-1.5 ${className}`}>
      {displayTags.map((tag) => {
        const color = getTagColor(tag)
        return (
          <span
            key={tag}
            data-testid="tag-item"
            className="flex items-center gap-1 text-sm sm:text-xs"
            style={{ color: color.text }}
          >
            <span
              className="w-2 h-2 sm:w-1.5 sm:h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color.dot }}
            />
            {tag}
          </span>
        )
      })}
    </div>
  );
}

/**
 * Shimmer placeholder shown in place of tags while a card is processing.
 *
 * WHY SHIMMER? When a card is saved, AI enrichment runs asynchronously (5–40s).
 * Without a placeholder, tags "pop in" and shift the card height — jarring in a
 * masonry grid where every pixel of height matters.
 *
 * WHY 3 PILLS? Most enriched cards receive 3–5 tags. Three pills approximate the
 * median tag count so the reserved space closely matches the final layout, keeping
 * cumulative layout shift (CLS) near zero.
 *
 * MOBILE-FIRST: Pill height is 14px (`h-3.5`) on phones for readability, shrinking
 * to 12px (`sm:h-3`) on tablet/desktop. Dot size follows the same pattern
 * (`w-2 h-2` → `sm:w-1.5 sm:h-1.5`), matching the real TagDisplay responsive
 * sizing so the transition from shimmer → tags is seamless.
 */
export function TagShimmerPlaceholder({ className = '' }: { className?: string }) {
  return (
    <div data-testid="tag-shimmer" className={`flex flex-wrap gap-x-3 gap-y-1.5 ${className}`}>
      {[56, 72, 48].map((width, i) => (
        <span
          key={i}
          className="flex items-center gap-1 animate-shimmer physics-pulse"
          style={{ animationDelay: `${i * 150}ms` }}
        >
          <span className="w-2 h-2 sm:w-1.5 sm:h-1.5 rounded-full flex-shrink-0 bg-[var(--foreground-muted)]/20" />
          <span
            className="h-3.5 sm:h-3 rounded bg-[var(--foreground-muted)]/15"
            style={{ width: `${width}px` }}
          />
        </span>
      ))}
    </div>
  );
}

export default TagDisplay;
