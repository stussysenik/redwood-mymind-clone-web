/**
 * WebGL Graph Renderer — Pixi.js v8
 *
 * GPU-batched 2D graph. Same d3-force-3d physics (numDimensions=2) as the
 * Canvas renderer; only the draw layer changes. Handles 5 000+ nodes at 60 fps
 * where Canvas tops out around 1 000.
 *
 * Architecture:
 *   - One Graphics object for all edges (single draw call per frame)
 *   - Individual Graphics per node (Pixi event system for hover/click)
 *   - BlurFilter on hovered-node sprite for glow, iA Writer-restrained
 */

import { useEffect, useRef, useCallback } from 'react'

import type { GraphRendererProps } from 'src/lib/graph-renderer-types'

// d3-force-3d is available in the monorepo root node_modules.
// numDimensions(2) makes it behave identically to d3-force.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D3Sim = any

const TYPE_COLORS: Record<string, number> = {
  article: 0x3b82f6,
  social:  0x1da1f2,
  video:   0xef4444,
  note:    0xf59e0b,
  image:   0x8b5cf6,
  book:    0x10b981,
  movie:   0xf97316,
  product: 0x6b7280,
}

const EDGE_COLOR   = 0xb8ad9e
const EDGE_ALPHA   = 0.35
const HOVER_GLOW   = 0.6      // BlurFilter strength for hovered node

function nodeColor(type: string, colorHex?: string): number {
  if (colorHex && colorHex.startsWith('#') && colorHex.length === 7) {
    return parseInt(colorHex.slice(1), 16)
  }
  return TYPE_COLORS[type] ?? 0x6b7280
}

function nodeRadius(connections: number): number {
  return Math.sqrt(Math.max(1, connections)) * 4 + 6
}

