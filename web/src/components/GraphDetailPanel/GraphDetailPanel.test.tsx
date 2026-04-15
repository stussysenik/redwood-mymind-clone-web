import userEvent from '@testing-library/user-event'

import { render, screen } from '@redwoodjs/testing/web'

import { GraphDetailPanel, type ConnectionItem } from './GraphDetailPanel'

const headItem: ConnectionItem = {
  id: 'head',
  title: 'Focused Card',
  type: 'article',
  color: '#6B7280',
  sharedTags: [],
  weight: 3,
}

const connections: ConnectionItem[] = [
  { id: 'a', title: 'Connection A', type: 'note', color: '#EAB308', sharedTags: [], weight: 2 },
  { id: 'b', title: 'Connection B', type: 'video', color: '#EF4444', sharedTags: ['ui'], weight: 1 },
  { id: 'c', title: 'Connection C', type: 'image', color: '#A855F7', sharedTags: [], weight: 4 },
]

describe('GraphDetailPanel', () => {
  it('renders the head row at index 0 and every connection row (task 2.5)', () => {
    render(
      <GraphDetailPanel
        headItem={headItem}
        connections={connections}
        onClose={() => undefined}
        onCardClick={() => undefined}
      />
    )
    // Head row button exists with the focused card's title.
    expect(screen.getByRole('button', { name: /open focused card/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open connection a/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open connection b/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open connection c/i })).toBeInTheDocument()
  })

  it('does not render any "Tap again to open" affordance', () => {
    render(
      <GraphDetailPanel
        headItem={headItem}
        connections={connections}
        onClose={() => undefined}
        onCardClick={() => undefined}
      />
    )
    expect(screen.queryByText(/tap again to open/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/tap a connection to select/i)).not.toBeInTheDocument()
  })

  it('fires onCardClick once on the first click of a connection row (task 3.4)', async () => {
    const user = userEvent.setup()
    const onCardClick = jest.fn()
    render(
      <GraphDetailPanel
        headItem={headItem}
        connections={connections}
        onClose={() => undefined}
        onCardClick={onCardClick}
      />
    )
    await user.click(screen.getByRole('button', { name: /open connection b/i }))
    expect(onCardClick).toHaveBeenCalledTimes(1)
    expect(onCardClick).toHaveBeenCalledWith('b')
  })

  it('fires onCardClick with the focused id when the head row is clicked (task 4.6)', async () => {
    const user = userEvent.setup()
    const onCardClick = jest.fn()
    render(
      <GraphDetailPanel
        headItem={headItem}
        connections={connections}
        onClose={() => undefined}
        onCardClick={onCardClick}
      />
    )
    const headRowButton = screen.getByRole('button', { name: /open focused card/i })
    expect(headRowButton).toHaveAttribute('aria-current', 'true')
    await user.click(headRowButton)
    expect(onCardClick).toHaveBeenCalledWith('head')
  })

  it('clamps ArrowDown at the last row without throwing (task 5.3)', async () => {
    const user = userEvent.setup()
    const onCardClick = jest.fn()
    render(
      <GraphDetailPanel
        headItem={headItem}
        connections={connections}
        onClose={() => undefined}
        onCardClick={onCardClick}
      />
    )
    // items.length === 4 (head + 3). Pressing ArrowDown 10 times should land
    // on the last row and stay there, never call onCardClick.
    for (let i = 0; i < 10; i++) {
      await user.keyboard('{ArrowDown}')
    }
    expect(onCardClick).not.toHaveBeenCalled()
    // Last row now has aria-current.
    expect(screen.getByRole('button', { name: /open connection c/i })).toHaveAttribute(
      'aria-current',
      'true'
    )
  })

  it('opens the active row on Enter (task 5.4)', async () => {
    const user = userEvent.setup()
    const onCardClick = jest.fn()
    render(
      <GraphDetailPanel
        headItem={headItem}
        connections={connections}
        onClose={() => undefined}
        onCardClick={onCardClick}
      />
    )
    await user.keyboard('{ArrowDown}') // move to row 1 (connection a)
    await user.keyboard('{Enter}')
    expect(onCardClick).toHaveBeenCalledWith('a')
  })

  it('jumps to bounds with Home and End (task 5.5)', async () => {
    const user = userEvent.setup()
    render(
      <GraphDetailPanel
        headItem={headItem}
        connections={connections}
        onClose={() => undefined}
        onCardClick={() => undefined}
      />
    )
    await user.keyboard('{End}')
    expect(screen.getByRole('button', { name: /open connection c/i })).toHaveAttribute(
      'aria-current',
      'true'
    )
    await user.keyboard('{Home}')
    expect(screen.getByRole('button', { name: /open focused card/i })).toHaveAttribute(
      'aria-current',
      'true'
    )
  })

  it('renders the empty-state label and disables prev/next when there are no connections (task 6.2)', async () => {
    const user = userEvent.setup()
    const onCardClick = jest.fn()
    render(
      <GraphDetailPanel
        headItem={headItem}
        connections={[]}
        onClose={() => undefined}
        onCardClick={onCardClick}
      />
    )
    expect(screen.getByText(/no connections yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous row/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /next row/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /open focused card/i }))
    expect(onCardClick).toHaveBeenCalledWith('head')
  })

  it('keeps activeIdx at 0 and never calls onCardClick on arrow keys for a single-item list (task 9.4)', async () => {
    const user = userEvent.setup()
    const onCardClick = jest.fn()
    render(
      <GraphDetailPanel
        headItem={headItem}
        connections={[]}
        onClose={() => undefined}
        onCardClick={onCardClick}
      />
    )
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{End}')
    expect(onCardClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /open focused card/i })).toHaveAttribute(
      'aria-current',
      'true'
    )
  })

  it('clamps activeIdx at 0 when ArrowUp is pressed many times (task 9.3)', async () => {
    const user = userEvent.setup()
    const onCardClick = jest.fn()
    render(
      <GraphDetailPanel
        headItem={headItem}
        connections={connections}
        onClose={() => undefined}
        onCardClick={onCardClick}
      />
    )
    // Already at 0; 20 ArrowUps should stay at 0 (never go negative).
    for (let i = 0; i < 20; i++) {
      await user.keyboard('{ArrowUp}')
    }
    expect(onCardClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /open focused card/i })).toHaveAttribute(
      'aria-current',
      'true'
    )
    // Now drive to End and verify ArrowRight 20 more times doesn't overflow.
    await user.keyboard('{End}')
    for (let i = 0; i < 20; i++) {
      await user.keyboard('{ArrowRight}')
    }
    expect(screen.getByRole('button', { name: /open connection c/i })).toHaveAttribute(
      'aria-current',
      'true'
    )
  })

  it('announces the focused node via an aria-live region', () => {
    render(
      <GraphDetailPanel
        headItem={headItem}
        connections={connections}
        onClose={() => undefined}
        onCardClick={() => undefined}
      />
    )
    expect(
      screen.getByText(/showing focused card\. 3 connections\./i)
    ).toBeInTheDocument()
  })
})
