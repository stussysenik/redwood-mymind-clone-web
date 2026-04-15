/**
 * ClusterListSheet — Bottom sheet (mobile) / right slide-over (desktop)
 * showing all saved graph clusters with tap-to-restore and long-press-to-delete.
 *
 * Architecture notes:
 * - Mirrors ClusterSheet layout/animation conventions exactly
 * - Long-press: pointer events only (no touch API) for cross-platform compat
 *   300 ms threshold + 10 px movement guard prevents accidental triggers on scroll
 * - Delete path uses cache.modify so Apollo evicts the row optimistically without
 *   a full re-fetch — the list stays snappy on slow connections
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation, useQuery } from '@redwoodjs/web'
import { formatDistanceToNow } from 'date-fns'
import { X, Layers } from 'lucide-react'

import {
  GRAPH_CLUSTERS_QUERY,
  DELETE_GRAPH_CLUSTER_MUTATION,
} from 'src/components/GraphClient/graphClustersFragments'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Cluster {
  id: string
  name: string
  note?: string | null
  nodeIds: string[]
  createdAt: string
}

interface ClusterListSheetProps {
  isOpen: boolean
  onClose: () => void
  onRestore: (cluster: Cluster) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LONG_PRESS_MS = 300
const LONG_PRESS_MOVE_THRESHOLD = 10

// ---------------------------------------------------------------------------
// Sub-component: ClusterRow
// ---------------------------------------------------------------------------

interface ClusterRowProps {
  cluster: Cluster
  onRestore: (cluster: Cluster) => void
  onClose: () => void
}

function ClusterRow({ cluster, onRestore, onClose }: ClusterRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Long-press tracking via pointer events
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const didLongPressRef = useRef(false)

  const [deleteCluster] = useMutation(DELETE_GRAPH_CLUSTER_MUTATION, {
    update(cache, { data }) {
      const deletedId = data?.deleteGraphCluster?.id
      if (!deletedId) return
      cache.modify({
        fields: {
          graphClusters(existing: any[] = [], { readField }) {
            return existing.filter(
              (ref) => readField('id', ref) !== deletedId
            )
          },
        },
      })
    },
  })

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only primary pointer (left click / first touch)
      if (e.button !== 0 && e.pointerType !== 'touch') return
      didLongPressRef.current = false
      startPosRef.current = { x: e.clientX, y: e.clientY }
      timerRef.current = setTimeout(() => {
        didLongPressRef.current = true
        setConfirmDelete(true)
      }, LONG_PRESS_MS)
    },
    []
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!startPosRef.current) return
      const dx = Math.abs(e.clientX - startPosRef.current.x)
      const dy = Math.abs(e.clientY - startPosRef.current.y)
      if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
        clearTimer()
      }
    },
    [clearTimer]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      clearTimer()
      if (didLongPressRef.current) {
        // Long-press already handled via timer — suppress tap
        return
      }
      // Regular tap → restore
      if (!confirmDelete) {
        onRestore(cluster)
        onClose()
      }
    },
    [clearTimer, confirmDelete, cluster, onRestore, onClose]
  )

  const handlePointerCancel = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  const handleConfirmDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      setIsDeleting(true)
      try {
        await deleteCluster({ variables: { id: cluster.id } })
      } catch {
        // silent — row will remain if delete fails; user can retry
        setIsDeleting(false)
        setConfirmDelete(false)
      }
    },
    [deleteCluster, cluster.id]
  )

  const handleCancelDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmDelete(false)
  }, [])

  // Note preview: single line, 60 chars max
  const notePreview =
    cluster.note
      ? cluster.note.length > 60
        ? cluster.note.slice(0, 60) + '\u2026'
        : cluster.note
      : null

  // Relative timestamp
  let relativeTime = ''
  try {
    relativeTime = formatDistanceToNow(new Date(cluster.createdAt), {
      addSuffix: true,
    })
  } catch {
    relativeTime = ''
  }

  const nodeCount = cluster.nodeIds.length

  return (
    <div
      className="border-b border-[var(--border-subtle)]"
      style={{ minHeight: '72px' }}
    >
      {confirmDelete ? (
        /* ---- Inline delete confirm state ---- */
        <div
          className="flex items-center justify-between gap-3 py-3 px-4"
          style={{ minHeight: '72px' }}
        >
          <p
            className="text-sm text-[var(--foreground)] flex-1 select-none"
          >
            Delete this cluster?
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCancelDelete}
              className="px-3 py-1.5 rounded-lg text-sm font-medium
                bg-[var(--surface-subtle)]
                text-[var(--foreground)]
                hover:bg-[var(--surface-hover)]
                transition-colors"
              style={{ minHeight: '44px' }}
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              className="px-3 py-1.5 rounded-lg text-sm font-medium
                bg-red-500
                text-white
                hover:bg-red-600
                disabled:opacity-60 disabled:cursor-not-allowed
                transition-colors flex items-center gap-1.5"
              style={{ minHeight: '44px' }}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete'
              )}
            </button>
          </div>
        </div>
      ) : (
        /* ---- Normal row ---- */
        <div
          role="button"
          tabIndex={0}
          className="py-3 px-4 flex flex-col gap-0.5 cursor-pointer
            hover:bg-[var(--surface-subtle)] active:bg-[var(--surface-hover)]
            select-none transition-colors outline-none
            focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/40 focus-visible:ring-inset"
          style={{
            minHeight: '72px',
            touchAction: 'manipulation',
            WebkitUserSelect: 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onRestore(cluster)
              onClose()
            }
          }}
          aria-label={`Restore cluster: ${cluster.name}`}
        >
          {/* Name */}
          <span className="text-sm font-semibold text-[var(--foreground)] leading-snug">
            {cluster.name}
          </span>

          {/* Note preview */}
          {notePreview && (
            <span className="text-sm text-[var(--foreground-muted)] leading-snug truncate">
              {notePreview}
            </span>
          )}

          {/* Bottom row: pill + timestamp */}
          <div className="flex items-center gap-2 mt-1">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]"
            >
              {nodeCount} card{nodeCount !== 1 ? 's' : ''}
            </span>
            {relativeTime && (
              <span className="text-xs text-[var(--foreground-muted)]">
                {relativeTime}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ClusterListSheet({
  isOpen,
  onClose,
  onRestore,
}: ClusterListSheetProps) {
  const { data, loading } = useQuery(GRAPH_CLUSTERS_QUERY, {
    // Only fire when sheet is open — avoids cold-start cost
    skip: !isOpen,
  })

  const clusters: Cluster[] = data?.graphClusters ?? []

  // Close on Esc
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet container — bottom on mobile, right slide-over on desktop */}
      <div
        className="fixed z-50 bg-[var(--surface-floating)] shadow-2xl flex flex-col
          /* Mobile: bottom sheet, max 75vh so it doesn't crowd the screen */
          bottom-0 left-0 right-0 rounded-t-2xl max-h-[75vh]
          /* Desktop: full-height right panel */
          md:bottom-auto md:left-auto md:top-0 md:right-0 md:h-full md:w-[400px]
          md:rounded-l-2xl md:rounded-t-none md:max-h-none
          animate-in slide-in-from-bottom md:slide-in-from-right duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cluster-list-sheet-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <h2
              id="cluster-list-sheet-title"
              className="text-base font-semibold text-[var(--foreground)]"
            >
              Saved Clusters
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--surface-hover)] transition-colors"
            aria-label="Close"
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            <X className="w-5 h-5 text-[var(--foreground-muted)]" />
          </button>
        </div>

        {/* Scrollable list body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-[var(--foreground-muted)]">
                Loading clusters…
              </p>
            </div>
          ) : clusters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
              <Layers
                className="w-12 h-12 text-[var(--foreground-muted)] opacity-30"
                aria-hidden="true"
              />
              <div className="flex flex-col items-center gap-2 text-center max-w-[280px]">
                <p className="text-base font-semibold text-[var(--foreground)]">
                  No clusters yet
                </p>
                <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
                  Clusters group related cards. Switch to{' '}
                  <span className="font-medium text-[var(--foreground)]">
                    3D view
                  </span>
                  , then{' '}
                  <span className="font-medium text-[var(--foreground)]">
                    long-press any node
                  </span>
                  {' '}— nearby connections flood-fill so you can name and save the group.
                </p>
              </div>
            </div>
          ) : (
            clusters.map((cluster) => (
              <ClusterRow
                key={cluster.id}
                cluster={cluster}
                onRestore={onRestore}
                onClose={onClose}
              />
            ))
          )}
        </div>

        {/* Bottom safe-area spacer (mobile) */}
        <div className="h-[env(safe-area-inset-bottom,0px)] shrink-0 md:hidden" />
      </div>
    </>
  )
}
