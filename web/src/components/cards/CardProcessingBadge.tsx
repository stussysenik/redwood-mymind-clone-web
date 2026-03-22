import type { CardMetadata } from 'src/lib/types';
import { getProcessingState } from 'src/lib/enrichment-timing';
import { AnalyzingIndicator } from '../AnalyzingIndicator';

interface CardProcessingBadgeProps {
	cardId: string;
	metadata?: CardMetadata;
	createdAt: string;
	accentColor: string;
	variant?: 'dark' | 'light' | 'glass';
	size?: 'sm' | 'md' | 'lg';
	className?: string;
}

/**
 * Shared processing badge for platform cards.
 * Shows spinner + stage dots while processing. Never shows error or retry states —
 * the server pipeline guarantees tags always arrive via fallback.
 */
export function CardProcessingBadge({
	metadata,
	accentColor,
	variant = 'dark',
	size = 'sm',
	className = 'absolute left-2 top-2 z-20',
}: CardProcessingBadgeProps) {
	const processingState = getProcessingState(metadata);

	if (processingState === 'idle') return null;

	return (
		<div className={className}>
			<AnalyzingIndicator
				variant={variant}
				accentColor={accentColor}
				size={size}
				showStage
				serverStage={metadata?.enrichmentStage}
			/>
		</div>
	);
}

export function isCardProcessing(metadata?: CardMetadata): boolean {
	return getProcessingState(metadata) !== 'idle';
}

export default CardProcessingBadge;
