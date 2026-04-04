/**
 * BYOA - User Menu Component
 *
 * Displays user email and sign out button.
 * Enhanced with:
 * - Touch target compliance (44px minimum on mobile)
 * - Atomic weight system for email visibility
 * - Physics-based animations
 * - Settings always accessible via menu
 * - Mobile: absorbs overflow items (Theme, Archive, Trash) hidden from header
 *
 * @fileoverview User menu dropdown
 */

import { useState, useEffect } from 'react';
import { navigate, useLocation } from '@redwoodjs/router';
import { LogOut, LogIn, Settings, Archive, Trash2, Sun, Moon, Monitor } from 'lucide-react';
import { createClient } from 'src/lib/supabase-browser';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { clearAuthTokenOnLogout } from 'src/lib/capacitor/keychain';
import { useAtomicWeight, useBreakpoint } from 'src/hooks/useMediaQuery';
import { useTheme } from 'src/lib/theme';

interface UserMenuProps {
	onOpenSettings?: () => void;
}

export function UserMenu({ onOpenSettings }: UserMenuProps) {
	const [user, setUser] = useState<SupabaseUser | null>(null);
	const [loading, setLoading] = useState(true);
	const [showMenu, setShowMenu] = useState(false);
	const { pathname } = useLocation();
	const supabase = createClient();
	const { showExtended } = useAtomicWeight();
	const { isMd } = useBreakpoint();
	const { theme, setTheme } = useTheme();

	useEffect(() => {
		if (!supabase) {
			setLoading(false);
			setUser(null);
			return;
		}

		const getUser = async () => {
			const { data: { user } } = await supabase.auth.getUser();
			setUser(user);
			setLoading(false);
		};
		getUser();

		// Listen for auth changes
		const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
			setUser(session?.user ?? null);
		});

		return () => subscription.unsubscribe();
	}, [supabase]);

	const handleSignOut = async () => {
		if (!supabase) {
			navigate('/login');
			return;
		}

		// Clear iOS Keychain token before signing out
		await clearAuthTokenOnLogout();
		await supabase.auth.signOut();
		navigate('/login');
	};

	const cycleTheme = () => {
		if (theme === 'light') setTheme('dark');
		else if (theme === 'dark') setTheme('system');
		else setTheme('light');
	};

	const themeIcon = theme === 'light' ? <Sun className="h-4 w-4" /> : theme === 'dark' ? <Moon className="h-4 w-4" /> : <Monitor className="h-4 w-4" />;
	const themeLabel = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';

	if (loading) {
		return (
			<div className="w-10 h-10 md:w-8 md:h-8 rounded-full bg-[var(--surface-secondary)] physics-pulse" />
		);
	}

	if (!user) {
		return (
			<button
				onClick={() => navigate('/login')}
				className="surface-chip flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
				           text-[var(--foreground)]
				           physics-press touch-target transition-colors"
			>
				<LogIn className="h-4 w-4" />
				<span className="hidden sm:inline">Sign in</span>
			</button>
		);
	}

	return (
		<div className="relative">
			{/* Avatar Button - Weight 9: Primary, always visible, touch target compliant */}
			<button
				onClick={() => setShowMenu(!showMenu)}
				className="surface-chip flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-lg text-sm font-medium
				           text-[var(--foreground)]
				           physics-press touch-target transition-colors"
			>
				{/* Avatar - Weight 9: Always visible, touch target on mobile */}
				<div className="w-8 h-8 rounded-full bg-[var(--accent-primary)] flex items-center justify-center text-white text-xs font-medium">
					{user.email?.charAt(0).toUpperCase()}
				</div>
				{/* Email - Weight 2: Extended, visible xl+ only */}
				{showExtended && (
					<span className="max-w-[120px] truncate text-[var(--foreground-muted)]">
						{user.email}
					</span>
				)}
			</button>

			{showMenu && (
				<>
					{/* Backdrop */}
					<div
						className="fixed inset-0 z-40"
						onClick={() => setShowMenu(false)}
					/>

					{/* Menu - Animate scale in */}
					<div className="surface-shell absolute right-0 top-full mt-2 w-56 rounded-xl z-50 py-1 animate-scale-in">
						{/* User info section */}
						<div className="px-4 py-3 border-b border-[var(--border)]">
							<p className="text-xs text-[var(--foreground-muted)]">Signed in as</p>
							<p className="text-sm font-medium text-[var(--foreground)] truncate">
								{user.email}
							</p>
						</div>

						{/* Mobile-only: Theme toggle */}
						{isMd && (
							<>
								<button
									onClick={cycleTheme}
									className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[var(--foreground)]
									           hover:bg-[var(--surface-hover)] transition-colors physics-press"
								>
									{themeIcon}
									<span>Theme: {themeLabel}</span>
								</button>
								<div className="h-px bg-[var(--border)] my-1" />
							</>
						)}

						{/* Mobile-only: Archive & Trash links */}
						{isMd && (
							<>
								<a
									href="/archive"
									onClick={() => setShowMenu(false)}
									className={`w-full flex items-center gap-3 px-4 py-3 text-sm
									           hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors physics-press
									           ${pathname === '/archive'
										? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20'
										: 'text-[var(--foreground)] hover:text-amber-600'
									}`}
								>
									<Archive className="h-4 w-4" />
									Archive
								</a>
								<a
									href="/trash"
									onClick={() => setShowMenu(false)}
									className={`w-full flex items-center gap-3 px-4 py-3 text-sm
									           hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors physics-press
									           ${pathname === '/trash'
										? 'text-red-500 bg-red-50 dark:bg-red-900/20'
										: 'text-[var(--foreground)] hover:text-red-500'
									}`}
								>
									<Trash2 className="h-4 w-4" />
									Trash
								</a>
								<div className="h-px bg-[var(--border)] my-1" />
							</>
						)}

						{/* Settings - Always visible in menu for accessibility */}
						<button
							onClick={() => {
								setShowMenu(false);
								if (onOpenSettings) {
									onOpenSettings();
								} else {
									navigate('/settings');
								}
							}}
							className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[var(--foreground)]
							           hover:bg-[var(--surface-hover)] transition-colors physics-press"
						>
							<Settings className="h-4 w-4" />
							Settings
						</button>

						{/* Divider */}
						<div className="h-px bg-[var(--border)] my-1" />

						{/* Sign out */}
						<button
							onClick={handleSignOut}
							className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600
							           hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors physics-press"
						>
							<LogOut className="h-4 w-4" />
							Sign out
						</button>
					</div>
				</>
			)}
		</div>
	);
}

export default UserMenu;
