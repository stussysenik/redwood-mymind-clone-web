/**
 * Graph Tooltip — Shows relationships, not just metadata
 *
 * Tufte principle: show the data that matters. For a graph, that means
 * showing what a node is connected TO, not just its own properties.
 */

import type { GraphNode } from 'src/lib/graph';

interface GraphTooltipProps {
	node: GraphNode | null;
	position: { x: number; y: number } | null;
	connectedNames?: string[];
}

const TYPE_BADGE_COLORS: Record<string, string> = {
	article: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
	video: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
	image: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
	product: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
	social: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
	book: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const DEFAULT_BADGE = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

export function GraphTooltip({ node, position, connectedNames = [] }: GraphTooltipProps) {
	if (!node || !position) return null;

	const badgeClass = TYPE_BADGE_COLORS[node.type] ?? DEFAULT_BADGE;

	return (
		<div
			className="fixed z-[100] pointer-events-none animate-scale-in"
			style={{
				left: position.x + 12,
				top: position.y - 8,
				maxWidth: 300,
			}}
		>
			<div className="surface-shell rounded-xl px-3 py-2.5 shadow-lg border border-[var(--border-subtle)]">
				{/* Title */}
				<p className="text-sm font-medium text-[var(--foreground)] truncate mb-1.5">
					{node.title}
				</p>

				{/* Type + connections */}
				<div className="flex items-center gap-2 mb-1.5">
					<span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeClass}`}>
						{node.type}
					</span>
					<span className="text-[11px] text-[var(--foreground-muted)]">
						{node.connections} connection{node.connections !== 1 ? 's' : ''}
					</span>
				</div>

				{/* Connected nodes — the key insight: show relationships */}
				{connectedNames.length > 0 && (
					<div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
						<p className="text-[10px] font-medium text-[var(--foreground-muted)] mb-1">
							Connected to
						</p>
						{connectedNames.map((name, i) => (
							<p
								key={i}
								className="text-[11px] text-[var(--foreground)] truncate leading-relaxed"
							>
								{name}
							</p>
						))}
						{node.connections > 3 && (
							<p className="text-[10px] text-[var(--foreground-muted)] mt-0.5">
								+{node.connections - 3} more
							</p>
						)}
					</div>
				)}

				{/* Tags — compact */}
				{node.tags.length > 0 && (
					<div className="flex flex-wrap gap-1 mt-2">
						{node.tags.slice(0, 4).map((tag) => (
							<span
								key={tag}
								className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--surface-accent)] text-[var(--foreground-muted)]"
							>
								#{tag}
							</span>
						))}
						{node.tags.length > 4 && (
							<span className="text-[10px] text-[var(--foreground-muted)]">
								+{node.tags.length - 4}
							</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
