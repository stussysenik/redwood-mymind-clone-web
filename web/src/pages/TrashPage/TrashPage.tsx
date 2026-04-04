import { useState } from 'react'

import { Metadata } from '@redwoodjs/web'

import CardsCell from 'src/components/CardsCell'
import { TrashBulkActions } from 'src/components/TrashBulkActions/TrashBulkActions'

const TrashPage = () => {
  const [page, setPage] = useState(1)

  return (
    <>
      <Metadata title="Trash" />
      <div className="px-4 sm:px-6 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="font-display text-xl" style={{ color: 'var(--foreground)' }}>Trash</h2>
          <TrashBulkActions itemCount={0} />
        </div>
        <CardsCell page={page} pageSize={25} mode="TRASH" onPageChange={setPage} />
      </div>
    </>
  )
}

export default TrashPage
