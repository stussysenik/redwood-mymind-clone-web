import { useEffect } from 'react'

import { useAuth } from 'src/auth'
import type { FeedCardRecord } from 'src/components/FeedCellShared/FeedCellShared'
import { getSupabaseBrowser } from 'src/lib/supabase'
import { rowToCard, type Card, type CardRow } from 'src/lib/types'

export function cardToFeedCardRecord(card: Card): FeedCardRecord {
  return {
    id: card.id,
    userId: card.userId,
    type: card.type,
    title: card.title,
    content: card.content,
    url: card.url,
    imageUrl: card.imageUrl,
    metadata: card.metadata,
    tags: card.tags,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    archivedAt: card.archivedAt,
    deletedAt: card.deletedAt,
  }
}

export function rowToFeedCardRecord(row: CardRow): FeedCardRecord {
  return cardToFeedCardRecord(rowToCard(row))
}

export function mergeFeedCardRecord<T extends FeedCardRecord>(
  base: T,
  patch: Partial<FeedCardRecord>
): T {
  return {
    ...base,
    ...patch,
    metadata: {
      ...(base.metadata ?? {}),
      ...(patch.metadata ?? {}),
    },
    tags: patch.tags ?? base.tags ?? [],
  }
}

export function useRealtimeCardUpdates(
  onCardUpdate: (card: FeedCardRecord) => void,
  enabled = true
) {
  const { currentUser } = useAuth()

  useEffect(() => {
    const supabaseBrowser = getSupabaseBrowser()

    if (!enabled || !supabaseBrowser || !currentUser?.id) {
      return
    }

    const channel = supabaseBrowser
      .channel(`cards-live-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cards',
          filter: `user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          if (!payload.new) {
            return
          }

          onCardUpdate(rowToFeedCardRecord(payload.new as CardRow))
        }
      )
      .subscribe()

    const pollRecentCards = async () => {
      const { data, error } = await supabaseBrowser
        .from('cards')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('updated_at', { ascending: false })
        .limit(20)

      if (error || !data) {
        return
      }

      for (const row of data) {
        onCardUpdate(rowToFeedCardRecord(row as CardRow))
      }
    }

    void pollRecentCards()
    const pollInterval = window.setInterval(() => {
      void pollRecentCards()
    }, 4000)

    return () => {
      window.clearInterval(pollInterval)
      supabaseBrowser.removeChannel(channel)
    }
  }, [currentUser?.id, enabled, onCardUpdate])
}
