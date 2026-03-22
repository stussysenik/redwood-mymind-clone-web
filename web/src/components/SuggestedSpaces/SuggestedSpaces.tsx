/**
 * MyMind Clone - Suggested Spaces Component
 *
 * Horizontal scroll of auto-detected space suggestions based on tag clusters.
 * Each suggestion has a "Create" action that creates a new auto-generated space.
 *
 * @fileoverview Client component for space suggestions
 */

import { useState } from 'react';
import { navigate } from '@redwoodjs/router';
import { Sparkles, Plus, Loader2, Hash } from 'lucide-react';

interface Suggestion {
	name: string;
	tagFilter: string[];
	estimatedCount: number;
}

interface SuggestedSpacesProps {
	suggestions: Suggestion[];
}

export function SuggestedSpaces({ suggestions }: SuggestedSpacesProps) {
	const [creating, setCreating] = useState<string | null>(null);

	const handleCreate = async (suggestion: Suggestion) => {
		setCreating(suggestion.name);
		try {
			// TODO: Replace with GraphQL mutation for creating a space
			const response = await fetch('/api/spaces', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: suggestion.name,
					tagFilter: suggestion.tagFilter,
				}),
			});

			if (response.ok) {
				navigate('/spaces');
			} else {
				const data = await response.json();
				console.error('[SuggestedSpaces] Create failed:', data.error);
			}
		} catch (err) {
			console.error('[SuggestedSpaces] Create error:', err);
		} finally {
			setCreating(null);
		}
	};

	if (suggestions.length === 0) return null;

	return (
		<div>
			<div className="flex items-center gap-2 mb-3">
				<Sparkles className="w-4 h-4 text-[var(--accent-primary)]" />
				<h2 className="text-sm font-medium text-[var(--foreground-muted)]">
					Suggested Spaces
				</h2>
			</div>

			<div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-gray-200">
				{suggestions.map((suggestion) => (
					<div
						key={suggestion.name}
						className="flex-shrink-0 bg-[var(--surface-card)] border border-dashed border-[var(--border)] rounded-[var(--radius-md)] p-3 flex items-center gap-3 min-w-[200px]"
					>
						<div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-50 to-purple-50 flex items-center justify-center shrink-0">
							<Hash className="w-4 h-4 text-violet-500" />
						</div>

						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium text-[var(--foreground)] truncate">
								{suggestion.name}
							</p>
							<p className="text-xs text-[var(--foreground-muted)]">
								~{suggestion.estimatedCount} cards
							</p>
						</div>

						<button
							onClick={() => handleCreate(suggestion)}
							disabled={creating !== null}
							className="shrink-0 p-1.5 rounded-lg bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/20 transition-colors disabled:opacity-50"
							title="Create this space"
						>
							{creating === suggestion.name ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Plus className="w-4 h-4" />
							)}
						</button>
					</div>
				))}
			</div>
		</div>
	);
}

export default SuggestedSpaces;
