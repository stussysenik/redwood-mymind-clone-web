import type { Card, CardMetadata, CardType } from 'src/lib/types'

let idCounter = 0
function nextId(): string {
  return `mock-card-${++idCounter}`
}

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  overrides: Partial<T>
): T {
  const result = { ...base } as Record<string, unknown>
  for (const key of Object.keys(overrides)) {
    const val = overrides[key]
    if (
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        val as Record<string, unknown>
      )
    } else {
      result[key] = val
    }
  }
  return result as T
}

export function createMockCard(overrides: Partial<Card> = {}): Card {
  const base: Card = {
    id: nextId(),
    userId: 'user-123',
    type: 'article',
    title: 'Understanding Modern Web Architecture',
    content:
      'A deep dive into the latest patterns in frontend and backend development.',
    url: 'https://example.com/modern-web-architecture',
    imageUrl: 'https://picsum.photos/seed/article1/600/400',
    metadata: {
      summary:
        'An exploration of modern web architecture patterns including micro-frontends, serverless, and edge computing.',
      colors: ['#3B82F6', '#1E40AF'],
      author: 'Jane Developer',
      enrichmentStage: 'complete',
      enrichmentSource: 'dspy',
    },
    tags: ['web', 'architecture', 'frontend'],
    createdAt: '2025-03-15T10:30:00Z',
    updatedAt: '2025-03-15T10:30:00Z',
    deletedAt: null,
    archivedAt: null,
  }
  return deepMerge(base as unknown as Record<string, unknown>, overrides as unknown as Record<string, unknown>) as unknown as Card
}

export function createTwitterCard(overrides: Partial<Card> = {}): Card {
  return createMockCard({
    type: 'social',
    title: 'The future of AI is not about replacing humans — it\'s about augmenting human creativity.',
    content:
      'The future of AI is not about replacing humans — it\'s about augmenting human creativity. We\'re building tools that amplify what people can do, not replace who they are.',
    url: 'https://x.com/elonmusk/status/1234567890',
    imageUrl: 'https://picsum.photos/seed/tweet1/600/400',
    metadata: {
      platform: 'twitter',
      authorName: 'Elon Musk',
      authorHandle: 'elonmusk',
      authorAvatar: 'https://picsum.photos/seed/avatar1/48/48',
      enrichmentStage: 'complete',
      engagement: { likes: 42000, retweets: 8500, views: 1200000 },
      images: [
        'https://picsum.photos/seed/tweet1/600/400',
        'https://picsum.photos/seed/tweet2/600/400',
      ],
    },
    tags: ['ai', 'technology', 'future'],
    ...overrides,
  })
}

export function createYouTubeCard(overrides: Partial<Card> = {}): Card {
  return createMockCard({
    type: 'video',
    title: 'Building a Full-Stack App with RedwoodJS',
    content: 'Learn how to build a modern full-stack application using RedwoodJS, GraphQL, and Prisma.',
    url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
    imageUrl: 'https://picsum.photos/seed/yt1/640/360',
    metadata: {
      platform: 'youtube',
      duration: '14:32',
      viewCount: '125,432',
      authorName: 'Fireship',
      authorHandle: 'Fireship',
      authorAvatar: 'https://picsum.photos/seed/ytavatar/48/48',
      enrichmentStage: 'complete',
    },
    tags: ['redwoodjs', 'tutorial', 'fullstack'],
    ...overrides,
  })
}

export function createMovieCard(overrides: Partial<Card> = {}): Card {
  return createMockCard({
    type: 'movie',
    title: 'Interstellar',
    content: 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.',
    url: 'https://imdb.com/title/tt0816692',
    imageUrl: 'https://picsum.photos/seed/movie1/300/450',
    metadata: {
      platform: 'imdb',
      rating: '8.7',
      year: '2014',
      director: 'Christopher Nolan',
      enrichmentStage: 'complete',
    },
    tags: ['sci-fi', 'space', 'nolan'],
    ...overrides,
  })
}

export function createRedditCard(overrides: Partial<Card> = {}): Card {
  return createMockCard({
    type: 'social',
    title: 'TIL that honeybees can recognize human faces',
    content: 'Researchers found that honeybees can be trained to recognize and remember human faces, similar to how we recognize faces.',
    url: 'https://reddit.com/r/todayilearned/comments/abc123',
    imageUrl: 'https://picsum.photos/seed/reddit1/600/400',
    metadata: {
      platform: 'reddit',
      subreddit: 'todayilearned',
      upvotes: '15.2k',
      comments: '432',
      authorName: 'u/science_enthusiast',
      enrichmentStage: 'complete',
    },
    tags: ['science', 'nature', 'til'],
    ...overrides,
  })
}

