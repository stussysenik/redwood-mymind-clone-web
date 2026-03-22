/**
 * MyMind Clone - Tag Display Component
 *
 * Consistent tag/hashtag display with colored dots.
 * Used across all card types for visual consistency.
 *
 * @fileoverview Reusable tag display with colored indicators
 */

// Color palette for tags - cycles through these colors
const TAG_COLORS = [
  '#10B981', // emerald/teal
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#F97316', // orange
  '#EC4899', // pink
  '#14B8A6', // cyan
  '#EAB308', // yellow
  '#EF4444', // red
];

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
      {displayTags.map((tag, index) => (
        <span
          key={tag}
          data-testid="tag-item"
          className="flex items-center gap-1 text-sm sm:text-xs text-[var(--foreground-muted)]"
        >
          <span
            className="w-2 h-2 sm:w-1.5 sm:h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: TAG_COLORS[index % TAG_COLORS.length] }}
          />
          {tag}
        </span>
      ))}
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
