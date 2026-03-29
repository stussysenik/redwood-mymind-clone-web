import {
  createArticleCard,
  createYouTubeCard,
  createNoteCard,
  createTwitterCard,
} from 'src/mocks/cardFactory'

export const standard = () => ({
  similarCards: [
    createArticleCard(),
    createYouTubeCard(),
    createNoteCard(),
    createTwitterCard(),
  ],
})

export const singleMatch = () => ({
  similarCards: [createArticleCard()],
})
