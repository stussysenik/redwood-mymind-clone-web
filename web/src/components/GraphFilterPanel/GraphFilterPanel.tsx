/**
 * MyMind Clone - Graph Filter Panel
 *
 * Floating control panel for the graph visualization.
 * Provides tag filtering, minimum weight slider, and graph statistics.
 *
 * @fileoverview Filter controls overlay for the knowledge graph view
 */

import { useState } from 'react';
import { Search, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface GraphFilterPanelProps {
	tagFilter: string;
	onTagFilterChange: (tag: string) => void;
	minWeight: number;
	onMinWeightChange: (weight: number) => void;
	nodeCount: number;
	edgeCount: number;
	onReset: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function GraphFilterPanel({
	tagFilter,
	onTagFilterChange,
	minWeight,
	onMinWeightChange,
	nodeCount,
	edgeCount,
	onReset,
}: GraphFilterPanelProps) {
	const [collapsed, setCollapsed] = useState(false);

	return (
		<div className="absolute top-4 left-4 z-50">
			<div className="surface-shell rounded-xl shadow-lg border border-[var(--border-subtle)] overflow-hidden"
				style={{ minWidth: 220 }}
			>
				{/* Header - always visible */}
				<button
					onClick={() => setCollapsed(!collapsed)}
					className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[var(--surface-hover)] transition-colors"
				>
					<span className="text-sm font-medium text-[var(--foreground)]">
						Filters
					</span>
					<div className="flex items-center gap-2">
						<span className="text-[11px] text-[var(--foreground-muted)] font-mono">
							{nodeCount}n / {edgeCount}e
						</span>
						{collapsed ? (
							<ChevronDown className="h-3.5 w-3.5 text-[var(--foreground-muted)]" />
						) : (
							<ChevronUp className="h-3.5 w-3.5 text-[var(--foreground-muted)]" />
						)}
					</div>
				</button>

				{/* Collapsible body */}
				{!collapsed && (
					<div className="px-3 pb-3 space-y-3 border-t border-[var(--border-subtle)]">
						{/* Tag filter */}
						<div className="pt-3">
							<label className="block text-[11px] font-medium text-[var(--foreground-muted)] mb-1">
								Filter by tag
							</label>
							<div className="relative">
								<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--foreground-muted)]" />
								<input
									type="text"
									value={tagFilter}
									onChange={(e) => onTagFilterChange(e.target.value)}
									placeholder="Type a tag..."
									className="w-full pl-7 pr-2 py-1.5 text-sm rounded-lg bg-[var(--surface-accent)] border border-[var(--border-subtle)] text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
								/>
							</div>
						</div>

						{/* Min weight slider */}
						<div>
							<label className="block text-[11px] font-medium text-[var(--foreground-muted)] mb-1">
								Min shared tags: {minWeight}
							</label>
							<input
								type="range"
								min={1}
								max={5}
								value={minWeight}
								onChange={(e) => onMinWeightChange(Number(e.target.value))}
								className="w-full h-1.5 rounded-full appearance-none bg-[var(--surface-accent)] cursor-pointer accent-[var(--accent-primary)]"
							/>
							<div className="flex justify-between text-[10px] text-[var(--foreground-muted)] mt-0.5">
								<span>1</span>
								<span>5</span>
							</div>
						</div>

						{/* Reset */}
						<button
							onClick={onReset}
							className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-lg surface-chip text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
						>
							<RotateCcw className="h-3 w-3" />
							Reset filters
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
