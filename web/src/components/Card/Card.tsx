/**
 * BYOA - Card Component
 *
 * Routes to platform-specific card renderers based on URL.
 * Falls back to generic card for unknown platforms.
 *
 * Enhanced with:
 * - Physics-based hover animations
 * - Touch target compliant action buttons
 * - Staggered fade-up entrance animation
 *
 * @fileoverview Smart card router component
 */

import { useState, useRef, useCallback, memo, lazy, Suspense } from 'react';
import { Globe, ExternalLink, Play, StickyNote, FileText, ShoppingBag, BookOpen, Trash2, RotateCcw, Twitter, Volume2, MessageSquare, Archive, Film, Users } from 'lucide-react';
import { AnalyzingIndicator } from 'src/components/AnalyzingIndicator';
import { TagDisplay, TagShimmerPlaceholder } from 'src/components/TagDisplay';
import type { Card as CardType } from 'src/lib/types';
import { detectPlatform, getPlatformInfo, extractDomain } from 'src/lib/platforms';
import { useWebGPU } from 'src/lib/webgpu/context';
import { decodeHtmlEntities } from 'src/lib/text-utils';
import { getProcessingState } from 'src/lib/enrichment-timing';
import { isCardProcessing } from 'src/components/cards/CardProcessingBadge';
import { MASONRY_IMAGE_SIZES, PRIORITY_CARD_COUNT } from 'src/lib/image-config';
import { getBrowserImageUrl, getFallbackScreenshotUrl } from 'src/lib/imageProxy';

// Platform-specific cards — lazy-loaded to reduce initial bundle
const TwitterCard = lazy(() => import('src/components/cards/TwitterCard').then(m => ({ default: m.TwitterCard })));
const InstagramCard = lazy(() => import('src/components/cards/InstagramCard').then(m => ({ default: m.InstagramCard })));
const YouTubeCard = lazy(() => import('src/components/cards/YouTubeCard').then(m => ({ default: m.YouTubeCard })));
const MovieCard = lazy(() => import('src/components/cards/MovieCard').then(m => ({ default: m.MovieCard })));
const RedditCard = lazy(() => import('src/components/cards/RedditCard').then(m => ({ default: m.RedditCard })));
const LetterboxdCard = lazy(() => import('src/components/cards/LetterboxdCard').then(m => ({ default: m.LetterboxdCard })));
const GoodreadsCard = lazy(() => import('src/components/cards/GoodreadsCard').then(m => ({ default: m.GoodreadsCard })));
const AmazonCard = lazy(() => import('src/components/cards/AmazonCard').then(m => ({ default: m.AmazonCard })));
const StoryGraphCard = lazy(() => import('src/components/cards/StoryGraphCard').then(m => ({ default: m.StoryGraphCard })));

// =============================================================================
// PROPS
// =============================================================================

interface CardProps {
	card: CardType;
	/** Card index in the grid — first PRIORITY_CARD_COUNT get priority loading */
	index?: number;
	/** Optional delete handler */
	onDelete?: () => void;
	/** Optional archive handler */
	onArchive?: () => void;
	/** Optional restore handler (for Trash) */
	onRestore?: () => void;
	/** Optional click handler (for Detail View) */
	onClick?: () => void;
}

// =============================================================================
// TYPE ICONS
// =============================================================================

const TYPE_ICONS = {
	article: FileText,
	image: Globe,
	note: StickyNote,
	product: ShoppingBag,
	book: BookOpen,
	video: Play,
	audio: Volume2,
	social: Users,     // Social media (Twitter, Instagram, Reddit, etc.)
	movie: Film,       // Movies (IMDB, Letterboxd)
	website: Globe,
} as const;

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Smart card component that routes to platform-specific renderers.
 */
