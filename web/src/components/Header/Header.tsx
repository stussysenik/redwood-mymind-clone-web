/**
 * BYOA - Header Component
 *
 * Top navigation with:
 * - Brand logo on left
 * - Navigation tabs in center: Everything | Spaces | Serendipity
 * - User menu on right with Archive and Trash links
 *
 * @fileoverview Application header with navigation tabs
 */

import { useLocation } from '@redwoodjs/router';
import { Sparkles, LayoutGrid, Shuffle, Archive, Trash2, MoreHorizontal, Settings, Network } from 'lucide-react';
import { UserMenu } from 'src/components/UserMenu/UserMenu';
import { ThemeToggle } from 'src/components/ThemeToggle';
import { SettingsModal } from 'src/components/SettingsModal';
import { useState, useRef, useEffect } from 'react';
import { useAtomicWeight } from 'src/hooks/useMediaQuery';

// =============================================================================
// TYPES
// =============================================================================

type Tab = 'everything' | 'spaces' | 'serendipity' | 'graph';

interface TabDef {
	id: Tab;
	label: string;
	icon: React.ReactNode;
	href: string;
}

interface HeaderProps {
	buildVersion?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function Header({ buildVersion = 'dev' }: HeaderProps) {
	const { pathname } = useLocation();
	const [pressedTab, setPressedTab] = useState<string | null>(null);
	const [showOverflowMenu, setShowOverflowMenu] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const overflowMenuRef = useRef<HTMLDivElement>(null);
	const { showTertiary } = useAtomicWeight();

	// Close overflow menu when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (showOverflowMenu && overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) {
				setShowOverflowMenu(false);
			}
		};
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	}, [showOverflowMenu]);

	const tabs: TabDef[] = [
		{ id: 'everything', label: 'Everything', icon: <LayoutGrid className="h-4 w-4" />, href: '/' },
		{ id: 'spaces', label: 'Spaces', icon: <Sparkles className="h-4 w-4" />, href: '/spaces' },
		{ id: 'serendipity', label: 'Serendipity', icon: <Shuffle className="h-4 w-4" />, href: '/serendipity' },
		{ id: 'graph', label: 'Graph', icon: <Network className="h-4 w-4" />, href: '/graph' },
	];

	return (
		<header
			className="sticky top-0 z-50 w-full border-b border-[var(--border-subtle)] backdrop-blur-xl"
			style={{ backgroundColor: 'var(--header-backdrop)' }}
		>
			<div className="flex h-14 items-center px-4">
				{/* Left: Brand */}
				<div className="flex items-center min-w-[44px] md:min-w-[120px]">
					<a
						href="/"
						className="flex items-center gap-2 group touch-target"
					>
						<span className="font-mono text-base font-bold text-[var(--foreground)] tracking-tight">
							byoa
						</span>
						<span className="hidden xl:block text-xs text-[var(--foreground-muted)] whitespace-nowrap">
							build your own algorithm
						</span>
					</a>
				</div>

				{/* Center: Navigation Tabs - Icons weight 8, labels weight 5 */}
				<nav className="flex-1 flex items-center justify-center gap-1">
					{tabs.map((tab) => {
						const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
						const isPressed = pressedTab === tab.id;

						return (
							<a
								key={tab.id}
								href={tab.href}
								onMouseDown={() => setPressedTab(tab.id)}
								onMouseUp={() => setPressedTab(null)}
								onMouseLeave={() => setPressedTab(null)}
								onTouchStart={() => setPressedTab(tab.id)}
								onTouchEnd={() => setPressedTab(null)}
								className={`
									relative px-3 md:px-4 py-2 rounded-lg border text-sm font-medium
									flex items-center justify-center gap-2 select-none
									physics-press touch-target
									${isPressed
										? 'scale-[0.97]'
										: 'hover:-translate-y-0.5'
									}
									${isActive
										? 'surface-chip-active text-[var(--foreground)]'
										: 'surface-chip text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
									}
								`}
								style={{
									transitionTimingFunction: isPressed
										? 'cubic-bezier(0.4, 0, 0.2, 1)'
										: 'var(--ease-snappy)'
								}}
							>
								{/* Active indicator with smooth animation */}
								{isActive && (
									<span
										className="absolute inset-0 rounded-lg animate-scale-in bg-[var(--surface-accent)]"
										aria-hidden="true"
									/>
								)}

								{/* Icon - Weight 8: Primary Nav, always visible */}
								<span className={`
									relative z-10 transition-transform duration-200
									${isActive ? 'text-[var(--accent-primary)]' : ''}
									group-hover:scale-110
								`}>
									{tab.icon}
								</span>

								{/* Label - Weight 5: Content Optional, visible md+
								    Using CSS instead of JS to prevent hydration flash */}
								<span className="hidden md:inline relative z-10">{tab.label}</span>
							</a>
						);
					})}
				</nav>

				{/* Right: Theme Toggle, Settings, Archive, Trash & User Menu */}
				<div className="flex items-center justify-end gap-1 shrink-0">
					<span
						className="surface-chip hidden md:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono text-[var(--foreground-muted)]"
						title={`Build ${buildVersion}`}
					>
						<span className="hidden sm:inline mr-1">build</span>
						{buildVersion}
					</span>

					{/* Theme Toggle - Weight 8: Visible md+ (mobile: moved to UserMenu) */}
					<div className="hidden md:block">
						<ThemeToggle />
					</div>

					{/* Settings Button (Desktop) - Weight 4 */}
					{showTertiary && (
						<button
							onClick={() => setShowSettings(true)}
							className="surface-chip p-2.5 rounded-lg text-[var(--foreground-muted)] physics-press touch-target hover:text-[var(--accent-primary)] hover:bg-[var(--surface-accent)]"
							aria-label="Settings"
							title="Settings - Customize theme, colors & typography"
							data-testid="open-settings-button"
						>
							<Settings className="h-5 w-5" />
						</button>
					)}

					{/* Desktop: Show Archive and Trash links directly - Weight 4 */}
					{showTertiary && (
						<>
							{/* Archive Link */}
							<a
								href="/archive"
								className={`
									surface-chip p-2.5 rounded-lg text-[var(--foreground-muted)]
									physics-press touch-target
									hover:text-amber-600 hover:bg-amber-50
									dark:hover:bg-amber-900/20
									${pathname === '/archive' ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' : ''}
								`}
								title="Archive - Saved for later"
							>
								<Archive className="h-5 w-5" />
							</a>

							{/* Trash Link */}
							<a
								href="/trash"
								className={`
									surface-chip p-2.5 rounded-lg text-[var(--foreground-muted)]
									physics-press touch-target
									hover:text-red-500 hover:bg-red-50
									dark:hover:bg-red-900/20
									${pathname === '/trash' ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : ''}
								`}
								title="Trash - Items to be deleted"
							>
								<Trash2 className="h-5 w-5" />
							</a>
						</>
					)}

					{/* Overflow Menu (hidden on mobile — items moved to UserMenu) */}
					{!showTertiary && (
						<div className="relative hidden md:block" ref={overflowMenuRef}>
							<button
								onClick={(e) => {
									e.stopPropagation();
									setShowOverflowMenu(!showOverflowMenu);
								}}
								className={`
									${showOverflowMenu ? 'surface-chip-active' : 'surface-chip'} p-2.5 rounded-lg text-[var(--foreground-muted)]
									physics-press touch-target
									hover:text-[var(--foreground)]
									${showOverflowMenu ? 'text-[var(--foreground)]' : ''}
								`}
								aria-label="More options"
								aria-expanded={showOverflowMenu}
							>
								<MoreHorizontal className="h-5 w-5" />
							</button>

							{/* Overflow Dropdown Menu */}
							{showOverflowMenu && (
								<div
									className="surface-shell absolute right-0 top-full mt-1 min-w-[180px] rounded-xl py-1 z-50 animate-scale-in"
								>
									{/* Settings Option - Opens modal instead of page */}
									<button
										onClick={() => {
											setShowOverflowMenu(false);
											setShowSettings(true);
										}}
										className="w-full px-3 py-3 text-left text-sm flex items-center gap-3 hover:bg-[var(--surface-hover)] text-[var(--foreground)]"
									>
										<Settings className="h-4 w-4" />
										<span>Settings</span>
									</button>

									{/* Divider */}
									<div className="h-px bg-[var(--border)] my-1" />

									{/* Archive Option */}
									<a
										href="/archive"
										onClick={() => setShowOverflowMenu(false)}
										className={`
											w-full px-3 py-3 text-left text-sm flex items-center gap-3
											hover:bg-amber-50 dark:hover:bg-amber-900/20
											${pathname === '/archive'
												? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20'
												: 'text-[var(--foreground-muted)] hover:text-amber-600'
											}
										`}
									>
										<Archive className="h-4 w-4" />
										<span>Archive</span>
									</a>

									{/* Trash Option */}
									<a
										href="/trash"
										onClick={() => setShowOverflowMenu(false)}
										className={`
											w-full px-3 py-3 text-left text-sm flex items-center gap-3
											hover:bg-red-50 dark:hover:bg-red-900/20
											${pathname === '/trash'
												? 'text-red-500 bg-red-50 dark:bg-red-900/20'
												: 'text-[var(--foreground-muted)] hover:text-red-500'
											}
										`}
									>
										<Trash2 className="h-4 w-4" />
										<span>Trash</span>
									</a>
								</div>
							)}
						</div>
					)}

					<UserMenu onOpenSettings={() => setShowSettings(true)} />
				</div>
			</div>

			{/* Settings Modal */}
			<SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
		</header>
	);
}

export default Header;
