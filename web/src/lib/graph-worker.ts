/**
 * BYOA — Graph Force Simulation Web Worker
 *
 * Offloads the computationally expensive d3 force simulation to a background
 * thread so the main thread stays free for rendering and interaction.
 *
 * Usage:
 *   const worker = new Worker(new URL('./graph-worker.ts', import.meta.url))
 *   worker.postMessage({ type: 'init', nodes, links, isMobile })
 *   worker.onmessage = (e) => { // 'tick' or 'done' }
 *
 * Uses d3-force-3d (bundled with force-graph) which is a superset of d3-force
 * and provides the same 2D simulation API.
 */

import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
} from 'd3-force-3d'

interface WorkerNode {
  id: string
  x?: number
  y?: number
  vx?: number
  vy?: number
  connections: number
}

interface WorkerLink {
  source: string | WorkerNode
  target: string | WorkerNode
  weight: number
}

interface InitMessage {
  type: 'init'
  nodes: WorkerNode[]
  links: WorkerLink[]
  isMobile: boolean
}

interface TickMessage {
  type: 'tick'
  nodes: Array<{ id: string; x: number; y: number }>
}

interface DoneMessage {
  type: 'done'
  nodes: Array<{ id: string; x: number; y: number }>
}

type OutboundMessage = TickMessage | DoneMessage

self.onmessage = (e: MessageEvent<InitMessage>) => {
  if (e.data.type !== 'init') return

  const { nodes, links, isMobile } = e.data

  const CHARGE_FLOOR = isMobile ? -200 : -300
  const CHARGE_PER_NODE = isMobile ? 0.5 : 0.8
  const CHARGE_BASE = isMobile ? -100 : -150
  const chargeStrength = Math.min(
    CHARGE_FLOOR,
    CHARGE_BASE - nodes.length * CHARGE_PER_NODE
  )

  const simulation = forceSimulation(nodes as any, 2)
    .force(
      'charge',
      forceManyBody()
        .strength(chargeStrength)
        .distanceMax(isMobile ? 400 : 600)
    )
    .force(
      'link',
      forceLink(links as any)
        .id((d: any) => d.id)
        .distance((l: any) => {
          const base = isMobile ? 50 : 80
          const spread = isMobile ? 100 : 150
          return base + (1 / (l.weight ?? 1)) * spread
        })
    )
    .force('center', forceCenter(0, 0).strength(0.05))
    .force('collide', forceCollide(8))
    .alphaDecay(isMobile ? 0.04 : 0.008)
    .velocityDecay(0.3)
    .stop()

  const totalTicks = isMobile ? 150 : 300
  const batchSize = 10

  for (let i = 0; i < totalTicks; i++) {
    simulation.tick()

    if (i % batchSize === 0) {
      const positions = nodes.map((n: any) => ({
        id: n.id,
        x: n.x ?? 0,
        y: n.y ?? 0,
      }))
      ;(self as any).postMessage({
        type: 'tick',
        nodes: positions,
      } as OutboundMessage)
    }
  }

  const finalPositions = nodes.map((n: any) => ({
    id: n.id,
    x: n.x ?? 0,
    y: n.y ?? 0,
  }))
  ;(self as any).postMessage({
    type: 'done',
    nodes: finalPositions,
  } as OutboundMessage)
}
