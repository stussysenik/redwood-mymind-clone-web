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
	const orphanSuffix = orphanCount > 0 ? `, ${orphanCount} unconnected` : '';
	const statsAriaLabel = `Graph contents: ${nodeCount} nodes, ${edgeCount} edges${orphanSuffix}`;
	const sliderAriaLabel = `Edge strength filter, currently showing connections with at least ${minWeight} shared tag${minWeight === 1 ? '' : 's'}`;

	return (
		<div
			className="absolute left-1/2 top-4 z-40 flex -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded-full px-3.5 py-1.5"
			style={{
				pointerEvents: 'auto',
				backgroundColor: 'var(--surface-floating)',
				border: '1px solid var(--border-subtle)',
				boxShadow: 'var(--shadow-sm)',
				backdropFilter: 'blur(12px)',
				WebkitBackdropFilter: 'blur(12px)',
			}}
		>
			{/* Stats — responsive: full words ≥640px, compact shorthand below */}
			<div
				role="group"
				aria-label={statsAriaLabel}
				className="text-[11px] font-mono select-none"
				style={{ color: 'var(--foreground-muted)' }}
			>
				<span aria-hidden="true" className="hidden sm:inline">
					{nodeCount} nodes&ensp;&middot;&ensp;{edgeCount} edges
					{orphanCount > 0 && (
						<>
							&ensp;&middot;&ensp;
							<span style={{ opacity: 0.6 }}>{orphanCount} unconnected</span>
						</>
					)}
				</span>
				<span aria-hidden="true" className="inline sm:hidden">
					{nodeCount}n&thinsp;/&thinsp;{edgeCount}e
					{orphanCount > 0 && (
						<>
							&ensp;&middot;&ensp;
							<span style={{ opacity: 0.6 }}>{orphanCount} solo</span>
						</>
					)}
				</span>
			</div>

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
					aria-label={sliderAriaLabel}
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
