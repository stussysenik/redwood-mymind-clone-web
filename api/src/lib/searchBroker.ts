/**
 * External search broker.
 *
 * Brave is the default fast path. Exa and Tavily remain available through the
 * same interface so the app can route by intent later without changing callers.
 */

export type SearchProvider = 'brave' | 'exa' | 'tavily'

export interface SearchBrokerRequest {
  query: string
  provider?: SearchProvider
  topK?: number
  freshnessDays?: number
}

export interface SearchBrokerResult {
  provider: SearchProvider
  title: string
  url: string
  snippet: string
  publishedAt?: string
  score?: number
}

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY
const EXA_API_KEY = process.env.EXA_API_KEY
const TAVILY_API_KEY = process.env.TAVILY_API_KEY

export function getAvailableSearchProviders(): SearchProvider[] {
  const providers: SearchProvider[] = []
  if (BRAVE_API_KEY) providers.push('brave')
  if (EXA_API_KEY) providers.push('exa')
  if (TAVILY_API_KEY) providers.push('tavily')
  return providers
}

function resolveProvider(provider?: SearchProvider): SearchProvider {
  if (provider) return provider
  if (BRAVE_API_KEY) return 'brave'
  if (EXA_API_KEY) return 'exa'
  return 'tavily'
}

async function searchBrave(
  query: string,
  topK: number,
  freshnessDays?: number
): Promise<SearchBrokerResult[]> {
  if (!BRAVE_API_KEY) {
    throw new Error('BRAVE_SEARCH_API_KEY is not configured')
  }

  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(topK))
  if (freshnessDays) {
    url.searchParams.set('freshness', `${freshnessDays}d`)
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': BRAVE_API_KEY,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Brave search error: ${response.status} - ${error}`)
  }

  const payload = (await response.json()) as {
    web?: {
      results?: Array<{
        title?: string
        url?: string
        description?: string
        page_age?: string
      }>
    }
  }

  return (payload.web?.results || []).map((result) => ({
    provider: 'brave' as const,
    title: result.title || result.url || 'Untitled',
    url: result.url || '',
    snippet: result.description || '',
    publishedAt: result.page_age,
  }))
}

async function searchExa(
  query: string,
  topK: number
): Promise<SearchBrokerResult[]> {
  if (!EXA_API_KEY) {
    throw new Error('EXA_API_KEY is not configured')
  }

  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': EXA_API_KEY,
    },
    body: JSON.stringify({
      query,
      numResults: topK,
      type: 'auto',
      contents: {
        text: true,
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Exa search error: ${response.status} - ${error}`)
  }

  const payload = (await response.json()) as {
    results?: Array<{
      title?: string
      url?: string
      text?: string
      publishedDate?: string
      score?: number
    }>
  }

  return (payload.results || []).map((result) => ({
    provider: 'exa' as const,
    title: result.title || result.url || 'Untitled',
    url: result.url || '',
    snippet: (result.text || '').slice(0, 300),
    publishedAt: result.publishedDate,
    score: result.score,
  }))
}

async function searchTavily(
  query: string,
  topK: number,
  freshnessDays?: number
): Promise<SearchBrokerResult[]> {
  if (!TAVILY_API_KEY) {
    throw new Error('TAVILY_API_KEY is not configured')
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      max_results: topK,
      days: freshnessDays,
      include_answer: false,
      include_raw_content: false,
      search_depth: 'basic',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Tavily search error: ${response.status} - ${error}`)
  }

  const payload = (await response.json()) as {
    results?: Array<{
      title?: string
      url?: string
      content?: string
      published_date?: string
      score?: number
    }>
  }

  return (payload.results || []).map((result) => ({
    provider: 'tavily' as const,
    title: result.title || result.url || 'Untitled',
    url: result.url || '',
    snippet: result.content || '',
    publishedAt: result.published_date,
    score: result.score,
  }))
}

export async function runSearchBroker(
  request: SearchBrokerRequest
): Promise<SearchBrokerResult[]> {
  const topK = Math.max(1, Math.min(request.topK || 8, 20))
  const provider = resolveProvider(request.provider)

  switch (provider) {
    case 'brave':
      return searchBrave(request.query, topK, request.freshnessDays)
    case 'exa':
      return searchExa(request.query, topK)
    case 'tavily':
      return searchTavily(request.query, topK, request.freshnessDays)
    default:
      return []
  }
}
