/**
 * MyMind Clone - CardGridClient Component (RedwoodJS)
 *
 * Client-side card grid with masonry layout, search filtering,
 * view toggle (grid/list), card size slider, pagination, and
 * platform-based filtering.
 *
 * Adapted from the Next.js version:
 * - Cards are passed as props from a parent Cell (no direct Supabase calls)
 * - Uses @redwoodjs/router instead of next/navigation
 * - Uses regular imports instead of next/dynamic
 * - API mutations replaced with TODO stubs for GraphQL
 *
 * @fileoverview Masonry card grid with filtering, pagination, and responsive layout
 */

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  memo,
} from 'react'
import { navigate, useLocation } from '@redwoodjs/router'
import { useMutation } from '@redwoodjs/web'
import { Sparkles, X, Plus } from 'lucide-react'
import { useToast } from 'src/components/Toast/Toast'
import type { Card } from 'src/lib/types'
import { Card as CardComponent } from 'src/components/Card/Card'
import { TagScroller } from 'src/components/TagScroller/TagScroller'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Cards above this index get priority loading (above the fold) */
const PRIORITY_CARD_COUNT = 6

/** Default number of cards per page */
const DEFAULT_PAGE_SIZE = 25

/** Available page size options */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

// =============================================================================
// GRAPHQL MUTATIONS
// =============================================================================

const ARCHIVE_CARD = gql`
  mutation ArchiveCard($id: String!) {
    archiveCard(id: $id) { id }
  }
`
const UNARCHIVE_CARD = gql`
  mutation UnarchiveCard($id: String!) {
    unarchiveCard(id: $id) { id }
  }
`
const DELETE_CARD = gql`
  mutation DeleteCard($id: String!, $permanent: Boolean) {
    deleteCard(id: $id, permanent: $permanent) { id }
  }
`
const RESTORE_CARD = gql`
  mutation RestoreCard($id: String!) {
    restoreCard(id: $id) { id }
  }
`

// =============================================================================
// PLATFORM DETECTION (inlined to avoid missing dependency)
// =============================================================================

type Platform =
  | 'twitter'
  | 'mastodon'
  | 'instagram'
  | 'youtube'
  | 'reddit'
  | 'wikipedia'
  | 'letterboxd'
  | 'imdb'
  | 'goodreads'
  | 'amazon'
  | 'storygraph'
  | 'spotify'
  | 'github'
  | 'tiktok'
  | 'linkedin'
  | 'pinterest'
  | 'medium'
  | 'substack'
  | 'perplexity'
  | 'unknown'

/**
 * Detect platform from a URL string.
 * Lightweight version — matches hostname patterns.
 */
function detectPlatform(url: string): Platform {
  try {
    const hostname = new URL(url).hostname.replace('www.', '')
    if (
      hostname.includes('twitter.com') ||
      hostname.includes('x.com') ||
      hostname.includes('nitter.')
    )
      return 'twitter'
    if (hostname.includes('instagram.com')) return 'instagram'
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be'))
      return 'youtube'
    if (hostname.includes('reddit.com')) return 'reddit'
    if (hostname.includes('wikipedia.org')) return 'wikipedia'
    if (hostname.includes('letterboxd.com')) return 'letterboxd'
    if (hostname.includes('imdb.com')) return 'imdb'
    if (hostname.includes('goodreads.com')) return 'goodreads'
    if (hostname.includes('amazon.')) return 'amazon'
    if (hostname.includes('thestorygraph.com')) return 'storygraph'
    if (hostname.includes('spotify.com')) return 'spotify'
    if (hostname.includes('github.com')) return 'github'
    if (hostname.includes('tiktok.com')) return 'tiktok'
    if (hostname.includes('linkedin.com')) return 'linkedin'
    if (hostname.includes('pinterest.com')) return 'pinterest'
    if (hostname.includes('medium.com')) return 'medium'
    if (hostname.includes('substack.com')) return 'substack'
    if (hostname.includes('perplexity.ai')) return 'perplexity'
    if (hostname.includes('mastodon.') || hostname.includes('mstdn.'))
      return 'mastodon'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

// =============================================================================
// CLIENT-SIDE SEARCH (inlined to avoid missing dependency)
// =============================================================================

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from',
  'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with',
])

function normalizeSearchValue(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}#\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getTokenVariant(token: string): string | null {
  if (token.length <= 3) return null
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.endsWith('ing')) return token.slice(0, -3)
  if (token.endsWith('ed')) return token.slice(0, -2)
  if (token.endsWith('es')) return token.slice(0, -2)
  if (token.endsWith('s')) return token.slice(0, -1)
  return null
}

function tokenizeQuery(query: string): string[] {
  const normalized = normalizeSearchValue(query)
  if (!normalized) return []

  const rawTokens = normalized.split(' ').filter(Boolean)
  const filteredTokens =
    rawTokens.length > 1
      ? rawTokens.filter((token) => !STOP_WORDS.has(token))
      : rawTokens

  const variants = new Set<string>()
  for (const token of filteredTokens) {
    variants.add(token)
    const variant = getTokenVariant(token)
    if (variant) variants.add(variant)
  }
  return Array.from(variants)
}

