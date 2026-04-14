/**
 * Three.js 3D Graph Renderer
 *
 * Philosophy (iA Writer · Things · Notion):
 *   - OrthographicCamera at tilt < 0.05 → identical flat feel to Canvas
 *   - PerspectiveCamera at tilt ≥ 0.05 → orbits around graph center at fixed
 *     radius 600, so gl_PointSize formula stays consistent across tilt values
 *   - ONE rotation handle (bottom-right): drag to tilt, tap to reset
 *   - No orbit gizmo, no toolbar buttons, no legend
 *   - Z-stratification by type gives spatial meaning without clutter
 *   - Custom GLSL ShaderMaterial: circle SDF + signed-distance AA + rim glow
 *   - Raycaster-based pointer events: hover, click (tap), long-press (300 ms / 10 px)
 *
 * Simulation: d3-force-3d numDimensions(3) with weak z-force per type.
 */

import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react'

import type { GraphNode } from 'src/lib/graph'
import type { GraphRendererProps } from 'src/lib/graph-renderer-types'
import { haptic } from 'src/lib/haptics'

// Imperative handle exposed via forwardRef
export interface ThreeGraphRendererHandle {
  /** Smoothly pan the camera to frame a cluster center over 600 ms. */
  frameTo(center: { x: number; y: number }, radius: number): void
}

// Z offset per card type — gives the graph semantic depth layers
const TYPE_Z: Record<string, number> = {
  article:  0,
  note:     20,
  image:   -20,
  book:     40,
  video:   -40,
  social:   10,
  product: -10,
  movie:   -30,
}

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

// GLSL: circle SDF with smooth AA and a rim-glow ring
const NODE_VERT = /* glsl */`
  uniform float uSize;
  attribute float aIndex;
  varying vec3 vColor;
  uniform vec3 uColors[128];

  void main() {
    vColor = uColors[int(aIndex)];
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * (300.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`

const NODE_FRAG = /* glsl */`
  varying vec3 vColor;
  uniform float uHover;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float circle = 1.0 - smoothstep(0.45, 0.5, d);
    float rim    = smoothstep(0.38, 0.42, d) * (1.0 - smoothstep(0.44, 0.5, d));
    vec3 col = mix(vColor, vec3(1.0), rim * 0.4);
    gl_FragColor = vec4(col, circle);
    if (gl_FragColor.a < 0.01) discard;
  }
`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ThreeType = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D3Sim = any

// Constant orbit radius — keeps camera-to-scene distance fixed across all tilt
// values so gl_PointSize stays consistent (formula: uSize * 300 / orbitR ≈ 6 px
// for uSize=12 at orbitR=600).
const ORBIT_R = 600

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255]
}

function typeHex(type: string, colorHex?: string): number {
  if (colorHex && colorHex.startsWith('#') && colorHex.length === 7) {
    return parseInt(colorHex.slice(1), 16)
  }
  return TYPE_COLORS[type] ?? 0x6b7280
}

