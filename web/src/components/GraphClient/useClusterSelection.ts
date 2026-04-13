import { useState, useCallback, useMemo, useRef } from 'react';
import { haptic } from 'src/lib/haptics';

// Maximum hop distance for flood-fill
const MAX_HOPS = 5;

export interface UseClusterSelectionOptions {
  neighborIndex: Record<string, Set<string>>;
}

export interface UseClusterSelectionReturn {
  // Selection state
  selectedNodeIds: Set<string>;
  selectionAnchorId: string | null;
  currentHopBound: number;

  // Actions
  startSelection: (anchorId: string) => void;
  toggleInSelection: (nodeId: string) => void;
  growSelection: () => void;
  shrinkSelection: () => void;
  clearSelection: () => void;
  isNodeSelected: (nodeId: string) => boolean;

  // For persisting/restoring clusters
  setSelectedNodeIds: (ids: Set<string>) => void;
}

/**
 * BFS flood-fill from anchor node up to maxHops steps
 */
function floodFillFromAnchor(
  anchorId: string,
  neighborIndex: Record<string, Set<string>>,
  maxHops: number
): Set<string> {
  const visited = new Set<string>();
  const result = new Set<string>();

  if (!neighborIndex[anchorId]) {
    result.add(anchorId);
    return result;
  }

  // BFS queue: [nodeId, hopCount]
  const queue: Array<[string, number]> = [[anchorId, 0]];
  visited.add(anchorId);
  result.add(anchorId);

  while (queue.length > 0) {
    const [nodeId, hopCount] = queue.shift()!;

    if (hopCount >= maxHops) continue;

    const neighbors = neighborIndex[nodeId];
    if (!neighbors) continue;

    for (const neighborId of neighbors) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        result.add(neighborId);
        queue.push([neighborId, hopCount + 1]);
      }
    }
  }

  return result;
}

export function useClusterSelection({
  neighborIndex,
}: UseClusterSelectionOptions): UseClusterSelectionReturn {
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [currentHopBound, setCurrentHopBound] = useState(0);

  // Ref to track last haptic time to avoid spamming
  const lastHapticTimeRef = useRef(0);

  const triggerHaptic = useCallback((type: 'light' | 'medium' | 'selection') => {
    const now = Date.now();
    if (now - lastHapticTimeRef.current > 50) {
      haptic(type);
      lastHapticTimeRef.current = now;
    }
  }, []);

  /**
   * Start a new selection from an anchor node with default 2-hop flood-fill
   */
  const startSelection = useCallback((anchorId: string) => {
    triggerHaptic('medium');
    setSelectionAnchorId(anchorId);
    setCurrentHopBound(2);
    const floodResult = floodFillFromAnchor(anchorId, neighborIndex, 2);
    setSelectedNodeIds(floodResult);
  }, [neighborIndex, triggerHaptic]);

  /**
   * Toggle a single node in/out of the current selection
   */
  const toggleInSelection = useCallback((nodeId: string) => {
    setSelectedNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
        triggerHaptic('selection');
      } else {
        next.add(nodeId);
        triggerHaptic('light');
      }
      return next;
    });
  }, [triggerHaptic]);

  /**
   * Expand selection by one hop
   */
  const growSelection = useCallback(() => {
    if (!selectionAnchorId) return;

    setCurrentHopBound(prev => {
      const next = Math.min(prev + 1, MAX_HOPS);
      if (next !== prev) {
        triggerHaptic('light');
        const floodResult = floodFillFromAnchor(selectionAnchorId, neighborIndex, next);
        setSelectedNodeIds(floodResult);
      }
      return next;
    });
  }, [selectionAnchorId, neighborIndex, triggerHaptic]);

  /**
   * Shrink selection by one hop
   */
  const shrinkSelection = useCallback(() => {
    if (!selectionAnchorId) return;

    setCurrentHopBound(prev => {
      const next = Math.max(prev - 1, 0);
      if (next !== prev) {
        triggerHaptic('selection');
        const floodResult = floodFillFromAnchor(selectionAnchorId, neighborIndex, next);
        setSelectedNodeIds(floodResult);
      }
      return next;
    });
  }, [selectionAnchorId, neighborIndex, triggerHaptic]);

  /**
   * Clear the entire selection
   */
  const clearSelection = useCallback(() => {
    if (selectedNodeIds.size > 0) {
      triggerHaptic('selection');
    }
    setSelectedNodeIds(new Set());
    setSelectionAnchorId(null);
    setCurrentHopBound(0);
  }, [selectedNodeIds.size, triggerHaptic]);

  /**
   * Check if a node is selected
   */
  const isNodeSelected = useCallback((nodeId: string): boolean => {
    return selectedNodeIds.has(nodeId);
  }, [selectedNodeIds]);

  /**
   * Restore a selection from a persisted cluster
   */
  const restoreSelection = useCallback((ids: Set<string>) => {
    setSelectedNodeIds(ids);
    // When restoring, we don't have a single anchor - the selection is arbitrary
    setSelectionAnchorId(null);
    setCurrentHopBound(0);
  }, []);

  return useMemo(() => ({
    selectedNodeIds,
    selectionAnchorId,
    currentHopBound,
    startSelection,
    toggleInSelection,
    growSelection,
    shrinkSelection,
    clearSelection,
    isNodeSelected,
    setSelectedNodeIds: restoreSelection,
  }), [
    selectedNodeIds,
    selectionAnchorId,
    currentHopBound,
    startSelection,
    toggleInSelection,
    growSelection,
    shrinkSelection,
    clearSelection,
    isNodeSelected,
    restoreSelection,
  ]);
}

// Export floodFillFromAnchor for testing
export { floodFillFromAnchor };
