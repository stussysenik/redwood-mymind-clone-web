/**
 * BYOA - Analyzing Indicator Component
 *
 * Premium loading indicator shown on cards during AI enrichment.
 * Features animated gradient, pulse effects, and platform-aware styling.
 *
 * Never-fail design: No warning, stuck, or retry states.
 * The indicator shows "Analyzing" + stage dots until processing completes.
 * The server pipeline guarantees tags always arrive (via fallback if needed).
 *
 * @fileoverview Shared analyzing indicator for all card types
 */

import { Loader2, Brain, Wand2, Sparkles } from 'lucide-react';
import {
	ENRICHMENT_PROGRESS_STAGES,
	type EnrichmentProgressStage,
	toProgressEnrichmentStage,
} from 'src/lib/semantic';

// =============================================================================
// TYPES
// =============================================================================

interface AnalyzingIndicatorProps {
	/** Visual variant for different card backgrounds */
	variant?: 'dark' | 'light' | 'glass';
	/** Optional platform color for accent */
	accentColor?: string;
	/** Size variant */
	size?: 'sm' | 'md' | 'lg';
	/** Custom label text */
	label?: string;
	/** Show detailed stage info */
	showStage?: boolean;
	/** Current processing stage (0-100) */
	progress?: number;
	/**
	 * Server-set enrichment stage — overrides time-based stage inference when provided.
	 *
	 * HOW IT WORKS: The /api/enrich route writes `metadata.enrichmentStage` to the
	 * Supabase `cards` row at each pipeline step (fetching → analyzing → extracting →
	 * finalizing). Supabase Realtime pushes these row changes to every subscribed
	 * client via WebSocket. The CardGridClient component listens to the `cards` table
	 * subscription and patches the local card state, which flows down as this prop.
	 *
	 * WHY SERVER STAGES? Time-based inference (dividing elapsed time by estimated total)
	 * is a rough heuristic — it can't know when the scraper is slow or the AI is fast.
	 * Server stages give exact pipeline position, making the progress dots truthful.
	 */
	serverStage?: string;
}

// =============================================================================
// ANIMATION STAGES
// =============================================================================

const STAGES = ENRICHMENT_PROGRESS_STAGES;

const STAGE_ICONS: Record<EnrichmentProgressStage, typeof Loader2> = {
	queued: Loader2,
	scraping: Loader2,
	analyzing: Brain,
	extracting: Wand2,
	finalizing: Sparkles,
};

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Premium analyzing indicator with animated gradient and pulse effects.
 * Designed to overlay on cards during AI enrichment.
 *
 * Never shows error, warning, or retry states — the pipeline guarantees
 * tags always arrive. This indicator simply shows progress until done.
 */
