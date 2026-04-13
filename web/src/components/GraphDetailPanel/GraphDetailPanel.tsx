/**
 * Graph Detail Panel — Slide-out connection list for a focused node.
 *
 * Desktop: right-side panel (340px, slides in from right)
 * Mobile:  bottom sheet (65dvh, slides up, backdrop to close)
 *
 * Connection browsing:
 *   - First tap a connection row → selects it (highlighted + "tap again to open" hint)
 *   - Tap selected row again → opens card detail
 *   - ← → buttons / keyboard arrows navigate through connections while one is selected
 */

import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect, useCallback, memo } from 'react';

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
	onCardClick?: (cardId: string) => void;
	isMobile?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

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

function GraphDetailPanelInner({
	nodeTitle,
	nodeType,
	nodeColor,
	nodeTags,
	connections,
	onClose,
	onCardClick,
	isMobile = false,
}: GraphDetailPanelProps) {
	const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
	const badgeClass = TYPE_BADGE_COLORS[nodeType] ?? DEFAULT_BADGE;

	// Reset selection whenever a different node is focused
	useEffect(() => {
		setSelectedIdx(null);
	}, [nodeTitle]);

	// Keyboard: arrows navigate connections, Enter opens selected
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (connections.length === 0) return;

			if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
				e.preventDefault();
				setSelectedIdx((i) => (i === null ? 0 : Math.max(0, i - 1)));
			}
			if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
				e.preventDefault();
				setSelectedIdx((i) =>
					i === null ? 0 : Math.min(connections.length - 1, i + 1)
				);
			}
			if (e.key === 'Enter' && selectedIdx !== null) {
				const conn = connections[selectedIdx];
				if (conn) openCard(conn);
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [selectedIdx, connections]); // eslint-disable-line react-hooks/exhaustive-deps

	const openCard = useCallback(
		(conn: ConnectionItem) => {
			if (onCardClick) {
				onCardClick(conn.id);
			} else {
				window.open(`/?q=${encodeURIComponent(conn.title)}`, '_self');
			}
		},
		[onCardClick]
	);

	const handleConnectionClick = useCallback(
		(conn: ConnectionItem, idx: number) => {
			if (selectedIdx === idx) {
				// Second tap → open the card
				openCard(conn);
			} else {
				setSelectedIdx(idx);
			}
		},
		[selectedIdx, openCard]
	);

	const goToPrev = useCallback(() => {
		setSelectedIdx((i) => (i !== null ? Math.max(0, i - 1) : 0));
	}, []);

	const goToNext = useCallback(() => {
		setSelectedIdx((i) =>
			i !== null ? Math.min(connections.length - 1, i + 1) : 0
		);
	}, [connections.length]);

	// ------------------------------------------------------------------
	// SHARED CONTENT BLOCKS
	// ------------------------------------------------------------------

	const dragHandle = (
		<button
			onClick={onClose}
			className="flex w-full justify-center py-2.5 shrink-0"
			aria-label="Close panel"
		>
			<div
				className="w-9 h-[3px] rounded-full"
				style={{ backgroundColor: 'var(--border-emphasis)' }}
			/>
		</button>
	);

	const panelHeader = (
		<div
			className="flex items-start gap-3 px-4 pb-3 shrink-0"
			style={{ borderBottom: '1px solid var(--border-subtle)' }}
		>
			{/* Color dot with type initial */}
			<div
				className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold text-xs"
				style={{ width: 32, height: 32, backgroundColor: nodeColor }}
			>
				{TYPE_INITIALS[nodeType] || '?'}
			</div>

			<div className="flex-1 min-w-0">
				<p className="text-sm font-semibold text-[var(--foreground)] leading-tight">
					{nodeTitle}
				</p>
				<div className="flex items-center gap-2 mt-1">
					<span
						className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeClass}`}
					>
						{nodeType}
					</span>
					<span className="text-[11px] text-[var(--foreground-muted)]">
						{connections.length} connection
						{connections.length !== 1 ? 's' : ''}
					</span>
				</div>
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
				className="flex-shrink-0 p-1.5 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
				title="Close (Esc)"
			>
				<X className="h-4 w-4 text-[var(--foreground-muted)]" />
			</button>
		</div>
	);

	const browseBar = selectedIdx !== null && (
		<div
			className="flex items-center justify-between px-4 py-2 shrink-0"
			style={{ borderBottom: '1px solid var(--border-subtle)' }}
		>
			<button
				onClick={goToPrev}
				disabled={selectedIdx === 0}
				className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-25 active:scale-95"
				style={{ color: 'var(--accent-primary)', backgroundColor: 'var(--surface-accent)' }}
			>
				<ChevronLeft className="h-3.5 w-3.5" />
				prev
			</button>

			<span className="text-[10px] font-medium tabular-nums" style={{ color: 'var(--foreground-muted)' }}>
				{selectedIdx + 1} / {connections.length}
			</span>

			<button
				onClick={goToNext}
				disabled={selectedIdx === connections.length - 1}
				className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-25 active:scale-95"
				style={{ color: 'var(--accent-primary)', backgroundColor: 'var(--surface-accent)' }}
			>
				next
				<ChevronRight className="h-3.5 w-3.5" />
			</button>
		</div>
	);

	const connectionList = (
		<div className="flex-1 overflow-y-auto overscroll-contain">
			<p
				className="px-4 pt-3 pb-1.5 text-[10px] font-medium uppercase tracking-wider shrink-0"
				style={{ color: 'var(--foreground-muted)' }}
			>
				Connected to
			</p>

			{connections.map((conn, idx) => {
				const isSelected = selectedIdx === idx;
				return (
					<button
						key={conn.id}
						onClick={() => handleConnectionClick(conn, idx)}
						className="w-full text-left px-4 py-3 flex items-start gap-2.5 transition-all"
						style={{
							borderBottom: '1px solid var(--border-subtle)',
							backgroundColor: isSelected
								? 'var(--surface-accent)'
								: undefined,
						}}
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
							<p
								className="text-[13px] font-medium leading-snug"
								style={{
									color: isSelected
										? 'var(--accent-primary)'
										: 'var(--foreground)',
								}}
							>
								{conn.title}
							</p>

							{/* Shared tags */}
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

							{/* Selected hint */}
							{isSelected && (
								<p
									className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide"
									style={{ color: 'var(--accent-primary)' }}
								>
									Tap again to open
								</p>
							)}
						</div>

						{/* Weight indicator bar */}
						<div className="flex-shrink-0 flex flex-col items-center gap-0.5 mt-0.5">
							<div
								className="rounded-full"
								style={{
									width: 4,
									height: Math.max(8, conn.weight * 6),
									backgroundColor: conn.color,
									opacity: isSelected ? 0.9 : 0.5,
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
	);

	const panelFooter = (
		<div
			className="px-4 py-2.5 text-[11px] text-center shrink-0"
			style={{
				color: 'var(--foreground-muted)',
				borderTop: '1px solid var(--border-subtle)',
			}}
		>
			{selectedIdx !== null
				? 'Tap again to open · ← → to browse'
				: 'Tap a connection to select · Esc to close'}
		</div>
	);

	// ------------------------------------------------------------------
	// MOBILE: BOTTOM SHEET
	// ------------------------------------------------------------------

	if (isMobile) {
		return (
			<>
				{/* Backdrop */}
				<div
					className="fixed inset-0 z-40"
					style={{ backgroundColor: 'rgba(0, 0, 0, 0.32)' }}
					onClick={onClose}
				/>

				{/* Bottom sheet */}
				<div
					className="fixed left-0 right-0 bottom-0 z-50 flex flex-col"
					style={{
						height: '65dvh',
						background: 'var(--surface-floating)',
						borderTop: '1px solid var(--border-subtle)',
						borderRadius: '20px 20px 0 0',
						backdropFilter: 'blur(20px)',
						WebkitBackdropFilter: 'blur(20px)',
						boxShadow: '0 -8px 40px rgba(0, 0, 0, 0.14)',
						animation: 'gdpSlideUp 320ms var(--ease-out-expo) forwards',
					}}
					onClick={(e) => e.stopPropagation()}
				>
					{dragHandle}
					{panelHeader}
					{browseBar}
					{connectionList}
					{panelFooter}
				</div>

				<style dangerouslySetInnerHTML={{
					__html: `
						@keyframes gdpSlideUp {
							from { transform: translateY(100%); }
							to   { transform: translateY(0); }
						}
					`,
				}} />
			</>
		);
	}

	// ------------------------------------------------------------------
	// DESKTOP: RIGHT-SIDE PANEL
	// ------------------------------------------------------------------

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
			<div className="pt-4 shrink-0">
				{panelHeader}
			</div>
			{browseBar}
			{connectionList}
			{panelFooter}
		</div>
	);
}

export const GraphDetailPanel = memo(GraphDetailPanelInner);
