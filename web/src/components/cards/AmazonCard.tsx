/**
 * BYOA - Amazon Card Component
 *
 * Renders products from Amazon with price and Prime badge.
 * Orange accent matching Amazon brand.
 *
 * @fileoverview Amazon product card
 */

import { useState } from 'react';
import { Package, Star, Globe } from 'lucide-react';
import type { Card } from 'src/lib/types';
import { MASONRY_IMAGE_SIZES, PRIORITY_CARD_COUNT } from 'src/lib/image-config';
import { TagDisplay, TagShimmerPlaceholder } from '../TagDisplay';
import { CardActions, ExternalLinkButton } from './CardActions';
import { CardProcessingBadge, isCardProcessing } from './CardProcessingBadge';

interface AmazonCardProps {
	card: Card;
	index?: number;
	onDelete?: () => void;
	onArchive?: () => void;
	onRestore?: () => void;
	onClick?: () => void;
}

export function AmazonCard({ card, index, onDelete, onArchive, onRestore, onClick }: AmazonCardProps) {
	const [imageError, setImageError] = useState(false);
	const [isHovered, setIsHovered] = useState(false);

	const price = card.metadata.price;
	const rating = card.metadata.rating;
	const isPriority = (index ?? Infinity) < PRIORITY_CARD_COUNT;

	return (
		<article
			className={`relative overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-card)] card-shadow border-l-[3px] border-[#FF9900] ${onClick ? 'cursor-pointer' : ''}`}
			onClick={onClick}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* Processing Indicator */}
			<CardProcessingBadge
				cardId={card.id}
				metadata={card.metadata}
				createdAt={card.createdAt}
				accentColor="#FF9900"
				variant="light"
				className="absolute right-2 top-2 z-30"
			/>

			{/* Product Image */}
			<div className="relative aspect-square w-full overflow-hidden bg-gray-50">
				{card.imageUrl && !imageError ? (
					<img
						src={card.imageUrl}
						alt={card.title || 'Product image'}
						className="object-contain p-4 w-full h-full"
						loading={isPriority ? "eager" : "lazy"}
						onError={() => setImageError(true)}
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center bg-gray-50">
						<Package className="h-12 w-12 text-[#FF9900]/40" />
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

				{/* Prime Badge (if applicable) */}
				{price && (
					<div className="absolute bottom-2 right-2 rounded bg-[#232F3E] px-2 py-1">
						<span className="text-sm font-bold text-[#FF9900]">{price}</span>
					</div>
				)}

				{/* Always-visible External Link */}
				{card.url && (
					<ExternalLinkButton url={card.url} variant="light" position="bottom-right" />
				)}

				{/* Hover Actions */}
				<CardActions
					isHovered={isHovered}
					onArchive={onArchive}
					onDelete={onDelete}
					onRestore={onRestore}
					variant="light"
				/>
			</div>

			{/* Content */}
			<div className="p-3">
				<h3 className="text-sm font-medium text-[var(--foreground)] line-clamp-2 leading-snug">
					{card.title}
				</h3>
				{rating && (
					<div className="flex items-center gap-1 mt-1">
						<Star className="h-3 w-3 text-[#FF9900] fill-[#FF9900]" />
						<span className="text-xs text-[var(--foreground-muted)]">{rating}</span>
					</div>
				)}
				{/* Added Date */}
				<div className="mt-1 text-xs text-[var(--foreground-muted)]">
					Added {new Date(card.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
				</div>
				{/* Domain Link */}
				<div className="flex items-center gap-1.5 mt-1">
					<Globe className="w-3 h-3 text-[var(--foreground-muted)]" />
					<span className="text-xs text-[#FF9900] truncate">amazon.com</span>
				</div>
				{/* Tags */}
				{card.tags && card.tags.length > 0 ? (
					<TagDisplay tags={card.tags} className="mt-2 pt-2 border-t border-[var(--border)]" />
				) : isCardProcessing(card.metadata) ? (
					<TagShimmerPlaceholder className="mt-2 pt-2 border-t border-[var(--border)]" />
				) : null}
			</div>
		</article>
	);
}

export default AmazonCard;
