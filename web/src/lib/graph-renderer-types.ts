/**
 * Graph Renderer Backend Contract
 *
 * All three renderer modules (Canvas, WebGL, Three) implement GraphRendererProps.
 * GraphClient lazy-imports the correct module based on the user's saved preference,
 * so Three.js never ships to a Canvas user.
 */

import type { GraphNode } from 'src/lib/graph'

export type RendererBackend = 'canvas' | 'webgl' | 'three'
export type GraphDimension = '2d' | '3d'

export interface GraphClientNode {
  id: string
  title?: string | null
  imageUrl?: string | null
  type: string
  tags: string[] | readonly string[]
  colors?: string[] | readonly string[] | null
  connections: number
  color?: string
}

export interface GraphClientLink {
  source: string
  target: string
  sharedTags: string[] | readonly string[]
  weight: number
}

export interface GraphRendererProps {
  nodes: readonly GraphClientNode[]
  links: readonly GraphClientLink[]
  dimensions: { width: number; height: number }
  focusedNodeId: string | null
  minWeight: number
  darkMode: boolean
  onNodeClick: (id: string) => void
  onNodeHover: (node: GraphNode | null) => void
  onEngineStop: () => void
  initialTilt?: number
}
