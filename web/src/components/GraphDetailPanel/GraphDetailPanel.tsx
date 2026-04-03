/**
 * Graph Detail Panel — Slide-out connection list for a focused node.
 *
 * Shows the full chain: who this card connects to, why (shared tags),
 * and how strongly (weight). Each row is clickable to navigate to the card.
 */

import { X } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export interface ConnectionItem {
	id: string;
	title: string;
	type: string;
	color: string;
	sharedTags: string[];
	weight: number;
}

interface GraphDetailPanelProps {
	nodeTitle: string;
	nodeType: string;
	nodeColor: string;
	nodeTags: string[];
	connections: ConnectionItem[];
	onClose: () => void;
	/** When provided, clicking a connection row calls this instead of navigating away. */
	onCardClick?: (cardId: string) => void;
}

const TYPE_INITIALS: Record<string, string> = {
	article: 'A',
	social: 'S',
	video: 'V',
	note: 'N',
	image: 'I',
	book: 'B',
	movie: 'M',
	product: 'P',
};

const TYPE_BADGE_COLORS: Record<string, string> = {
	article: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
	video: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
	image: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
	product: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
	social: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
	book: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
	note: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
	movie: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
};

const DEFAULT_BADGE = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

// =============================================================================
// COMPONENT
// =============================================================================

export function GraphDetailPanel({
	nodeTitle,
	nodeType,
	nodeColor,
	nodeTags,
	connections,
	onClose,
	onCardClick,
}: GraphDetailPanelProps) {
	const badgeClass = TYPE_BADGE_COLORS[nodeType] ?? DEFAULT_BADGE;

	return (
		<div
			className="absolute top-0 right-0 bottom-0 z-50 flex flex-col animate-slide-in-right"
			style={{
				width: 340,
				background: 'var(--surface-floating)',
				borderLeft: '1px solid var(--border-subtle)',
				backdropFilter: 'blur(16px)',
			}}
		>
			{/* Header */}
			<div
				className="flex items-start gap-3 px-4 pt-4 pb-3"
				style={{ borderBottom: '1px solid var(--border-subtle)' }}
			>
				{/* Color dot with type initial */}
				<div
					className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold text-xs"
					style={{
						width: 32,
						height: 32,
						backgroundColor: nodeColor,
					}}
				>
					{TYPE_INITIALS[nodeType] || '?'}
				</div>

				<div className="flex-1 min-w-0">
					<p className="text-sm font-semibold text-[var(--foreground)] leading-tight">
						{nodeTitle}
					</p>
					<div className="flex items-center gap-2 mt-1">
						<span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeClass}`}>
							{nodeType}
						</span>
						<span className="text-[11px] text-[var(--foreground-muted)]">
							{connections.length} connection{connections.length !== 1 ? 's' : ''}
						</span>
					</div>
					{/* Node's own tags */}
					{nodeTags.length > 0 && (
						<div className="flex flex-wrap gap-1 mt-1.5">
							{nodeTags.slice(0, 5).map((tag) => (
								<span
									key={tag}
									className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--surface-accent)] text-[var(--foreground-muted)]"
								>
									#{tag}
								</span>
							))}
							{nodeTags.length > 5 && (
								<span className="text-[9px] text-[var(--foreground-muted)]">
									+{nodeTags.length - 5}
								</span>
							)}
						</div>
					)}
				</div>

				<button
					onClick={onClose}
					className="flex-shrink-0 p-1 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
					title="Close (Esc)"
				>
					<X className="h-4 w-4 text-[var(--foreground-muted)]" />
				</button>
			</div>

			{/* Connection list */}
			<div className="flex-1 overflow-y-auto">
				<p
					className="px-4 pt-3 pb-1.5 text-[10px] font-medium uppercase tracking-wider"
					style={{ color: 'var(--foreground-muted)' }}
				>
					Connected to
				</p>
				{connections.map((conn) => {
					const connBadge = TYPE_BADGE_COLORS[conn.type] ?? DEFAULT_BADGE;
					return (
						<button
							key={conn.id}
							onClick={() =>
								onCardClick
									? onCardClick(conn.id)
									: window.open(
											`/?q=${encodeURIComponent(conn.title)}`,
											'_self'
									  )
							}
							className="w-full text-left px-4 py-2.5 hover:bg-[var(--surface-hover)] transition-colors flex items-start gap-2.5"
							style={{ borderBottom: '1px solid var(--border-subtle)' }}
						>
							{/* Type dot */}
							<div
								className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold mt-0.5"
								style={{
									width: 22,
									height: 22,
									backgroundColor: conn.color,
									fontSize: 9,
								}}
							>
								{TYPE_INITIALS[conn.type] || '?'}
							</div>

							<div className="flex-1 min-w-0">
								{/* Title */}
								<p className="text-[13px] font-medium text-[var(--foreground)] leading-snug">
									{conn.title}
								</p>

								{/* Shared tags — the WHY */}
								<div className="flex flex-wrap items-center gap-1 mt-1">
									{conn.sharedTags.slice(0, 4).map((tag) => (
										<span
											key={tag}
											className="text-[9px] px-1.5 py-0.5 rounded-full text-[var(--foreground-muted)]"
											style={{ background: 'var(--surface-soft)' }}
										>
											{tag}
										</span>
									))}
									{conn.sharedTags.length > 4 && (
										<span className="text-[9px] text-[var(--foreground-muted)]">
											+{conn.sharedTags.length - 4}
										</span>
									)}
								</div>
							</div>

							{/* Weight indicator — visual bar */}
							<div className="flex-shrink-0 flex flex-col items-center gap-0.5 mt-0.5">
								<div
									className="rounded-full"
									style={{
										width: 4,
										height: Math.max(8, conn.weight * 6),
										backgroundColor: conn.color,
										opacity: 0.5,
									}}
								/>
								<span className="text-[9px] text-[var(--foreground-muted)]">
									{conn.weight}
								</span>
							</div>
						</button>
					);
				})}
			</div>

			{/* Footer */}
			<div
				className="px-4 py-2.5 text-[11px] text-center"
				style={{
					color: 'var(--foreground-muted)',
					borderTop: '1px solid var(--border-subtle)',
				}}
			>
				Click a card to open &middot; Esc to close
			</div>
		</div>
	);
}
