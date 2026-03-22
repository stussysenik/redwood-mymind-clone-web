/**
 * MyMind Clone - SearchBar Component
 *
 * Serif italic search input matching mymind.com aesthetic.
 * "Search my mind..." placeholder in elegant serif typography.
 *
 * @fileoverview Search input with mymind-inspired styling
 */

import { startTransition, useEffect, useMemo, useState } from 'react';
import { navigate, useLocation } from '@redwoodjs/router';
import { Search, X, PackagePlus, Loader2 } from 'lucide-react';
import { useDebounce } from 'src/hooks/useDebounce';

// =============================================================================
// PROPS
// =============================================================================

interface SearchBarProps {
	/** Placeholder text */
	placeholder?: string;
	/** Callback when search query changes */
	onSearch?: (query: string) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Search bar with serif italic placeholder.
 */
export function SearchBar({
	placeholder = 'Search your creative brain...',
	onSearch
}: SearchBarProps) {
	const { pathname, search } = useLocation();
	const searchParams = new URLSearchParams(search);

	const initialQuery = searchParams.get('q') ?? '';

	const [query, setQuery] = useState(initialQuery);
	const [isFocused, setIsFocused] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	const debouncedQuery = useDebounce(query, 350);
	const currentUrlQuery = searchParams.get('q') ?? '';
	const hasLegacyMode = searchParams.has('mode');
	const searchParamsString = searchParams.toString();
	const searchHref = useMemo(() => {
		const params = new URLSearchParams(searchParamsString);

		if (query.trim()) {
			params.set('q', query.trim());
		} else {
			params.delete('q');
		}

		params.delete('mode');

		const nextQuery = params.toString();
		return nextQuery ? `?${nextQuery}` : '/';
	}, [query, searchParamsString]);

	// Sync local state when URL changes externally (e.g. tag click)
	useEffect(() => {
		// Only update if different AND we aren't focused (to avoid overwriting while typing)
		// This prevents the race condition where debounced URL update reverts local state
		if (!isFocused && currentUrlQuery !== query) {
			setQuery(currentUrlQuery);
		}
	}, [currentUrlQuery, isFocused, query]);

	// Update URL when debounced query changes
	useEffect(() => {
		if (debouncedQuery === currentUrlQuery && !hasLegacyMode) {
			onSearch?.(debouncedQuery);
			return;
		}

		const params = new URLSearchParams(searchParamsString);
		if (debouncedQuery) {
			params.set('q', debouncedQuery);
		} else {
			params.delete('q');
		}
		params.delete('mode');

		const nextQuery = params.toString();
		startTransition(() => {
			navigate(nextQuery ? `?${nextQuery}` : '/');
		});

		onSearch?.(debouncedQuery);
	}, [debouncedQuery, currentUrlQuery, hasLegacyMode, searchParamsString, onSearch]);


	const handleClear = () => {
		setQuery('');
		const params = new URLSearchParams(searchParamsString);
		params.delete('q');
		params.delete('mode');
		const nextQuery = params.toString();

		startTransition(() => {
			navigate(nextQuery ? `?${nextQuery}` : '/');
		});
		onSearch?.('');
	};

	const handleSaveSpace = async () => {
		if (!query.trim()) return;
		setIsSaving(true);
		try {
			// TODO: Replace with GraphQL mutation for saving a space from search
			await fetch('/api/save', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'note',
					title: `Space: ${query}`,
					content: `Created from search "${query}"`,
					tags: [query]
				})
			});
			// Trigger a re-fetch or navigation
			navigate(pathname);
		} catch (error) {
			console.error('Failed to save space', error);
		} finally {
			setIsSaving(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Escape') {
			handleClear();
			(e.target as HTMLInputElement).blur();
		} else if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			startTransition(() => {
				navigate(searchHref);
			});
			onSearch?.(query.trim());
		} else if (e.key === 'Enter' && e.shiftKey) {
			// Shift+Enter to save as space
			e.preventDefault();
			handleSaveSpace();
		}
	};

	return (
		<div className="relative w-full">
			{/* Search Container */}
			<div
				className={`
					surface-shell flex items-center gap-3 py-3 px-4 rounded-[var(--radius-lg)]
					transition-all duration-300 ease-out
					${isFocused
						? 'bg-[var(--surface-elevated)] border-[var(--border-default)] shadow-[var(--shadow-xl)] transform -translate-y-0.5'
						: 'hover:bg-[var(--surface-elevated)] hover:border-[var(--border-default)]'
					}
				`}
			>

				{/* Search Icon */}
				<Search
					className={`
            h-5 w-5 flex-shrink-0 transition-colors
            ${isFocused ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'}
          `}
				/>

				{/* Input Field */}
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					className={`
            flex-1 bg-transparent text-lg
            placeholder:text-[var(--foreground-muted)]
            focus:outline-none
            font-medium tracking-tight text-[var(--foreground)]
          `}
					style={{ fontFamily: 'var(--font-serif)' }}
					aria-label="Search cards"
					data-testid="search-input"
				/>

				{/* Actions */}
				{query && (
					<div className="flex items-center gap-1">
						<button
							onClick={handleSaveSpace}
							disabled={isSaving}
							className="p-1 rounded-full text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:opacity-50"
							title="Save as Space"
						>
							{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
						</button>
						<button
							onClick={handleClear}
							className="p-1 rounded-full text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
							aria-label="Clear search"
							type="button" // Important preventing form submit
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

export default SearchBar;
