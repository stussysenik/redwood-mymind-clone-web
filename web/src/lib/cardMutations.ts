/**
 * BYOA - Shared card mutations and optimistic action hook.
 */
import type { Card } from 'src/lib/types'

export const ARCHIVE_CARD_MUTATION = gql`
  mutation ArchiveCardMutation($id: String!) {
    archiveCard(id: $id) {
      id
      archivedAt
    }
  }
`

export const UNARCHIVE_CARD_MUTATION = gql`
  mutation UnarchiveCardMutation($id: String!) {
    unarchiveCard(id: $id) {
      id
      archivedAt
    }
  }
`

export const RESTORE_CARD_MUTATION = gql`
  mutation RestoreCardMutation($id: String!) {
    restoreCard(id: $id) {
      id
      deletedAt
    }
  }
`

/**
 * Creates an optimistic card action handler.
 * Hides the card immediately, rolls back on failure.
 */
export function makeOptimisticCardAction(
  mutationFn: (opts: { variables: { id: string } }) => Promise<unknown>,
  selectedCard: Card | null,
  setSelectedCard: (c: Card | null) => void,
  setHiddenCardIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  return (id: string) => {
    const prev = selectedCard
    setHiddenCardIds((s) => new Set(s).add(id))
    if (prev?.id === id) setSelectedCard(null)

    void mutationFn({ variables: { id } }).catch(() => {
      setHiddenCardIds((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
      if (prev?.id === id) setSelectedCard(prev)
    })
  }
}
