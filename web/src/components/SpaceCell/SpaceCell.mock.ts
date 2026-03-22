import { createMockSpace, createSmartSpace } from 'src/mocks/spaceFactory'
import {
  createArticleCard,
  createTwitterCard,
  createYouTubeCard,
  createNoteCard,
  createImageCard,
  createMockCard,
} from 'src/mocks/cardFactory'

const spaceCards = [
  createArticleCard(),
  createTwitterCard(),
  createYouTubeCard(),
  createNoteCard(),
  createImageCard(),
  createMockCard({ title: 'Additional saved resource', tags: ['misc'] }),
]

const space = createMockSpace({
  name: 'Design Inspiration',
  query: '#design',
  cardCount: spaceCards.length,
})

export const standard = () => ({
  space: {
    ...space,
    cards: spaceCards.map((card) => ({
      id: card.id,
      type: card.type,
      title: card.title,
      imageUrl: card.imageUrl,
      metadata: card.metadata,
      tags: card.tags,
      createdAt: card.createdAt,
    })),
  },
})

export const smartSpace = () => {
  const smartCards = [createArticleCard(), createArticleCard(), createArticleCard()]
  const smart = createSmartSpace({
    name: 'Recent Articles',
    query: 'type:article',
    cardCount: smartCards.length,
  })
  return {
    space: {
      ...smart,
      cards: smartCards.map((card) => ({
        id: card.id,
        type: card.type,
        title: card.title,
        imageUrl: card.imageUrl,
        metadata: card.metadata,
        tags: card.tags,
        createdAt: card.createdAt,
      })),
    },
  }
}
