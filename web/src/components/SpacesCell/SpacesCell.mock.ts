import { createMockSpace, createSmartSpace } from 'src/mocks/spaceFactory'

export const standard = () => ({
  spaces: [
    createMockSpace({ name: 'Design Inspiration', query: '#design', cardCount: 12 }),
    createSmartSpace({ name: 'Recent Articles', query: 'type:article', cardCount: 24 }),
    createMockSpace({ name: 'Reading List', query: '#reading', cardCount: 8 }),
    createSmartSpace({ name: 'Tech Videos', query: 'type:video tag:tech', cardCount: 15 }),
    createMockSpace({ name: 'Product Research', query: '#product', cardCount: 5 }),
    createMockSpace({ name: 'Architecture Notes', query: '#architecture', cardCount: 3 }),
  ],
})

export const singleSpace = () => ({
  spaces: [
    createMockSpace({ name: 'Design Inspiration', query: '#design', cardCount: 12 }),
  ],
})
