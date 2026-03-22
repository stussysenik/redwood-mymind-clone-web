import {
  createArticleCard,
  createTwitterCard,
  createYouTubeCard,
  createNoteCard,
  createImageCard,
} from 'src/mocks/cardFactory'

const cards = [
  createArticleCard(),
  createTwitterCard(),
  createYouTubeCard(),
  createNoteCard(),
  createImageCard(),
]

export const standard = () => ({
  graphData: {
    nodes: cards.map((card) => ({
      id: card.id,
      title: card.title,
      imageUrl: card.imageUrl,
      type: card.type,
      tags: card.tags,
      colors: (card.metadata as any)?.colors ?? [],
      connections: 2,
    })),
    links: [
      { source: cards[0].id, target: cards[1].id, sharedTags: ['web'], weight: 2 },
      { source: cards[0].id, target: cards[2].id, sharedTags: ['tutorial'], weight: 1 },
      { source: cards[1].id, target: cards[3].id, sharedTags: ['ai'], weight: 1 },
      { source: cards[2].id, target: cards[4].id, sharedTags: ['design'], weight: 1 },
    ],
  },
})

export const sparse = () => ({
  graphData: {
    nodes: cards.slice(0, 2).map((card) => ({
      id: card.id,
      title: card.title,
      imageUrl: card.imageUrl,
      type: card.type,
      tags: card.tags,
      colors: [],
      connections: 1,
    })),
    links: [
      { source: cards[0].id, target: cards[1].id, sharedTags: ['web'], weight: 1 },
    ],
  },
})
