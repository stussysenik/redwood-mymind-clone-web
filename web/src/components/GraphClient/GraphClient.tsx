/**
 * BYOA - Graph Client Component
 *
 * Force-directed knowledge graph with:
 * - Type initials inside each node (A/V/N/S...) so you instantly know the category
 * - Focus mode: click a node → detail panel slides in with full connection list
 * - Orphan nodes rendered as hollow dashed rings, visually distinct from connected nodes
 * - Shared tag labels on focused edges
 */

import { useState, useEffect, useCallback, useRef, useMemo, type ComponentType } from 'react';

import { useQuery } from '@redwoodjs/web';

import { CardDetailModal } from 'src/components/CardDetailModal/CardDetailModal';
import { GraphFilterPanel } from 'src/components/GraphFilterPanel/GraphFilterPanel';
import { GraphDetailPanel } from 'src/components/GraphDetailPanel/GraphDetailPanel';
import type { ConnectionItem } from 'src/components/GraphDetailPanel/GraphDetailPanel';
import { GraphListView } from 'src/components/GraphListView/GraphListView';
import { GraphTooltip } from 'src/components/GraphTooltip/GraphTooltip';
import { ViewModeToggle } from 'src/components/ViewModeToggle/ViewModeToggle';
import { usePersistedViewMode } from 'src/hooks/usePersistedViewMode';
import { haptic } from 'src/lib/haptics';
import type { GraphNode } from 'src/lib/graph';
import type { Card } from 'src/lib/types';
import { Loader2, Network, Rows3 } from 'lucide-react';

// =============================================================================
// GRAPHQL — fetch a single card for the detail modal
// =============================================================================

const CARD_QUERY = gql`
	query GraphCardQuery($id: String!) {
		card(id: $id) {
			id
			userId
			type
			title
			content
			url
			imageUrl
			metadata
			tags
			createdAt
			updatedAt
			archivedAt
			deletedAt
		}
	}
`;

// =============================================================================
// TYPES & CONSTANTS
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FGNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FGLink = any;

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

const TYPE_INITIALS: Record<string, string> = {
	article: 'A', social: 'S', video: 'V', note: 'N',
	image: 'I', book: 'B', movie: 'M', product: 'P',
};

const EDGE_COLOR = '#B8AD9E';
const DIM_ALPHA = 0.08;

// Detect dark mode for canvas text (CSS vars aren't available in canvas)
function isDarkMode(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function truncate(s: string | null | undefined, max: number): string {
	if (!s) return '';
	return s.length <= max ? s : s.slice(0, max) + '\u2026';
}

function getLinkEndpointId(endpoint: unknown): string | null {
	if (typeof endpoint === 'string') {
		return endpoint;
	}

	if (
		endpoint &&
		typeof endpoint === 'object' &&
		'id' in endpoint &&
		typeof endpoint.id === 'string'
	) {
		return endpoint.id;
	}

	return null;
}

function drawRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
) {
	if (typeof ctx.roundRect === 'function') {
		ctx.roundRect(x, y, width, height, radius);
		return;
	}

	const safeRadius = Math.min(radius, width / 2, height / 2);
	ctx.moveTo(x + safeRadius, y);
	ctx.lineTo(x + width - safeRadius, y);
	ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
	ctx.lineTo(x + width, y + height - safeRadius);
	ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
	ctx.lineTo(x + safeRadius, y + height);
	ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
	ctx.lineTo(x, y + safeRadius);
	ctx.quadraticCurveTo(x, y, x + safeRadius, y);
}

// =============================================================================
// COMPONENT
// =============================================================================

