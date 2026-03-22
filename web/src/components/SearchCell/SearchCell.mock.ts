import {
  createArticleCard,
  createTwitterCard,
  createYouTubeCard,
  createNoteCard,
} from 'src/mocks/cardFactory'

export const standard = () => ({
  searchCards: {
    cards: [
      createArticleCard(),
      createTwitterCard(),
      createYouTubeCard(),
      createNoteCard(),
    ],
    total: 4,
    mode: 'semantic',
  },
})

export const singleResult = () => ({
  searchCards: {
    cards: [createArticleCard()],
    total: 1,
    mode: 'keyword',
  },
})