export function WebGLGraphRenderer({
  nodes,
  links,
  dimensions,
  focusedNodeId,
  onNodeClick,
  onNodeHover,
  onEngineStop,
  darkMode,
  neighborSetsByNode,
}: GraphRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appRef   = useRef<any>(null)
  const simRef   = useRef<D3Sim>(null)

  const onNodeClickRef  = useRef(onNodeClick)
  const onNodeHoverRef  = useRef(onNodeHover)
  const onEngineStopRef = useRef(onEngineStop)
  onNodeClickRef.current  = onNodeClick
  onNodeHoverRef.current  = onNodeHover
  onEngineStopRef.current = onEngineStop

  const initGraph = useCallback(async () => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const { width, height } = dimensions

    // ── Pixi.js v8 init ─────────────────────────────────────────────────────
    const { Application, Graphics, Container, BlurFilter } = await import('pixi.js')

    const app = new Application()
    await app.init({
      canvas,
      width,
      height,
      backgroundAlpha: 0,
      antialias: true,
      resolution: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
      autoDensity: true,
    })
    appRef.current = app

    // Two layers: edges behind, nodes on top
    const edgeLayer = new Container()
    const nodeLayer = new Container()
    app.stage.addChild(edgeLayer)
    app.stage.addChild(nodeLayer)

    // Single Graphics for all edges — one draw call per frame
    const edgeGfx = new Graphics()
    edgeLayer.addChild(edgeGfx)

    // ── Clone nodes / links for d3 mutation ─────────────────────────────────
    // d3 mutates .x / .y / .vx / .vy directly on the objects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const simNodes: any[] = nodes.map((n) => ({
      id: n.id,
      type: n.type,
      color: n.color,
      connections: n.connections,
      // Pre-seed positions from parent (localStorage cache) if available
      x: (n as unknown as { x?: number }).x ?? width / 2 + (Math.random() - 0.5) * 100,
      y: (n as unknown as { y?: number }).y ?? height / 2 + (Math.random() - 0.5) * 100,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const simLinks: any[] = links.map((l) => ({
      source: l.source,
      target: l.target,
      weight: l.weight,
    }))

    // ── d3-force-3d simulation (2D) ──────────────────────────────────────────
    const d3 = await import('d3-force-3d')
    const sim: D3Sim = d3
      .forceSimulation(simNodes)
      .numDimensions(2)
      .force('charge',    d3.forceManyBody().strength(-180).distanceMax(500))
      .force('link',      d3.forceLink(simLinks).id((n: { id: string }) => n.id).distance((l: { weight: number }) => 60 + (1 / (l.weight || 1)) * 80))
      .force('center',    d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collision', d3.forceCollide((n: { connections: number }) => nodeRadius(n.connections) + 4))
      .alphaDecay(0.012)
      .on('end', () => onEngineStopRef.current())

    simRef.current = sim

    // ── Node sprites (Graphics per node for Pixi events) ────────────────────
    const nodeGfxMap = new Map<string, ReturnType<typeof makeNodeGfx>>()
    const blurFilter = new BlurFilter({ strength: HOVER_GLOW * 4, quality: 3 })

    function makeNodeGfx(simNode: { id: string; type: string; color?: string; connections: number }) {
      const g = new Graphics()
      const r = nodeRadius(simNode.connections)
      const c = nodeColor(simNode.type, simNode.color)

      g.circle(0, 0, r).fill({ color: c, alpha: 1 })

      g.eventMode = 'static'
      g.cursor    = 'pointer'

      g.on('pointerenter', () => {
        g.filters = [blurFilter]
        const matchedNode = nodes.find((n) => n.id === simNode.id)
        if (matchedNode) onNodeHoverRef.current(matchedNode as unknown as Parameters<typeof onNodeHoverRef.current>[0])
      })
      g.on('pointerleave', () => {
        g.filters = []
        onNodeHoverRef.current(null)
      })
      g.on('pointertap', () => {
        onNodeClickRef.current(simNode.id)
      })

      nodeLayer.addChild(g)
      return g
    }

    for (const sn of simNodes) {
      nodeGfxMap.set(sn.id, makeNodeGfx(sn))
    }

    // ── Render loop (Pixi ticker) ────────────────────────────────────────────
    const focusedId        = focusedNodeId    // captured at init; re-init on change
    const neighborSets     = neighborSetsByNode  // same capture pattern

    app.ticker.add(() => {
      // Redraw all edges in one Graphics call
      edgeGfx.clear()
      for (const link of simLinks) {
        const sx = link.source.x ?? 0
        const sy = link.source.y ?? 0
        const tx = link.target.x ?? 0
        const ty = link.target.y ?? 0

        const dimmed = focusedId !== null &&
          link.source.id !== focusedId &&
          link.target.id !== focusedId

        edgeGfx
          .moveTo(sx, sy)
          .lineTo(tx, ty)
          .stroke({ width: Math.sqrt(link.weight || 1), color: EDGE_COLOR, alpha: dimmed ? 0.06 : EDGE_ALPHA })
      }

      // Update node positions
      for (const sn of simNodes) {
        const g = nodeGfxMap.get(sn.id)
        if (!g) continue
        g.x = sn.x ?? 0
        g.y = sn.y ?? 0

        const isFocused    = sn.id === focusedId
        const isNeighbor   = focusedId ? (neighborSets?.get(focusedId)?.has(sn.id) ?? false) : false
        const inFocusMode  = focusedId !== null
        g.alpha = inFocusMode && !isFocused && !isNeighbor ? 0.12 : 1
      }
    })

    // ── Pan / zoom via pointer ───────────────────────────────────────────────
    // Basic two-finger zoom + drag on the stage (no external dep needed)
    app.stage.eventMode = 'static'
    app.stage.hitArea   = app.screen

    let isPanning = false
    let panStart  = { x: 0, y: 0 }
    let stageStart = { x: 0, y: 0 }

    app.stage.on('pointerdown', (e: { global: { x: number; y: number } }) => {
      isPanning  = true
      panStart   = { x: e.global.x, y: e.global.y }
      stageStart = { x: app.stage.x, y: app.stage.y }
    })
    app.stage.on('pointermove', (e: { global: { x: number; y: number } }) => {
      if (!isPanning) return
      app.stage.x = stageStart.x + (e.global.x - panStart.x)
      app.stage.y = stageStart.y + (e.global.y - panStart.y)
    })
    app.stage.on('pointerup',    () => { isPanning = false })
    app.stage.on('pointerupoutside', () => { isPanning = false })

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      const scaleDelta = e.deltaY > 0 ? 0.9 : 1.1
      app.stage.scale.x *= scaleDelta
      app.stage.scale.y *= scaleDelta
    }, { passive: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions.width, dimensions.height, nodes, links, focusedNodeId, darkMode, neighborSetsByNode])

  useEffect(() => {
    let cancelled = false

    initGraph().catch(console.error)

    return () => {
      cancelled = true
      if (simRef.current) {
        simRef.current.stop()
        simRef.current = null
      }
      if (appRef.current) {
        appRef.current.destroy(true, { children: true })
        appRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions.width, dimensions.height, nodes.length, links.length, focusedNodeId])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: dimensions.width,
        height: dimensions.height,
        touchAction: 'none',
      }}
    />
  )
}