export function AnalyzingIndicator({
	variant = 'dark',
	accentColor,
	size = 'sm',
	label,
	showStage = false,
	progress,
	serverStage,
}: AnalyzingIndicatorProps) {
	// When a server stage is provided, auto-enable stage display
	const effectiveShowStage = showStage || !!serverStage;
	const normalizedStage = toProgressEnrichmentStage(serverStage);

	// Determine stage: prefer server stage, fall back to progress-based, then default
	const stageIndex = normalizedStage
		? Math.max(0, STAGES.findIndex(s => s.name === normalizedStage))
		: progress !== undefined
			? Math.min(Math.floor(progress / (100 / STAGES.length)), STAGES.length - 1)
			: 0;
	const currentStage = STAGES[stageIndex];
	const StageIcon = STAGE_ICONS[currentStage?.name || 'analyzing'] || Brain;

	const effectiveLabel = label || (effectiveShowStage ? currentStage?.label : 'Analyzing');

	// Size classes
	const sizeClasses = {
		sm: 'px-2.5 py-1.5 gap-1.5 text-[10px]',
		md: 'px-3 py-2 gap-2 text-xs',
		lg: 'px-4 py-2.5 gap-2.5 text-sm',
	};

	const iconSizes = {
		sm: 'h-3 w-3',
		md: 'h-3.5 w-3.5',
		lg: 'h-4 w-4',
	};

	// Variant styles
	const variantClasses = {
		dark: 'bg-black/70 text-white border border-white/10',
		light: 'bg-white/90 text-gray-700 border border-gray-200/50 shadow-sm',
		glass: 'bg-white/20 text-white border border-white/20',
	};

	return (
		<div
			className={`
				inline-flex items-center rounded-full backdrop-blur-md font-medium
				${sizeClasses[size]}
				${variantClasses[variant]}
				analyzing-indicator
			`}
			style={{
				boxShadow: accentColor
					? `0 0 12px ${accentColor}40, inset 0 1px 0 rgba(255,255,255,0.1)`
					: undefined,
			}}
		>
			{/* Animated Icon */}
			<div className="relative">
				{/* Outer pulse ring */}
				<div
					className={`
						absolute inset-0 rounded-full animate-ping opacity-30
						${variant === 'light' ? 'bg-gray-500' : 'bg-white'}
					`}
					style={{ animationDuration: '1.5s' }}
				/>
				{/* Inner icon */}
				{effectiveShowStage ? (
					<StageIcon
						className={`${iconSizes[size]} animate-pulse`}
						style={{ animationDuration: '1s' }}
					/>
				) : (
					<Loader2
						className={`${iconSizes[size]} animate-spin`}
						style={{ animationDuration: '1s' }}
					/>
				)}
			</div>

			{/* Label with gradient shimmer */}
			<span className="relative overflow-hidden">
				<span className="relative z-10">
					{effectiveLabel}
				</span>
				{/* Shimmer overlay */}
				<span
					className="absolute inset-0 -translate-x-full animate-shimmer-fast bg-gradient-to-r from-transparent via-white/30 to-transparent"
					style={{
						animationDuration: '2s',
						animationIterationCount: 'infinite',
					}}
				/>
			</span>

			{/* Progress indicator dots */}
			{effectiveShowStage && (
				<div className="flex gap-0.5 ml-1">
					{STAGES.map((_, i) => (
						<div
							key={i}
							className={`
								w-1 h-1 rounded-full transition-all duration-300
								${i <= stageIndex
									? variant === 'light' ? 'bg-gray-700' : 'bg-white'
									: variant === 'light' ? 'bg-gray-300' : 'bg-white/30'
								}
								${i === stageIndex ? 'scale-125' : ''}
							`}
						/>
					))}
				</div>
			)}
		</div>
	);
}

// =============================================================================
// FULL CARD OVERLAY VARIANT
// =============================================================================

interface AnalyzingOverlayProps {
	/** Whether to show the overlay */
	visible: boolean;
	/** Platform accent color */
	accentColor?: string;
	/** Current progress percentage */
	progress?: number;
}

/**
 * Full-card overlay variant for more prominent loading state.
 * Use this for cards without images or when you want to emphasize the loading.
 */
export function AnalyzingOverlay({ visible, accentColor, progress }: AnalyzingOverlayProps) {
	if (!visible) return null;

	return (
		<div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-lg">
			<div className="flex flex-col items-center gap-3">
				{/* Animated brain icon with orbiting dots */}
				<div className="relative">
					<div
						className="w-12 h-12 rounded-full flex items-center justify-center"
						style={{
							background: accentColor
								? `linear-gradient(135deg, ${accentColor}40, ${accentColor}20)`
								: 'linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(139, 92, 246, 0.2))',
						}}
					>
						<Brain className="w-6 h-6 text-white animate-pulse" />
					</div>

					{/* Orbiting dots */}
					<div
						className="absolute inset-0 animate-spin"
						style={{ animationDuration: '3s' }}
					>
						<div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-2 h-2 rounded-full bg-white/80" />
					</div>
					<div
						className="absolute inset-0 animate-spin"
						style={{ animationDuration: '3s', animationDelay: '-1s' }}
					>
						<div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 w-1.5 h-1.5 rounded-full bg-white/60" />
					</div>
				</div>

				{/* Status text */}
				<div className="text-white text-sm font-medium text-center">
					<span className="analyzing-text">Analyzing content</span>
				</div>

				{/* Progress bar (if provided) */}
				{progress !== undefined && (
					<div className="w-24 h-1 rounded-full bg-white/20 overflow-hidden">
						<div
							className="h-full rounded-full bg-white transition-all duration-500 ease-out"
							style={{ width: `${progress}%` }}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

export default AnalyzingIndicator;
