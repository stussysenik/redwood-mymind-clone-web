/**
 * BYOA - SearchBar Component
 *
 * Serif italic search input matching mymind.com aesthetic.
 * "Search my mind..." placeholder in elegant serif typography.
 *
 * @fileoverview Search input with mymind-inspired styling
 */

import React from 'react';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { navigate, useLocation } from '@redwoodjs/router';
import { useMutation } from '@redwoodjs/web';
import { Search, X, PackagePlus, Loader2 } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';

// =============================================================================
// PROPS
// =============================================================================

interface SearchBarProps {
  /** Placeholder text */
  placeholder?: string;
  /** Callback when search query changes */
  onSearch?: (query: string) => void;
  /** Search mode to retain in URL (e.g. ARCHIVE) */
  mode?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Search bar with serif italic placeholder.
 */
export function SearchBar({
  placeholder = 'Search...',
  onSearch,
  mode
}: SearchBarProps) {
	const { search } = useLocation();
	const searchParams = new URLSearchParams(search);

	const initialQuery = searchParams.get('q') ?? '';

	const [query, setQuery] = useState(initialQuery);
	const [isFocused, setIsFocused] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const [createSpace] = useMutation(gql`
		mutation SearchBarCreateSpace($input: CreateSpaceInput!) {
			createSpace(input: $input) {
				id
				name
			}
		}
	`);

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

    if (mode) {
      params.set('mode', mode);
    } else {
      params.delete('mode');
    }

    const nextQuery = params.toString();
		return nextQuery ? `?${nextQuery}` : '/';
	}, [query, searchParamsString]);

	// Sync local state when URL changes externally (e.g. tag click, back button).
	// Only depends on currentUrlQuery — NOT on query, to avoid resetting input while typing.
	useEffect(() => {
		if (!isFocused) {
			setQuery(currentUrlQuery);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentUrlQuery]);

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
    if (mode) {
      params.set('mode', mode);
    } else {
      params.delete('mode');
    }

		const nextQuery = params.toString();
		startTransition(() => {
			navigate(nextQuery ? `?${nextQuery}` : '/');
		});

		// Redwood's router steals focus via document.body.focus() on query param changes.
		// Reclaim focus so the user can keep typing.
		requestAnimationFrame(() => inputRef.current?.focus());

		onSearch?.(debouncedQuery);
	}, [debouncedQuery, currentUrlQuery, hasLegacyMode, searchParamsString, onSearch]);


	const handleClear = () => {
		setQuery('');
		const params = new URLSearchParams(searchParamsString);
		params.delete('q');
    if (mode) {
      params.set('mode', mode);
    } else {
      params.delete('mode');
    }
		const nextQuery = params.toString();

		startTransition(() => {
			navigate(nextQuery ? `?${nextQuery}` : '/');
		});
		onSearch?.('');
	};

	const handleSaveSpace = async () => {
		const normalizedQuery = query.trim().replace(/^#+/, '').toLowerCase();
		if (!normalizedQuery) return;

		setIsSaving(true);
		try {
			await createSpace({
				variables: {
					input: {
						name: normalizedQuery,
						query: normalizedQuery,
						isSmart: true
					}
				}
			});
			navigate('/spaces');
		} catch (error) {
			console.error('Failed to save space', error);
		} finally {
			setIsSaving(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
			e.preventDefault();
			e.currentTarget.select();
		} else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			startTransition(() => {
				navigate(searchHref);
			});
			onSearch?.(query.trim());
		} else if (e.key === 'Escape') {
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
					surface-shell flex items-center gap-2.5 py-2.5 px-3.5 sm:gap-3 sm:py-3 sm:px-4 rounded-[var(--radius-xl)]
					transition-[background-color,border-color,box-shadow,transform] duration-300 ease-out
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
					ref={inputRef}
					type="text"
					name="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					className={`
            flex-1 bg-transparent text-base sm:text-lg
            placeholder:text-[var(--foreground-muted)]
            focus:outline-none
            font-medium tracking-tight text-[var(--foreground)]
          `}
					style={{ fontFamily: 'var(--font-display)' }}
					aria-label="Search cards"
					autoComplete="off"
					spellCheck={false}
					enterKeyHint="search"
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
							aria-label="Save as Space"
							type="button"
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
