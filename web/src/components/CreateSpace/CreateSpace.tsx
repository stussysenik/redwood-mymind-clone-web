/**
 * MyMind Clone - Create Space Component
 *
 * Modal form for creating a new space.
 * Uses GraphQL mutation via useMutation hook.
 */

import { useState } from 'react'

import { navigate } from '@redwoodjs/router'
import { useMutation } from '@redwoodjs/web'
import { Plus, X, Loader2 } from 'lucide-react'

const CREATE_SPACE_MUTATION = gql`
  mutation CreateSpaceMutation($input: CreateSpaceInput!) {
    createSpace(input: $input) {
      id
      name
    }
  }
`

export function CreateSpace() {
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')

  const [createSpace, { loading }] = useMutation(CREATE_SPACE_MUTATION, {
    onCompleted: () => {
      setIsOpen(false)
      setName('')
      setQuery('')
      navigate('/spaces')
    },
    onError: (err) => {
      console.error('Failed to create space:', err)
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    await createSpace({
      variables: {
        input: {
          name: name.trim(),
          query: query.trim() || null,
          isSmart: !!query.trim(),
        },
      },
    })
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm physics-press"
        style={{
          backgroundColor: 'var(--foreground)',
          color: 'var(--background)',
        }}
      >
        <Plus className="w-4 h-4" />
        <span>Create Space</span>
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-backdrop-enter"
      style={{ backgroundColor: 'var(--surface-overlay)' }}
      onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}
    >
      <div
        className="rounded-xl p-6 w-full max-w-md animate-modal-enter"
        style={{
          backgroundColor: 'var(--surface-card)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <h3
            className="text-lg font-bold font-serif"
            style={{ color: 'var(--foreground)' }}
          >
            Create New Space
          </h3>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-full"
            style={{ color: 'var(--foreground-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--foreground-muted)' }}
            >
              Space Name
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Design Inspiration, Recipes"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                color: 'var(--foreground)',
              }}
            />
          </div>

          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--foreground-muted)' }}
            >
              Tag Filter (optional — makes it a smart space)
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. design, recipe, architecture"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                color: 'var(--foreground)',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full p-2 rounded-lg flex items-center justify-center font-medium text-sm physics-press"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'white',
              opacity: loading || !name.trim() ? 0.5 : 1,
            }}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Create Space'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
