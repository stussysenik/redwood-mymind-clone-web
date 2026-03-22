/**
 * MyMind Clone - Graph Client Component
 *
 * Interactive 2D force-directed graph visualization of the user's knowledge.
 * Nodes are cards, edges connect cards that share tags.
 * Uses react-force-graph-2d for WebGL-accelerated rendering.
 *
 * Accepts pre-built graph data (nodes + links) as props — the GraphQL query
 * in GraphCell handles data fetching, so this component is purely presentational.
 *
 * @fileoverview Client-side knowledge graph visualization
 */

import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import type { GraphNode } from 'src/lib/graph';
import { GraphFilterPanel } from 'src/components/GraphFilterPanel/GraphFilterPanel';
import { GraphTooltip } from 'src/components/GraphTooltip/GraphTooltip';
import { Loader2 } from 'lucide-react';

const ForceGraph2D = lazy(() => import('react-force-graph-2d'));

// =============================================================================
// TYPES
// =============================================================================

interface GraphClientNode {
	id: string;
	title?: string | null;
	imageUrl?: string | null;
	type: string;
	tags: string[] | readonly string[];
	colors?: string[] | readonly string[] | null;
	connections: number;
	color?: string;
}

interface GraphClientLink {
	source: string;
	target: string;
	sharedTags: string[] | readonly string[];
	weight: number;
}

interface GraphClientProps {
	nodes: readonly GraphClientNode[];
	links: readonly GraphClientLink[];
}

// react-force-graph augments node/link objects at runtime with positional data.
// We use `any` for callback params to satisfy the library's generic signatures,
// then access our custom properties (color, connections, weight, etc.) directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FGNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FGLink = any;

// Map from card type to a default node colour
const TYPE_COLORS: Record<string, string> = {
	article: '#3B82F6',
	social: '#1DA1F2',
	video: '#EF4444',
	note: '#F59E0B',
	image: '#8B5CF6',
	book: '#10B981',
	movie: '#F97316',
	product: '#6B7280',
};

// =============================================================================
// COMPONENT
// =============================================================================

