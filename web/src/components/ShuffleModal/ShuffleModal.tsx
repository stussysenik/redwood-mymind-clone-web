/**
 * ShuffleModal — Random card discovery mode.
 *
 * Pick 1–25 random cards from your library and swipe through
 * them one by one in a focused full-screen overlay.
 *
 * Animation keyframes:
 *   backdropIn      — backdrop fades in
 *   modalSlideIn    — modal springs up from below
 *   fadeSlideIn     — sections cascade in with stagger
 *   diceRoll        — header icon bounces on open
 *   countPop        — number display pops when value changes
 *   cardEnterRight  — card enters from right on next()
 *   cardEnterLeft   — card enters from left on prev()
 *   breathe         — loading icon pulse
 *   progressGlow    — progress bar leading-edge glow
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'

import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Dices,
  Shuffle,
  X,
} from 'lucide-react'

import { useQuery } from '@redwoodjs/web'

import { CardDetailModal } from 'src/components/CardDetailModal/CardDetailModal'
import { haptic } from 'src/lib/haptics'
import {
  type FeedCardRecord,
  FeedCardVisual,
  toFeedCard,
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
  const [cardDirection, setCardDirection] = useState<'right' | 'left'>('right')
  const [selectedCard, setSelectedCard] = useState<FeedCardRecord | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => new Set())

  const { data, loading, refetch } = useQuery(RANDOM_CARDS_QUERY, {
    variables: { limit: confirmedCount ?? 10 },
    skip: confirmedCount === null,
  })

  const rawCards: FeedCardRecord[] = data?.randomCards ?? []
  const cards = useMemo(
    () => rawCards.filter((c) => !archivedIds.has(c.id)),
    [rawCards, archivedIds]
  )

  // Pixel-perfect slider fill:
  // Browser places thumb center at: thumbRadius + fraction × (trackWidth − thumbDiameter)
  // As CSS:  calc(14px + fraction × (100% − 28px))
  const sliderFraction = ((count - 1) / 24).toFixed(5)
  const sliderFill = `calc(14px + ${sliderFraction} * (100% - 28px))`

  const handleCountChange = (newCount: number) => {
    if (newCount !== count) {
      haptic('selection')
      setCount(newCount)
    }
  }

  const handleStart = () => {
    haptic('heavy')
    setIsLaunching(true)
    setTimeout(() => {
      setIndex(0)
      setCardDirection('right')
      setConfirmedCount(count)
      setIsLaunching(false)
    }, 280)
  }

  const handleReshuffle = () => {
    haptic('medium')
    setIndex(0)
    setCardDirection('right')
    setArchivedIds(new Set())
    refetch({ limit: confirmedCount ?? count })
  }

  // Session-only hide: the archive button in shuffle mode doesn't touch
  // the DB. It just removes the card from the current draw so you can
  // skip past it — cards re-appear on the next shuffle or reshuffle.
  const handleArchive = useCallback((cardId: string) => {
    haptic('medium')
    setArchivedIds((prev) => {
      if (prev.has(cardId)) return prev
      const next = new Set(prev)
      next.add(cardId)
      return next
    })
  }, [])

  // Clamp index to a valid position in the (possibly shrinking) cards array.
  // Using a derived safeIndex avoids an off-by-one render crash between the
  // archive mutation and the clamp effect below.
  const safeIndex = cards.length === 0 ? 0 : Math.min(index, cards.length - 1)
  const currentCard = cards[safeIndex]

  const prev = useCallback(() => {
    if (safeIndex > 0) {
      haptic('light')
      setCardDirection('left')
      setIndex(safeIndex - 1)
    }
  }, [safeIndex])

  const next = useCallback(() => {
    if (safeIndex < cards.length - 1) {
      haptic('light')
      setCardDirection('right')
      setIndex(safeIndex + 1)
    }
  }, [safeIndex, cards.length])

  useEffect(() => {
    if (cards.length === 0) return
    if (index > cards.length - 1) {
      setIndex(cards.length - 1)
    }
  }, [cards.length, index])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (confirmedCount !== null) {
        if (e.key === 'ArrowLeft') prev()
        if (e.key === 'ArrowRight') next()
        if ((e.key === 'e' || e.key === 'E') && currentCard) {
          handleArchive(currentCard.id)
        }
      }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [confirmedCount, prev, next, onClose, currentCard, handleArchive])

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden">

      {/* Backdrop */}
      <div
        className="fixed inset-0"
        style={{
          backgroundColor: 'rgba(0,0,0,0.48)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          animation: 'shuffleBackdropIn 350ms ease forwards',
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-10 flex h-full w-full max-w-4xl flex-col overflow-hidden shadow-2xl sm:h-[85vh] sm:max-h-[800px] sm:w-[90vw] sm:rounded-3xl"
        style={{
          backgroundColor: 'var(--surface-elevated)',
          border: '1px solid var(--border-default)',
          animation: 'shuffleModalSlideIn 520ms var(--ease-spring)',
        }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Grid overlay ──────────────────────────────────────────
            Hairline editorial grid: 3 horizontal row dividers (red)
            + 1 vertical centre axis (purple). Pointer-events: none.  */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden sm:rounded-3xl"
          style={{ zIndex: 2 }}
        >
          {[25, 50, 75].map((pct) => (
            <div
              key={pct}
              className="absolute left-0 right-0"
              style={{
                top: `${pct}%`,
                height: '1px',
                background: 'rgba(215, 52, 28, 0.07)',
              }}
            />
          ))}
          <div
            className="absolute bottom-0 top-0"
            style={{
              left: '50%',
              width: '1px',
              background: 'rgba(95, 55, 185, 0.08)',
            }}
          />
        </div>

        {/* ── Header ──────────────────────────────────────────────── */}
        <div
          className="relative flex shrink-0 items-center justify-between px-6 py-4"
          style={{ zIndex: 10, animation: 'shuffleFadeSlideIn 380ms ease' }}
        >
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{
                backgroundColor: 'var(--accent-light)',
                animation: 'shuffleDiceRoll 620ms var(--ease-spring) 120ms both',
              }}
            >
              <Dices size={18} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <h2
              className="text-sm font-medium"
              style={{ color: 'var(--foreground-muted)' }}
            >
              Shuffle mode
            </h2>
            {confirmedCount !== null && cards.length > 0 && (
              <div
                className="ml-2 flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
                style={{
                  backgroundColor: 'var(--surface-soft)',
                  color: 'var(--foreground)',
                  animation: 'shuffleCountPop 280ms var(--ease-spring)',
                }}
                key={`${safeIndex + 1}-${cards.length}`}
              >
                {safeIndex + 1} / {cards.length}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shuffle-close-btn flex h-10 w-10 items-center justify-center rounded-full"
            style={{ color: 'var(--foreground-muted)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Content ─────────────────────────────────────────────── */}
        <div className="relative flex flex-1 flex-col overflow-hidden" style={{ zIndex: 10 }}>

          {confirmedCount === null ? (

            /* ── Setup screen ─────────────────────────────────────── */
            <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-10">

              {/* Title */}
              <div
                className="text-center"
                style={{ animation: 'shuffleFadeSlideIn 420ms 60ms ease both' }}
              >
                <h2
                  className="font-display text-3xl"
                  style={{ color: 'var(--foreground)', letterSpacing: '-0.03em' }}
                >
                  How many cards?
                </h2>
                <p className="mt-2 text-sm" style={{ color: 'var(--foreground-muted)' }}>
                  We'll pick them at random from your library.
                </p>
              </div>

              {/* Count number — remounts on every change to re-fire countPop */}
              <div style={{ animation: 'shuffleFadeSlideIn 420ms 140ms ease both' }}>
                <div
                  key={count}
                  className="text-center font-display tabular-nums"
                  style={{
                    fontSize: '5rem',
                    lineHeight: 1,
                    color: 'var(--accent-primary)',
                    letterSpacing: '-0.05em',
                    minWidth: '5rem',
                    animation: 'shuffleCountPop 300ms var(--ease-spring)',
                  }}
                >
                  {count}
                </div>
              </div>

              {/* Slider — 384px = 3 × 128px grid cell */}
              <div
                className="w-full max-w-sm"
                style={{ animation: 'shuffleFadeSlideIn 420ms 220ms ease both' }}
              >
                <div className="relative py-3">
                  <input
                    type="range"
                    min="1"
                    max="25"
                    aria-label="Number of cards to shuffle"
                    className="shuffle-slider w-full"
                    value={count}
                    onChange={(e) => handleCountChange(parseInt(e.target.value))}
                    onPointerDown={() => haptic('medium')}
                    onPointerUp={() => haptic('rigid')}
                    style={{ '--slider-fill': sliderFill } as React.CSSProperties}
                  />
                </div>
                {/*
                 * Label inset = thumbRadius (14px) so "1" and "25" sit directly
                 * under the thumb centre at each endpoint — matches the CSS formula
                 * calc(14px + fraction × (100% − 28px)).
                 */}
                <div
                  className="mt-0.5 flex justify-between text-xs font-semibold tracking-wide"
                  style={{ color: 'var(--foreground-muted)', paddingLeft: '14px', paddingRight: '14px' }}
                >
                  <span>1</span>
                  <span>25</span>
                </div>
              </div>

              {/* Preset chips — same 384px width, spread across full span */}
              <div
                className="flex w-full max-w-sm justify-between"
                style={{ animation: 'shuffleFadeSlideIn 420ms 300ms ease both' }}
              >
                {[5, 10, 15, 20, 25].map((val) => {
                  const active = count === val
                  return (
                    <button
                      key={val}
                      onClick={() => { haptic('soft'); handleCountChange(val) }}
                      className="shuffle-preset-btn flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold tabular-nums"
                      style={{
                        backgroundColor: active ? 'var(--accent-primary)' : 'var(--surface-soft)',
                        color: active ? 'white' : 'var(--foreground-muted)',
                        transform: active ? 'scale(1.12)' : 'scale(1)',
                        boxShadow: active ? '0 4px 18px rgba(255, 107, 74, 0.38)' : 'none',
                        transition:
                          'background-color 240ms ease, color 240ms ease, ' +
                          'transform 380ms var(--ease-spring), box-shadow 240ms ease',
                      }}
                    >
                      {val}
                    </button>
                  )
                })}
              </div>

              {/* CTA — w-full within 384px container so edges align with slider */}
              <button
                onClick={handleStart}
                disabled={isLaunching}
                className="shuffle-cta-btn mt-4 w-full max-w-sm rounded-full py-4 font-bold text-white"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  boxShadow: '0 8px 32px rgba(255, 107, 74, 0.38)',
                  animation: 'shuffleFadeSlideIn 420ms 390ms ease both',
                  transform: isLaunching ? 'scale(0.95)' : undefined,
                  opacity: isLaunching ? 0.85 : undefined,
                  transition: 'transform 220ms var(--ease-spring), opacity 200ms ease',
                }}
              >
                {isLaunching ? 'Drawing…' : `Draw ${count} cards`}
              </button>
            </div>

          ) : loading ? (

            /* ── Loading ──────────────────────────────────────────── */
            <div
              className="flex flex-1 flex-col items-center justify-center gap-6"
              style={{ animation: 'shuffleFadeSlideIn 300ms ease' }}
            >
              <div style={{ animation: 'shuffleBreathe 1.4s ease-in-out infinite' }}>
                <Dices size={52} style={{ color: 'var(--accent-primary)', opacity: 0.85 }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground-muted)' }}>
                Gathering memories…
              </p>
            </div>

          ) : cards.length === 0 ? (

            /* ── Empty ────────────────────────────────────────────── */
            <div
              className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
              style={{ animation: 'shuffleFadeSlideIn 300ms ease' }}
            >
              <Shuffle size={48} style={{ color: 'var(--border-default)' }} />
              <p className="text-lg font-medium" style={{ color: 'var(--foreground)' }}>
                No cards found
              </p>
              <button
                onClick={() => setConfirmedCount(null)}
                className="text-sm font-medium underline underline-offset-4"
                style={{ color: 'var(--accent-primary)' }}
              >
                Try a different amount
              </button>
            </div>

          ) : (

            /* ── Card display ─────────────────────────────────────── */
            <div
              className="flex flex-1 flex-col overflow-hidden px-3 pb-8 sm:px-8"
              style={{ animation: 'shuffleFadeSlideIn 300ms ease' }}
            >
              {/*
               * Card row — flex layout so nav buttons reserve their own
               * space and can never overlap the card (even on hover/active
               * scale-up). Nav buttons live at the thumb-reachable edges
               * on every viewport.
               */}
              <div className="relative flex flex-1 items-center gap-2 overflow-hidden py-4 sm:gap-4">

                {/* Nav ← */}
                <div className="flex shrink-0 items-center">
                  <button
                    onClick={prev}
                    disabled={index === 0}
                    aria-label="Previous card"
                    className="shuffle-nav-btn flex h-12 w-12 items-center justify-center rounded-full shadow-lg disabled:pointer-events-none disabled:opacity-0"
                    style={{
                      backgroundColor: 'var(--surface-elevated)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--foreground)',
                    }}
                  >
                    <ChevronLeft size={24} />
                  </button>
                </div>

                {/* Card — flex-1 centered container so card stays clear of nav columns */}
                <div className="flex h-full min-w-0 flex-1 justify-center">
                  <div
                    key={`${currentCard.id}-${index}`}
                    className="shuffle-card flex h-full w-full max-w-lg cursor-pointer flex-col overflow-hidden rounded-2xl shadow-xl"
                    onClick={() => { haptic('medium'); setSelectedCard(currentCard) }}
                    style={{
                      backgroundColor: 'var(--background)',
                      border: '1px solid var(--border-default)',
                      animation:
                        cardDirection === 'right'
                          ? 'shuffleCardEnterRight 420ms var(--ease-spring)'
                          : 'shuffleCardEnterLeft 420ms var(--ease-spring)',
                    }}
                  >
                    <div
                      className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
                      style={{ backgroundColor: 'var(--surface-soft)' }}
                    >
                      <FeedCardVisual card={currentCard} fill />
                    </div>
                    <div className="px-5 py-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <h3
                        className="line-clamp-2 text-base font-semibold"
                        style={{ color: 'var(--foreground)' }}
                      >
                        {currentCard.title || 'Untitled Card'}
                      </h3>
                      <div className="mt-2 flex items-center justify-between">
                        <span
                          className="text-xs"
                          style={{ color: 'var(--foreground-muted)' }}
                        >
                          {new Date(parseInt(currentCard.createdAt)).toLocaleDateString()}
                        </span>
                        <div
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: 'var(--accent-primary)' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Nav → */}
                <div className="flex shrink-0 items-center">
                  <button
                    onClick={next}
                    disabled={safeIndex >= cards.length - 1}
                    aria-label="Next card"
                    className="shuffle-nav-btn flex h-12 w-12 items-center justify-center rounded-full shadow-lg disabled:pointer-events-none disabled:opacity-0"
                    style={{
                      backgroundColor: 'var(--surface-elevated)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--foreground)',
                    }}
                  >
                    <ChevronRight size={24} />
                  </button>
                </div>
              </div>

              {/* Progress + controls */}
              <div className="mt-6 shrink-0 space-y-4">

                {/*
                 * Discrete progress segments — one notch per card in the
                 * current shuffle set, so you can read it as 7/15 at a
                 * glance. Current is glowing, past is filled, future is soft.
                 */}
                <div
                  className="flex h-1.5 w-full items-stretch gap-1"
                  role="progressbar"
                  aria-valuenow={safeIndex + 1}
                  aria-valuemin={1}
                  aria-valuemax={cards.length}
                  aria-label={`Card ${safeIndex + 1} of ${cards.length}`}
                >
                  {cards.map((card, i) => {
                    const passed = i <= safeIndex
                    const current = i === safeIndex
                    return (
                      <div
                        key={card.id}
                        className="h-full flex-1 rounded-full"
                        style={{
                          backgroundColor: passed
                            ? 'var(--accent-primary)'
                            : 'var(--surface-soft)',
                          boxShadow: current
                            ? '0 0 10px rgba(255, 107, 74, 0.55)'
                            : 'none',
                          transition:
                            'background-color 280ms ease, box-shadow 280ms ease',
                        }}
                      />
                    )
                  })}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleReshuffle}
                      className="shuffle-reshuffle-btn flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold"
                      style={{ color: 'var(--foreground-muted)' }}
                    >
                      <Shuffle size={14} />
                      Reshuffle
                    </button>
                    <button
                      onClick={() =>
                        currentCard && handleArchive(currentCard.id)
                      }
                      disabled={!currentCard}
                      title="Hide card from this shuffle (E)"
                      aria-label="Hide card from this shuffle"
                      className="shuffle-archive-btn flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold disabled:opacity-40"
                      style={{ color: 'var(--foreground-muted)' }}
                    >
                      <Archive size={14} />
                      Archive
                    </button>
                  </div>

                  <button
                    onClick={() => setConfirmedCount(null)}
                    className="text-xs font-bold transition-all hover:opacity-60 active:scale-95"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    Change amount
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedCard && (
        <CardDetailModal
          isOpen={true}
          onClose={() => setSelectedCard(null)}
          card={toFeedCard(selectedCard)}
          onArchive={handleArchive}
        />
      )}

      <style dangerouslySetInnerHTML={{ __html: `

        /* ── Entry animations ─────────────────────────────────────── */

        @keyframes shuffleBackdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* Modal springs up: starts 48px below, 94% scale */
        @keyframes shuffleModalSlideIn {
          from { opacity: 0; transform: translateY(48px) scale(0.94); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }

        /* Generic staggered section entrance */
        @keyframes shuffleFadeSlideIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Header Dices icon rolls in with slight overshoot */
        @keyframes shuffleDiceRoll {
          0%   { opacity: 0; transform: rotate(-20deg) scale(0.6); }
          55%  { opacity: 1; transform: rotate(10deg)  scale(1.15); }
          80%  { transform: rotate(-4deg) scale(0.97); }
          100% { opacity: 1; transform: rotate(0deg)   scale(1); }
        }

        /* Count number pops when value changes */
        @keyframes shuffleCountPop {
          0%   { opacity: 0; transform: scale(0.68); }
          55%  { opacity: 1; transform: scale(1.12); }
          100% { opacity: 1; transform: scale(1); }
        }

        /* Card enters from right (next) */
        @keyframes shuffleCardEnterRight {
          from { opacity: 0; transform: translateX(52px) scale(0.93); }
          to   { opacity: 1; transform: translateX(0)    scale(1); }
        }

        /* Card enters from left (prev) */
        @keyframes shuffleCardEnterLeft {
          from { opacity: 0; transform: translateX(-52px) scale(0.93); }
          to   { opacity: 1; transform: translateX(0)     scale(1); }
        }

        /* Loading icon breathes */
        @keyframes shuffleBreathe {
          0%, 100% { transform: scale(1);    opacity: 0.80; }
          50%       { transform: scale(1.14); opacity: 1; }
        }

        /* ── Interactive states ───────────────────────────────────── */

        .shuffle-close-btn {
          transition: background-color 180ms ease, transform 200ms var(--ease-spring);
        }
        .shuffle-close-btn:hover {
          background-color: var(--surface-soft);
          transform: scale(1.1);
        }
        .shuffle-close-btn:active {
          transform: scale(0.88);
        }

        .shuffle-cta-btn {
          transition:
            transform 260ms var(--ease-spring),
            box-shadow 220ms ease,
            opacity    200ms ease;
        }
        .shuffle-cta-btn:not(:disabled):hover {
          transform: translateY(-4px) scale(1.02);
          box-shadow: 0 16px 48px rgba(255, 107, 74, 0.48);
        }
        .shuffle-cta-btn:not(:disabled):active {
          transform: scale(0.95);
          box-shadow: 0 4px 12px rgba(255, 107, 74, 0.30);
        }

        .shuffle-preset-btn:hover {
          opacity: 0.85;
        }
        .shuffle-preset-btn:active {
          transform: scale(0.90) !important;
          transition-duration: 120ms !important;
        }

        .shuffle-nav-btn {
          transition: transform 200ms var(--ease-spring), box-shadow 200ms ease, opacity 200ms ease;
        }
        .shuffle-nav-btn:hover {
          transform: scale(1.12);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }
        .shuffle-nav-btn:active {
          transform: scale(0.90);
        }

        .shuffle-card {
          transition: box-shadow 240ms ease, transform 240ms var(--ease-spring);
        }
        .shuffle-card:hover {
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.14);
          transform: scale(1.015) translateY(-2px);
        }
        .shuffle-card:active {
          transform: scale(0.984);
        }

        .shuffle-reshuffle-btn {
          transition: background-color 180ms ease, transform 200ms var(--ease-spring), opacity 180ms ease;
        }
        .shuffle-reshuffle-btn:hover {
          background-color: var(--surface-soft);
          transform: scale(1.04);
        }
        .shuffle-reshuffle-btn:active {
          transform: scale(0.94);
        }

        .shuffle-archive-btn {
          transition: background-color 180ms ease, color 180ms ease, transform 200ms var(--ease-spring), opacity 180ms ease;
        }
        .shuffle-archive-btn:not(:disabled):hover {
          background-color: var(--surface-soft);
          color: var(--foreground);
          transform: scale(1.04);
        }
        .shuffle-archive-btn:not(:disabled):active {
          transform: scale(0.94);
        }

        /* ── Shuffle Slider ───────────────────────────────────────── */

        .shuffle-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 8px;
          border-radius: 9999px;
          /*
           * Fill uses the pixel-accurate formula so the gradient edge lines
           * up exactly with the browser-rendered thumb centre:
           *   calc(thumbRadius + fraction × (trackWidth − thumbDiameter))
           * expressed in CSS as: calc(14px + fraction × (100% − 28px))
           */
          background: linear-gradient(
            to right,
            var(--accent-primary) var(--slider-fill, calc(14px + 0.375 * (100% - 28px))),
            rgba(0, 0, 0, 0.08) var(--slider-fill, calc(14px + 0.375 * (100% - 28px)))
          );
          outline: none;
          cursor: grab;
        }
        .shuffle-slider:active {
          cursor: grabbing;
        }

        /* WebKit thumb */
        .shuffle-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--accent-primary);
          border: 3px solid white;
          box-shadow:
            0 2px 10px rgba(255, 107, 74, 0.42),
            0 0 0 2px rgba(255, 107, 74, 0.12);
          cursor: grab;
          transition:
            transform  220ms cubic-bezier(0.34, 1.56, 0.64, 1),
            box-shadow 200ms ease;
        }
        .shuffle-slider:hover::-webkit-slider-thumb {
          box-shadow:
            0 4px 16px rgba(255, 107, 74, 0.52),
            0 0 0 5px rgba(255, 107, 74, 0.14);
        }
        .shuffle-slider:active::-webkit-slider-thumb {
          transform: scale(1.28);
          box-shadow:
            0 6px 24px rgba(255, 107, 74, 0.58),
            0 0 0 7px rgba(255, 107, 74, 0.14);
          cursor: grabbing;
        }
        .shuffle-slider::-webkit-slider-runnable-track {
          height: 8px;
          border-radius: 9999px;
        }

        /* Firefox thumb */
        .shuffle-slider::-moz-range-thumb {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--accent-primary);
          border: 3px solid white;
          box-shadow: 0 2px 10px rgba(255, 107, 74, 0.42);
          cursor: grab;
          transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .shuffle-slider:active::-moz-range-thumb {
          transform: scale(1.28);
        }
        .shuffle-slider::-moz-range-progress {
          background: var(--accent-primary);
          height: 8px;
          border-radius: 9999px;
        }
        .shuffle-slider::-moz-range-track {
          background: rgba(0, 0, 0, 0.08);
          height: 8px;
          border-radius: 9999px;
        }

      `}} />
    </div>
  )
}