export const Card = memo(function Card({ card, index, onDelete, onArchive, onRestore, onClick }: CardProps) {
	const platform = detectPlatform(card.url);
	const sharedProps = { card, index, onDelete, onArchive, onRestore, onClick };

	// Route to platform-specific cards (wrapped in Suspense for lazy loading)
	const platformCard = (() => {
		switch (platform) {
			case 'twitter':
				return <TwitterCard {...sharedProps} />;
			case 'instagram':
				return <InstagramCard {...sharedProps} />;
			case 'youtube':
				return <YouTubeCard {...sharedProps} />;
			case 'reddit':
				return <RedditCard {...sharedProps} />;
			case 'letterboxd':
				return <LetterboxdCard {...sharedProps} />;
			case 'imdb':
				return <MovieCard {...sharedProps} />;
			case 'goodreads':
				return <GoodreadsCard {...sharedProps} />;
			case 'amazon':
				return <AmazonCard {...sharedProps} />;
			case 'storygraph':
				return <StoryGraphCard {...sharedProps} />;
			default:
				return <GenericCard {...sharedProps} />;
		}
	})();

	if (platform === 'unknown' || !platform) {
		return <GenericCard {...sharedProps} />;
	}

	return <Suspense fallback={<div className="animate-pulse bg-gray-100 rounded-lg h-48" />}>{platformCard}</Suspense>;
}, (prev, next) => {
	return prev.card.id === next.card.id
		&& prev.card.imageUrl === next.card.imageUrl
		&& prev.card.title === next.card.title
		&& prev.card.metadata?.enrichedAt === next.card.metadata?.enrichedAt
		&& prev.card.tags === next.card.tags
		&& prev.index === next.index
		&& prev.onDelete === next.onDelete
		&& prev.onArchive === next.onArchive
		&& prev.onRestore === next.onRestore
		&& prev.onClick === next.onClick;
});

// =============================================================================
// GENERIC CARD (for unknown platforms)
// =============================================================================

/**
 * Generic card for non-platform-specific content.
 */
