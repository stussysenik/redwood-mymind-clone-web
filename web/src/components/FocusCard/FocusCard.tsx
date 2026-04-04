/**
 * BYOA - FocusCard Component
 *
 * Large, centered card for focused exploration in Serendipity mode.
 * Displays a single card prominently with animated transitions.
 *
 * @fileoverview Focused single card display for Serendipity
 */

import {
  Globe,
  Play,
  StickyNote,
  FileText,
  ShoppingBag,
  BookOpen,
  Volume2,
  Film,
  Users,
} from 'lucide-react'
import type { Card } from 'src/lib/types'
import {
  getBrowserImageUrl,
  getFallbackScreenshotUrl,
} from 'src/lib/imageProxy'
import { extractDomain, isVideoUrl } from 'src/lib/platforms'
import { decodeHtmlEntities } from 'src/lib/text-utils'

// =============================================================================
// TYPES
// =============================================================================

interface FocusCardProps {
  card: Card
  onOpenDetail: () => void
  isAnimating?: boolean
  direction?: 'left' | 'right'
}

// =============================================================================
// TYPE ICONS
// =============================================================================

const TYPE_ICONS = {
  article: FileText,
  image: Globe,
  note: StickyNote,
  product: ShoppingBag,
  book: BookOpen,
  video: Play,
  audio: Volume2,
  social: Users, // Social media (Twitter, Instagram, Reddit, etc.)
  movie: Film, // Movies (IMDB, Letterboxd)
  website: Globe,
} as const

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Large focused card display for Serendipity exploration mode.
 */
export function FocusCard({
  card,
  onOpenDetail,
  isAnimating = false,
  direction = 'right',
}: FocusCardProps) {
  const domain = extractDomain(card.url)
  const TypeIcon = TYPE_ICONS[card.type] || Globe
  const isVideo = card.url ? isVideoUrl(card.url) : false
  const browserImageUrl = getBrowserImageUrl(card.imageUrl)
  const screenshotUrl = getFallbackScreenshotUrl(card.url)

  // Generate gradient for cards without images
  const getGradient = (str: string) => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue1 = Math.abs(hash % 360)
    const hue2 = (hue1 + 40) % 360
    return `linear-gradient(135deg, hsl(${hue1}, 70%, 90%), hsl(${hue2}, 70%, 95%))`
  }

  // Animation classes based on direction
  const animationClass = isAnimating
    ? direction === 'right'
      ? 'animate-slide-in-right'
      : 'animate-slide-in-left'
    : 'animate-in fade-in zoom-in-95 duration-500'

  return (
    <div
      className={`group relative mx-auto max-w-3xl cursor-pointer ${animationClass}`}
      onClick={onOpenDetail}
    >
      {/* Large Image Container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-xl)] bg-[var(--surface-secondary)] shadow-[var(--shadow-xl)]">
        {browserImageUrl ? (
          <>
            {/* Blurred backdrop */}
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={browserImageUrl}
                alt=""
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl"
              />
            </div>
            {/* Main image */}
            <img
              src={browserImageUrl}
              alt={card.title || 'Card image'}
              className="absolute relative inset-0 z-10 h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
            />
          </>
        ) : screenshotUrl ? (
          // Screenshot fallback for URLs (skip social platforms that block screenshots)
          <img
            src={screenshotUrl}
            alt="Site Preview"
            className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          // Gradient placeholder
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: getGradient(card.title || card.type) }}
          >
            <TypeIcon className="h-24 w-24 text-gray-400/50" />
          </div>
        )}

        {/* Video play button overlay */}
        {isVideo && (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/90 shadow-xl backdrop-blur-sm transition-transform group-hover:scale-110">
              <Play
                className="ml-1 h-8 w-8 text-gray-800"
                fill="currentColor"
              />
            </div>
          </div>
        )}

        {/* Domain badge */}
        {domain && (
          <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">
            <Globe className="h-4 w-4 text-white/80" />
            <span className="text-sm font-medium text-white">{domain}</span>
          </div>
        )}

        {/* Color palette */}
        {card.metadata?.colors && card.metadata.colors.length > 0 && (
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5">
            {card.metadata.colors
              .slice(0, 5)
              .map((color: string, i: number) => (
                <div
                  key={i}
                  className="h-6 w-6 rounded-full border-2 border-white/70 shadow-lg"
                  style={{ backgroundColor: color }}
                />
              ))}
          </div>
        )}
      </div>

      {/* Card Info */}
      <div className="mt-6 px-4 text-center">
        <h2 className="font-serif text-2xl font-bold leading-tight text-gray-900 md:text-3xl">
          {decodeHtmlEntities(card.title || 'Untitled')}
        </h2>

        {card.metadata?.summary && (
          <p className="mx-auto mt-3 line-clamp-2 max-w-xl leading-relaxed text-gray-600">
            {decodeHtmlEntities(card.metadata.summary)}
          </p>
        )}

        {/* Tags */}
        {card.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {card.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Click hint */}
        <div className="mt-6 text-sm text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
          Click or press Space to view details
        </div>
      </div>
    </div>
  )
}

export default FocusCard
