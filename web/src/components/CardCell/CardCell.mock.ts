import { createMockCard, createArticleCard } from 'src/mocks/cardFactory'

export const standard = () => ({
  card: createArticleCard(),
})

export const withNote = () => ({
  card: createMockCard({
    type: 'note',
    title: 'Design Thoughts',
    content: 'Key ideas from today:\n- Simplify the navigation\n- Use consistent spacing tokens\n- Prefer system fonts for performance',
    url: null,
    imageUrl: null,
    tags: ['design', 'ux'],
  }),
})
