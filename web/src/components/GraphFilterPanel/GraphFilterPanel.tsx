/**
 * Graph Filter Panel — Minimal inline controls with orphan count.
 */

interface GraphFilterPanelProps {
	minWeight: number;
	onMinWeightChange: (weight: number) => void;
	nodeCount: number;
	edgeCount: number;
	orphanCount: number;
	onReset: () => void;
}

export function GraphFilterPanel({
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

			{/* Weight slider */}
			<label className="flex items-center gap-2 cursor-pointer">
				<span
					className="text-[11px] select-none whitespace-nowrap"
					style={{ color: 'var(--foreground-muted)' }}
				>
					min {minWeight}
				</span>
				<input
					type="range"
					min={1}
					max={5}
					value={minWeight}
					onChange={(e) => onMinWeightChange(Number(e.target.value))}
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
