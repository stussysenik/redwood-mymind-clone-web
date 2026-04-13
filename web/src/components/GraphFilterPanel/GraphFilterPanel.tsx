/**
 * Graph Filter Panel — Minimal inline controls with orphan count.
 */

import { memo } from 'react';

interface GraphFilterPanelProps {
	minWeight: number;
	onMinWeightChange: (weight: number) => void;
	nodeCount: number;
	edgeCount: number;
	orphanCount: number;
	onReset: () => void;
}

function GraphFilterPanelInner({
	minWeight,
	onMinWeightChange,
	nodeCount,
	edgeCount,
	orphanCount,
	onReset,
}: GraphFilterPanelProps) {
	return (
		<div
			className="absolute bottom-20 left-4 z-40 flex items-center gap-3 sm:bottom-4"
			style={{ pointerEvents: 'auto' }}
		>
			{/* Stats */}
			<span
				className="text-[11px] font-mono select-none"
				style={{ color: 'var(--foreground-muted)' }}
			>
				{nodeCount}n&thinsp;/&thinsp;{edgeCount}e
				{orphanCount > 0 && (
					<>
						&ensp;&middot;&ensp;
						<span style={{ opacity: 0.6 }}>{orphanCount} solo</span>
					</>
				)}
			</span>

			{/*
			 * Edge-strength filter — NOT a zoom control.
			 *
			 * Moving the slider right hides weaker connections (edges with
			 * fewer shared tags), leaving only the strongest links. The label
			 * deliberately says "edges ≥ N" to prevent the long-standing
			 * confusion where this read as a zoom slider.
			 */}
			<label
				className="flex items-center gap-2 cursor-pointer"
				title="Hide weaker connections — show only edges with at least N shared tags"
			>
				<span
					className="text-[11px] select-none whitespace-nowrap font-mono"
					style={{ color: 'var(--foreground-muted)' }}
				>
					edges ≥ {minWeight}
				</span>
				<input
					type="range"
					min={1}
					max={5}
					value={minWeight}
					onChange={(e) => onMinWeightChange(Number(e.target.value))}
					aria-label={`Minimum edge strength: show only connections with at least ${minWeight} shared tag${minWeight === 1 ? '' : 's'}`}
					className="w-20 h-1 rounded-full appearance-none cursor-pointer accent-[var(--accent-primary)]"
					style={{ background: 'var(--border-default)' }}
				/>
			</label>

			{/* Reset — only show when not at default */}
			{minWeight !== 1 && (
				<button
					onClick={onReset}
					className="text-[11px] hover:underline transition-colors"
					style={{ color: 'var(--foreground-muted)' }}
				>
					reset
				</button>
			)}
		</div>
	);
}

export const GraphFilterPanel = memo(GraphFilterPanelInner);
