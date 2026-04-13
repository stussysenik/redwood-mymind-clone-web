/**
 * Three.js 3D Graph Renderer
 *
 * Philosophy (iA Writer · Things · Notion):
 *   - Orthographic camera by default → identical flat feel to Canvas
 *   - ONE rotation handle (bottom-right): drag to tilt, tap to reset
 *   - No orbit gizmo, no toolbar buttons, no legend
 *   - Z-stratification by type gives spatial meaning without clutter
 *   - Custom GLSL ShaderMaterial: circle SDF + signed-distance AA + rim glow
 *
 * Simulation: d3-force-3d numDimensions(3) with weak z-force per type.
 */

import { useEffect, useRef, useCallback, useState } from 'react'

import type { GraphRendererProps } from 'src/lib/graph-renderer-types'

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

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255]
}

function typeHex(type: string, colorHex?: string): number {
  if (colorHex && colorHex.startsWith('#') && colorHex.length === 7) {
    return parseInt(colorHex.slice(1), 16)
  }
  return TYPE_COLORS[type] ?? 0x6b7280
}

export function ThreeGraphRenderer({
  nodes,
  links,
  dimensions,
  onNodeClick,
  onNodeHover,
  onEngineStop,
  darkMode,
}: GraphRendererProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<ThreeType>(null)
  const sceneRef    = useRef<ThreeType>(null)
  const cameraRef   = useRef<ThreeType>(null)
  const simRef      = useRef<D3Sim>(null)
  const rafRef      = useRef<number>(0)

  // Tilt state: 0 = flat (ortho feel), 1 = full 60° perspective
  const [tilt, setTilt]     = useState(0)
  const tiltRef             = useRef(0)
  const isDraggingHandle    = useRef(false)
  const handleDragStart     = useRef({ y: 0, tilt: 0 })

  const onClickRef       = useRef(onNodeClick)
  const onHoverRef       = useRef(onNodeHover)
  const onEngineStopRef  = useRef(onEngineStop)
  onClickRef.current      = onNodeClick
  onHoverRef.current      = onNodeHover
  onEngineStopRef.current = onEngineStop

  const init = useCallback(async () => {
    if (!canvasRef.current) return
    const { width, height } = dimensions

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

    // ── Camera — perspective (we animate the FOV down to 1° for ortho feel) ─
    const fov  = 1 + tiltRef.current * 59  // 1° = near-ortho, 60° = perspective
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 10000)
    camera.position.set(width / 2, height / 2, 600)
    camera.lookAt(width / 2, height / 2, 0)
    cameraRef.current = camera

    // ── Ambient light ────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.8))

    // ── d3-force-3d simulation ───────────────────────────────────────────────
    const d3 = await import('d3-force-3d')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const simNodes: any[] = nodes.map((n, i) => ({
      id: n.id,
      type: n.type,
      color: n.color,
      connections: n.connections,
      x: (n as unknown as { x?: number }).x ?? width / 2 + (Math.random() - 0.5) * 100,
      y: (n as unknown as { y?: number }).y ?? height / 2 + (Math.random() - 0.5) * 100,
      z: TYPE_Z[n.type] ?? 0,
      _idx: i,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const simLinks: any[] = links.map((l) => ({
      source: l.source,
      target: l.target,
      weight: l.weight,
    }))

    const sim: D3Sim = d3
      .forceSimulation(simNodes)
      .numDimensions(3)
      .force('charge',  d3.forceManyBody().strength(-200).distanceMax(600))
      .force('link',    d3.forceLink(simLinks).id((n: { id: string }) => n.id).distance((l: { weight: number }) => 80 + (1 / (l.weight || 1)) * 100))
      .force('center',  d3.forceCenter(width / 2, height / 2, 0).strength(0.04))
      .force('zTarget', d3.forceZ((n: { type: string }) => TYPE_Z[n.type] ?? 0).strength(0.3))
      .alphaDecay(0.012)
      .on('end', () => onEngineStopRef.current())

    simRef.current = sim

    // ── Node point cloud (ShaderMaterial) ────────────────────────────────────
    const MAX_NODES = simNodes.length
    const positions = new Float32Array(MAX_NODES * 3)
    const indices   = new Float32Array(MAX_NODES)  // maps point → color slot
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
        uSize:   { value: 12 },
        uHover:  { value: -1 },
        uColors: { value: uColors },
      },
      transparent: true,
      depthWrite: false,
    })

    const pointCloud = new THREE.Points(geo, nodeMat)
    scene.add(pointCloud)

    // ── Edge line segments ───────────────────────────────────────────────────
    const edgeGeo  = new THREE.BufferGeometry()
    const edgePos  = new Float32Array(simLinks.length * 6)  // 2 verts × 3 coords
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3))

    const edgeMat = new THREE.LineBasicMaterial({
      color: darkMode ? 0x6b7280 : 0xb8ad9e,
      transparent: true,
      opacity: 0.35,
    })
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat)
    scene.add(edgeLines)

    // ── Render loop ──────────────────────────────────────────────────────────
    const posAttr = geo.getAttribute('position') as ThreeType
    const edgePosAttr = edgeGeo.getAttribute('position') as ThreeType

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

      // Update camera tilt
      const targetFov = 1 + tiltRef.current * 59
      if (Math.abs(camera.fov - targetFov) > 0.1) {
        camera.fov += (targetFov - camera.fov) * 0.1
        camera.updateProjectionMatrix()
      }

      renderer.render(scene, camera)
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions.width, dimensions.height, nodes.length, links.length])

  // ── Rotation handle interactions ────────────────────────────────────────────
  function onHandlePointerDown(e: React.PointerEvent) {
    isDraggingHandle.current  = true
    handleDragStart.current   = { y: e.clientY, tilt: tiltRef.current }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onHandlePointerMove(e: React.PointerEvent) {
    if (!isDraggingHandle.current) return
    const dy = (e.clientY - handleDragStart.current.y) / 120  // 120px = full tilt
    const next = Math.max(0, Math.min(1, handleDragStart.current.tilt + dy))
    tiltRef.current = next
    setTilt(next)
  }

  function onHandlePointerUp() {
    isDraggingHandle.current = false
  }

  function onHandleTap() {
    // Snap back to flat
    tiltRef.current = 0
    setTilt(0)
  }

  const handleIsFlat = tilt < 0.02

  return (
    <div style={{ position: 'relative', width: dimensions.width, height: dimensions.height }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: dimensions.width, height: dimensions.height }}
      />

      {/* Single rotation handle — bottom-right corner */}
      <button
        aria-label={handleIsFlat ? 'Drag to tilt into 3D perspective' : 'Tap to reset to flat view'}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onClick={handleIsFlat ? undefined : onHandleTap}
        style={{
          position: 'absolute',
          right: 20,
          bottom: 28,
          width: 32,
          height: 32,
          borderRadius: '50%',
          backgroundColor: 'var(--surface-floating)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-sm)',
          cursor: handleIsFlat ? 'ns-resize' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'none',
          // Subtle indicator of current tilt
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
}
