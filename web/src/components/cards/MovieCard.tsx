/**
 * BYOA - Movie/Film Card Component
 *
 * Renders IMDB and Letterboxd movie/film entries.
 *
 * @fileoverview Movie card for IMDB and Letterboxd
 */

import { useState } from 'react';
import { Star, Film, Globe } from 'lucide-react';
import type { Card } from 'src/lib/types';
import { detectPlatform } from 'src/lib/platforms';
import { TagDisplay, TagShimmerPlaceholder } from '../TagDisplay';
import { CardActions, ExternalLinkButton } from './CardActions';
import { CardProcessingBadge, isCardProcessing } from './CardProcessingBadge';
import { MASONRY_IMAGE_SIZES, PRIORITY_CARD_COUNT } from 'src/lib/image-config';

// =============================================================================
// TYPES
// =============================================================================

interface MovieCardProps {
	card: Card;
	index?: number;
	onDelete?: () => void;
	onArchive?: () => void;
	onRestore?: () => void;
	onClick?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Movie/Film card for IMDB and Letterboxd.
 */
export function MovieCard({ card, index, onDelete, onArchive, onRestore, onClick }: MovieCardProps) {
	const [imageError, setImageError] = useState(false);
	const [isHovered, setIsHovered] = useState(false);
	const platform = detectPlatform(card.url);
	const isLetterboxd = platform === 'letterboxd';
	const isImdb = platform === 'imdb';

	const rating = card.metadata.rating;
	const year = card.metadata.year;
	const director = card.metadata.director;

	// Extract domain for display
	const domain = isLetterboxd ? 'letterboxd.com' : isImdb ? 'imdb.com' : null;

	// Extract dominant color from IMDB color extraction
	const dominantColor = card.metadata?.colors?.[0];

	// Platform-specific colors
	const borderColor = isLetterboxd ? '#00E054' : '#F5C518';
	const accentColor = isLetterboxd ? '#00E054' : '#F5C518';
	const isPriority = (index ?? Infinity) < PRIORITY_CARD_COUNT;

	return (
		<article
			className={`relative overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-card)] card-shadow ${onClick ? 'cursor-pointer' : ''}`}
			style={{
				borderLeft: `3px solid ${borderColor}`,
				// Apply subtle gradient from extracted dominant color (IMDB only)
				background: dominantColor
					? `linear-gradient(135deg, ${dominantColor}15, transparent 60%)`
					: undefined
			}}
			onClick={onClick}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* Processing Indicator */}
			<CardProcessingBadge
				cardId={card.id}
				metadata={card.metadata}
				createdAt={card.createdAt}
				accentColor={accentColor}
				variant="dark"
				className="absolute left-2 top-2 z-30"
			/>

			{/* Poster */}
			<div className="relative aspect-[2/3] w-full overflow-hidden bg-gray-900" style={{ backgroundColor: card.metadata?.colors?.[0] || undefined }}>
				{card.imageUrl && !imageError ? (
					<img
						src={card.imageUrl}
						alt={card.title || 'Movie poster'}
						className="object-cover w-full h-full"
						loading={isPriority ? "eager" : "lazy"}
						onError={() => setImageError(true)}
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900">
						<Film className="h-16 w-16 text-gray-600" />
					</div>
				)}

				{/* Domain Badge */}
				{card.url && (
					<div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 backdrop-blur-sm">
						<Globe className="w-3 h-3 text-white/80" />
						<span className="text-xs font-medium text-white truncate max-w-[120px]">
							{new URL(card.url).hostname.replace('www.', '')}
						</span>
					</div>
				)}

				{/* Rating Badge */}
				{rating && (
					<div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/80 px-2 py-1 backdrop-blur-sm">
						<Star className="h-3.5 w-3.5" fill={accentColor} stroke={accentColor} />
						<span className="text-sm font-bold text-white">{rating}</span>
					</div>
				)}

				{/* Gradient Overlay */}
				<div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent" />

				{/* Always-visible External Link - bottom right for consistency */}
				{card.url && (
					<ExternalLinkButton url={card.url} variant="dark" position="bottom-right" />
				)}

				{/* Hover Actions */}
				<CardActions
					isHovered={isHovered}
					onArchive={onArchive}
					onDelete={onDelete}
					onRestore={onRestore}
					variant="dark"
				/>
			</div>

			{/* Content */}
			<div className="p-3">
				{/* Title */}
				<h3 className="mb-1 text-sm font-semibold text-[var(--foreground)] line-clamp-2">
					{card.title}
				</h3>

				{/* Year & Director */}
				<div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
					{year && <span>{year}</span>}
					{year && director && <span>•</span>}
					{director && <span>Dir. {director}</span>}
				</div>

				{/* Added Date */}
				<div className="mt-1 text-xs text-[var(--foreground-muted)]">
					Added {new Date(card.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
				</div>

				{/* Domain Link */}
				{domain && (
					<div className="flex items-center gap-1.5 mt-1">
						<Globe className="w-3 h-3 text-[var(--foreground-muted)]" />
						<span className="text-xs truncate" style={{ color: accentColor }}>{domain}</span>
					</div>
				)}

				{/* Summary */}
				{card.metadata.summary && (
					<p className="mt-2 text-xs text-[var(--foreground-muted)] line-clamp-2">
						{card.metadata.summary}
					</p>
				)}

				{/* Tags */}
				{card.tags.length > 0 ? (
					<TagDisplay tags={card.tags} className="mt-2 pt-2 border-t border-[var(--border)]" />
				) : isCardProcessing(card.metadata) ? (
					<TagShimmerPlaceholder className="mt-2 pt-2 border-t border-[var(--border)]" />
				) : null}
			</div>
		</article>
	);
}

export default MovieCard;