const GenericCard = memo(function GenericCard({ card, index, onDelete, onArchive, onRestore, onClick }: CardProps) {
	const [imageError, setImageError] = useState(false);
	const [screenshotError, setScreenshotError] = useState(false);
	const articleRef = useRef<HTMLElement>(null);
	const { reportHover } = useWebGPU();
	const isPriority = (index ?? Infinity) < PRIORITY_CARD_COUNT;

	const platformInfo = getPlatformInfo(card.url);
	const domain = extractDomain(card.url);
	const TypeIcon = TYPE_ICONS[card.type];
	const isVideo = card.url?.includes('vimeo');
	const browserImageUrl = getBrowserImageUrl(card.imageUrl);

	// Processing updates are now handled by Supabase realtime in CardGridClient
	// (targeted UPDATE events update cards in-place, no polling needed)

	/**
	 * Renders the card visual content.
	 */
	const renderVisual = () => {
		const hasValidUrl = card.url && !card.url.startsWith('file:') && !card.url.startsWith('local-');

		// 1. Primary Image - Fixed aspect ratio with color placeholder for CLS prevention
		if (browserImageUrl && !imageError) {
			return (
				<div
					className="relative w-full overflow-hidden"
					style={{
						backgroundColor: card.metadata?.colors?.[0] || 'rgb(243, 244, 246)',
						aspectRatio: '5/3'
					}}
				>
					<img
						src={browserImageUrl}
						alt={card.title || 'Card image'}
						className="object-cover w-full h-full"
						loading={isPriority ? "eager" : "lazy"}
						onError={() => setImageError(true)}
					/>
					{/* Platform/Domain Badge for generic websites */}
					{domain && (
						<div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md">
							<Globe className="w-3 h-3 text-white/80" />
							<span className="text-xs font-medium text-white truncate max-w-[100px]">{domain}</span>
						</div>
					)}
					{/* Video Play Button */}
					{isVideo && (
						<div className="absolute inset-0 flex items-center justify-center">
							<div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg backdrop-blur-sm">
								<Play className="w-5 h-5 text-gray-800 ml-0.5" fill="currentColor" />
							</div>
						</div>
					)}
				</div>
			);
		}

		// 2. Fallback: Automatic Screenshot (Microlink) - Fixed Golden Ratio for consistency
		// Skip for social platforms that block screenshots (twitter/x show login walls)
		const isSocialUrl = card.url && (card.url.includes('twitter.com') || card.url.includes('x.com') || card.url.includes('instagram.com'));
		const screenshotUrl = getFallbackScreenshotUrl(card.url);
		if (hasValidUrl && !screenshotError && !isSocialUrl && screenshotUrl) {
			return (
				<div className="relative aspect-[1.618/1] w-full overflow-hidden bg-gray-50">
					<div className="absolute inset-0 animate-shimmer" />
					<img
						src={screenshotUrl}
						alt="Site Preview"
						className="object-cover object-top opacity-90 hover:opacity-100 transition-opacity relative z-10 w-full h-full"
						loading="lazy"
						onError={() => setScreenshotError(true)}
					/>
					{/* Platform/Domain Badge */}
					<div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md">
						<Globe className="w-3 h-3 text-white/80" />
						<span className="text-xs font-medium text-white truncate max-w-[100px]">{domain || 'Website'}</span>
					</div>
				</div>
			);
		}

		// 3. Last Resort: Type Icon

		// Note card without image
		if (card.type === 'note') {
			return (
				<div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 min-h-[120px]">
					<h4 className="text-xs font-semibold text-orange-600 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
						<span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
						{decodeHtmlEntities(card.title || 'Add a New Note')}
					</h4>
					<p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-6">
						{decodeHtmlEntities(card.content?.slice(0, 200) || 'Start typing here...')}
					</p>
				</div>
			);
		}

		// Placeholder with dynamic gradient and Golden Ratio
		const getGradient = (str: string) => {
			let hash = 0;
			for (let i = 0; i < str.length; i++) {
				hash = str.charCodeAt(i) + ((hash << 5) - hash);
			}
			const hue1 = Math.abs(hash % 360);
			const hue2 = (hue1 + 40) % 360;
			return `linear-gradient(135deg, hsl(${hue1}, 70%, 90%), hsl(${hue2}, 70%, 95%))`;
		};

		return (
			<div
				className="aspect-[1.618/1] w-full flex items-center justify-center transition-transform duration-500 group-hover:scale-105"
				style={{ background: getGradient(card.title || card.type) }}
			>
				<TypeIcon className="h-12 w-12 text-gray-400/50" />
			</div>
		);
	};

	return (
		<article
			data-testid="card"
			data-card-id={card.id}
			onClick={onClick}
			className={`
				group relative flex flex-col overflow-hidden
				bg-[var(--surface-card)] card-base
				physics-press
				${onClick ? 'cursor-pointer' : ''}
			`}
			style={{
				borderLeft: `3px solid ${platformInfo.color}`,
				transitionTimingFunction: 'var(--ease-snappy)'
			}}
			ref={articleRef}
			onPointerEnter={() => {
				if (articleRef.current) {
					const rect = articleRef.current.getBoundingClientRect();
					reportHover({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
				}
			}}
			onPointerLeave={() => {
				reportHover(null);
			}}
		>
			{/* Visual Section */}
			{renderVisual()}

			{/* Content Section */}
			<div className="flex flex-col p-3 gap-2">
				{/* Title */}
				{card.title && card.type !== 'note' && (
					<h3 className="text-sm font-medium text-[var(--foreground)] line-clamp-2 leading-snug">
						{decodeHtmlEntities(card.title)}
					</h3>
				)}

				{/* Summary */}
				{card.metadata.summary && card.type !== 'note' && (
					<p className="text-xs text-[var(--foreground-muted)] line-clamp-2">
						{decodeHtmlEntities(card.metadata.summary)}
					</p>
				)}

				{/* Price for products */}
				{card.type === 'product' && card.metadata.price && (
					<span className="text-sm font-semibold text-green-600">
						{card.metadata.price}
					</span>
				)}

				{/* Source URL */}
				{domain && (
					<div className="flex items-center gap-1.5 mt-auto pt-1">
						<Globe className="w-3 h-3 text-[var(--foreground-muted)]" />
						<span className="text-xs text-[var(--accent-primary)] truncate">
							{domain}
						</span>
					</div>
				)}

				{/* Tags */}
				{card.tags.length > 0 ? (
					<TagDisplay tags={card.tags} className="pt-2 border-t border-[var(--border)]" />
				) : isCardProcessing(card.metadata) ? (
					<TagShimmerPlaceholder className="pt-2 border-t border-[var(--border)]" />
				) : null}
			</div>

			{/* Processing Indicator - positioned on left to avoid conflicting with hover actions */}
			{(() => {
				const processingState = getProcessingState(card.metadata);
				if (processingState === 'idle') return null;

				return (
					<div className="absolute top-2 left-2 z-10">
						<AnalyzingIndicator
							variant="dark"
							accentColor={platformInfo.color}
							size="sm"
							showStage
							serverStage={card.metadata?.enrichmentStage}
						/>
					</div>
				);
			})()}

			{/* Always-visible External Link - bottom right, 44px touch target on mobile */}
			{card.url && (
				<a
					href={card.url}
					target="_blank"
					rel="noopener noreferrer"
					onClick={(e) => e.stopPropagation()}
					className="absolute bottom-2 right-2 p-2.5 sm:p-2 md:p-1.5 rounded-full
						   bg-[var(--card-bg)]/90 shadow-sm text-[var(--foreground-muted)]
						   hover:text-[var(--foreground)] transition-colors z-10
						   physics-press touch-target min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0
						   flex items-center justify-center"
					aria-label="Open original"
				>
					<ExternalLink className="h-4 w-4 md:h-3.5 md:w-3.5" />
				</a>
			)}

			{/* Hover Actions - CSS-only visibility, no state */}
			<div className="absolute right-2 top-2 flex gap-1.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150">
				{onArchive && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onArchive();
						}}
						className="p-2.5 md:p-2 rounded-lg bg-[var(--card-bg)]/90 shadow-sm
								   text-[var(--foreground-muted)] hover:text-amber-600
								   hover:bg-amber-50 dark:hover:bg-amber-900/20
								   transition-colors physics-press touch-target"
						aria-label="Archive card"
					>
						<Archive className="h-4 w-4" />
					</button>
				)}
				{onDelete && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						className="p-2.5 md:p-2 rounded-lg bg-[var(--card-bg)]/90 shadow-sm
								   text-[var(--foreground-muted)] hover:text-red-600
								   hover:bg-red-50 dark:hover:bg-red-900/20
								   transition-colors physics-press touch-target"
						aria-label="Delete card"
					>
						<Trash2 className="h-4 w-4" />
					</button>
				)}
				{onRestore && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onRestore();
						}}
						className="p-2.5 md:p-2 rounded-lg bg-[var(--card-bg)]/90 shadow-sm
								   text-[var(--foreground-muted)] hover:text-green-600
								   hover:bg-green-50 dark:hover:bg-green-900/20
								   transition-colors physics-press touch-target"
						aria-label="Restore card"
					>
						<RotateCcw className="h-4 w-4" />
					</button>
				)}
			</div>
		</article>
	);
}, (prev, next) => {
	return prev.card.id === next.card.id
		&& prev.card.imageUrl === next.card.imageUrl
		&& prev.card.title === next.card.title
		&& prev.card.metadata?.enrichedAt === next.card.metadata?.enrichedAt
		&& prev.card.tags === next.card.tags
		&& prev.index === next.index
		&& prev.onDelete === next.onDelete
		&& prev.onArchive === next.onArchive
		&& prev.onRestore === next.onRestore
		&& prev.onClick === next.onClick;
});

export default Card;