/**
 * Search cards by query string.
 * Handles hashtag searches (#tag) and freeform text search
 * across title, summary, content, tags, and author fields.
 */
function searchCardsByQuery(cards: Card[], query: string): Card[] {
  if (!query) return cards

  // Hashtag search
  if (query.startsWith('#')) {
    const tagQuery = normalizeSearchValue(query.slice(1))
    if (!tagQuery) return cards
    return cards.filter((card) =>
      card.tags.some((t) => normalizeSearchValue(t).includes(tagQuery))
    )
  }

  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return cards

  return cards.filter((card) => {
    const title = normalizeSearchValue(card.title)
    const summary = normalizeSearchValue(card.metadata?.summary)
    const content = normalizeSearchValue(card.content?.slice(0, 1200))
    const tags = card.tags.map((t) => normalizeSearchValue(t))
    const author = normalizeSearchValue(
      card.metadata?.authorName ||
        card.metadata?.authorHandle ||
        card.metadata?.author
    )
    const searchable = [title, summary, content, author, ...tags].join(' ')

    return tokens.every((token) => searchable.includes(token))
  })
}

// =============================================================================
// COLOR MATCHING (inlined to avoid missing dependency)
// =============================================================================

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [128, 128, 128]
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ]
}

function rgbToLab(rgb: [number, number, number]): [number, number, number] {
  let r = rgb[0] / 255
  let g = rgb[1] / 255
  let b = rgb[2] / 255

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92

  r *= 100
  g *= 100
  b *= 100

  let x = r * 0.4124 + g * 0.3576 + b * 0.1805
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722
  let z = r * 0.0193 + g * 0.1192 + b * 0.9505

  x /= 95.047
  y /= 100.0
  z /= 108.883

  x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116

  const L = 116 * y - 16
  const a = 500 * (x - y)
  const bLab = 200 * (y - z)

  return [L, a, bLab]
}

function colorDistance(hex1: string, hex2: string): number {
  const lab1 = rgbToLab(hexToRgb(hex1))
  const lab2 = rgbToLab(hexToRgb(hex2))
  return Math.sqrt(
    (lab1[0] - lab2[0]) ** 2 +
      (lab1[1] - lab2[1]) ** 2 +
      (lab1[2] - lab2[2]) ** 2
  )
}

function hasMatchingColor(
  colors: string[] | undefined,
  targetColor: string,
  threshold = 30
): boolean {
  if (!colors || colors.length === 0) return false
  return colors.some((c) => colorDistance(c, targetColor) <= threshold)
}

// =============================================================================
// HELPERS
// =============================================================================

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  if (current > 3) pages.push('...')
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}

function getCardPlatform(card: Card): Platform {
  if (card.metadata?.platform) {
    return card.metadata.platform as Platform
  }
  if (card.url) {
    return detectPlatform(card.url)
  }
  return 'unknown'
}

/**
 * Parse URL search params from a location search string.
 * RedwoodJS useLocation() returns { search } as a raw query string.
 */
