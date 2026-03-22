import { Metadata } from '@redwoodjs/web'

const HomePage = () => {
  return (
    <>
      <Metadata title="Home" description="Your saved knowledge" />
      <div className="px-4 sm:px-6 py-6">
        {/* TagScroller placeholder */}
        <div className="mb-4 overflow-x-auto hide-scrollbar">
          <div className="flex gap-2">
            <span className="tag-pill tag-orange">All</span>
          </div>
        </div>

        {/* CardsCell will go here */}
        <div className="text-center py-20" style={{ color: 'var(--foreground-muted)' }}>
          <p className="font-serif text-xl mb-2">Your mind, organized</p>
          <p className="text-sm">Save articles, images, notes, and more</p>
        </div>
      </div>
    </>
  )
}

export default HomePage
