import {
  createMockCard,
  createTwitterCard,
  createYouTubeCard,
  createArticleCard,
  createNoteCard,
  createImageCard,
} from 'src/mocks/cardFactory'

export const standard = () => ({
  cards: {
    cards: [
      createArticleCard(),
      createTwitterCard(),
      createYouTubeCard(),
      createNoteCard(),
      createImageCard(),
      createMockCard({ title: 'Extra article for padding', tags: ['extra'] }),
    ],
    total: 6,
    page: 1,
    pageSize: 25,
    hasMore: false,
  },
})

export const withPagination = () => ({
  cards: {
    cards: [
      createArticleCard(),
      createTwitterCard(),
      createYouTubeCard(),
    ],
    total: 42,
    page: 1,
    pageSize: 25,
    hasMore: true,
  },
})
