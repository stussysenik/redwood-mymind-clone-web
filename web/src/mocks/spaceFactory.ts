import type { SpaceWithCount } from 'src/lib/types'

let spaceCounter = 0
function nextId(): string {
  return `mock-space-${++spaceCounter}`
}

export function createMockSpace(
  overrides: Partial<SpaceWithCount> = {}
): SpaceWithCount {
  return {
    id: nextId(),
    userId: 'user-123',
    name: 'Design Inspiration',
    query: '#design',
    isSmart: false,
    createdAt: '2025-03-10T08:00:00Z',
    cardCount: 12,
    ...overrides,
  }
}

export function createSmartSpace(
  overrides: Partial<SpaceWithCount> = {}
): SpaceWithCount {
  return createMockSpace({
    name: 'Recent Articles',
    query: 'type:article',
    isSmart: true,
    cardCount: 24,
    ...overrides,
  })
}
