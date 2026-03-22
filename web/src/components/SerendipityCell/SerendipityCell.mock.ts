import {
  createArticleCard,
  createTwitterCard,
  createYouTubeCard,
  createNoteCard,
  createImageCard,
} from 'src/mocks/cardFactory'

export const standard = () => ({
  randomCards: [
    createArticleCard(),
    createTwitterCard(),
    createYouTubeCard(),
    createNoteCard(),
    createImageCard(),
  ],
})

export const singleCard = () => ({
  randomCards: [createArticleCard()],
})