export function GraphClient({ nodes, links }: GraphClientProps) {
	// Filter state (client-side post-filter on top of the server data)
	const [minWeight, setMinWeight] = useState(1);

	// Tooltip state
	const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
	const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

	const containerRef = useRef<HTMLDivElement>(null);
	const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

	// -------------------------------------------------------------------------
	// RESPONSIVE SIZING
	// -------------------------------------------------------------------------

	useEffect(() => {
		function updateSize() {
			if (containerRef.current) {
				setDimensions({
					width: containerRef.current.clientWidth,
					height: containerRef.current.clientHeight,
				});
			}
		}

		updateSize();
		window.addEventListener('resize', updateSize);
		return () => window.removeEventListener('resize', updateSize);
	}, []);

	// -------------------------------------------------------------------------
	// BUILD GRAPH DATA (add colours, apply client-side minWeight filter)
	// -------------------------------------------------------------------------

	const graphData = useMemo(() => {
		// Assign colour to each node (prefer first entry in `colors`, fall back to type colour)
		const colouredNodes = nodes.map((n) => ({
			...n,
			color: n.colors?.[0] ?? TYPE_COLORS[n.type] ?? '#6B7280',
		}));

		// Apply client-side minimum-weight filter
		const filteredLinks = links.filter((l) => l.weight >= minWeight);

		return { nodes: colouredNodes, links: filteredLinks };
	}, [nodes, links, minWeight]);

	// Compute max weight for edge opacity scaling
	const maxWeight = useMemo(
		() => Math.max(1, ...graphData.links.map((l) => l.weight)),
		[graphData.links]
	);

	// -------------------------------------------------------------------------
	// CALLBACKS
	// -------------------------------------------------------------------------

	const handleNodeHover = useCallback(
		(node: FGNode | null, _previousNode: FGNode | null) => {
			if (node) {
				setHoveredNode(node as GraphNode);
				setTooltipPos({ x: (node.__screenX ?? 0) as number, y: (node.__screenY ?? 0) as number });
			} else {
				setHoveredNode(null);
				setTooltipPos(null);
			}
		},
		[]
	);

	// Track mouse position for tooltip
	useEffect(() => {
		function handleMouseMove(e: MouseEvent) {
			if (hoveredNode) {
				setTooltipPos({ x: e.clientX, y: e.clientY });
			}
		}
		window.addEventListener('mousemove', handleMouseMove);
		return () => window.removeEventListener('mousemove', handleMouseMove);
	}, [hoveredNode]);

	const handleNodeClick = useCallback((node: FGNode) => {
		window.open(`/?highlight=${node.id}`, '_self');
	}, []);

	const nodeCanvasObject = useCallback(
		(node: FGNode, ctx: CanvasRenderingContext2D) => {
			const x = node.x ?? 0;
			const y = node.y ?? 0;
			const connections = node.connections ?? 1;
			const color = node.color ?? '#6B7280';
			const radius = Math.sqrt(connections) * 4 + 6;

			// Glow for hovered node
			if (hoveredNode?.id === node.id) {
				ctx.beginPath();
				ctx.arc(x, y, radius + 4, 0, 2 * Math.PI);
				ctx.fillStyle = color + '33';
				ctx.fill();
			}

			// Main circle
			ctx.beginPath();
			ctx.arc(x, y, radius, 0, 2 * Math.PI);
			ctx.fillStyle = color;
			ctx.fill();

			// Border
			ctx.strokeStyle = hoveredNode?.id === node.id
				? 'rgba(255,255,255,0.9)'
				: 'rgba(255,255,255,0.3)';
			ctx.lineWidth = hoveredNode?.id === node.id ? 2 : 1;
			ctx.stroke();
		},
		[hoveredNode]
	);

	const linkColor = useCallback(
		(link: FGLink) => {
			const weight = link.weight ?? 1;
			const opacity = 0.1 + (weight / maxWeight) * 0.4;
			return `rgba(150, 150, 150, ${opacity})`;
		},
		[maxWeight]
	);

	const linkWidth = useCallback((link: FGLink) => {
		return Math.max(1, (link.weight ?? 1) * 0.5);
	}, []);

	const handleReset = useCallback(() => {
		setMinWeight(1);
	}, []);

	// -------------------------------------------------------------------------
	// RENDER
	// -------------------------------------------------------------------------

	return (
		<div ref={containerRef} className="absolute inset-0">
			<GraphFilterPanel
				tagFilter=""
				onTagFilterChange={() => {}}
				minWeight={minWeight}
				onMinWeightChange={setMinWeight}
				nodeCount={graphData.nodes.length}
				edgeCount={graphData.links.length}
				onReset={handleReset}
			/>

			<Suspense fallback={
				<div className="flex-1 flex items-center justify-center min-h-[60vh]">
					<Loader2 className="h-8 w-8 animate-spin text-[var(--accent-primary)]" />
				</div>
			}>
				<ForceGraph2D
					graphData={graphData}
					width={dimensions.width}
					height={dimensions.height}
					nodeCanvasObject={nodeCanvasObject}
					nodePointerAreaPaint={(node: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
						const radius = Math.sqrt(node.connections ?? 1) * 4 + 6;
						ctx.beginPath();
						ctx.arc(node.x ?? 0, node.y ?? 0, radius + 2, 0, 2 * Math.PI);
						ctx.fillStyle = color;
						ctx.fill();
					}}
					linkColor={linkColor}
					linkWidth={linkWidth}
					onNodeHover={handleNodeHover}
					onNodeClick={handleNodeClick}
					backgroundColor="transparent"
					cooldownTicks={100}
					d3AlphaDecay={0.02}
					d3VelocityDecay={0.3}
				/>
			</Suspense>

			<GraphTooltip node={hoveredNode} position={tooltipPos} />
		</div>
	);
}
