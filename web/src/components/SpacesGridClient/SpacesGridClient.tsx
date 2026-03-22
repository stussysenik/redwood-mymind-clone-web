/**
 * MyMind Clone - Spaces Grid Client Component
 *
 * Client component that displays database-backed spaces.
 * Supports soft-delete via API and shows real space data.
 *
 * @fileoverview Client wrapper for spaces grid with delete functionality
 */

import { useState, useEffect } from 'react';
import { navigate } from '@redwoodjs/router';
import { PackageOpen, Trash2 } from 'lucide-react';
import { Hash, Layers } from 'lucide-react';
import type { SpaceWithCount } from 'src/lib/types';

interface SpacesGridClientProps {
	spaces: SpaceWithCount[];
}

export function SpacesGridClient({ spaces }: SpacesGridClientProps) {
	const [mounted, setMounted] = useState(false);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const handleDeleteSpace = async (spaceId: string) => {
		setIsDeleting(true);
		try {
			// TODO: Replace with GraphQL mutation for deleting a space
			const response = await fetch(`/api/spaces/${spaceId}`, {
				method: 'DELETE',
			});

			if (response.ok) {
				navigate('/spaces');
			} else {
				const data = await response.json();
				console.error('[SpacesGrid] Delete failed:', data.error);
			}
		} catch (err) {
			console.error('[SpacesGrid] Delete error:', err);
		} finally {
			setIsDeleting(false);
			setDeleteConfirmId(null);
		}
	};

	if (spaces.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-20 text-center">
				<div className="bg-gray-100 p-4 rounded-full mb-4">
					<PackageOpen className="w-8 h-8 text-gray-400" />
				</div>
				<h3 className="text-lg font-medium text-[var(--foreground)]">No spaces yet</h3>
				<p className="text-[var(--foreground-muted)] max-w-sm mt-1">
					Create a space to organize your cards into collections.
				</p>
			</div>
		);
	}

	if (!mounted) {
		return <SpacesGridSkeleton />;
	}

	return (
		<div>
			<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
				{spaces.map((space) => (
					<SpaceCardItem
						key={space.id}
						space={space}
						onDelete={() => setDeleteConfirmId(space.id)}
					/>
				))}
			</div>

			{/* Delete Confirmation Dialog */}
			{deleteConfirmId && (
				<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
					<div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95">
						<div className="flex items-center gap-3 mb-4">
							<div className="p-2 bg-red-100 rounded-full">
								<Trash2 className="w-5 h-5 text-red-500" />
							</div>
							<h3 className="text-lg font-bold text-gray-900">Delete Space?</h3>
						</div>

						<p className="text-sm text-gray-600 mb-2">
							This will remove the space. Cards in this space will not be deleted.
						</p>

						<div className="flex gap-3 mt-6">
							<button
								onClick={() => setDeleteConfirmId(null)}
								disabled={isDeleting}
								className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
							>
								Cancel
							</button>
							<button
								onClick={() => handleDeleteSpace(deleteConfirmId)}
								disabled={isDeleting}
								className="flex-1 py-2.5 px-4 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
							>
								{isDeleting ? (
									<>
										<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
										Deleting...
									</>
								) : (
									'Delete Space'
								)}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// =============================================================================
// SPACE CARD ITEM
// =============================================================================

function SpaceCardItem({ space, onDelete }: { space: SpaceWithCount; onDelete: () => void }) {
	const handleDelete = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onDelete();
	};

	return (
		<a
			href={`/spaces/${space.id}`}
			className="group relative bg-[var(--surface-card)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] border border-[var(--border)] hover:shadow-[var(--shadow-md)] transition-all p-3 flex items-center gap-3"
		>
			{/* Delete Button (appears on hover) */}
			<div className="absolute top-2 right-2 z-10">
				<button
					onClick={handleDelete}
					className="p-1 rounded-full bg-gray-100 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-500 transition-all"
					title="Delete space"
				>
					<Trash2 className="w-3.5 h-3.5" />
				</button>
			</div>

			{/* Icon */}
			<div
				className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
				style={{
					background: 'linear-gradient(135deg, rgb(255 237 213), rgb(254 243 199))',
				}}
			>
				{space.isSmart ? (
					<Hash className="w-5 h-5 text-[var(--accent-primary)]" />
				) : (
					<Layers className="w-5 h-5 text-[var(--accent-primary)]" />
				)}
			</div>

			{/* Text */}
			<div className="flex-1 min-w-0 pr-8">
				<h3 className="text-sm font-medium text-[var(--foreground)] truncate group-hover:text-[var(--accent-primary)] transition-colors">
					{space.name}
				</h3>
				<p className="text-xs text-[var(--foreground-muted)]">
					{space.cardCount} {space.cardCount === 1 ? 'card' : 'cards'}
				</p>
			</div>
		</a>
	);
}

// =============================================================================
// SKELETON
// =============================================================================

function SpacesGridSkeleton() {
	return (
		<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
			{Array.from({ length: 8 }).map((_, i) => (
				<div key={i} className="bg-white rounded-xl border border-[var(--border)] p-3 flex items-center gap-3">
					<div className="w-10 h-10 rounded-lg bg-gray-100 animate-pulse shrink-0" />
					<div className="flex-1 space-y-1.5">
						<div className="h-4 w-20 bg-gray-100 animate-pulse rounded" />
						<div className="h-3 w-12 bg-gray-100 animate-pulse rounded" />
					</div>
				</div>
			))}
		</div>
	);
}

export default SpacesGridClient;
