import { Metadata } from '@redwoodjs/web'

import SpacesCell from 'src/components/SpacesCell'
import { CreateSpace } from 'src/components/CreateSpace/CreateSpace'

const SpacesPage = () => {
  return (
    <>
      <Metadata title="Spaces" />
      <div
        className="px-4 sm:px-6 py-6"
        style={{ maxWidth: 1200, margin: '0 auto' }}
      >
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h2
              className="font-display text-2xl"
              style={{ color: 'var(--foreground)' }}
            >
              Spaces
            </h2>
            <CreateSpace />
          </div>
          <p
            className="max-w-md text-sm leading-relaxed"
            style={{ color: 'var(--foreground-muted)' }}
          >
            Organize saved work into collections.
          </p>
        </div>

        <SpacesCell />
      </div>
    </>
  )
}

export default SpacesPage
