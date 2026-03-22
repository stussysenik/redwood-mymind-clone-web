import {
  createArticleCard,
  createYouTubeCard,
  createNoteCard,
  createTwitterCard,
} from 'src/mocks/cardFactory'

const card1 = createArticleCard()
const card2 = createYouTubeCard()
const card3 = createNoteCard()
const card4 = createTwitterCard()

export const standard = () => ({
  similarCards: {
    matches: [
      { id: card1.id, score: 0.97 },
      { id: card2.id, score: 0.88 },
      { id: card3.id, score: 0.75 },
      { id: card4.id, score: 0.63 },
    ],
    cards: [card1, card2, card3, card4],
  },
})

export const singleMatch = () => {
  const card = createArticleCard()
  return {
    similarCards: {
      matches: [{ id: card.id, score: 0.95 }],
      cards: [card],
    },
  }
}
