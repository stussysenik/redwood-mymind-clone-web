import { Metadata } from '@redwoodjs/web'

import CardsCell from 'src/components/CardsCell'

const HomePage = () => {
  return (
    <>
      <Metadata title="Home" description="Your saved knowledge" />
      <CardsCell page={1} pageSize={25} mode="DEFAULT" />
    </>
  )
}

export default HomePage
