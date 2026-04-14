/**
 * GraphRendererPicker
 *
 * Three-segment control for choosing between Canvas, WebGL, and Three.js
 * graph renderers. Preference is persisted to the user's account via GraphQL
 * and followed across devices.
 *
 * Design: one control, no explanatory copy, muted status sublabels.
 * Saves optimistically on tap, rolls back on error.
 */

import { useState } from 'react'

import { useMutation, useQuery } from '@redwoodjs/web'

import type { RendererBackend } from 'src/lib/graph-renderer-types'

const GET_RENDERER = gql`
  query GetGraphRenderer {
    userPreferences {
      userId
      graphRenderer
    }
  }
`

const SET_RENDERER = gql`
  mutation SetGraphRenderer($graphRenderer: String!) {
    updateUserPreferences(graphRenderer: $graphRenderer) {
      userId
      graphRenderer
    }
  }
`

const SEGMENTS: {
  value: RendererBackend
  label: string
  sublabel: string
}[] = [
  { value: 'canvas', label: '2D · Canvas',  sublabel: 'default' },
  { value: 'webgl',  label: '2D · WebGL',   sublabel: 'GPU'     },
  { value: 'three',  label: '3D · Three.js', sublabel: 'depth'  },
]

export function GraphRendererPicker() {
  const { data } = useQuery(GET_RENDERER)
  const serverValue: RendererBackend =
    (data?.userPreferences?.graphRenderer as RendererBackend) ?? 'canvas'

  // Optimistic local state — updates immediately, syncs to server
  const [optimistic, setOptimistic] = useState<RendererBackend | null>(null)
  const current = optimistic ?? serverValue

  const [setRenderer] = useMutation(SET_RENDERER, {
    onError: () => {
      // Roll back to server value on failure
      setOptimistic(null)
    },
  })

  function handleSelect(value: RendererBackend) {
    if (value === current) return
    setOptimistic(value)
    setRenderer({ variables: { graphRenderer: value } })
  }

  return (
    <div className="flex gap-2" role="radiogroup" aria-label="Graph renderer">
      {SEGMENTS.map(({ value, label, sublabel }) => {
        const isActive = current === value
        return (
          <button
            key={value}
            role="radio"
            aria-checked={isActive}
            onClick={() => handleSelect(value)}
            className="flex-1 flex flex-col items-center py-2.5 px-3 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: isActive
                ? 'var(--accent-primary)'
                : 'var(--surface-soft)',
              color: isActive ? '#FFFFFF' : 'var(--foreground-muted)',
              border: isActive ? 'none' : '1px solid var(--border-subtle)',
            }}
          >
            <span>{label}</span>
            <span
              className="text-[10px] font-normal mt-0.5"
              style={{
                opacity: isActive ? 0.75 : 0.5,
                color: isActive ? '#FFFFFF' : 'var(--foreground-muted)',
              }}
            >
              {sublabel}
            </span>
          </button>
        )
      })}
    </div>
  )
}
