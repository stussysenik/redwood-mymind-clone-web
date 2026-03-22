import { useParams } from '@redwoodjs/router'
import { Metadata } from '@redwoodjs/web'

const SpacePage = () => {
  const { id } = useParams()

  return (
    <>
      <Metadata title="Space" />
      <div className="px-4 sm:px-6 py-6">
        {/* SpaceCell will go here with id={id} */}
        <div className="text-center py-20" style={{ color: 'var(--foreground-muted)' }}>
          <p className="text-sm">Space content will appear here</p>
        </div>
      </div>
    </>
  )
}

export default SpacePage
