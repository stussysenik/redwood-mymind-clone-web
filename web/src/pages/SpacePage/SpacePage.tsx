import { useParams } from '@redwoodjs/router'
import { Metadata } from '@redwoodjs/web'

import SpaceCell from 'src/components/SpaceCell'

const SpacePage = () => {
  const { id } = useParams()

  return (
    <>
      <Metadata title="Space" />
      <SpaceCell id={id!} />
    </>
  )
}

export default SpacePage
