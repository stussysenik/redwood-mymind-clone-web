/**
 * BYOA - Graph Client Component
 *
 * Force-directed knowledge graph with:
 * - Type initials inside each node (A/V/N/S...) so you instantly know the category
 * - Focus mode: click a node → detail panel slides in with full connection list
 * - Orphan nodes rendered as hollow dashed rings, visually distinct from connected nodes
 * - Shared tag labels on focused edges
 */

import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense, type ComponentType } from 'react';

import { useMutation, useQuery } from '@redwoodjs/web';

import { CardDetailModal } from 'src/components/CardDetailModal/CardDetailModal';
import { GraphDimensionToggle } from 'src/components/GraphDimensionToggle/GraphDimensionToggle';
import { GraphFilterPanel } from 'src/components/GraphFilterPanel/GraphFilterPanel';
import { GraphDetailPanel } from 'src/components/GraphDetailPanel/GraphDetailPanel';
import type { ConnectionItem } from 'src/components/GraphDetailPanel/GraphDetailPanel';
import { GraphListView } from 'src/components/GraphListView/GraphListView';
import { GraphTooltip } from 'src/components/GraphTooltip/GraphTooltip';
import { useToast } from 'src/components/Toast/Toast';
import { ViewModeToggle } from 'src/components/ViewModeToggle/ViewModeToggle';
import { usePersistedViewMode } from 'src/hooks/usePersistedViewMode';
import { haptic } from 'src/lib/haptics';
import type { GraphNode } from 'src/lib/graph';
import type { RendererBackend, GraphDimension } from 'src/lib/graph-renderer-types';
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
// GRAPHQL — card mutations used by the detail modal (archive / unarchive / delete)
// =============================================================================

const ARCHIVE_CARD_MUTATION = gql`
	mutation GraphArchiveCard($id: String!) {
		archiveCard(id: $id) { id archivedAt }
	}
`;

const UNARCHIVE_CARD_MUTATION = gql`
	mutation GraphUnarchiveCard($id: String!) {
		unarchiveCard(id: $id) { id archivedAt }
	}
`;

const DELETE_CARD_MUTATION = gql`
	mutation GraphDeleteCard($id: String!) {
		deleteCard(id: $id, permanent: false) { id deletedAt }
	}
`;