function useSearchParams(): URLSearchParams {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

// =============================================================================
// PROPS
// =============================================================================

interface CardGridClientProps {
  /** Cards passed from a parent Cell */
  cards: Card[]
  /** Total card count for pagination */
  totalCount: number
  /** Current page number */
  page: number
  /** Number of cards per page */
  pageSize: number
  /** Whether more pages exist */
  hasMore: boolean
  /** Display mode: default (active), archive, or trash */
  mode?: 'default' | 'archive' | 'trash'
  /** Platform filter for client-side filtering */
  platformFilter?: string
  /** Search query for filtering */
  searchQuery?: string
  /** Callback when user changes page */
  onPageChange?: (page: number) => void
}

// =============================================================================
// CARD ITEM -- stable-callback wrapper so Card.memo works
// =============================================================================

interface CardItemProps {
  card: Card
  index?: number
  mode: 'default' | 'trash' | 'archive'
  onDelete: (id: string) => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onRestore: (id: string) => void
  onSelect: (card: Card) => void
}

const CardItem = memo(function CardItem({
  card,
  index,
  mode,
  onDelete,
  onArchive,
  onUnarchive,
  onRestore,
  onSelect,
}: CardItemProps) {
  const handleDelete = useCallback(() => onDelete(card.id), [onDelete, card.id])
  const handleArchive = useCallback(
    () => onArchive(card.id),
    [onArchive, card.id]
  )
  const handleUnarchive = useCallback(
    () => onUnarchive(card.id),
    [onUnarchive, card.id]
  )
  const handleRestore = useCallback(
    () => onRestore(card.id),
    [onRestore, card.id]
  )
  const handleClick = useCallback(() => onSelect(card), [onSelect, card])

  return (
    <CardComponent
      card={card}
      index={index}
      onDelete={handleDelete}
      onArchive={mode === 'default' ? handleArchive : undefined}
      onRestore={
        mode === 'trash'
          ? handleRestore
          : mode === 'archive'
            ? handleUnarchive
            : undefined
      }
      onClick={handleClick}
    />
  )
})

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Card grid with masonry layout, search/filter, pagination, and view toggle.
 *
 * In the RedwoodJS version, cards come from a parent Cell via props.
 * All data mutations (delete, archive, restore) are stubbed as TODO
 * for future GraphQL mutation integration.
 */
export function CardGridClient({
  cards: serverCards,
  totalCount: serverTotalCount,
  page: serverPage,
  pageSize: serverPageSize,
  hasMore: serverHasMore,
  mode = 'default',
  platformFilter,
  searchQuery,
  onPageChange,
}: CardGridClientProps) {
  const searchParams = useSearchParams()

  // Use platformFilter prop or extract from URL
  const activeFilter =
    platformFilter || searchParams.get('platform') || undefined

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const { showToast } = useToast()
  const [archiveCardMutation] = useMutation(ARCHIVE_CARD)
  const [unarchiveCardMutation] = useMutation(UNARCHIVE_CARD)
  const [deleteCardMutation] = useMutation(DELETE_CARD)
  const [restoreCardMutation] = useMutation(RESTORE_CARD)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [isBulkUnarchiving, setIsBulkUnarchiving] = useState(false)

  // Pagination state
  const [effectivePageSize, setEffectivePageSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mymind_page_size')
      if (saved) {
        const parsed = parseInt(saved, 10)
        if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed))
          return parsed
      }
    }
    return serverPageSize ?? DEFAULT_PAGE_SIZE
  })
  const [currentPage, setCurrentPage] = useState(serverPage || 1)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [totalCount, setTotalCount] = useState(
    serverTotalCount ?? serverCards.length
  )

  // Card size slider state (1 = default, range: 0.7 to 1.5)
  const [cardSize, setCardSize] = useState<number>(1)
  const [mobileGridColumns, setMobileGridColumns] = useState<1 | 2>(1)

  // Similarity search state
  const similarityId = searchParams.get('similar')
  const [similarCards, setSimilarCards] = useState<Card[]>([])
  const [isCreatingSpace, setIsCreatingSpace] = useState(false)
  const [newSpaceName, setNewSpaceName] = useState('')

  // Progressive rendering: only mount INITIAL_CHUNK cards at first
  const INITIAL_CHUNK = 80
  const CHUNK_SIZE = 80
  const [renderedCount, setRenderedCount] = useState(INITIAL_CHUNK)

  const currentQuery = searchParams.get('q') ?? searchQuery
  const deferredQuery = useDeferredValue((currentQuery ?? '').trim())

  // Color search state
  const colorFilter = searchParams.get('color')
  const colorCategory = searchParams.get('colorCategory')

  // ---------------------------------------------------------------------------
  // EFFECTS
  // ---------------------------------------------------------------------------

  // Sync totalCount and page from props
  useEffect(() => {
    setTotalCount(serverTotalCount ?? serverCards.length)
  }, [serverTotalCount, serverCards.length])

  useEffect(() => {
    if (serverPage) setCurrentPage(serverPage)
  }, [serverPage])

  // Fetch similar cards when similarityId changes
  useEffect(() => {
    if (!similarityId) {
      setSimilarCards([])
      return
    }

    // TODO: Replace with GraphQL query for similar cards
    // Example: const { data } = useQuery(SIMILAR_CARDS_QUERY, { variables: { cardId: similarityId, topK: 20 } })
    console.warn(
      '[CardGridClient] Similar cards fetch not yet implemented via GraphQL'
    )
  }, [similarityId])

  // Load card size preferences on mount
  useEffect(() => {
    const savedSize = localStorage.getItem('mymind_card_size')
    if (savedSize) {
      const parsed = parseFloat(savedSize)
      if (!isNaN(parsed) && parsed >= 0.7 && parsed <= 1.5) {
        setCardSize(parsed)
      }
    }

    const savedMobileColumns = localStorage.getItem(
      'mymind_mobile_grid_columns'
    )
    if (savedMobileColumns === '2') {
      setMobileGridColumns(2)
    }
  }, [])

  // Save card size to localStorage when changed
  useEffect(() => {
    localStorage.setItem('mymind_card_size', String(cardSize))
  }, [cardSize])

  useEffect(() => {
    localStorage.setItem('mymind_mobile_grid_columns', String(mobileGridColumns))
  }, [mobileGridColumns])

  useEffect(() => {
    localStorage.setItem('mymind_page_size', String(effectivePageSize))
  }, [effectivePageSize])

  // Optimistic card insert from AddModal
  const [optimisticCards, setOptimisticCards] = useState<Card[]>([])
  // Track which optimistic cards are "fresh" (for entrance animation)
  const [freshCardIds, setFreshCardIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const handleCardSaved = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.id) {
        const skeleton: Card = {
          id: detail.id,
          userId: '',
          title: detail.title || detail.url || 'Processing...',
          type: detail.type || 'website',
          url: detail.url || null,
          content: detail.content || null,
          imageUrl: detail.imageUrl || null,
          tags: detail.tags || [],
          metadata: detail.metadata || { processing: true, enrichmentStage: 'queued' },
          createdAt: detail.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          archivedAt: null,
        }
        setOptimisticCards((prev) => [skeleton, ...prev])
        setFreshCardIds((prev) => new Set(prev).add(detail.id))

        // Clear "fresh" flag after entrance animation (400ms)
        setTimeout(() => {
          setFreshCardIds((prev) => { const next = new Set(prev); next.delete(detail.id); return next })
        }, 500)

        // Remove optimistic card after 2 minutes (server data should replace it well before)
        setTimeout(() => {
          setOptimisticCards((prev) => prev.filter((c) => c.id !== detail.id))
        }, 120_000)
      }
    }
    const handleCardsChanged = () => {
      setOptimisticCards([])
    }
    window.addEventListener('card-saved', handleCardSaved)
    window.addEventListener('cards-changed', handleCardsChanged)
    return () => {
      window.removeEventListener('card-saved', handleCardSaved)
      window.removeEventListener('cards-changed', handleCardsChanged)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // CARD ACTIONS (stubbed for GraphQL mutations)
  // ---------------------------------------------------------------------------

  // Shared optimistic action pattern: hide → mutate → toast → rollback on error
  const optimisticAction = useCallback(async (
    cardId: string, mutation: () => Promise<unknown>,
    successMsg: string, label: string, successType: 'success' | 'info' = 'success',
  ) => {
    setDeletedIds((prev) => new Set(prev).add(cardId))
    try {
      await mutation()
      showToast(successMsg, successType)
    } catch (err) {
      console.error(`[CardGridClient] ${label} failed:`, err)
      setDeletedIds((prev) => { const next = new Set(prev); next.delete(cardId); return next })
      showToast(`Failed to ${label} card`, 'error')
    }
  }, [showToast])

  const handleDelete = useCallback((cardId: string) =>
    optimisticAction(cardId, () => deleteCardMutation({ variables: { id: cardId, permanent: mode === 'trash' } }),
      mode === 'trash' ? 'Card permanently deleted' : 'Card moved to trash', 'delete', 'info'),
  [deleteCardMutation, optimisticAction, mode])

  const handleRestore = useCallback((cardId: string) =>
    optimisticAction(cardId, () => restoreCardMutation({ variables: { id: cardId } }), 'Card restored', 'restore'),
  [restoreCardMutation, optimisticAction])

  const handleArchive = useCallback((cardId: string) =>
    optimisticAction(cardId, () => archiveCardMutation({ variables: { id: cardId } }), 'Card archived', 'archive'),
  [archiveCardMutation, optimisticAction])

  const handleUnarchive = useCallback((cardId: string) =>
    optimisticAction(cardId, () => unarchiveCardMutation({ variables: { id: cardId } }), 'Card unarchived', 'unarchive'),
  [unarchiveCardMutation, optimisticAction])

  // Create Space from Similar Cards
  const handleCreateSpaceFromSimilar = useCallback(async () => {
    if (!newSpaceName.trim() || similarCards.length === 0) return

    const tagName = newSpaceName.trim().toLowerCase().replace(/\s+/g, '-')

    // TODO: Replace with GraphQL mutation to batch-update tags
    // Example: batchUpdateCardTags({ variables: { cardIds: similarCards.map(c => c.id), addTags: [tagName] } })
    console.warn(`[CardGridClient] Create space "${tagName}" — TODO: GraphQL mutation`)

    // Navigate to the new space
    navigate(`/?q=%23${tagName}`)
  }, [newSpaceName, similarCards])

  const handleUnarchiveAll = useCallback(async () => {
    const archivedIds = uniqueCards.map((card) => card.id)
    if (archivedIds.length === 0) return

    const shouldContinue = confirm(
      `Unarchive all ${archivedIds.length} items?`
    )
    if (!shouldContinue) return

    setIsBulkUnarchiving(true)
    try {
      // TODO: Replace with GraphQL mutation
      // Example: bulkUnarchiveCards({ variables: { action: 'unarchive-all' } })
      console.warn('[CardGridClient] Bulk unarchive — TODO: GraphQL mutation')

      setDeletedIds((prev) => {
        const next = new Set(prev)
        archivedIds.forEach((id) => next.add(id))
        return next
      })
    } catch (error) {
      console.error('[UnarchiveAll] Failed:', error)
    } finally {
      setIsBulkUnarchiving(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleArchiveAll = useCallback(async () => {
    if (!confirm(`Archive all ${uniqueCards.length} items?`)) return

    // TODO: Replace with GraphQL mutation
    // Example: bulkArchiveCards({ variables: { action: 'archive-all' } })
    console.warn('[CardGridClient] Bulk archive — TODO: GraphQL mutation')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // DERIVED DATA
  // ---------------------------------------------------------------------------

  const mergedCards = useMemo(() => {
    if (similarityId) return similarCards
    // Deduplicate cards and prepend optimistic inserts
    const seen = new Set<string>()
    const result: Card[] = []
    // Add optimistic cards first (they appear at top)
    for (const card of optimisticCards) {
      if (!seen.has(card.id)) {
        seen.add(card.id)
        result.push(card)
      }
    }
    for (const card of serverCards) {
      if (!seen.has(card.id)) {
        seen.add(card.id)
        result.push(card)
      }
    }
    return result
  }, [similarityId, similarCards, serverCards, optimisticCards])

  const searchableCards = useMemo(() => {
    let cards = mergedCards

    // Color filter (hex match)
    if (colorFilter) {
      cards = cards.filter((card) =>
        hasMatchingColor(card.metadata?.colors, colorFilter, 30)
      )
    }

    // Color category filter (warm/cool/monochrome/vibrant/muted)
    if (colorCategory) {
      cards = cards.filter((card) =>
        card.metadata?.colorCategory === colorCategory
      )
    }

    // Remove deleted cards and filter by mode
    const seenIds = new Set<string>()
    const deduped = cards.filter((card) => {
      if (deletedIds.has(card.id) || seenIds.has(card.id)) {
        return false
      }

      const isArchived = !!card.archivedAt
      const shouldShow =
        mode === 'archive'
          ? isArchived
          : mode === 'trash'
            ? true
            : !isArchived

      if (!shouldShow) return false

      seenIds.add(card.id)
      return true
    })

    return searchCardsByQuery(deduped, deferredQuery)
  }, [mergedCards, colorFilter, colorCategory, deletedIds, mode, deferredQuery])

  const uniqueCards = useMemo(() => {
    if (!activeFilter) {
      return searchableCards
    }

    return searchableCards.filter((card) => {
      const cardPlatform = getCardPlatform(card)

      if (activeFilter === 'websites' || activeFilter === 'article') {
        return cardPlatform === 'unknown' && card.type === 'article'
      }
      if (activeFilter === 'images' || activeFilter === 'image') {
        return card.type === 'image'
      }
      if (activeFilter === 'notes' || activeFilter === 'note') {
        return card.type === 'note'
      }
      if (activeFilter === 'video') return card.type === 'video'
      if (activeFilter === 'social') return card.type === 'social'
      if (activeFilter === 'movie') return card.type === 'movie'
      if (activeFilter === 'book') return card.type === 'book'
      if (activeFilter === 'product') return card.type === 'product'

      return cardPlatform === activeFilter
    })
  }, [searchableCards, activeFilter])

  const visibleCards = uniqueCards.slice(0, renderedCount)

  // ---------------------------------------------------------------------------
  // PAGINATION
  // ---------------------------------------------------------------------------

  const totalPages = Math.max(1, Math.ceil(totalCount / effectivePageSize))

  const goToPage = useCallback(
    async (page: number) => {
      if (page < 1 || page > totalPages || isLoadingMore) return
      setIsLoadingMore(true)
      setCurrentPage(page)

      // Delegate to parent Cell's onPageChange callback
      if (onPageChange) {
        onPageChange(page)
      }

      window.scrollTo({ top: 0, behavior: 'smooth' })
      setIsLoadingMore(false)
    },
    [totalPages, isLoadingMore, onPageChange]
  )

  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      setEffectivePageSize(newSize)
      setCurrentPage(1)

      // Delegate to parent — the Cell should refetch with new pageSize
      if (onPageChange) {
        onPageChange(1)
      }
    },
    [onPageChange]
  )

  // ---------------------------------------------------------------------------
  // PLATFORM COUNTS (for TagScroller pills)
  // ---------------------------------------------------------------------------

  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const card of searchableCards) {
      if (card.type === 'image') {
        counts['image'] = (counts['image'] || 0) + 1
        continue
      }
      if (card.type === 'note') {
        counts['note'] = (counts['note'] || 0) + 1
        continue
      }
      const platform = getCardPlatform(card)
      counts[platform] = (counts[platform] || 0) + 1
    }
    return counts
  }, [searchableCards])

  // Sync selected card with updated data
  useEffect(() => {
    if (selectedCard) {
      const updated = uniqueCards.find((c) => c.id === selectedCard.id)
      if (updated && updated !== selectedCard) {
        setSelectedCard(updated)
      }
    }
  }, [uniqueCards, selectedCard])

  // ---------------------------------------------------------------------------
  // MASONRY LAYOUT (responsive column calculation)
  // ---------------------------------------------------------------------------

  const [windowWidth, setWindowWidth] = useState(0)

  useEffect(() => {
    setWindowWidth(window.innerWidth)
    let timer: ReturnType<typeof setTimeout>
    let raf: number
    const handleResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        raf = requestAnimationFrame(() => setWindowWidth(window.innerWidth))
      }, 150)
    }
    window.addEventListener('resize', handleResize, { passive: true })
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // Chunked rendering: progressively mount cards during idle frames
  useEffect(() => {
    if (renderedCount >= uniqueCards.length) return
    let handle: number
    if (typeof requestIdleCallback === 'function') {
      handle = requestIdleCallback(
        () => {
          setRenderedCount((prev) =>
            Math.min(prev + CHUNK_SIZE, uniqueCards.length)
          )
        },
        { timeout: 2000 }
      )
      return () => cancelIdleCallback(handle)
    } else {
      handle = window.setTimeout(() => {
        setRenderedCount((prev) =>
          Math.min(prev + CHUNK_SIZE, uniqueCards.length)
        )
      }, 16)
      return () => window.clearTimeout(handle)
    }
  }, [renderedCount, uniqueCards.length])

  // Reset chunk count when filters change
  useEffect(() => {
    if (deferredQuery || activeFilter || colorFilter || colorCategory) {
      setRenderedCount(INITIAL_CHUNK)
    }
  }, [deferredQuery, activeFilter, colorFilter, colorCategory])

  /**
   * Calculate column count based on viewport and card size.
   * Returns null before mount -- CSS columns are used as SSR fallback.
   *
   * cardSize 0.7 = compact (more columns), 1.0 = default, 1.5 = expanded (fewer columns)
   */
  const masonryStyle = useMemo(() => {
    if (windowWidth === 0) return null // Not mounted yet, use CSS fallback

    // Base columns per breakpoint (default at cardSize = 1.0)
    let baseColumns: number
    if (windowWidth < 640) {
      baseColumns = mobileGridColumns
    } else if (windowWidth < 1024) {
      baseColumns = 2
    } else if (windowWidth < 1280) {
      baseColumns = 3
    } else if (windowWidth < 1536) {
      baseColumns = 4
    } else {
      baseColumns = 5
    }

    let columns = baseColumns
    if (windowWidth >= 640) {
      const columnAdjustment = Math.round((1 - cardSize) * 2)
      const minColumns =
        windowWidth < 1024 ? 2 : windowWidth < 1280 ? 3 : 3
      columns = Math.max(
        minColumns,
        Math.min(5, baseColumns + columnAdjustment)
      )
    }

    const gap =
      windowWidth < 640
        ? mobileGridColumns === 2
          ? 12
          : 16
        : cardSize <= 0.9
          ? 12
          : cardSize >= 1.2
            ? 20
            : 16

    const gridColumns =
      windowWidth < 640
        ? mobileGridColumns === 2
          ? 'repeat(2, 1fr)'
          : '1fr'
        : `repeat(${columns}, 1fr)`

    return {
      display: 'grid' as const,
      gridTemplateColumns: gridColumns,
      gap: `${gap}px`,
      alignItems: 'start' as const,
    }
  }, [windowWidth, cardSize, mobileGridColumns])

  // ---------------------------------------------------------------------------
  // DEV TRACE
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    console.debug('[CardGrid] state', {
      mode,
      visibleCards: uniqueCards.length,
      searchQuery: deferredQuery || 'none',
      filter: activeFilter ?? 'all',
    })
  }, [mode, uniqueCards.length, deferredQuery, activeFilter])

  // ---------------------------------------------------------------------------
  // DERIVED LABELS
  // ---------------------------------------------------------------------------

  const showMobileGridDensityToggle = windowWidth > 0 && windowWidth < 640
  const visibleCountLabel = similarityId
    ? `${uniqueCards.length} ${uniqueCards.length === 1 ? 'related item' : 'related items'}`
    : deferredQuery
      ? `${uniqueCards.length} ${uniqueCards.length === 1 ? 'match' : 'matches'}`
      : totalPages > 1
        ? `${uniqueCards.length} of ${totalCount} items · Page ${currentPage} of ${totalPages}`
        : `${uniqueCards.length} ${uniqueCards.length === 1 ? 'item' : 'items'}`

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full" data-testid="card-grid">
      {/* Dynamic Platform Pills */}
      <div className="border-b border-[var(--border)] mb-6">
        <TagScroller platformCounts={platformCounts} />
      </div>

      {/* Similarity Mode Banner */}
      {similarityId && (
        <div className="mb-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-accent)] p-6 animate-in slide-in-from-top-4 md:flex-row md:items-center">
          <div>
            <h3 className="mb-1 flex items-center gap-2 font-serif text-xl text-[var(--foreground)]">
              <Sparkles className="w-5 h-5 text-[var(--accent-primary)]" />
              Similar Minds
            </h3>
            <p className="text-sm text-[var(--foreground-muted)]">
              {uniqueCards.length > 0
                ? `Showing ${uniqueCards.length} items semantically related to your selection`
                : 'Searching for similar items...'}
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {isCreatingSpace ? (
              <div className="flex items-center gap-2 flex-1 md:flex-none">
                <input
                  autoFocus
                  type="text"
                  className="surface-input rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none"
                  placeholder="Name your space..."
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateSpaceFromSimilar()
                    if (e.key === 'Escape') setIsCreatingSpace(false)
                  }}
                />
                <button
                  onClick={handleCreateSpaceFromSimilar}
                  className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
                >
                  Create
                </button>
                <button
                  onClick={() => setIsCreatingSpace(false)}
                  className="surface-chip rounded-lg p-2 text-[var(--accent-primary)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreatingSpace(true)}
                className="surface-chip-active flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-all"
              >
                <Plus className="w-4 h-4" />
                Create Space from These
              </button>
            )}

            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 text-sm font-medium text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Controls Bar (Only show if we have cards) */}
      {uniqueCards.length > 0 && (
        <div className="mobile-toolbar-grid flex items-center justify-between mb-6">
          {/* Items count + Archive All */}
          <div className="mobile-col-count flex items-center gap-3">
            <p
              className="text-xs text-[var(--foreground-muted)]"
              data-testid="card-count"
            >
              {visibleCountLabel}
            </p>
            {mode === 'default' && (
              <button
                onClick={handleArchiveAll}
                className="hidden md:inline text-xs text-[var(--foreground-muted)] hover:text-[var(--accent-primary)] transition-colors"
              >
                Archive All
              </button>
            )}
            {mode === 'archive' && (
              <button
                onClick={handleUnarchiveAll}
                disabled={isBulkUnarchiving}
                className="hidden md:inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-[var(--accent-primary)] transition-colors disabled:opacity-60"
                aria-label="Unarchive all cards"
              >
                {isBulkUnarchiving && (
                  <svg
                    className="h-3 w-3 animate-spin"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M1.85 7.5c0-2.835 2.21-5.65 5.65-5.65 3.44 0 5.65 2.815 5.65 5.65 0 2.835-2.21 5.65-5.65 5.65-.745 0-1.44-.12-2.065-.34"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                  </svg>
                )}
                {isBulkUnarchiving ? 'Unarchiving...' : 'Unarchive All'}
              </button>
            )}
          </div>

          <div className="mobile-col-slider flex items-center gap-4">
            {/* Card Size Slider (only show in grid view) */}
            {viewMode === 'grid' &&
              (showMobileGridDensityToggle ? (
                <div
                  className="surface-chip flex items-center rounded-lg p-1"
                  data-testid="mobile-grid-density"
                >
                  <button
                    onClick={() => setMobileGridColumns(1)}
                    className={`min-w-[44px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      mobileGridColumns === 1
                        ? 'surface-chip-active text-[var(--foreground)]'
                        : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                    }`}
                    aria-label="Single column grid"
                  >
                    1x
                  </button>
                  <button
                    onClick={() => setMobileGridColumns(2)}
                    className={`min-w-[44px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      mobileGridColumns === 2
                        ? 'surface-chip-active text-[var(--foreground)]'
                        : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                    }`}
                    aria-label="Two column grid"
                  >
                    2x
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <svg
                    className="hidden md:block h-3 w-3 text-[var(--foreground-muted)]"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M2.25 7.5H12.75"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                  </svg>
                  <input
                    type="range"
                    min="0.7"
                    max="1.5"
                    step="0.1"
                    value={cardSize}
                    onChange={(e) => setCardSize(parseFloat(e.target.value))}
                    className="card-size-slider"
                    aria-label="Card size"
                    title={`Card size: ${cardSize < 0.9 ? 'Compact' : cardSize > 1.2 ? 'Expanded' : 'Default'}`}
                  />
                  <svg
                    className="hidden md:block h-3 w-3 text-[var(--foreground-muted)]"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M8 2.75V12.25M2.25 7.5H12.75"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                  </svg>
                </div>
              ))}
          </div>

          {/* Page Size Selector -- desktop only */}
          <div className="hidden sm:flex surface-chip items-center rounded-lg p-1">
            {PAGE_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                onClick={() => handlePageSizeChange(size)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  effectivePageSize === size
                    ? 'surface-chip-active text-[var(--foreground)]'
                    : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
                aria-label={`Show ${size} cards per page`}
              >
                {size}
              </button>
            ))}
          </div>

          <div className="mobile-col-toggle flex items-center gap-4">
            {/* View Toggle */}
            <div className="surface-chip flex items-center rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'surface-chip-active text-[var(--foreground)]'
                    : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
                aria-label="Grid View"
              >
                {/* DashboardIcon equivalent */}
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 15 15"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M2.5 2.5h4v4h-4v-4zm6 0h4v4h-4v-4zm-6 6h4v4h-4v-4zm6 0h4v4h-4v-4z"
                    stroke="currentColor"
                    strokeWidth="1"
                  />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'surface-chip-active text-[var(--foreground)]'
                    : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
                aria-label="List View"
              >
                {/* RowsIcon equivalent */}
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 15 15"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M2 4.5h11M2 7.5h11M2 10.5h11"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State / Grid */}
      {uniqueCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in duration-500">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-[var(--accent-primary)]/20 blur-xl rounded-full"></div>
            <div className="surface-card-elevated relative rounded-2xl p-6">
              <svg
                className="h-10 w-10 text-[var(--accent-primary)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
          </div>
          <h3 className="mb-2 text-2xl font-serif text-[var(--foreground)]">
            {similarityId
              ? 'No similar cards found'
              : 'Your mind is waiting'}
          </h3>
          <p className="mx-auto mb-8 max-w-md leading-relaxed text-[var(--foreground-muted)]">
            {currentQuery ? (
              <>
                We couldn&apos;t find anything matching &quot;{currentQuery}
                &quot;. Try a broader search or explore your spaces.
              </>
            ) : similarityId ? (
              "We analyzed the vectors but couldn't find anything similar enough yet. Try enriching more cards!"
            ) : (() => {
                const filter =
                  searchParams.get('platform') ||
                  searchParams.get('type')
                const label = filter
                  ? filter === 'websites'
                    ? 'websites'
                    : filter === 'images'
                      ? 'images'
                      : filter === 'notes'
                        ? 'notes'
                        : filter === 'youtube'
                          ? 'YouTube videos'
                          : filter === 'twitter'
                            ? 'tweets'
                            : filter === 'instagram'
                              ? 'Instagram posts'
                              : filter === 'reddit'
                                ? 'Reddit posts'
                                : filter === 'letterboxd'
                                  ? 'Letterboxd reviews'
                                  : filter === 'goodreads'
                                    ? 'Goodreads books'
                                    : 'items'
                  : 'items'
                return `This space is empty using the current filter. Save some ${label} to fill your creative brain.`
              })()}
          </p>
        </div>
      ) : (
        <>
          {viewMode === 'grid' ? (
            <div
              data-testid="masonry-grid"
              className={
                masonryStyle
                  ? ''
                  : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
              }
              style={masonryStyle ?? undefined}
            >
              {visibleCards.map((card, index) => {
                const isFresh = freshCardIds.has(card.id)
                const isProcessing = card.metadata?.processing === true
                return (
                <div
                  key={card.id}
                  className={`relative card-contained ${
                    isFresh
                      ? 'animate-card-arrive'
                      : index < PRIORITY_CARD_COUNT
                        ? 'animate-fade-up'
                        : 'animate-fade-up-stagger'
                  } ${isProcessing ? 'card-shimmer overflow-hidden' : ''}`}
                  style={
                    index >= PRIORITY_CARD_COUNT
                      ? ({
                          '--stagger-index': Math.min(
                            index - PRIORITY_CARD_COUNT,
                            10
                          ),
                        } as React.CSSProperties)
                      : undefined
                  }
                  data-card-index={index}
                >
                  {mode === 'archive' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleUnarchive(card.id)
                      }}
                      className="absolute left-2 top-2 z-40 inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-[var(--surface-success)] px-2 py-1 text-xs font-medium text-emerald-600 shadow-sm"
                      aria-label="Unarchive card"
                    >
                      {/* ReloadIcon equivalent */}
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M1.85 7.5c0-2.835 2.21-5.65 5.65-5.65 3.44 0 5.65 2.815 5.65 5.65 0 2.835-2.21 5.65-5.65 5.65-.745 0-1.44-.12-2.065-.34"
                          stroke="currentColor"
                          strokeWidth="1.2"
                        />
                      </svg>
                      Unarchive
                    </button>
                  )}
                  <CardItem
                    card={card}
                    index={index}
                    mode={mode}
                    onDelete={handleDelete}
                    onArchive={handleArchive}
                    onUnarchive={handleUnarchive}
                    onRestore={handleRestore}
                    onSelect={setSelectedCard}
                  />
                </div>
              )})}
            </div>
          ) : (
            <div className="flex flex-col gap-4 max-w-3xl mx-auto">
              {visibleCards.map((card) => (
                /* List View Item */
                <div key={card.id} className="relative w-full">
                  {mode === 'archive' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleUnarchive(card.id)
                      }}
                      className="absolute left-2 top-2 z-40 inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-[var(--surface-success)] px-2 py-1 text-xs font-medium text-emerald-600 shadow-sm"
                      aria-label="Unarchive card"
                    >
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M1.85 7.5c0-2.835 2.21-5.65 5.65-5.65 3.44 0 5.65 2.815 5.65 5.65 0 2.835-2.21 5.65-5.65 5.65-.745 0-1.44-.12-2.065-.34"
                          stroke="currentColor"
                          strokeWidth="1.2"
                        />
                      </svg>
                      Unarchive
                    </button>
                  )}
                  <CardItem
                    card={card}
                    mode={mode}
                    onDelete={handleDelete}
                    onArchive={handleArchive}
                    onUnarchive={handleUnarchive}
                    onRestore={handleRestore}
                    onSelect={setSelectedCard}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && mode === 'default' && (
            <div className="flex items-center justify-center gap-1.5 py-8">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1 || isLoadingMore}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] transition-all physics-press disabled:opacity-40"
                aria-label="Previous page"
              >
                &larr;
              </button>

              {getPageNumbers(currentPage, totalPages).map((p, i) =>
                p === '...' ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="px-2 text-xs text-[var(--foreground-muted)]"
                  >
                    &hellip;
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    disabled={isLoadingMore}
                    className={`min-w-[32px] h-8 rounded-lg text-sm font-medium transition-all physics-press ${
                      p === currentPage
                        ? 'bg-[var(--accent-primary)] text-white'
                        : 'text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages || isLoadingMore}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] transition-all physics-press disabled:opacity-40"
                aria-label="Next page"
              >
                &rarr;
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail Modal — TODO: Import CardDetailModal once ported */}
      {/* When CardDetailModal is available, uncomment:
      {selectedCard && (
        <CardDetailModal
          key={selectedCard.id}
          card={selectedCard}
          isOpen={true}
          onClose={() => setSelectedCard(null)}
          onDelete={(id) => {
            handleDelete(id)
            setSelectedCard(null)
          }}
          onRestore={
            mode === 'trash'
              ? (id) => { handleRestore(id); setSelectedCard(null) }
              : mode === 'archive'
                ? (id) => { handleUnarchive(id); setSelectedCard(null) }
                : undefined
          }
          restoreLabel={mode === 'archive' ? 'Unarchive' : 'Restore'}
          onArchive={
            mode === 'default'
              ? (id) => { handleArchive(id); setSelectedCard(null) }
              : undefined
          }
          availableSpaces={Array.from(new Set(searchableCards.flatMap(c => c.tags))).sort()}
        />
      )}
      */}
    </div>
  )
}

export default CardGridClient