export const ThreeGraphRenderer = forwardRef<ThreeGraphRendererHandle, GraphRendererProps>(
function ThreeGraphRenderer({
  nodes,
  links,
  dimensions,
  onNodeClick,
  onNodeHover,
  onEngineStop,
  darkMode,
  initialTilt = 0,
  onLongPressNode,
}, ref) {
  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const rendererRef    = useRef<ThreeType>(null)
  const sceneRef       = useRef<ThreeType>(null)
  const orthoCamRef    = useRef<ThreeType>(null)
  const perspCamRef    = useRef<ThreeType>(null)
  const simNodesRef    = useRef<ThreeType[]>([])
  const pointCloudRef  = useRef<ThreeType>(null)
  const raycasterRef   = useRef<ThreeType>(null)
  const simRef         = useRef<D3Sim>(null)
  const rafRef         = useRef<number>(0)

  // frameTo animation state (cluster restore smooth pan)
  const frameToTargetRef = useRef<{
    fromX: number; fromY: number
    toX: number;   toY: number
    startTime: number
  } | null>(null)

  // Tilt state: 0 = flat (ortho), 1 = full 45° perspective orbit
  const [tilt, setTilt]  = useState(initialTilt)
  const tiltRef          = useRef(initialTilt)
  const isDraggingHandle = useRef(false)
  const handleDragStart  = useRef({ y: 0, tilt: 0 })

  // Shared camera state — readable by both the animate loop and pointer events
  const cameraStateRef    = useRef({ cx: 0, cy: 0, span: 600 })
  // Once the user zooms/pans manually, auto zoom-to-fit is disabled
  const userInteractedRef = useRef(false)

  // Keep prop callbacks fresh without re-triggering init
  const onClickRef         = useRef(onNodeClick)
  const onHoverRef         = useRef(onNodeHover)
  const onEngineStopRef    = useRef(onEngineStop)
  const onLongPressRef     = useRef(onLongPressNode)
  onClickRef.current       = onNodeClick
  onHoverRef.current       = onNodeHover
  onEngineStopRef.current  = onEngineStop
  onLongPressRef.current   = onLongPressNode

  const init = useCallback(async () => {
    if (!canvasRef.current) return
    const { width, height } = dimensions
    const cx = width / 2
    const cy = height / 2

    const THREE: ThreeType = await import('three')

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: true,
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    renderer.setClearColor(0x000000, 0)
    rendererRef.current = renderer

    // ── Scene ────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // ── Camera pair ──────────────────────────────────────────────────────────
    // OrthographicCamera: flat view at tilt < 0.05.
    // Frustum spans exactly the canvas in world units (nodes are positioned in
    // screen-space coordinates [0..width] × [0..height]).
    const orthoCam = new THREE.OrthographicCamera(
      -width / 2,   // left   (relative to camera position)
       width / 2,   // right
       height / 2,  // top
      -height / 2,  // bottom
      -1000,        // near
       2000          // far
    )
    orthoCam.position.set(cx, cy, ORBIT_R)
    orthoCam.lookAt(cx, cy, 0)
    orthoCam.updateProjectionMatrix()
    orthoCamRef.current = orthoCam

    // PerspectiveCamera: perspective view at tilt ≥ 0.05.
    // Orbits around (cx, cy, 0) at constant radius ORBIT_R so point-size
    // stays consistent with the ortho view.
    const perspCam = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000)
    perspCam.position.set(cx, cy, ORBIT_R)
    perspCam.lookAt(cx, cy, 0)
    perspCam.updateProjectionMatrix()
    perspCamRef.current = perspCam

    // ── Raycaster ────────────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster()
    // 12 world-unit threshold ≈ 12 screen pixels at ORBIT_R=600 (see note in
    // proposal §D4: threshold is recomputed on resize but 12 is appropriate for
    // our coordinate system where 1 world unit ≈ 1 CSS pixel in ortho mode).
    raycaster.params.Points = { threshold: 12 }
    raycasterRef.current = raycaster

    // ── Ambient light ────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.8))

    // ── d3-force-3d simulation ───────────────────────────────────────────────
    const d3 = await import('d3-force-3d')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const simNodes: any[] = nodes.map((n, i) => ({
      id: n.id,
      title: n.title,
      type: n.type,
      color: n.color,
      connections: n.connections,
      tags: n.tags ?? [],
      // Spread nodes evenly in a circle to avoid the explosive initial repulsion
      // burst that occurs when all nodes start clustered near the center.
      x: (n as unknown as { x?: number }).x ?? cx + Math.cos((i / nodes.length) * 2 * Math.PI) * (Math.min(width, height) * 0.35),
      y: (n as unknown as { y?: number }).y ?? cy + Math.sin((i / nodes.length) * 2 * Math.PI) * (Math.min(width, height) * 0.35),
      z: TYPE_Z[n.type] ?? 0,
      _idx: i,
    }))
    simNodesRef.current = simNodes

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const simLinks: any[] = links.map((l) => ({
      source: l.source,
      target: l.target,
      weight: l.weight,
    }))

    const sim: D3Sim = d3
      // Pass numDimensions=3 to the constructor so initializeNodes() runs with
      // nDim=3 and sets vz=0 on every node. Calling .numDimensions(3) as a
      // chained method after construction skips the re-initialization, leaving
      // vz=undefined. On the first tick: z += vz *= velocityDecay → z=NaN,
      // which makes gl_PointSize=NaN (vertex discarded) → blank canvas.
      .forceSimulation(simNodes, 3)
      // Charge keeps nodes apart; distanceMax=200 prevents global explosion.
      .force('charge',  d3.forceManyBody().strength(-25).distanceMax(200))
      .force('link',    d3.forceLink(simLinks).id((n: { id: string }) => n.id).distance((l: { weight: number }) => 30 + (1 / (l.weight || 1)) * 40))
      // forceX/forceY instead of forceCenter: forceCenter only keeps the mean
      // at (cx,cy) but lets individual nodes fly arbitrarily far (isolated nodes
      // have no link force to anchor them). forceX/forceY apply a per-node pull
      // toward (cx,cy), preventing the unbounded spread that caused the graph to
      // zoom out to 15,000+ world units on fresh mounts.
      .force('cx',      d3.forceX(cx).strength(0.12))
      .force('cy',      d3.forceY(cy).strength(0.12))
      .force('zTarget', d3.forceZ((n: { type: string }) => TYPE_Z[n.type] ?? 0).strength(0.3))
      .alphaDecay(0.02)
      .on('end', () => onEngineStopRef.current())

    simRef.current = sim

    // ── Node point cloud (ShaderMaterial) ────────────────────────────────────
    const MAX_NODES = simNodes.length
    const positions = new Float32Array(MAX_NODES * 3)
    const indices   = new Float32Array(MAX_NODES)
    const colors    = new Array(Math.min(MAX_NODES, 128)).fill(null).flatMap((_, i) => {
      const sn = simNodes[i]
      if (!sn) return [0.42, 0.42, 0.42]
      const rgb = hexToRgb(typeHex(sn.type, sn.color))
      return rgb
    })

    simNodes.forEach((sn, i) => {
      positions[i * 3    ] = sn.x
      positions[i * 3 + 1] = sn.y
      positions[i * 3 + 2] = sn.z
      indices[i] = i < 128 ? i : 127
    })

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aIndex',   new THREE.BufferAttribute(indices, 1))

    const uColors: ThreeType[] = []
    for (let i = 0; i < 128; i++) {
      uColors.push(new THREE.Vector3(colors[i * 3] ?? 0.42, colors[i * 3 + 1] ?? 0.42, colors[i * 3 + 2] ?? 0.42))
    }

    const nodeMat = new THREE.ShaderMaterial({
      vertexShader: NODE_VERT,
      fragmentShader: NODE_FRAG,
      uniforms: {
        uSize:   { value: 20 },
        uHover:  { value: -1 },
        uColors: { value: uColors },
      },
      transparent: true,
      depthWrite: false,
    })

    const pointCloud = new THREE.Points(geo, nodeMat)
    scene.add(pointCloud)
    pointCloudRef.current = pointCloud

    // ── Edge line segments ───────────────────────────────────────────────────
    const edgeGeo  = new THREE.BufferGeometry()
    const edgePos  = new Float32Array(simLinks.length * 6)
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3))

    const edgeMat = new THREE.LineBasicMaterial({
      color: darkMode ? 0x6b7280 : 0xa09080,
      transparent: true,
      opacity: 0.55,
    })
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat)
    scene.add(edgeLines)

    // ── Render loop ──────────────────────────────────────────────────────────
    const posAttr     = geo.getAttribute('position') as ThreeType
    const edgePosAttr = edgeGeo.getAttribute('position') as ThreeType

    // Reset camera state for this mount so auto zoom-to-fit starts fresh.
    userInteractedRef.current = false
    cameraStateRef.current    = { cx, cy, span: Math.min(width, height) }

    sim.on('end', () => onEngineStopRef.current())

    function animate() {
      rafRef.current = requestAnimationFrame(animate)

      // Update node positions from simulation
      simNodes.forEach((sn, i) => {
        posAttr.setXYZ(i, sn.x ?? 0, sn.y ?? 0, sn.z ?? 0)
      })
      posAttr.needsUpdate = true

      // Update edge positions
      simLinks.forEach((link, i) => {
        const sx = link.source.x ?? 0, sy = link.source.y ?? 0, sz = link.source.z ?? 0
        const tx = link.target.x ?? 0, ty = link.target.y ?? 0, tz = link.target.z ?? 0
        edgePosAttr.setXYZ(i * 2,     sx, sy, sz)
        edgePosAttr.setXYZ(i * 2 + 1, tx, ty, tz)
      })
      edgePosAttr.needsUpdate = true

      // ── Auto zoom-to-fit: disabled once the user interacts (wheel/pan) ──────
      if (!userInteractedRef.current && simNodes.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
        for (const sn of simNodes) {
          if (sn.x < minX) minX = sn.x
          if (sn.x > maxX) maxX = sn.x
          if (sn.y < minY) minY = sn.y
          if (sn.y > maxY) maxY = sn.y
        }
        const graphCX   = (minX + maxX) / 2
        const graphCY   = (minY + maxY) / 2
        const graphSpan = Math.max(maxX - minX, maxY - minY) * 1.1
        cameraStateRef.current.cx   += (graphCX   - cameraStateRef.current.cx)   * 0.08
        cameraStateRef.current.cy   += (graphCY   - cameraStateRef.current.cy)   * 0.08
        cameraStateRef.current.span += (graphSpan - cameraStateRef.current.span) * 0.08
      }

      // Apply ortho frustum from shared camera state
      const { cx: camCX, cy: camCY, span: camSpan } = cameraStateRef.current
      const hs = camSpan / 2
      orthoCam.left   = camCX - hs
      orthoCam.right  = camCX + hs
      orthoCam.top    = camCY + hs
      orthoCam.bottom = camCY - hs
      orthoCam.position.set(camCX, camCY, ORBIT_R)
      orthoCam.lookAt(camCX, camCY, 0)
      orthoCam.updateProjectionMatrix()

      // Pick active camera and update perspective orbit
      const t = tiltRef.current
      const activeCam: ThreeType = t < 0.05 ? orthoCam : perspCam

      if (t >= 0.05) {
        const angle     = t * (Math.PI / 4)
        const orbitDist = Math.max(ORBIT_R, camSpan * 0.75)
        perspCam.position.set(
          camCX,
          camCY - Math.sin(angle) * orbitDist,
          Math.cos(angle) * orbitDist
        )
        perspCam.lookAt(camCX, camCY, 0)
        perspCam.updateProjectionMatrix()
      }

      // ── frameTo lerp (cluster restore smooth pan) ──────────────────────────
      const ft = frameToTargetRef.current
      if (ft) {
        const elapsed  = Date.now() - ft.startTime
        const progress = Math.min(elapsed / 600, 1)
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3)
        const camX  = ft.fromX + (ft.toX - ft.fromX) * eased
        const camY  = ft.fromY + (ft.toY - ft.fromY) * eased
        orthoCam.position.setX(camX)
        orthoCam.position.setY(camY)
        orthoCam.lookAt(camX, camY, 0)
        perspCam.position.setX(camX)
        const angle = tiltRef.current * (Math.PI / 4)
        perspCam.position.setY(camY - Math.sin(angle) * ORBIT_R)
        perspCam.lookAt(camX, camY, 0)
        if (progress >= 1) frameToTargetRef.current = null
      }

      renderer.render(scene, activeCam)
    }

    animate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions.width, dimensions.height, nodes, links, darkMode])

  useEffect(() => {
    init().catch(console.error)

    return () => {
      cancelAnimationFrame(rafRef.current)
      simRef.current?.stop()
      simRef.current = null
      rendererRef.current?.dispose()
      rendererRef.current = null
      pointCloudRef.current = null
      orthoCamRef.current = null
      perspCamRef.current = null
      simNodesRef.current = []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions.width, dimensions.height, nodes.length, links.length])

  // ── Pointer event wiring (hover / click / long-press / pan / zoom) ─────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let pressTimer: ReturnType<typeof setTimeout> | null = null
    let pressNodeId: string | null = null
    let pressStart: { x: number; y: number; time: number } | null = null
    let hoverRafId: number | null = null
    let panState: { startX: number; startY: number; startCX: number; startCY: number } | null = null

    function pickNode(clientX: number, clientY: number): string | null {
      const rc  = raycasterRef.current
      const pc  = pointCloudRef.current
      const t   = tiltRef.current
      const cam = t < 0.05 ? orthoCamRef.current : perspCamRef.current
      if (!rc || !pc || !cam || !canvasRef.current) return null

      const rect = canvasRef.current.getBoundingClientRect()
      const nx = ((clientX - rect.left) / rect.width)  * 2 - 1
      const ny = -((clientY - rect.top)  / rect.height) * 2 + 1
      rc.setFromCamera({ x: nx, y: ny }, cam)
      const hits = rc.intersectObject(pc, false) as Array<{ index?: number }>
      if (hits.length === 0) return null
      const idx = hits[0].index
      if (idx == null) return null
      return simNodesRef.current[idx]?.id ?? null
    }

    function cancelPress() {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
      pressNodeId = null
      pressStart  = null
    }

    // ── Wheel zoom: scale span toward cursor ──────────────────────────────────
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      userInteractedRef.current = true
      const factor = e.deltaY > 0 ? 1.12 : 0.9
      const rect = canvas.getBoundingClientRect()
      const mx = (e.clientX - rect.left) / rect.width
      const my = (e.clientY - rect.top)  / rect.height
      const { cx: camCX, cy: camCY, span } = cameraStateRef.current
      const newSpan = Math.max(60, Math.min(6000, span * factor))
      const dSpan   = newSpan - span
      cameraStateRef.current.span = newSpan
      // Keep world point under cursor fixed while scaling
      cameraStateRef.current.cx = camCX - (mx - 0.5) * dSpan
      cameraStateRef.current.cy = camCY + (my - 0.5) * dSpan
    }

    function onPointerMove(e: PointerEvent) {
      // Pan: move camera when dragging on empty space
      if (panState) {
        userInteractedRef.current = true
        const dx = e.clientX - panState.startX
        const dy = e.clientY - panState.startY
        const rect = canvas.getBoundingClientRect()
        const pxPerWorld = rect.width / cameraStateRef.current.span
        cameraStateRef.current.cx = panState.startCX - dx / pxPerWorld
        cameraStateRef.current.cy = panState.startCY + dy / pxPerWorld
        return
      }

      // RAF-guard hover to stay at 60 fps
      if (hoverRafId !== null) return
      const evX = e.clientX, evY = e.clientY
      hoverRafId = requestAnimationFrame(() => {
        hoverRafId = null

        if (!isDraggingHandle.current) {
          const id = pickNode(evX, evY)
          const simNode = id ? simNodesRef.current.find(n => n.id === id) ?? null : null
          onHoverRef.current(simNode as GraphNode | null)
        }

        // Cancel long-press if finger moved > 10 px from press origin
        if (pressStart) {
          const dx = evX - pressStart.x
          const dy = evY - pressStart.y
          if (Math.sqrt(dx * dx + dy * dy) > 10) cancelPress()
        }
      })
    }

    function onPointerDown(e: PointerEvent) {
      if (isDraggingHandle.current) return
      const id = pickNode(e.clientX, e.clientY)

      if (id) {
        pressNodeId = id
        pressStart  = { x: e.clientX, y: e.clientY, time: Date.now() }
        pressTimer = setTimeout(() => {
          pressTimer = null
          const nodeId = pressNodeId
          pressNodeId  = null
          pressStart   = null
          if (nodeId && onLongPressRef.current) {
            haptic('medium')
            onLongPressRef.current(nodeId)
          }
        }, 300)
      } else {
        // Start pan on empty space
        panState = {
          startX: e.clientX,
          startY: e.clientY,
          startCX: cameraStateRef.current.cx,
          startCY: cameraStateRef.current.cy,
        }
        canvas.setPointerCapture(e.pointerId)
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (panState) {
        panState = null
        return
      }

      if (!pressTimer || !pressNodeId || !pressStart) {
        cancelPress()
        return
      }

      const dx = e.clientX - pressStart.x
      const dy = e.clientY - pressStart.y
      const elapsed = Date.now() - pressStart.time

      cancelPress()

      if (Math.sqrt(dx * dx + dy * dy) < 8 && elapsed < 250) {
        const id = pickNode(e.clientX, e.clientY)
        if (id) onClickRef.current(id)
      }
    }

    canvas.addEventListener('pointermove',  onPointerMove)
    canvas.addEventListener('pointerdown',  onPointerDown)
    canvas.addEventListener('wheel',        onWheel, { passive: false })
    window.addEventListener('pointerup',    onPointerUp)

    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('wheel',       onWheel)
      window.removeEventListener('pointerup',   onPointerUp)
      if (pressTimer)   clearTimeout(pressTimer)
      if (hoverRafId !== null) cancelAnimationFrame(hoverRafId)
    }
  // Re-attach when canvas or init re-runs (dimensions/node count change)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions.width, dimensions.height, nodes.length, links.length])

  // ── Expose frameTo via forwardRef handle ───────────────────────────────────
  useImperativeHandle(ref, () => ({
    frameTo(center: { x: number; y: number }, _radius: number) {
      const cam = tiltRef.current < 0.05 ? orthoCamRef.current : perspCamRef.current
      if (!cam) return
      frameToTargetRef.current = {
        fromX: cam.position.x,
        fromY: cam.position.y,
        toX: center.x,
        toY: center.y,
        startTime: Date.now(),
      }
    },
  }), [])

  // ── Rotation handle interactions ────────────────────────────────────────────
  function onHandlePointerDown(e: React.PointerEvent) {
    isDraggingHandle.current = true
    handleDragStart.current  = { y: e.clientY, tilt: tiltRef.current }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onHandlePointerMove(e: React.PointerEvent) {
    if (!isDraggingHandle.current) return
    const dy   = (e.clientY - handleDragStart.current.y) / 120
    const next = Math.max(0, Math.min(1, handleDragStart.current.tilt + dy))
    tiltRef.current = next
    setTilt(next)
  }

  function onHandlePointerUp() {
    isDraggingHandle.current = false
  }

  function onHandleTap() {
    tiltRef.current = 0
    setTilt(0)
  }

  const handleIsFlat = tilt < 0.02

  return (
    <div style={{ position: 'relative', width: dimensions.width, height: dimensions.height }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: dimensions.width, height: dimensions.height, touchAction: 'none' }}
      />

      {/* Single rotation handle — bottom-right corner. 44×44 touch target (Apple HIG) */}
      <button
        aria-label={handleIsFlat ? 'Drag to tilt into 3D perspective' : 'Tap to reset to flat view'}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onClick={handleIsFlat ? undefined : onHandleTap}
        style={{
          position: 'absolute',
          right: 12,
          bottom: 20,
          width: 44,
          height: 44,
          borderRadius: '50%',
          backgroundColor: 'var(--surface-floating)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-sm)',
          cursor: handleIsFlat ? 'ns-resize' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'none',
          transform: `rotateX(${tilt * 25}deg)`,
          transition: handleIsFlat ? 'transform 300ms ease-out' : 'none',
        }}
      >
        {/* 3D cube icon — minimal SVG */}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M7 1L13 4.5V9.5L7 13L1 9.5V4.5L7 1Z"
            stroke="var(--foreground-muted)"
            strokeWidth="1.2"
            strokeLinejoin="round"
            fill="none"
            opacity={0.5 + tilt * 0.5}
          />
          <path
            d="M7 1V7M7 7L13 4.5M7 7L1 4.5"
            stroke="var(--foreground-muted)"
            strokeWidth="1.2"
            strokeLinejoin="round"
            opacity={0.3 + tilt * 0.7}
          />
        </svg>
      </button>
    </div>
  )
})

ThreeGraphRenderer.displayName = 'ThreeGraphRenderer'
