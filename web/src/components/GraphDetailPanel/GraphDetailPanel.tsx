/**
 * Graph Detail Panel — single-click focused-node list with senior a11y.
 *
 * The focused node is row 0 of a unified list; its connections are rows 1..N.
 * One click on any row opens that row's card detail modal — no "select-first"
 * step. Keyboard: ↑↓←→ navigate, Home/End jump, Enter/Space open, Esc closes.
 * All activeIdx mutations route through a single bounds-clamped setter.
 * See openspec/changes/unify-graph-focus-one-click/.
 */

import { useCallback, useEffect, useMemo, useState, memo } from 'react';

import { X, ChevronLeft, ChevronRight } from 'lucide-react';

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
	/** The focused node rendered as row 0 of the unified list. */
	headItem: ConnectionItem;
	/** The focused node's neighbors, rendered as rows 1..N. */
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

const DEFAULT_BADGE =
	'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

// Shared focus-visible ring — same treatment on every interactive element.
const FOCUS_RING =
	'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
	'focus-visible:outline-[var(--accent-primary)]';

// =============================================================================
// COMPONENT
// =============================================================================

function GraphDetailPanelInner({
	headItem,
	connections,
	onClose,
	onCardClick,
	isMobile = false,
}: GraphDetailPanelProps) {
	// Unified list: row 0 = focused node, row 1..N = connections.
	const items = useMemo<ConnectionItem[]>(
		() => [headItem, ...connections],
		[headItem, connections]
	);

	const [activeIdx, setActiveIdxRaw] = useState(0);

	// Single bounds-clamped mutator — every activeIdx write routes through this,
	// so no keyboard/pointer path can produce an out-of-range value.
	const setActiveIdx = useCallback(
		(next: number | ((prev: number) => number)) => {
			setActiveIdxRaw((prev) => {
				const raw = typeof next === 'function' ? next(prev) : next;
				return Math.max(0, Math.min(items.length - 1, raw));
			});
		},
		[items.length]
	);

	// Reset cursor to row 0 whenever the focused node changes identity.
	useEffect(() => {
		setActiveIdxRaw(0);
	}, [headItem.id]);

	const openCard = useCallback(
		(item: ConnectionItem | undefined) => {
			if (!item) return;
			if (onCardClick) {
				onCardClick(item.id);
			} else {
				window.open(`/?q=${encodeURIComponent(item.title)}`, '_self');
			}
		},
		[onCardClick]
	);

	// Click any row → open it. No prior "select" step.
	const handleRowClick = useCallback(
		(idx: number) => {
			setActiveIdx(idx);
			openCard(items[idx]);
		},
		[items, openCard, setActiveIdx]
	);

	// Keyboard navigation over the unified list.
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (items.length === 0) return;
			switch (e.key) {
				case 'ArrowUp':
				case 'ArrowLeft':
					e.preventDefault();
					setActiveIdx((i) => i - 1);
					break;
				case 'ArrowDown':
				case 'ArrowRight':
					e.preventDefault();
					setActiveIdx((i) => i + 1);
					break;
				case 'Home':
					e.preventDefault();
					setActiveIdx(0);
					break;
				case 'End':
					e.preventDefault();
					setActiveIdx(items.length - 1);
					break;
				case 'Enter':
				case ' ':
					e.preventDefault();
					openCard(items[activeIdx]);
					break;
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [items, activeIdx, openCard, setActiveIdx]);

	const goToPrev = useCallback(() => setActiveIdx((i) => i - 1), [setActiveIdx]);
	const goToNext = useCallback(() => setActiveIdx((i) => i + 1), [setActiveIdx]);

	const headBadgeClass = TYPE_BADGE_COLORS[headItem.type] ?? DEFAULT_BADGE;
	const hasConnections = connections.length > 0;
	const connectionCountLabel = `${connections.length} connection${
		connections.length !== 1 ? 's' : ''
	}`;
	const liveAnnouncement = `Showing ${headItem.title}. ${connectionCountLabel}.`;

	// ------------------------------------------------------------------
	// SHARED CONTENT BLOCKS
	// ------------------------------------------------------------------

	// HEAD ROW — the "ring": one <button> wrapping all the children of the
	// focused-node header. The close X is NOT inside (buttons cannot nest).
	// Wrapped in div[role=listitem] so the button keeps its native semantics
	// while the list structure is still announced by assistive tech.
	const headRow = (
		<div role="listitem">
			<button
				type="button"
				onClick={() => handleRowClick(0)}
				aria-current={activeIdx === 0 ? 'true' : undefined}
				aria-label={`Open ${headItem.title}`}
				className={`w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors ${FOCUS_RING}`}
				style={{
					minHeight: 56,
					backgroundColor:
						activeIdx === 0 ? 'var(--surface-accent)' : undefined,
					borderBottom: '1px solid var(--border-subtle)',
				}}
			>
			<div
				className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold"
				style={{
					width: 36,
					height: 36,
					backgroundColor: headItem.color,
					fontSize: 13,
				}}
				aria-hidden="true"
			>
				{TYPE_INITIALS[headItem.type] || '?'}
			</div>

			<div className="flex-1 min-w-0 pr-10">
				<p className="text-base font-semibold text-[var(--foreground)] leading-tight">
					{headItem.title}
				</p>
				<div className="flex items-center gap-2 mt-1.5">
					<span
						className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${headBadgeClass}`}
					>
						{headItem.type}
					</span>
					<span className="text-[13px] text-[var(--foreground-muted)]">
						{connectionCountLabel}
					</span>
				</div>
			</div>
			</button>
		</div>
	);

	// CLOSE X — sibling to the head row, absolute-positioned. 48x48 hit area.
	const closeButton = (
		<button
			type="button"
			onClick={onClose}
			aria-label="Close panel"
			title="Close (Esc)"
			className={`absolute top-2 right-2 z-10 flex items-center justify-center rounded-md hover:bg-[var(--surface-hover)] transition-colors ${FOCUS_RING}`}
			style={{ minWidth: 48, minHeight: 48 }}
		>
			<X className="h-4 w-4 text-[var(--foreground-muted)]" />
		</button>
	);

	// SECTION LABEL — sits inside the list container as a presentation element,
	// positioned visually between head row and connection rows.
	const sectionLabel = (
		<div
			role="presentation"
			className="px-4 pt-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider shrink-0"
			style={{ color: 'var(--foreground-muted)' }}
		>
			{hasConnections
				? `Connected to · ${connectionCountLabel}`
				: 'No connections yet'}
		</div>
	);

	// BROWSE BAR — prev/next chrome. Operates on the unified items array.
	// Always rendered when the panel is open; buttons disable at the bounds
	// (both disabled when items.length === 1, i.e. zero connections).
	const prevDisabled = activeIdx === 0;
	const nextDisabled = activeIdx === items.length - 1;
	const browseBar = (
		<div
			className="flex items-center justify-between px-4 py-2 shrink-0"
			style={{ borderBottom: '1px solid var(--border-subtle)' }}
		>
			<button
				type="button"
				onClick={goToPrev}
				disabled={prevDisabled}
				aria-disabled={prevDisabled}
				aria-label="Previous row"
				className={`flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-25 ${FOCUS_RING}`}
				style={{
					minHeight: 48,
					color: 'var(--accent-primary)',
					backgroundColor: 'var(--surface-accent)',
				}}
			>
				<ChevronLeft className="h-4 w-4" />
				prev
			</button>

			<span
				className="text-[13px] font-medium tabular-nums"
				style={{ color: 'var(--foreground-muted)' }}
			>
				{activeIdx + 1} / {items.length}
			</span>

			<button
				type="button"
				onClick={goToNext}
				disabled={nextDisabled}
				aria-disabled={nextDisabled}
				aria-label="Next row"
				className={`flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-25 ${FOCUS_RING}`}
				style={{
					minHeight: 48,
					color: 'var(--accent-primary)',
					backgroundColor: 'var(--surface-accent)',
				}}
			>
				next
				<ChevronRight className="h-4 w-4" />
			</button>
		</div>
	);

	// CONNECTION ROWS — rows 1..N. Wrapped with the head row in a role=list.
	// Each row is a div[role=listitem] containing the interactive <button>, so
	// the button keeps its native semantics and screen readers still announce
	// the list structure (see head row for the same pattern).
	const connectionRows = connections.map((conn, connIdx) => {
		const itemIdx = connIdx + 1;
		const isActive = activeIdx === itemIdx;
		return (
			<div key={conn.id} role="listitem">
				<button
					type="button"
					onClick={() => handleRowClick(itemIdx)}
					aria-current={isActive ? 'true' : undefined}
					aria-label={`Open ${conn.title}`}
					className={`w-full text-left px-4 py-3 flex items-start gap-2.5 transition-all ${FOCUS_RING}`}
					style={{
						minHeight: 56,
						borderBottom: '1px solid var(--border-subtle)',
						backgroundColor: isActive ? 'var(--surface-accent)' : undefined,
					}}
				>
				<div
					className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold mt-0.5"
					style={{
						width: 26,
						height: 26,
						backgroundColor: conn.color,
						fontSize: 11,
					}}
					aria-hidden="true"
				>
					{TYPE_INITIALS[conn.type] || '?'}
				</div>

				<div className="flex-1 min-w-0">
					<p
						className="text-[15px] font-medium leading-snug"
						style={{
							color: isActive
								? 'var(--accent-primary)'
								: 'var(--foreground)',
						}}
					>
						{conn.title}
					</p>

					{conn.sharedTags.length > 0 && (
						<div className="flex flex-wrap items-center gap-1 mt-1">
							{conn.sharedTags.slice(0, 4).map((tag) => (
								<span
									key={tag}
									className="text-[11px] px-1.5 py-0.5 rounded-full text-[var(--foreground-muted)]"
									style={{ background: 'var(--surface-soft)' }}
								>
									{tag}
								</span>
							))}
							{conn.sharedTags.length > 4 && (
								<span className="text-[11px] text-[var(--foreground-muted)]">
									+{conn.sharedTags.length - 4}
								</span>
							)}
						</div>
					)}
				</div>

				<div className="flex-shrink-0 flex flex-col items-center gap-0.5 mt-0.5">
					<div
						className="rounded-full"
						style={{
							width: 4,
							height: Math.max(8, conn.weight * 6),
							backgroundColor: conn.color,
							opacity: isActive ? 0.9 : 0.5,
						}}
						aria-hidden="true"
					/>
					<span className="text-[11px] text-[var(--foreground-muted)]">
						{conn.weight}
					</span>
				</div>
				</button>
			</div>
		);
	});

	// SCROLL CONTAINER — holds the head row, the section label, and the rows.
	// `role="list"` wraps listitem children; the section label is a presentation
	// element, tolerated by screen readers as a non-listitem sibling.
	const listScroll = (
		<div
			role="list"
			className="flex-1 overflow-y-auto overscroll-contain"
		>
			{headRow}
			{sectionLabel}
			{connectionRows}
		</div>
	);

	const panelFooter = (
		<div
			className="px-4 py-2.5 text-[13px] text-center shrink-0"
			style={{
				color: 'var(--foreground-muted)',
				borderTop: '1px solid var(--border-subtle)',
			}}
		>
			← → browse · Enter open · Esc close
		</div>
	);

	// Reduced-motion CSS — disables the slide animations for users who prefer
	// stillness. Scoped via `.gdp-*` classes below.
	const reducedMotionStyles = (
		<style
			dangerouslySetInnerHTML={{
				__html: `
					@media (prefers-reduced-motion: no-preference) {
						@keyframes gdpSlideUp {
							from { transform: translateY(100%); }
							to   { transform: translateY(0); }
						}
						@keyframes gdpSlideInRight {
							from { transform: translateX(100%); }
							to   { transform: translateX(0); }
						}
						.gdp-slide-up { animation: gdpSlideUp 320ms var(--ease-out-expo) forwards; }
						.gdp-slide-in-right { animation: gdpSlideInRight 280ms var(--ease-out-expo) forwards; }
					}
					@media (prefers-reduced-motion: reduce) {
						.gdp-slide-up, .gdp-slide-in-right { animation: none !important; }
					}
				`,
			}}
		/>
	);

	// A11y: polite live region announcing the subject when the panel mounts
	// or when the focused node changes.
	const liveRegion = (
		<div aria-live="polite" aria-atomic="true" className="sr-only">
			{liveAnnouncement}
		</div>
	);

	// ------------------------------------------------------------------
	// MOBILE: BOTTOM SHEET
	// ------------------------------------------------------------------

	if (isMobile) {
		return (
			<>
				<div
					className="fixed inset-0 z-40"
					style={{ backgroundColor: 'rgba(0, 0, 0, 0.32)' }}
					onClick={onClose}
					aria-hidden="true"
				/>

				<div
					className="gdp-slide-up fixed left-0 right-0 bottom-0 z-50 flex flex-col"
					style={{
						height: '72dvh',
						background: 'var(--surface-floating)',
						borderTop: '1px solid var(--border-subtle)',
						borderRadius: '20px 20px 0 0',
						backdropFilter: 'blur(20px)',
						WebkitBackdropFilter: 'blur(20px)',
						boxShadow: '0 -8px 40px rgba(0, 0, 0, 0.14)',
					}}
					onClick={(e) => e.stopPropagation()}
				>
					{liveRegion}
					{closeButton}
					{listScroll}
					{browseBar}
					{panelFooter}
				</div>

				{reducedMotionStyles}
			</>
		);
	}

	// ------------------------------------------------------------------
	// DESKTOP: RIGHT-SIDE PANEL
	// ------------------------------------------------------------------

	return (
		<>
			<div
				className="gdp-slide-in-right absolute top-0 right-0 bottom-0 z-50 flex flex-col"
				style={{
					width: 360,
					background: 'var(--surface-floating)',
					borderLeft: '1px solid var(--border-subtle)',
					backdropFilter: 'blur(16px)',
				}}
			>
				{liveRegion}
				{closeButton}
				{listScroll}
				{browseBar}
				{panelFooter}
			</div>

			{reducedMotionStyles}
		</>
	);
}

export const GraphDetailPanel = memo(GraphDetailPanelInner);