export function GraphClient({ nodes, links }: GraphClientProps) {
	const [minWeight, setMinWeight] = useState(1);
	const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
	const [viewMode, setViewMode] = usePersistedViewMode(
		'byoa_graph_view_mode',
		['graph', 'list'] as const,
		'graph'
	);
	const [ForceGraphCanvas, setForceGraphCanvas] = useState<ComponentType<any> | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
	const [graphLoadError, setGraphLoadError] = useState<string | null>(null);
	const [currentZoom, setCurrentZoom] = useState(1);

	// Card detail modal state
	const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

	// Fetch the full card when one is selected for the modal
	const { data: cardData, loading: cardLoading } = useQuery(CARD_QUERY, {
		variables: { id: selectedCardId },
		skip: !selectedCardId,
	});
	const selectedCard: Card | null = cardData?.card ?? null;

	// Tooltip
	const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
	const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
	const [connectedNames, setConnectedNames] = useState<string[]>([]);

	const containerRef = useRef<HTMLDivElement>(null);
	const fgRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
	const forcesConfigured = useRef(false);
	const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
	const isMobile = dimensions.width < 768;

	// Track double-tap for mobile "open detail" gesture
	const lastTapRef = useRef<{ nodeId: string; time: number } | null>(null);

	// -------------------------------------------------------------------------
	// RESPONSIVE SIZING
	// -------------------------------------------------------------------------

	useEffect(() => {
		let isActive = true;

		import('react-force-graph-2d')
			.then((mod) => {
				if (!isActive) return;
				const GraphRenderer =
					(mod.default as ComponentType<any> | undefined) ||
					((mod as unknown as { ForceGraph2D?: ComponentType<any> }).ForceGraph2D ??
						null);

				if (!GraphRenderer) {
					throw new Error('Graph renderer export not found');
				}

				setForceGraphCanvas(() => GraphRenderer);
				setGraphLoadError(null);
			})
			.catch((error) => {
				console.error('[GraphClient] Failed to load graph renderer', error);
				if (!isActive) return;
				setGraphLoadError(
					error instanceof Error
						? error.message
						: 'Unable to load graph renderer'
				);
			});

		return () => {
			isActive = false;
		};
	}, []);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		function updateSize() {
			if (containerRef.current) {
				const w = containerRef.current.clientWidth;
				const h = containerRef.current.clientHeight;
				if (w > 0 && h > 0) setDimensions({ width: w, height: h });
			}
		}
		let observer: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined') {
			observer = new ResizeObserver(updateSize);
			observer.observe(el);
		}
		updateSize();
		window.addEventListener('resize', updateSize);
		return () => {
			observer?.disconnect();
			window.removeEventListener('resize', updateSize);
		};
	}, []);

	// -------------------------------------------------------------------------
	// CONFIGURE D3 FORCES
	// -------------------------------------------------------------------------

	// Reset force configuration when mobile breakpoint changes so forces re-apply
	useEffect(() => {
		forcesConfigured.current = false;
	}, [isMobile]);

	const configureForces = useCallback(() => {
		const fg = fgRef.current;
		if (!fg || forcesConfigured.current) return;
		forcesConfigured.current = true;

		// Stronger repulsion as graph grows to prevent overlap.
		// Math.min picks the more-negative (stronger) of floor vs. scaled value.
		const CHARGE_FLOOR = isMobile ? -200 : -300;
		const CHARGE_PER_NODE = isMobile ? 0.5 : 0.8;
		const CHARGE_BASE = isMobile ? -100 : -150;
		const chargeStrength = Math.min(CHARGE_FLOOR, CHARGE_BASE - nodes.length * CHARGE_PER_NODE);

		fg.d3Force('charge')?.strength(chargeStrength).distanceMax(isMobile ? 400 : 600);
		fg.d3Force('link')?.distance((link: FGLink) => {
			const base = isMobile ? 50 : 80;
			const spread = isMobile ? 100 : 150;
			return base + (1 / (link.weight ?? 1)) * spread;
		});
		fg.d3Force('center')?.strength(0.05);
		fg.d3ReheatSimulation();
	}, [isMobile, nodes.length]);

	// -------------------------------------------------------------------------
	// BUILD GRAPH DATA
	// -------------------------------------------------------------------------

	const graphData = useMemo(() => {
		const colouredNodes = nodes.map((n) => ({
			...n,
			color: n.colors?.[0] ?? TYPE_COLORS[n.type] ?? '#6B7280',
		}));
		const filteredLinks = links
			.filter((l) => l.weight >= minWeight)
			.map((l) => ({ ...l }));
		return { nodes: colouredNodes, links: filteredLinks };
	}, [nodes, links, minWeight]);

	// Set of node IDs that have at least one edge (at current minWeight)
	const connectedNodeIds = useMemo(() => {
		const ids = new Set<string>();
		for (const link of graphData.links) {
			const src = getLinkEndpointId(link.source);
			const tgt = getLinkEndpointId(link.target);
			if (src) ids.add(src);
			if (tgt) ids.add(tgt);
		}
		return ids;
	}, [graphData.links]);

	const orphanCount = graphData.nodes.length - connectedNodeIds.size;

	// Neighbor index + metadata for detail panel
	const neighborIndex = useMemo(() => {
		const idx: Record<string, Set<string>> = {};
		const titleMap: Record<string, string> = {};
		const typeMap: Record<string, string> = {};
		const colorMap: Record<string, string> = {};
		const tagsMap: Record<string, readonly string[]> = {};

		for (const n of graphData.nodes) {
			titleMap[n.id] = n.title || 'Untitled';
			typeMap[n.id] = n.type;
			colorMap[n.id] = n.color || '#6B7280';
			tagsMap[n.id] = n.tags;
			idx[n.id] = new Set();
		}

		// Link metadata: shared tags + weight per connection
		const linkMeta: Record<string, { sharedTags: string[]; weight: number }> = {};
		for (const link of graphData.links) {
			const src = getLinkEndpointId(link.source);
			const tgt = getLinkEndpointId(link.target);
			if (src && tgt) {
				idx[src]?.add(tgt);
				idx[tgt]?.add(src);
				const key = [src, tgt].sort().join('::');
				linkMeta[key] = {
					sharedTags: Array.isArray(link.sharedTags) ? [...link.sharedTags] : [],
					weight: link.weight,
				};
			}
		}

		return { idx, titleMap, typeMap, colorMap, tagsMap, linkMeta };
	}, [graphData]);

	const focusedNeighbors = useMemo(() => {
		if (!focusedNodeId) return null;
		return neighborIndex.idx[focusedNodeId] ?? new Set<string>();
	}, [focusedNodeId, neighborIndex]);

	// Build connection list for the detail panel
	const focusedConnections = useMemo((): ConnectionItem[] => {
		if (!focusedNodeId || !focusedNeighbors) return [];
		return Array.from(focusedNeighbors)
			.map((nid) => {
				const key = [focusedNodeId, nid].sort().join('::');
				const meta = neighborIndex.linkMeta[key];
				return {
					id: nid,
					title: neighborIndex.titleMap[nid] || 'Untitled',
					type: neighborIndex.typeMap[nid] || 'article',
					color: neighborIndex.colorMap[nid] || '#6B7280',
					sharedTags: meta?.sharedTags || [],
					weight: meta?.weight || 1,
				};
			})
			.sort((a, b) => b.weight - a.weight);
	}, [focusedNodeId, focusedNeighbors, neighborIndex]);

	const maxWeight = useMemo(
		() => Math.max(1, ...graphData.links.map((l) => l.weight)),
		[graphData.links]
	);

	const maxConnections = useMemo(
		() => Math.max(1, ...graphData.nodes.map((n) => n.connections)),
		[graphData.nodes]
	);

	const getConnectedNames = useCallback(
		(nodeId: string) => {
			const neighbors = neighborIndex.idx[nodeId];
			if (!neighbors) return [];
			return Array.from(neighbors)
				.slice(0, 5)
				.map((id) => neighborIndex.titleMap[id] || 'Untitled');
		},
		[neighborIndex]
	);

	// -------------------------------------------------------------------------
	// CALLBACKS
	// -------------------------------------------------------------------------

	const handleNodeHover = useCallback(
		(node: FGNode | null, _prev: FGNode | null) => {
			if (node) {
				setHoveredNode(node as GraphNode);
				setTooltipPos({ x: (node.__screenX ?? 0) as number, y: (node.__screenY ?? 0) as number });
				setConnectedNames(getConnectedNames(node.id));
			} else {
				setHoveredNode(null);
				setTooltipPos(null);
				setConnectedNames([]);
			}
		},
		[getConnectedNames]
	);

	useEffect(() => {
		function handleMouseMove(e: MouseEvent) {
			if (hoveredNode) setTooltipPos({ x: e.clientX, y: e.clientY });
		}
		window.addEventListener('mousemove', handleMouseMove);
		return () => window.removeEventListener('mousemove', handleMouseMove);
	}, [hoveredNode]);

	const handleNodeClick = useCallback(
		(node: FGNode) => {
			const now = Date.now();
			const last = lastTapRef.current;

			// Double-tap / double-click detection: same node within 400ms
			const isDoubleTap = last && last.nodeId === node.id && now - last.time < 400;
			lastTapRef.current = { nodeId: node.id, time: now };

			if (focusedNodeId === node.id || isDoubleTap) {
				// Second click on the focused node OR double-tap — open card detail modal
				haptic('medium');
				setSelectedCardId(node.id);
			} else {
				haptic('light');
				setFocusedNodeId(node.id);
				const fg = fgRef.current;
				if (fg) {
					fg.centerAt(node.x, node.y, 600);
					fg.zoom(isMobile ? 2 : 2.5, 600);
				}
			}
		},
		[focusedNodeId, isMobile]
	);

	const closeFocus = useCallback(() => {
		setFocusedNodeId(null);
		const fg = fgRef.current;
		if (fg) {
			fg.centerAt(0, 0, 600);
			fg.zoom(1, 600);
		}
	}, []);

	const handleBackgroundClick = useCallback(() => {
		if (focusedNodeId) closeFocus();
	}, [focusedNodeId, closeFocus]);

	const handleZoom = useCallback(({ k }: { k: number }) => {
		setCurrentZoom(k);
	}, []);

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				// Close the modal first if open; otherwise close focus mode
				if (selectedCardId) {
					setSelectedCardId(null);
				} else if (focusedNodeId) {
					closeFocus();
				}
			}
		}
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [focusedNodeId, selectedCardId, closeFocus]);

	useEffect(() => {
		if (graphLoadError && viewMode === 'graph') {
			setViewMode('list');
		}
	}, [graphLoadError, setViewMode, viewMode]);

	// -------------------------------------------------------------------------
	// CANVAS RENDERING
	// -------------------------------------------------------------------------

	const nodeCanvasObject = useCallback(
		(node: FGNode, ctx: CanvasRenderingContext2D) => {
			const x = node.x ?? 0;
			const y = node.y ?? 0;

			// Viewport culling — skip nodes outside visible canvas
			const canvas = ctx.canvas;
			const transform = ctx.getTransform();
			const screenX = x * transform.a + transform.e;
			const screenY = y * transform.d + transform.f;
			const pad = 60;
			if (
				screenX < -pad ||
				screenX > canvas.width + pad ||
				screenY < -pad ||
				screenY > canvas.height + pad
			) {
				return;
			}

			// LOD — hide text at far zoom levels to improve render perf
			const showLabels = currentZoom > 1.0;
			const showInitials = currentZoom > 0.5;

			const connections = node.connections ?? 0;
			const color = node.color ?? '#6B7280';
			const type = node.type ?? 'article';
			const isOrphan = !connectedNodeIds.has(node.id);

			const isHovered = hoveredNode?.id === node.id;
			const isFocused = focusedNodeId === node.id;
			const isNeighbor = focusedNeighbors?.has(node.id) ?? false;
			const inFocusMode = focusedNodeId !== null;

			// ---- ORPHAN NODES: hollow dashed rings ----
			if (isOrphan && !isHovered) {
				const r = 6;
				ctx.beginPath();
				ctx.arc(x, y, r, 0, 2 * Math.PI);
				ctx.setLineDash([2, 2]);
				ctx.strokeStyle = color;
				ctx.globalAlpha = inFocusMode ? 0.12 : 0.35;
				ctx.lineWidth = 1.25;
				ctx.stroke();
				ctx.setLineDash([]);
				ctx.globalAlpha = 1;

				// Type initial inside orphan (tiny)
				if (showInitials) {
					ctx.font = '600 5px Inter, system-ui, sans-serif';
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					ctx.fillStyle = color;
					ctx.globalAlpha = inFocusMode ? 0.14 : 0.28;
					ctx.fillText(TYPE_INITIALS[type] || '?', x, y);
					ctx.globalAlpha = 1;
				}
				return;
			}

			// ---- CONNECTED NODES ----
			const radius = Math.sqrt(Math.max(1, connections)) * 4 + 5;

			let alpha: number;
			if (inFocusMode) {
				alpha = (isFocused || isNeighbor) ? 1 : DIM_ALPHA;
			} else {
				alpha = 0.35 + (connections / maxConnections) * 0.65;
			}
			if (isHovered) alpha = 1;

			// Glow
			if (isHovered || isFocused) {
				ctx.beginPath();
				ctx.arc(x, y, radius + 6, 0, 2 * Math.PI);
				ctx.fillStyle = color + '22';
				ctx.fill();
			}

			// Filled circle
			ctx.beginPath();
			ctx.arc(x, y, radius, 0, 2 * Math.PI);
			ctx.globalAlpha = alpha;
			ctx.fillStyle = color;
			ctx.fill();
			ctx.globalAlpha = 1;

			// TYPE INITIAL inside the node — white letter, bold, centered
			if (showInitials) {
				const initial = TYPE_INITIALS[type] || '?';
				const initialSize = Math.max(8, radius * 0.75);
				ctx.font = `700 ${initialSize}px Inter, system-ui, sans-serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillStyle = '#FFFFFF';
				ctx.globalAlpha = alpha * 0.9;
				ctx.fillText(initial, x, y);
				ctx.globalAlpha = 1;
			}

			// Title label below node
			if (showLabels) {
				const title = node.title;
				const showLabel = !inFocusMode || isFocused || isNeighbor || isHovered;
				if (title && showLabel && alpha > DIM_ALPHA) {
					const prominent = isHovered || isFocused;
					const dark = isDarkMode();
					const label = prominent ? truncate(title, 36) : truncate(title, 20);
					const fontSize = prominent ? 12 : 10;
					ctx.font = `${prominent ? '600 ' : ''}${fontSize}px Inter, system-ui, sans-serif`;
					ctx.textAlign = 'center';
					ctx.textBaseline = 'top';
					ctx.fillStyle = prominent
						? (dark ? '#F5EFE5' : '#2D2D2D')
						: (dark ? '#A8A098' : '#5A5A5A');
					ctx.globalAlpha = prominent ? 1 : Math.max(0.5, alpha * 0.9);
					ctx.fillText(label, x, y + radius + 3);
					ctx.globalAlpha = 1;
				}
			}
		},
		[hoveredNode, focusedNodeId, focusedNeighbors, maxConnections, connectedNodeIds, currentZoom]
	);

	const linkCanvasObject = useCallback(
		(link: FGLink, ctx: CanvasRenderingContext2D) => {
			const src = link.source;
			const tgt = link.target;
			if (!src || !tgt || src.x == null || tgt.x == null) return;

			const srcId = src.id ?? src;
			const tgtId = tgt.id ?? tgt;
			const inFocusMode = focusedNodeId !== null;
			const isFocusedLink = inFocusMode && (srcId === focusedNodeId || tgtId === focusedNodeId);

			const weight = link.weight ?? 1;
			const t = 0.15 + (weight / maxWeight) * 0.45;

			let edgeAlpha = t;
			if (inFocusMode && !isFocusedLink) edgeAlpha = DIM_ALPHA * 0.5;
			if (isFocusedLink) edgeAlpha = Math.max(t, 0.5);

			const sx = src.x, sy = src.y, tx = tgt.x, ty = tgt.y;

			// Viewport culling — skip links where both endpoints are offscreen
			const canvas = ctx.canvas;
			const transform = ctx.getTransform();
			const srcScreenX = sx * transform.a + transform.e;
			const srcScreenY = sy * transform.d + transform.f;
			const tgtScreenX = tx * transform.a + transform.e;
			const tgtScreenY = ty * transform.d + transform.f;
			const linkPad = 20;
			const bothOffscreen =
				(srcScreenX < -linkPad && tgtScreenX < -linkPad) ||
				(srcScreenX > canvas.width + linkPad && tgtScreenX > canvas.width + linkPad) ||
				(srcScreenY < -linkPad && tgtScreenY < -linkPad) ||
				(srcScreenY > canvas.height + linkPad && tgtScreenY > canvas.height + linkPad);
			if (bothOffscreen) return;

			const mx = (sx + tx) / 2;
			const my = (sy + ty) / 2;
			const dx = tx - sx;
			const dy = ty - sy;
			const cpx = mx - dy * 0.15;
			const cpy = my + dx * 0.15;

			ctx.beginPath();
			ctx.moveTo(sx, sy);
			ctx.quadraticCurveTo(cpx, cpy, tx, ty);
			ctx.strokeStyle = isFocusedLink ? '#8B7355' : EDGE_COLOR;
			ctx.globalAlpha = edgeAlpha;
			ctx.lineWidth = isFocusedLink ? Math.max(1.5, weight * 1) : Math.max(0.5, weight * 0.8);
			ctx.stroke();
			ctx.globalAlpha = 1;

			// Shared tag labels on focused links
			const sharedTags = link.sharedTags;
			if (isFocusedLink && sharedTags && sharedTags.length > 0) {
				const lx = (mx + cpx) / 2;
				const ly = (my + cpy) / 2;
				const label = sharedTags.slice(0, 3).join(', ');
				ctx.font = '9px Inter, system-ui, sans-serif';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';

				const dark = isDarkMode();
				const metrics = ctx.measureText(label);
				const pw = metrics.width + 8;
				const ph = 14;
				ctx.fillStyle = dark ? '#1A1A2E' : '#F7F6F3';
				ctx.globalAlpha = 0.9;
				ctx.beginPath();
				drawRoundedRect(ctx, lx - pw / 2, ly - ph / 2, pw, ph, 4);
				ctx.fill();

				ctx.fillStyle = dark ? '#C4B5A0' : '#6B5D4F';
				ctx.globalAlpha = 1;
				ctx.fillText(label, lx, ly);
			}
		},
		[focusedNodeId, maxWeight]
	);

	const handleReset = useCallback(() => {
		setMinWeight(1);
		setFocusedNodeId(null);
	}, []);

	// -------------------------------------------------------------------------
	// RENDER
	// -------------------------------------------------------------------------

	const isReady = dimensions.width > 10 && dimensions.height > 10;
	const hasFilteredLinks = graphData.links.length > 0;
	const showGraphCanvas = viewMode === 'graph';

	useEffect(() => {
		if (viewMode === 'graph' && graphLoadError) {
			setViewMode('list');
		}
	}, [graphLoadError, setViewMode, viewMode]);

	// Focused node metadata for the detail panel
	const focusedNodeMeta = focusedNodeId
		? {
				title: neighborIndex.titleMap[focusedNodeId] || 'Untitled',
				type: neighborIndex.typeMap[focusedNodeId] || 'article',
				color: neighborIndex.colorMap[focusedNodeId] || '#6B7280',
				tags: [...(neighborIndex.tagsMap[focusedNodeId] || [])],
			}
		: null;

	return (
		<div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, touchAction: viewMode === 'list' ? 'auto' : (isMobile ? 'manipulation' : 'none') }}>
			<div className="absolute right-4 top-4 z-50">
				<ViewModeToggle
					value={viewMode}
					onChange={setViewMode}
					ariaLabel="Graph page view"
					options={[
						{
							value: 'graph',
							label: 'Graph',
							icon: <Network className="h-4 w-4" />,
						},
						{
							value: 'list',
							label: 'List',
							icon: <Rows3 className="h-4 w-4" />,
						},
					]}
				/>
			</div>
			{viewMode === 'graph' && !hasFilteredLinks && (
				<div className="absolute left-4 top-4 z-40 max-w-[320px] rounded-[18px] px-3.5 py-3 text-xs"
					style={{
						backgroundColor: 'var(--surface-floating)',
						border: '1px solid var(--border-subtle)',
						boxShadow: 'var(--shadow-sm)',
						color: 'var(--foreground-muted)',
					}}
				>
					No shared-tag edges yet. The graph still renders every card, and list
					view stays available as a denser fallback while tags improve.
				</div>
			)}
			{viewMode === 'list' ? (
				<GraphListView
					nodes={graphData.nodes}
					links={graphData.links}
					onCardOpen={setSelectedCardId}
				/>
			) : !isReady || !ForceGraphCanvas ? (
				<div className="flex items-center justify-center" style={{ width: '100%', height: '100%' }}>
					<Loader2 className="h-8 w-8 animate-spin text-[var(--accent-primary)]" />
				</div>
			) : graphLoadError ? (
				<div className="flex h-full items-center justify-center px-6 text-center">
					<div>
						<p className="text-sm font-medium text-[var(--foreground)]">
							Graph renderer failed to load
						</p>
						<p className="mt-2 text-sm text-[var(--foreground-muted)]">
							{graphLoadError}
						</p>
					</div>
				</div>
			) : showGraphCanvas ? (
				<ForceGraphCanvas
					ref={fgRef}
					graphData={graphData}
					width={dimensions.width}
					height={dimensions.height}
					nodeCanvasObject={nodeCanvasObject}
					nodePointerAreaPaint={(node: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
						const isOrphan = !connectedNodeIds.has(node.id);
						const radius = isOrphan ? 8 : Math.sqrt(Math.max(1, node.connections ?? 1)) * 4 + 8;
						ctx.beginPath();
						ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI);
						ctx.fillStyle = color;
						ctx.fill();
					}}
					linkCanvasObject={linkCanvasObject}
					linkPointerAreaPaint={() => {}}
					enableNodeDrag={isMobile}
					enableZoomInteraction={true}
					enablePanInteraction={true}
					onNodeHover={handleNodeHover}
					onNodeClick={handleNodeClick}
					onBackgroundClick={handleBackgroundClick}
					onZoom={handleZoom}
					onEngineStop={configureForces}
					backgroundColor="#00000000"
					cooldownTicks={isMobile ? 150 : 300}
					d3AlphaDecay={isMobile ? 0.04 : 0.008}
					d3VelocityDecay={0.3}
				/>
			) : null}

			{viewMode === 'graph' && (
				<GraphFilterPanel
					minWeight={minWeight}
					onMinWeightChange={setMinWeight}
					nodeCount={graphData.nodes.length}
					edgeCount={graphData.links.length}
					orphanCount={orphanCount}
					onReset={handleReset}
				/>
			)}

			{/* Focus mode hint */}
			{viewMode === 'graph' && !focusedNodeId && hasFilteredLinks && (
				<div
					className="absolute top-4 left-1/2 -translate-x-1/2 text-[11px] select-none pointer-events-none"
					style={{ color: 'var(--foreground-muted)' }}
				>
					Click a node to explore its connections
				</div>
			)}

			{/* Detail panel — replaces the old info bar */}
			{viewMode === 'graph' && focusedNodeId && focusedNodeMeta && (
				<GraphDetailPanel
					nodeTitle={focusedNodeMeta.title}
					nodeType={focusedNodeMeta.type}
					nodeColor={focusedNodeMeta.color}
					nodeTags={focusedNodeMeta.tags}
					connections={focusedConnections}
					onClose={closeFocus}
					onCardClick={setSelectedCardId}
				/>
			)}

			{viewMode === 'graph' && (
				<GraphTooltip node={hoveredNode} position={tooltipPos} connectedNames={connectedNames} />
			)}

			{/* Card detail modal overlay — opens when a card is clicked in the graph */}
			{selectedCardId && (
				<>
					{cardLoading && !selectedCard && (
						<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
							<Loader2 className="h-8 w-8 animate-spin text-white" />
						</div>
					)}
					{selectedCard && (
						<CardDetailModal
							key={selectedCard.id}
							card={selectedCard}
							isOpen={true}
							onClose={() => setSelectedCardId(null)}
						/>
					)}
				</>
			)}
		</div>
	);
}
