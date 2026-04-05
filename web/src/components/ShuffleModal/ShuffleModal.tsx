/**
 * ShuffleModal — Random card discovery mode.
 *
 * Pick 1–25 random cards from your library and swipe through
 * them one by one in a focused full-screen overlay.
 */

import { useState, useEffect, useCallback, useRef } from 'react'

import { ChevronLeft, ChevronRight, Dices, Shuffle, X } from 'lucide-react'

import { useQuery } from '@redwoodjs/web'

import { CardDetailModal } from 'src/components/CardDetailModal/CardDetailModal'
import { haptic } from 'src/lib/haptics'
import {
  type FeedCardRecord,
  toFeedCard,
  FeedCardVisual,
  FeedCardTags,
} from 'src/components/FeedCellShared/FeedCellShared'

const RANDOM_CARDS_QUERY = gql`
  query ShuffleRandomCards($limit: Int) {
    randomCards(limit: $limit) {
      id
      userId
      type
      title
      content
      url
      imageUrl
      metadata
      tags
      createdAt
      updatedAt
      archivedAt
      deletedAt
    }
  }
`

interface ShuffleModalProps {
  onClose: () => void
}

export function ShuffleModal({ onClose }: ShuffleModalProps) {
  const [count, setCount] = useState(10)
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null)
  const [index, setIndex] = useState(0)
  const [selectedCard, setSelectedCard] = useState<FeedCardRecord | null>(null)

  const { data, loading, refetch } = useQuery(RANDOM_CARDS_QUERY, {
    variables: { limit: confirmedCount ?? 10 },
    skip: confirmedCount === null,
  })

  const cards: FeedCardRecord[] = data?.randomCards ?? []
  const lastSliderHaptic = useRef(0)

  const handleStart = () => {
    setIndex(0)
    setConfirmedCount(count)
  }

  const handleReshuffle = () => {
    setIndex(0)
    refetch({ limit: confirmedCount ?? count })
  }

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const next = useCallback(
    () => setIndex((i) => Math.min(cards.length - 1, i + 1)),
    [cards.length]
  )

  // Keyboard navigation
  useEffect(() => {
    if (confirmedCount === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [confirmedCount, prev, next, onClose])

  const currentCard = cards[index]
  const domainLabel = currentCard?.url
    ? (() => {
        try {
          return new URL(currentCard.url).hostname.replace(/^www\./, '')
        } catch {
          return null
        }
      })()
    : null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-md"
        style={{ animation: 'fadeIn 200ms ease' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed inset-x-2 inset-y-3 z-[70] mx-auto flex flex-col overflow-hidden rounded-2xl shadow-2xl sm:inset-x-8 sm:inset-y-10"
        style={{
          maxWidth: 680,
          left: '50%',
          transform: 'translateX(-50%)',
          right: 'auto',
          backgroundColor: 'var(--surface-elevated)',
          border: '1px solid var(--border-default)',
          animation: 'scaleIn 200ms var(--ease-snappy)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2.5">
            <Dices size={18} style={{ color: 'var(--accent-primary)' }} />
            <span
              className="text-sm font-semibold tracking-tight"
              style={{ color: 'var(--foreground)' }}
            >
              Shuffle
            </span>
            {confirmedCount !== null && cards.length > 0 && (
              <span
                className="tabular-nums text-sm font-semibold sm:text-base"
                style={{ color: 'var(--foreground)' }}
              >
                {index + 1}
                <span style={{ color: 'var(--foreground-muted)', margin: '0 2px' }}>/</span>
                {cards.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {confirmedCount !== null && (
              <button
                onClick={() => { haptic('medium'); handleReshuffle() }}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--surface-soft)',
                  color: 'var(--foreground-muted)',
                }}
                title="Draw new random cards"
              >
                <Shuffle size={12} />
                Reshuffle
              </button>
            )}
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
              style={{ color: 'var(--foreground-muted)' }}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        {confirmedCount === null ? (
          // — Picker screen —
          <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-10">
            <div className="text-center">
              <h2
                className="font-display text-3xl"
                style={{ color: 'var(--foreground)', letterSpacing: '-0.03em' }}
              >
                How many cards?
              </h2>
              <p
                className="mt-2 text-sm"
                style={{ color: 'var(--foreground-muted)' }}
              >
                We'll pick them at random from your library.
              </p>
            </div>

            {/* Number display */}
            <div
              className="text-center font-display tabular-nums"
              style={{
                fontSize: '5rem',
                lineHeight: 1,
                color: 'var(--accent-primary)',
                letterSpacing: '-0.05em',
                minWidth: '5rem',
              }}
            >
              {count}
            </div>

            {/* Slider */}
            <div className="w-full max-w-xs">
              <input
                type="range"
                min={1}
                max={25}
                value={count}
                onChange={(e) => {
                  setCount(Number(e.target.value))
                  const now = Date.now()
                  if (now - lastSliderHaptic.current > 80) {
                    haptic('selection')
                    lastSliderHaptic.current = now
                  }
                }}
                className="w-full"
                style={{ accentColor: 'var(--accent-primary)' }}
              />
              <div
                className="mt-1 flex justify-between text-[11px]"
                style={{ color: 'var(--foreground-muted)' }}
              >
                <span>1</span>
                <span>25</span>
              </div>
            </div>

            {/* Quick picks */}
            <div className="flex flex-wrap justify-center gap-2">
              {[5, 10, 15, 20, 25].map((n) => (
                <button
                  key={n}
                  onClick={() => { haptic('selection'); setCount(n) }}
                  className="rounded-full px-3 py-1 text-sm font-medium transition-all"
                  style={{
                    backgroundColor:
                      count === n
                        ? 'var(--accent-primary)'
                        : 'var(--surface-soft)',
                    color: count === n ? 'white' : 'var(--foreground-muted)',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>

            <button
              onClick={() => { haptic('medium'); handleStart() }}
              className="rounded-full px-8 py-3 font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              Draw {count} card{count !== 1 ? 's' : ''}
            </button>
          </div>
        ) : loading ? (
          // — Loading state —
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <Dices
              size={36}
              style={{ color: 'var(--accent-primary)', animation: 'spin 1s linear infinite' }}
            />
            <p
              className="text-sm"
              style={{ color: 'var(--foreground-muted)' }}
            >
              Shuffling your library…
            </p>
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
              No cards found.
            </p>
          </div>
        ) : (
          // — Card browser —
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Card display area */}
            <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
              {currentCard && (
                <div
                  key={currentCard.id}
                  style={{ animation: 'fadeSlideIn 180ms var(--ease-snappy)' }}
                >
                  {/* Image */}
                  {(currentCard.imageUrl ||
                    currentCard.url ||
                    (currentCard.metadata as Record<string, unknown>)?.screenshotUrl) && (
                    <div
                      className="mb-4 overflow-hidden rounded-xl cursor-pointer"
                      style={{ maxHeight: 260 }}
                      onClick={() => setSelectedCard(currentCard)}
                    >
                      <FeedCardVisual
                        card={currentCard}
                        variant="stacked"
                        showBadges={false}
                        showProcessingIndicator={false}
                      />
                    </div>
                  )}

                  {/* Domain */}
                  {domainLabel && (
                    <p
                      className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em]"
                      style={{ color: 'var(--foreground-muted)' }}
                    >
                      {domainLabel}
                    </p>
                  )}

                  {/* Title */}
                  <h3
                    className="font-display cursor-pointer hover:underline"
                    style={{
                      fontSize: '1.35rem',
                      lineHeight: 1.25,
                      letterSpacing: '-0.03em',
                      color: 'var(--foreground)',
                    }}
                    onClick={() => setSelectedCard(currentCard)}
                  >
                    {currentCard.title || 'Untitled'}
                  </h3>

                  {/* Snippet */}
                  {(currentCard.content ||
                    currentCard.metadata?.summary) && (
                    <p
                      className="mt-2 text-sm leading-relaxed"
                      style={{
                        color: 'var(--foreground-muted)',
                        display: '-webkit-box',
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {(currentCard.metadata?.summary as string) ||
                        currentCard.content}
                    </p>
                  )}

                  {/* Tags */}
                  <div className="mt-3">
                    <FeedCardTags card={currentCard} maxTags={6} />
                  </div>
                </div>
              )}
            </div>

            {/* Navigation footer */}
            <div
              className="flex items-center justify-between px-3 py-3 sm:px-5"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <button
                onClick={() => { prev(); haptic('light') }}
                disabled={index === 0}
                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-all disabled:opacity-30 min-w-[44px] min-h-[44px] justify-center sm:px-4"
                style={{
                  backgroundColor: 'var(--surface-soft)',
                  color: 'var(--foreground)',
                }}
              >
                <ChevronLeft size={16} />
                <span className="hidden sm:inline">Prev</span>
              </button>

              {/* Progress bar */}
              <div
                className="relative mx-3 flex-1 cursor-pointer"
                style={{ height: 3, backgroundColor: 'var(--border-default)', borderRadius: 2 }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const fraction = (e.clientX - rect.left) / rect.width
                  const target = Math.floor(fraction * cards.length)
                  setIndex(Math.max(0, Math.min(cards.length - 1, target)))
                  haptic('light')
                }}
                role="progressbar"
                aria-valuenow={index + 1}
                aria-valuemin={1}
                aria-valuemax={cards.length}
              >
                <div
                  style={{
                    width: `${((index + 1) / cards.length) * 100}%`,
                    height: '100%',
                    backgroundColor: 'var(--accent-primary)',
                    borderRadius: 2,
                    transition: 'width 200ms ease',
                  }}
                />
              </div>

              <button
                onClick={() => { next(); haptic('light') }}
                disabled={index === cards.length - 1}
                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-all disabled:opacity-30 min-w-[44px] min-h-[44px] justify-center sm:px-4"
                style={{
                  backgroundColor: 'var(--surface-soft)',
                  color: 'var(--foreground)',
                }}
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full detail on click */}
      {selectedCard && (
        <CardDetailModal
          card={toFeedCard(selectedCard)}
          isOpen={true}
          onClose={() => setSelectedCard(null)}
          onArchive={() => setSelectedCard(null)}
        />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { opacity: 0; transform: translateX(-50%) scale(0.96) } to { opacity: 1; transform: translateX(-50%) scale(1) } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </>
  )
}

export default ShuffleModal