const SET_GRAPH_DIMENSION = gql`
	mutation GraphSetDimension($graphDimension: String!) {
		updateUserPreferences(graphDimension: $graphDimension) {
			userId
			graphDimension
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
	rendererBackend?: RendererBackend;
	graphDimension?: GraphDimension;
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

// Hard cap on rendered edges. Beyond a few thousand edges d3-force runs on the
// main thread become unworkable (each tick = O(E)) and the visualization turns
// into unreadable soup. When filtered links exceed this budget we keep the
// top-weighted edges — those are the strongest knowledge connections — and
// drop the long tail. Raise via the minWeight slider if users want more.
const EDGE_BUDGET = 4000;

// Safety net: if the simulation never fires onEngineStop (corrupt data,
// pathological layout, slow device), reveal the canvas anyway after this long
// so the user never sees a forever-spinner.
const SETTLE_TIMEOUT_MS = 8000;

// Lazy-loaded alternative renderers — only bundled when the user selects them
const WebGLGraphRenderer = lazy(() =>
  import('src/components/WebGLGraphRenderer/WebGLGraphRenderer').then((m) => ({
    default: m.WebGLGraphRenderer,
  }))
)
const ThreeGraphRenderer = lazy(() =>
  import('src/components/ThreeGraphRenderer/ThreeGraphRenderer').then((m) => ({
    default: m.ThreeGraphRenderer,
  }))
)

// Module-level canvas font constants — hoisted out of the hot render path so
// the browser can cache parsed font descriptors and we avoid string allocations
// on every requestAnimationFrame.
const FONT_LABEL_PROMINENT = '600 12px Inter, system-ui, sans-serif';
const FONT_LABEL_NORMAL    = '10px Inter, system-ui, sans-serif';
const FONT_ORPHAN_INITIAL  = '600 5px Inter, system-ui, sans-serif';
const FONT_TAG_LABEL       = '9px Inter, system-ui, sans-serif';

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
// LAYOUT POSITION CACHE
// Saves the fully-settled d3 node positions to localStorage after the first
// simulation. On subsequent loads the positions are injected into graphData so
// ForceGraph2D starts near its final state and needs only ~20 ticks to
// fine-tune — making the graph appear instantly on repeat visits.
//
// Cache key: djb2 hash of sorted node IDs — invalidated automatically when the
// graph topology changes (new cards added, deleted, etc.).
// =============================================================================

const LAYOUT_CACHE_PREFIX = 'byoa_gl_v1_';

type LayoutPositions = Record<string, { x: number; y: number }>;

/** djb2 hash of sorted, null-byte-delimited node IDs. */
function graphLayoutKey(nodeIds: readonly string[]): string {
	const sorted = [...nodeIds].sort().join('\x00');
	let h = 5381;
	for (let i = 0; i < sorted.length; i++) {
		h = ((h << 5) + h + sorted.charCodeAt(i)) | 0;
	}
	return LAYOUT_CACHE_PREFIX + Math.abs(h).toString(36);
}

function loadLayout(key: string): LayoutPositions | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		return JSON.parse(raw) as LayoutPositions;
	} catch {
		return null;
	}
}

function saveLayout(
	key: string,
	nodes: ReadonlyArray<{ id: string; x?: number; y?: number }>
): void {
	try {
		const positions: LayoutPositions = {};
		for (const n of nodes) {
			if (n.x != null && n.y != null && isFinite(n.x) && isFinite(n.y)) {
				// Round to 1 decimal place — saves ~30% space vs full float precision
				positions[n.id] = { x: Math.round(n.x * 10) / 10, y: Math.round(n.y * 10) / 10 };
			}
		}
		localStorage.setItem(key, JSON.stringify(positions));
	} catch {
		// localStorage full or unavailable — silently skip
	}
}

// =============================================================================
// COMPONENT
// =============================================================================

export function GraphClient({ nodes, links, rendererBackend = 'canvas', graphDimension: serverDimension = '2d' }: GraphClientProps) {
	// -------------------------------------------------------------------------
	// DIMENSIONALITY STATE — 2D / 3D toggle with optimistic local state
	// -------------------------------------------------------------------------
	const [localDimension, setLocalDimension] = useState<GraphDimension>(serverDimension);

	// Sync when the server value changes (e.g., loaded from cache on another device)
	useEffect(() => { setLocalDimension(serverDimension); }, [serverDimension]);

	const [setDimensionMutation] = useMutation(SET_GRAPH_DIMENSION, {
		onError: () => setLocalDimension(serverDimension), // rollback on failure
	});

	const handleDimensionChange = useCallback((next: GraphDimension) => {
		if (next === localDimension) return;
		setLocalDimension(next);
		setDimensionMutation({ variables: { graphDimension: next } });
	}, [localDimension, setDimensionMutation]);

	// When 3D is active, always use Three; when 2D, fall back to the user's 2D
	// backend preference (canvas or webgl — but never 'three' in 2D mode).
	const effectiveRenderer: RendererBackend = localDimension === '3d'
		? 'three'
		: (rendererBackend === 'three' ? 'canvas' : rendererBackend);

	const [minWeight, setMinWeight] = useState(1);
	const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
	const [viewMode, setViewMode] = usePersistedViewMode(
		'byoa_graph_view_mode',
		['graph', 'list'] as const,
		'graph'
	);
	const [ForceGraphCanvas, setForceGraphCanvas] = useState<ComponentType<any> | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
	const [graphLoadError, setGraphLoadError] = useState<string | null>(null);
	// Zoom is stored in a ref — ForceGraph2D emits `onZoom` synchronously from
	// its own adjustCanvasSize path, which runs *during* React's render phase.
	// Using setState from that callback triggers React's
	// "Cannot update a component while rendering a different component" warning.
	// Since currentZoom is only read per-frame inside `nodeCanvasObject` (which
	// ForceGraph calls from its own rAF), a ref is sufficient and actively better:
	// it keeps `nodeCanvasObject` referentially stable, so ForceGraph's internal
	// memoization isn't invalidated on every zoom tick.
	const currentZoomRef = useRef(1);

	// Card detail modal state
	const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

	// Fetch the full card when one is selected for the modal
	const { data: cardData, loading: cardLoading } = useQuery(CARD_QUERY, {
		variables: { id: selectedCardId },
		skip: !selectedCardId,
	});
	const selectedCard: Card | null = cardData?.card ?? null;

	// Toast for archive/delete feedback
	const { showToast } = useToast();

	// ---------------------------------------------------------------------------
	// CARD MUTATIONS — archive / unarchive / delete
	//
	// Each mutation passes an `update` fn that rewrites every cached variant of
	// the `graphData` Query field, filtering out the affected node and any links
	// that touch it. Because we mutate the cache IN PLACE (not via refetch),
	// ForceGraph2D just diffs a single missing node — the remaining nodes keep
	// their simulation state, so there's no camera reset or layout re-settle.
	// ---------------------------------------------------------------------------
	const removeCardFromGraphCache = useCallback(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(cache: any, cardId: string) => {
			cache.modify({
				fields: {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					graphData(existing: any, { readField }: { readField: (field: string, obj?: any) => unknown }) { // eslint-disable-line @typescript-eslint/no-explicit-any
						if (!existing || typeof existing !== 'object') return existing;
						const nextNodes = Array.isArray(existing.nodes)
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							? existing.nodes.filter((n: any) => readField('id', n) !== cardId)
							: existing.nodes;
						const nextLinks = Array.isArray(existing.links)
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							? existing.links.filter((l: any) => {
									const src = readField('source', l);
									const tgt = readField('target', l);
									return src !== cardId && tgt !== cardId;
								})
							: existing.links;
						return { ...existing, nodes: nextNodes, links: nextLinks };
					},
				},
			});
			// Cascade into the normalized entity so any other query that points
			// at this GraphNode stops rendering a ghost reference.
			cache.evict({ id: `GraphNode:${cardId}` });
			cache.gc();
		},
		[]
	);

	const [archiveCardMutation] = useMutation(ARCHIVE_CARD_MUTATION, {
		update(cache, _result, options) {
			const id = (options.variables as { id?: string } | undefined)?.id;
			if (id) removeCardFromGraphCache(cache, id);
		},
	});

	const [unarchiveCardMutation] = useMutation(UNARCHIVE_CARD_MUTATION);

	const [deleteCardMutation] = useMutation(DELETE_CARD_MUTATION, {
		update(cache, _result, options) {
			const id = (options.variables as { id?: string } | undefined)?.id;
			if (!id) return;
			removeCardFromGraphCache(cache, id);
			// Soft-delete the Card too so feed/search queries don't surface it
			// until they refetch.
			cache.evict({ id: `Card:${id}` });
			cache.gc();
		},
	});

	const handleArchiveFromGraph = useCallback(
		(cardId: string) => {
			// Close the modal + focus state optimistically so the user sees the
			// node disappear immediately. The cache update then removes it from
			// the underlying graph without a re-settle.
			setSelectedCardId(null);
			setFocusedNodeId(null);
			archiveCardMutation({ variables: { id: cardId } })
				.then(() => showToast('Card archived', 'success'))
				.catch((err) => {
					console.error('[GraphClient] archive failed', err);
					showToast('Failed to archive card', 'error');
				});
		},
		[archiveCardMutation, showToast]
	);

	const handleDeleteFromGraph = useCallback(
		(cardId: string) => {
			setSelectedCardId(null);
			setFocusedNodeId(null);
			deleteCardMutation({ variables: { id: cardId } })
				.then(() => showToast('Card moved to trash', 'info'))
				.catch((err) => {
					console.error('[GraphClient] delete failed', err);
					showToast('Failed to delete card', 'error');
				});
		},
		[deleteCardMutation, showToast]
	);

	const handleRestoreFromGraph = useCallback(
		(cardId: string) => {
			setSelectedCardId(null);
			unarchiveCardMutation({ variables: { id: cardId } })
				.then(() => showToast('Card unarchived', 'success'))
				.catch((err) => {
					console.error('[GraphClient] unarchive failed', err);
					showToast('Failed to unarchive card', 'error');
				});
		},
		[unarchiveCardMutation, showToast]
	);

	// Tooltip
	const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
	const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
	const [connectedNames, setConnectedNames] = useState<string[]>([]);

	// Last known cursor position — updated every mousemove regardless of hover
	// state so the tooltip can pin to the cursor the instant a node enters
	// hover, instead of flashing at (0,0) waiting for the next mousemove.
	const cursorPosRef = useRef<{ x: number; y: number } | null>(null);

	const containerRef = useRef<HTMLDivElement>(null);
	const fgRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
	const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
	const isMobile = dimensions.width < 768;

	// Has the force simulation settled at least once for the current data?
	// Used to keep the canvas hidden during the violent initial d3 layout
	// so the user only ever sees the final, stable shape — no chaos → settle
	// animation, no intermediate flickers.
	const [graphSettled, setGraphSettled] = useState(false);

	// Dark mode — computed once at mount, updated via MediaQueryList event.
	// Never call window.matchMedia inside the canvas render loop (60 fps).
	const darkModeRef = useRef(
		typeof window !== 'undefined'
			? window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
			: false
	);

	// RAF handle for tooltip throttle
	const tooltipRafRef = useRef<number | null>(null);

	// Layout cache refs — set in graphData useMemo so they're ready before render
	const layoutKeyRef = useRef<string>('');
	const hasCachedLayout = useRef(false);

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

	// Keep darkModeRef in sync without polling — runs once, zero cost in canvas loop
	useEffect(() => {
		if (typeof window === 'undefined') return;
		const mql = window.matchMedia('(prefers-color-scheme: dark)');
		const handler = (e: MediaQueryListEvent) => { darkModeRef.current = e.matches; };
		mql.addEventListener('change', handler);
		return () => mql.removeEventListener('change', handler);
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

	// Re-hide the canvas whenever the topology or breakpoint changes — the
	// layout is about to re-run and we want one clean reveal, not chaos.
	// Exception: when positions are pre-seeded from the cache the graph starts
	// near its final state, so we skip the hide and show it immediately.
	useEffect(() => {
		if (hasCachedLayout.current) {
			setGraphSettled(true);
		} else {
			setGraphSettled(false);
		}
	}, [isMobile, nodes.length, links.length]);

	// Forever-spinner insurance: if the simulation never signals engineStop
	// (corrupt data, pathological layout, very slow device) reveal the canvas
	// anyway so the user can interact with whatever d3 has drawn so far.
	useEffect(() => {
		if (graphSettled) return;
		const timeoutId = window.setTimeout(() => {
			setGraphSettled(true);
		}, SETTLE_TIMEOUT_MS);
		return () => window.clearTimeout(timeoutId);
	}, [graphSettled, nodes.length, links.length]);

	// Configure d3 forces as soon as the ForceGraph instance exists. Doing
	// this BEFORE the simulation settles (instead of waiting for a first
	// engineStop → reheat → second stop) cuts the total settle time in half
	// on dense graphs. We poll via rAF because the ref populates after the
	// first commit of the dynamically-loaded renderer.
	useEffect(() => {
		if (!ForceGraphCanvas) return;

		let rafId = 0;
		let cancelled = false;

		const apply = () => {
			if (cancelled) return;
			const fg = fgRef.current;
			if (!fg || typeof fg.d3Force !== 'function') {
				rafId = requestAnimationFrame(apply);
				return;
			}

			// Stronger repulsion as graph grows to prevent overlap.
			// Math.min picks the more-negative (stronger) of floor vs. scaled value.
			const CHARGE_FLOOR = isMobile ? -200 : -300;
			const CHARGE_PER_NODE = isMobile ? 0.5 : 0.8;
			const CHARGE_BASE = isMobile ? -100 : -150;
			const chargeStrength = Math.min(
				CHARGE_FLOOR,
				CHARGE_BASE - nodes.length * CHARGE_PER_NODE
			);

			fg.d3Force('charge')?.strength(chargeStrength).distanceMax(isMobile ? 400 : 600);
			fg.d3Force('link')?.distance((link: FGLink) => {
				const base = isMobile ? 50 : 80;
				const spread = isMobile ? 100 : 150;
				return base + (1 / (link.weight ?? 1)) * spread;
			});
			fg.d3Force('center')?.strength(0.05);

			// Reheat so the freshly-installed forces actually drive the layout
			// from the current (pre-tick) state.
			fg.d3ReheatSimulation?.();
		};

		rafId = requestAnimationFrame(apply);
		return () => {
			cancelled = true;
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, [ForceGraphCanvas, isMobile, nodes.length, links.length]);

	const handleEngineStop = useCallback(() => {
		setGraphSettled(true);
		// Persist settled positions — makes repeat visits near-instant
		if (layoutKeyRef.current && fgRef.current) {
			const gd = fgRef.current.graphData?.() as { nodes?: Array<{ id: string; x?: number; y?: number }> } | undefined;
			if (Array.isArray(gd?.nodes) && gd.nodes.length > 0) {
				saveLayout(layoutKeyRef.current, gd.nodes);
			}
		}
	}, []);

	// -------------------------------------------------------------------------
	// BUILD GRAPH DATA
	// -------------------------------------------------------------------------

	const graphData = useMemo(() => {
		// Look up cached positions for this exact graph topology
		const key = graphLayoutKey(nodes.map((n) => n.id));
		layoutKeyRef.current = key;
		const cached = typeof window !== 'undefined' ? loadLayout(key) : null;
		hasCachedLayout.current = cached !== null;

		const colouredNodes = nodes.map((n) => {
			const pos = cached?.[n.id];
			return {
				...n,
				color: n.colors?.[0] ?? TYPE_COLORS[n.type] ?? '#6B7280',
				// Pre-seed x/y so d3 starts at the settled position — near-instant settle
				...(pos ? { x: pos.x, y: pos.y } : {}),
			};
		});

		// Filter by the user's minWeight slider, then enforce an edge budget.
		// Sorting is O(E log E) but only runs when over budget, and only on
		// minWeight changes — not per frame.
		const afterMinWeight = links.filter((l) => l.weight >= minWeight);
		const budgeted =
			afterMinWeight.length > EDGE_BUDGET
				? [...afterMinWeight]
						.sort((a, b) => b.weight - a.weight)
						.slice(0, EDGE_BUDGET)
				: afterMinWeight;
		const filteredLinks = budgeted.map((l) => ({ ...l }));

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
		() => graphData.links.reduce((m, l) => Math.max(m, l.weight), 1),
		[graphData.links]
	);

	const maxConnections = useMemo(
		() => graphData.nodes.reduce((m, n) => Math.max(m, n.connections), 1),
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
				// Pin to the last known cursor position so the tooltip never
				// flashes in the top-left corner while waiting for a fresh
				// mousemove. react-force-graph never populates __screenX/Y,
				// so the old fallback-to-0 path was the source of the artifact.
				const cursor = cursorPosRef.current;
				if (cursor) {
					setTooltipPos({ x: cursor.x, y: cursor.y });
				}
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
			cursorPosRef.current = { x: e.clientX, y: e.clientY };
			if (!hoveredNode) return;
			if (tooltipRafRef.current !== null) return; // frame already pending
			tooltipRafRef.current = requestAnimationFrame(() => {
				tooltipRafRef.current = null;
				setTooltipPos({ x: e.clientX, y: e.clientY });
			});
		}
		window.addEventListener('mousemove', handleMouseMove);
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			if (tooltipRafRef.current !== null) {
				cancelAnimationFrame(tooltipRafRef.current);
				tooltipRafRef.current = null;
			}
		};
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
		currentZoomRef.current = k;
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

			// LOD — hide text at far zoom levels to improve render perf.
			// Read the ref live, so every frame picks up the current zoom without
			// forcing React re-renders or invalidating this useCallback.
			const zoom = currentZoomRef.current;
			const showLabels = zoom > 1.0;
			const showInitials = zoom > 0.5;

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
					ctx.font = FONT_ORPHAN_INITIAL;
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
				// initial font size varies with radius — unavoidable dynamic string
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
					const dark = darkModeRef.current; // read ref — zero cost
					const label = prominent ? truncate(title, 36) : truncate(title, 20);
					ctx.font = prominent ? FONT_LABEL_PROMINENT : FONT_LABEL_NORMAL;
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
		[hoveredNode, focusedNodeId, focusedNeighbors, maxConnections, connectedNodeIds, darkModeRef]
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
				ctx.font = FONT_TAG_LABEL;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';

				const dark = darkModeRef.current; // read ref — zero cost
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
		[focusedNodeId, maxWeight, darkModeRef]
	);

	const handleReset = useCallback(() => {
		setMinWeight(1);
		setFocusedNodeId(null);
	}, []);

	// Adapter: alternative renderers receive (id: string), canvas path receives FGNode
	const handleNodeClickById = useCallback((id: string) => {
		const node = graphData.nodes.find((n) => n.id === id);
		if (node) handleNodeClick(node);
	}, [graphData.nodes, handleNodeClick]);

	// Adapter: alternative renderers call onNodeHover(node | null), canvas path has extra _prev arg
	const handleNodeHoverById = useCallback((node: GraphNode | null) => {
		handleNodeHover(node, null);
	}, [handleNodeHover]);

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
			{/* Top-right chrome: 2D/3D toggle + view mode switcher */}
			<div className="absolute right-4 top-4 z-50 flex items-center gap-2">
				{viewMode === 'graph' && (
					<GraphDimensionToggle
						value={localDimension}
						onChange={handleDimensionChange}
					/>
				)}
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
			) : viewMode === 'graph' && effectiveRenderer === 'webgl' ? (
				<Suspense fallback={<div className="flex items-center justify-center w-full h-full"><Loader2 className="h-8 w-8 animate-spin text-[var(--accent-primary)]" /></div>}>
					<WebGLGraphRenderer
						nodes={graphData.nodes}
						links={graphData.links}
						dimensions={dimensions}
						focusedNodeId={focusedNodeId}
						minWeight={minWeight}
						darkMode={darkModeRef.current}
						onNodeClick={handleNodeClickById}
						onNodeHover={handleNodeHoverById}
						onEngineStop={handleEngineStop}
					/>
				</Suspense>
			) : viewMode === 'graph' && effectiveRenderer === 'three' ? (
				<Suspense fallback={<div className="flex items-center justify-center w-full h-full"><Loader2 className="h-8 w-8 animate-spin text-[var(--accent-primary)]" /></div>}>
					<ThreeGraphRenderer
						nodes={graphData.nodes}
						links={graphData.links}
						dimensions={dimensions}
						focusedNodeId={focusedNodeId}
						minWeight={minWeight}
						darkMode={darkModeRef.current}
						onNodeClick={handleNodeClickById}
						onNodeHover={handleNodeHoverById}
						onEngineStop={handleEngineStop}
						initialTilt={localDimension === '3d' ? 0.5 : 0}
					/>
				</Suspense>
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
				<>
					{/*
					 * Keep the simulation running invisibly while d3 settles,
					 * then cross-fade to the final layout once `graphSettled`
					 * flips true. The user sees one clean reveal instead of
					 * the violent initial burst of force-direction ticks.
					 */}
					<div
						className="absolute inset-0"
						style={{
							opacity: graphSettled ? 1 : 0,
							transition: graphSettled
								? 'opacity 320ms ease'
								: 'none',
							pointerEvents: graphSettled ? 'auto' : 'none',
						}}
					>
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
							onEngineStop={handleEngineStop}
							backgroundColor="#00000000"
							cooldownTicks={hasCachedLayout.current ? 20 : (isMobile ? 100 : 180)}
							d3AlphaDecay={hasCachedLayout.current ? 0.1 : (isMobile ? 0.04 : 0.012)}
							d3VelocityDecay={0.3}
						/>
					</div>
					{!graphSettled && (
						<div
							className="pointer-events-none absolute inset-0 flex items-center justify-center"
							aria-hidden="true"
						>
							<Loader2 className="h-8 w-8 animate-spin text-[var(--accent-primary)]" />
						</div>
					)}
				</>
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

			{/* Focus mode hint — sits below the filter panel at the top */}
			{viewMode === 'graph' && !focusedNodeId && hasFilteredLinks && (
				<div
					className="absolute left-1/2 top-14 -translate-x-1/2 select-none text-[11px] pointer-events-none"
					style={{ color: 'var(--foreground-muted)' }}
				>
					Click a node to explore its connections
				</div>
			)}

			{/* Detail panel — bottom sheet on mobile, right panel on desktop */}
			{viewMode === 'graph' && focusedNodeId && focusedNodeMeta && (
				<GraphDetailPanel
					nodeTitle={focusedNodeMeta.title}
					nodeType={focusedNodeMeta.type}
					nodeColor={focusedNodeMeta.color}
					nodeTags={focusedNodeMeta.tags}
					connections={focusedConnections}
					onClose={closeFocus}
					onCardClick={setSelectedCardId}
					isMobile={isMobile}
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
							onArchive={handleArchiveFromGraph}
							onDelete={handleDeleteFromGraph}
							onRestore={handleRestoreFromGraph}
						/>
					)}
				</>
			)}
		</div>
	);
}
