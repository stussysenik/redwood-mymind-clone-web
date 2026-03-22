/**
 * MyMind Clone - Graph Tooltip
 *
 * Positioned tooltip that appears near a hovered node in the graph view.
 * Shows the card title, type badge, tags, and connection count.
 *
 * @fileoverview Tooltip overlay for graph node hover
 */

import type { GraphNode } from 'src/lib/graph';

// =============================================================================
// TYPES
// =============================================================================

interface GraphTooltipProps {
	node: GraphNode | null;
	position: { x: number; y: number } | null;
}

// =============================================================================
// TYPE COLOR MAP (matches graph.ts palette)
// =============================================================================

const TYPE_BADGE_COLORS: Record<string, string> = {
	article: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
	video: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
	image: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
	product: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
	social: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
	book: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const DEFAULT_BADGE = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

// =============================================================================
// COMPONENT
// =============================================================================

export function GraphTooltip({ node, position }: GraphTooltipProps) {
	if (!node || !position) return null;

	const badgeClass = TYPE_BADGE_COLORS[node.type] ?? DEFAULT_BADGE;

	return (
		<div
			className="fixed z-[100] pointer-events-none animate-scale-in"
			style={{
				left: position.x + 12,
				top: position.y - 8,
				maxWidth: 280,
			}}
		>
			<div className="surface-shell rounded-xl px-3 py-2.5 shadow-lg border border-[var(--border-subtle)]">
				{/* Title */}
				<p className="text-sm font-medium text-[var(--foreground)] truncate mb-1.5">
					{node.title}
				</p>

				{/* Type badge + connection count */}
				<div className="flex items-center gap-2 mb-1.5">
					<span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeClass}`}>
						{node.type}
					</span>
					<span className="text-[11px] text-[var(--foreground-muted)]">
						{node.connections} connection{node.connections !== 1 ? 's' : ''}
					</span>
				</div>

				{/* Tags */}
				{node.tags.length > 0 && (
					<div className="flex flex-wrap gap-1">
						{node.tags.slice(0, 5).map((tag) => (
							<span
								key={tag}
								className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--surface-accent)] text-[var(--foreground-muted)]"
							>
								#{tag}
							</span>
						))}
						{node.tags.length > 5 && (
							<span className="text-[10px] text-[var(--foreground-muted)]">
								+{node.tags.length - 5}
							</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
