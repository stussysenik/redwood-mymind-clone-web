/**
 * MyMind Clone - Graph Client Component
 *
 * Interactive 2D force-directed graph visualization of the user's knowledge.
 * Nodes are cards, edges connect cards that share tags.
 * Uses react-force-graph-2d for WebGL-accelerated rendering.
 *
 * @fileoverview Client-side knowledge graph visualization
 */

import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { buildGraphData, type GraphData, type GraphNode } from 'src/lib/graph';
import { GraphFilterPanel } from 'src/components/GraphFilterPanel/GraphFilterPanel';
import { GraphTooltip } from 'src/components/GraphTooltip';
import { Loader2 } from 'lucide-react';

const ForceGraph2D = lazy(() => import('react-force-graph-2d'));

// =============================================================================
// TYPES
// =============================================================================

interface ApiCard {
	id: string;
	title: string | null;
	image_url: string | null;
	type: string;
	tags: string[];
	metadata: { colors?: string[] } | null;
}

// react-force-graph augments node/link objects at runtime with positional data.
// We use `any` for callback params to satisfy the library's generic signatures,
// then access our custom properties (color, connections, weight, etc.) directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FGNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FGLink = any;

// =============================================================================
// COMPONENT
// =============================================================================

export function GraphClient() {
	const [cards, setCards] = useState<ApiCard[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Filter state
	const [tagFilter, setTagFilter] = useState('');
	const [minWeight, setMinWeight] = useState(1);

	// Tooltip state
	const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
	const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

	const containerRef = useRef<HTMLDivElement>(null);
	const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

	// -------------------------------------------------------------------------
	// FETCH CARDS
	// -------------------------------------------------------------------------

	useEffect(() => {
		async function fetchCards() {
			try {
				setLoading(true);
				const params = new URLSearchParams();
				if (tagFilter) params.set('tag', tagFilter);

				// TODO: Replace with GraphQL query for graph data
				const res = await fetch(`/api/graph?${params.toString()}`);
				if (!res.ok) {
					const body = await res.json().catch(() => ({}));
					throw new Error(body.error ?? `HTTP ${res.status}`);
				}

				const json = await res.json();
				setCards(json.cards ?? []);
				setError(null);
			} catch (err) {
				console.error('[GraphClient] Fetch error:', err);
				setError(err instanceof Error ? err.message : 'Failed to load graph data');
			} finally {
				setLoading(false);
			}
		}

		fetchCards();
	}, [tagFilter]);

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
	// BUILD GRAPH DATA
	// -------------------------------------------------------------------------

	const graphData: GraphData = useMemo(() => {
		const cardInputs = cards.map((c) => ({
			id: c.id,
			title: c.title,
			imageUrl: c.image_url,
			type: c.type,
			tags: c.tags,
			metadata: c.metadata,
		}));
		return buildGraphData(cardInputs, minWeight);
	}, [cards, minWeight]);

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
				// Use the node's screen coordinates from the canvas
				// The tooltip will follow the mouse via the global position
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
		// Navigate to the card in the main view (scroll to or open detail)
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
		setTagFilter('');
		setMinWeight(1);
	}, []);

	// -------------------------------------------------------------------------
	// RENDER
	// -------------------------------------------------------------------------

	if (loading) {
		return (
			<div className="flex-1 flex items-center justify-center min-h-[60vh]">
				<div className="flex flex-col items-center gap-3">
					<Loader2 className="h-8 w-8 animate-spin text-[var(--accent-primary)]" />
					<p className="text-sm text-[var(--foreground-muted)]">Building knowledge graph...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex-1 flex items-center justify-center min-h-[60vh]">
				<div className="text-center">
					<p className="text-sm text-red-500 mb-2">Failed to load graph</p>
					<p className="text-xs text-[var(--foreground-muted)]">{error}</p>
				</div>
			</div>
		);
	}

	if (graphData.nodes.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center min-h-[60vh]">
				<div className="text-center max-w-sm">
					<p className="text-lg font-medium text-[var(--foreground)] mb-2">No connections yet</p>
					<p className="text-sm text-[var(--foreground-muted)]">
						Cards need at least {minWeight} shared tag{minWeight > 1 ? 's' : ''} to form connections.
						Try lowering the minimum weight or adding more tagged cards.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div ref={containerRef} className="relative flex-1 w-full" style={{ height: 'calc(100vh - 120px)' }}>
			<GraphFilterPanel
				tagFilter={tagFilter}
				onTagFilterChange={setTagFilter}
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
