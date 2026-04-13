/**
 * Three.js 3D Graph Renderer
 *
 * Orthographic camera by default (same flat feel as Canvas).
 * One rotation handle (bottom-right) tilts to perspective — drag to orbit,
 * tap to snap back. Nodes stratified by type on the Z axis.
 * Custom GLSL ShaderMaterial for circle SDF + rim glow.
 *
 * Status: implementation in progress (Slice 7)
 */

import type { GraphRendererProps } from 'src/lib/graph-renderer-types'

export function ThreeGraphRenderer({
  nodes,
  dimensions,
}: GraphRendererProps) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ width: dimensions.width, height: dimensions.height }}
    >
      <div
        className="rounded-2xl px-6 py-4 text-center"
        style={{
          backgroundColor: 'var(--surface-card)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <p
          className="text-sm font-medium"
          style={{ color: 'var(--foreground)' }}
        >
          3D renderer
        </p>
        <p
          className="mt-1 text-xs"
          style={{ color: 'var(--foreground-muted)' }}
        >
          {nodes.length} nodes · Three.js loading…
        </p>
      </div>
    </div>
  )
}
