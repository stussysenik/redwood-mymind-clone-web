import { Metadata } from '@redwoodjs/web'

import SpacesCell from 'src/components/SpacesCell'

const SpacesPage = () => {
  return (
    <>
      <Metadata title="Spaces" />
      <div className="px-4 sm:px-6 py-6">
        <h2 className="font-serif text-xl mb-4" style={{ color: 'var(--foreground)' }}>Spaces</h2>
        <SpacesCell />
      </div>
    </>
  )
}

export default SpacesPage
