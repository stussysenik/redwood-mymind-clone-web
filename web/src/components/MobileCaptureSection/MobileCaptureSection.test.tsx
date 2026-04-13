import { render, screen, waitFor } from '@redwoodjs/testing/web'
import userEvent from '@testing-library/user-event'

import MobileCaptureSection from './MobileCaptureSection'

describe('MobileCaptureSection', () => {
  it('renders the section header and Generate token button', () => {
    mockGraphQLQuery('ApiTokensQuery', () => ({ apiTokens: [] }))
    render(<MobileCaptureSection />)
    expect(
      screen.getByRole('heading', { name: /mobile capture/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /generate token/i })
    ).toBeInTheDocument()
  })

  it('shows an empty-state message when there are no tokens', async () => {
    mockGraphQLQuery('ApiTokensQuery', () => ({ apiTokens: [] }))
    render(<MobileCaptureSection />)
    await waitFor(() => {
      expect(screen.getByText(/no active tokens/i)).toBeInTheDocument()
    })
  })

  it('renders the active token list from the query', async () => {
    mockGraphQLQuery('ApiTokensQuery', () => ({
      apiTokens: [
        {
          __typename: 'ApiToken',
          id: 'tok_1',
          name: 'iPhone',
          prefix: 'abcdef01',
          scopes: ['cards:write'],
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          revokedAt: null,
        },
      ],
    }))
    render(<MobileCaptureSection />)
    await waitFor(() => {
      expect(screen.getByText('iPhone')).toBeInTheDocument()
      expect(screen.getByText(/byoa_abcdef01/)).toBeInTheDocument()
    })
  })

  it('opens the generate dialog when the button is clicked', async () => {
    const user = userEvent.setup()
    mockGraphQLQuery('ApiTokensQuery', () => ({ apiTokens: [] }))
    render(<MobileCaptureSection />)

    await user.click(screen.getByRole('button', { name: /generate token/i }))

    expect(screen.getByLabelText(/device name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^create$/i })).toBeInTheDocument()
  })

  it('generates a token and shows the plaintext exactly once', async () => {
    const user = userEvent.setup()
    mockGraphQLQuery('ApiTokensQuery', () => ({ apiTokens: [] }))
    mockGraphQLMutation('GenerateApiTokenMutation', () => ({
      generateApiToken: {
        __typename: 'GeneratedApiToken',
        plaintext: 'byoa_abcdef01_' + 'a'.repeat(32),
        token: {
          __typename: 'ApiToken',
          id: 'tok_1',
          name: 'iPhone',
          prefix: 'abcdef01',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        },
      },
    }))

    render(<MobileCaptureSection />)

    await user.click(screen.getByRole('button', { name: /generate token/i }))
    await user.clear(screen.getByLabelText(/device name/i))
    await user.type(screen.getByLabelText(/device name/i), 'iPhone')
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(screen.getByText(/byoa_abcdef01_a{32}/)).toBeInTheDocument()
    })
    expect(screen.getByText(/only time you'?ll see this/i)).toBeInTheDocument()
  })
})
