import { floodFillFromAnchor } from './useClusterSelection';

describe('floodFillFromAnchor', () => {
  // Simple chain: A - B - C - D - E
  const chainIndex: Record<string, Set<string>> = {
    'A': new Set(['B']),
    'B': new Set(['A', 'C']),
    'C': new Set(['B', 'D']),
    'D': new Set(['C', 'E']),
    'E': new Set(['D']),
  };

  // Star: A connected to B, C, D, E
  const starIndex: Record<string, Set<string>> = {
    'A': new Set(['B', 'C', 'D', 'E']),
    'B': new Set(['A']),
    'C': new Set(['A']),
    'D': new Set(['A']),
    'E': new Set(['A']),
  };

  // Disconnected: A-B and C-D are separate components
  const disconnectedIndex: Record<string, Set<string>> = {
    'A': new Set(['B']),
    'B': new Set(['A']),
    'C': new Set(['D']),
    'D': new Set(['C']),
  };

  it('returns just the anchor for 0 hops', () => {
    const result = floodFillFromAnchor('A', chainIndex, 0);
    expect(result).toEqual(new Set(['A']));
  });

  it('returns anchor + immediate neighbors for 1 hop', () => {
    const result = floodFillFromAnchor('C', chainIndex, 1);
    expect(result).toEqual(new Set(['C', 'B', 'D']));
  });

  it('returns anchor + neighbors + their neighbors for 2 hops', () => {
    const result = floodFillFromAnchor('C', chainIndex, 2);
    expect(result).toEqual(new Set(['C', 'B', 'D', 'A', 'E']));
  });

  it('returns full chain for 5 hops on a 5-node chain', () => {
    const result = floodFillFromAnchor('A', chainIndex, 5);
    expect(result).toEqual(new Set(['A', 'B', 'C', 'D', 'E']));
  });

  it('handles star topology correctly', () => {
    // From center A with 2 hops should reach all
    const result = floodFillFromAnchor('A', starIndex, 2);
    expect(result).toEqual(new Set(['A', 'B', 'C', 'D', 'E']));
  });

  it('handles star from leaf node', () => {
    // From B, 1 hop should reach A, 2 hops should reach all through A
    const result1 = floodFillFromAnchor('B', starIndex, 1);
    expect(result1).toEqual(new Set(['B', 'A']));

    const result2 = floodFillFromAnchor('B', starIndex, 2);
    expect(result2).toEqual(new Set(['B', 'A', 'C', 'D', 'E']));
  });

  it('does not cross disconnected components', () => {
    // From A, even with 5 hops, should not reach C or D
    const result = floodFillFromAnchor('A', disconnectedIndex, 5);
    expect(result).toEqual(new Set(['A', 'B']));
    expect(result.has('C')).toBe(false);
    expect(result.has('D')).toBe(false);
  });

  it('handles empty graph (anchor not in index)', () => {
    const result = floodFillFromAnchor('X', chainIndex, 2);
    expect(result).toEqual(new Set(['X']));
  });

  it('handles single node graph', () => {
    const singleIndex: Record<string, Set<string>> = {
      'A': new Set(),
    };
    const result = floodFillFromAnchor('A', singleIndex, 5);
    expect(result).toEqual(new Set(['A']));
  });

  it('handles complex graph with multiple paths', () => {
    // Diamond: A -> B -> D, A -> C -> D
    const diamondIndex: Record<string, Set<string>> = {
      'A': new Set(['B', 'C']),
      'B': new Set(['A', 'D']),
      'C': new Set(['A', 'D']),
      'D': new Set(['B', 'C']),
    };

    const result = floodFillFromAnchor('A', diamondIndex, 2);
    expect(result).toEqual(new Set(['A', 'B', 'C', 'D']));
  });

  it('handles cycle in graph', () => {
    // Triangle: A - B - C - A
    const triangleIndex: Record<string, Set<string>> = {
      'A': new Set(['B', 'C']),
      'B': new Set(['A', 'C']),
      'C': new Set(['A', 'B']),
    };

    const result = floodFillFromAnchor('A', triangleIndex, 1);
    expect(result).toEqual(new Set(['A', 'B', 'C']));

    // With more hops, should still be just the 3 nodes
    const result2 = floodFillFromAnchor('A', triangleIndex, 5);
    expect(result2).toEqual(new Set(['A', 'B', 'C']));
  });
});