export function createInstagramCard(overrides: Partial<Card> = {}): Card {
  return createMockCard({
    type: 'social',
    title: 'Golden hour in the mountains',
    content: 'Caught the most incredible sunset from the summit today.',
    url: 'https://instagram.com/p/CxYz123',
    imageUrl: 'https://picsum.photos/seed/ig1/600/600',
    metadata: {
      platform: 'instagram',
      authorName: 'Nature Photography',
      authorHandle: 'naturephoto',
      authorAvatar: 'https://picsum.photos/seed/igavatar/48/48',
      isCarousel: true,
      slideCount: 4,
      carouselExtracted: true,
      images: [
        'https://picsum.photos/seed/ig1/600/600',
        'https://picsum.photos/seed/ig2/600/600',
        'https://picsum.photos/seed/ig3/600/600',
        'https://picsum.photos/seed/ig4/600/600',
      ],
      enrichmentStage: 'complete',
    },
    tags: ['photography', 'sunset', 'mountains'],
    ...overrides,
  })
}

export function createLetterboxdCard(overrides: Partial<Card> = {}): Card {
  return createMockCard({
    type: 'movie',
    title: 'Parasite',
    content: 'A masterclass in genre-bending storytelling.',
    url: 'https://letterboxd.com/film/parasite-2019',
    imageUrl: 'https://picsum.photos/seed/lb1/300/450',
    metadata: {
      platform: 'letterboxd',
      rating: '4.5',
      year: '2019',
      director: 'Bong Joon-ho',
      enrichmentStage: 'complete',
    },
    tags: ['thriller', 'korean', 'oscar'],
    ...overrides,
  })
}

export function createGoodreadsCard(overrides: Partial<Card> = {}): Card {
  return createMockCard({
    type: 'book',
    title: 'Project Hail Mary',
    content: 'A lone astronaut must save the earth from disaster in this propulsive interstellar adventure.',
    url: 'https://goodreads.com/book/show/54493401',
    imageUrl: 'https://picsum.photos/seed/book1/300/450',
    metadata: {
      author: 'Andy Weir',
      rating: '4.52',
      enrichmentStage: 'complete',
    },
    tags: ['sci-fi', 'fiction', 'space'],
    ...overrides,
  })
}

export function createAmazonCard(overrides: Partial<Card> = {}): Card {
  return createMockCard({
    type: 'product',
    title: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
    content: 'Industry-leading noise cancellation with Auto NC Optimizer.',
    url: 'https://amazon.com/dp/B09XS7JWHH',
    imageUrl: 'https://picsum.photos/seed/amazon1/400/400',
    metadata: {
      platform: 'amazon',
      price: '$348.00',
      rating: '4.4',
      enrichmentStage: 'complete',
    },
    tags: ['headphones', 'audio', 'electronics'],
    ...overrides,
  })
}

export function createStoryGraphCard(overrides: Partial<Card> = {}): Card {
  return createMockCard({
    type: 'book',
    title: 'Tomorrow, and Tomorrow, and Tomorrow',
    content: 'A dazzling and imaginative novel about the lifelong bond between two creative collaborators.',
    url: 'https://app.thestorygraph.com/books/abc-123',
    imageUrl: 'https://picsum.photos/seed/sg1/300/450',
    metadata: {
      platform: 'storygraph',
      author: 'Gabrielle Zevin',
      rating: '4.18',
      enrichmentStage: 'complete',
    },
    tags: ['fiction', 'gaming', 'friendship'],
    ...overrides,
  })
}

export function createArticleCard(overrides: Partial<Card> = {}): Card {
  return createMockCard({
    type: 'article',
    title: 'The Rise of Edge Computing',
    content: 'Edge computing is transforming how applications are built and deployed.',
    url: 'https://example.com/edge-computing',
    imageUrl: 'https://picsum.photos/seed/art1/600/400',
    metadata: {
      summary: 'How edge computing is changing the landscape of web development.',
      author: 'Tech Writer',
      readingTime: 8,
      publishedAt: '2025-02-20T09:00:00Z',
      enrichmentStage: 'complete',
    },
    tags: ['edge', 'cloud', 'infrastructure'],
    ...overrides,
  })
}

export function createNoteCard(overrides: Partial<Card> = {}): Card {
  return createMockCard({
    type: 'note',
    title: 'Meeting Notes — Q1 Planning',
    content:
      'Key takeaways:\n- Focus on performance optimization\n- Launch new dashboard by March\n- Hire two frontend engineers',
    url: null,
    imageUrl: null,
    metadata: {
      enrichmentStage: 'complete',
    },
    tags: ['meeting', 'planning', 'q1'],
    ...overrides,
  })
}

export function createImageCard(overrides: Partial<Card> = {}): Card {
  return createMockCard({
    type: 'image',
    title: 'Design Inspiration — Minimal Dashboard',
    content: null,
    url: null,
    imageUrl: 'https://picsum.photos/seed/img1/800/600',
    metadata: {
      colors: ['#F8F9FA', '#212529', '#6C757D'],
      objects: ['dashboard', 'chart', 'sidebar'],
      ocrText: 'Monthly Revenue: $42,500',
      enrichmentStage: 'complete',
    },
    tags: ['design', 'ui', 'dashboard'],
    ...overrides,
  })
}

export function createProcessingCard(overrides: Partial<Card> = {}): Card {
  return createMockCard({
    title: null,
    content: null,
    metadata: {
      processing: true,
      enrichmentStage: 'analyzing',
      enrichmentTiming: {
        startedAt: Date.now() - 3000,
        estimatedTotalMs: 8000,
        platform: 'unknown',
      },
    },
    tags: [],
    ...overrides,
  })
}
