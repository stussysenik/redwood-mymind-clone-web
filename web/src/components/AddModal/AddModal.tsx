/**
 * BYOA - Add Modal Component
 *
 * "Smart Input" modal for adding new items.
 * Auto-detects URLs, text notes, and handles image drops/pastes fluidly.
 *
 * @fileoverview Modal for adding new cards (Smart Input)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Image as ImageIcon, Loader2, Globe, Sparkles, Upload, ArrowUp, Check, AlertCircle, RotateCcw } from 'lucide-react';
import { useMutation } from '@redwoodjs/web';
import { getPlatformInfo } from 'src/lib/platforms';
import { useLocalAI } from 'src/lib/local-ai';
import { posthog } from 'src/lib/posthog';
import { useToast } from 'src/components/Toast/Toast';
import Papa from 'papaparse';

const SAVE_CARD_MUTATION = gql`
  mutation SaveCard($input: SaveCardInput!) {
    saveCard(input: $input) {
      id
      userId
      title
      content
      type
      url
      imageUrl
      metadata
      tags
      createdAt
      updatedAt
      archivedAt
      deletedAt
    }
  }
`

// =============================================================================
// TYPES
// =============================================================================

type Mode = 'auto' | 'link' | 'note' | 'image';

type LinkSaveStatus = 'pending' | 'saving' | 'done' | 'failed';

interface AddModalProps {
	isOpen: boolean;
	onClose: () => void;
}

/**
 * Concurrency-limited parallel executor.
 * Runs `fn` for each item with at most `concurrency` in-flight at once.
 * Teaches: this is the "pool" pattern — useful anywhere you need to
 * parallelize network calls without overwhelming the server.
 */
async function promisePool<T>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<void>
): Promise<void> {
	const executing = new Set<Promise<void>>();
	for (const item of items) {
		const p = fn(item).finally(() => executing.delete(p));
		executing.add(p);
		if (executing.size >= concurrency) {
			await Promise.race(executing);
		}
	}
	await Promise.all(executing);
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AddModal({ isOpen, onClose }: AddModalProps) {
	const localAI = useLocalAI();
	const { showToast } = useToast();
	const [saveCard] = useMutation(SAVE_CARD_MUTATION);

	type SavePayload = {
		type?: string;
		title?: string;
		content?: string;
		imageUrl?: string;
		url?: string;
	};

	// State
	const [content, setContent] = useState(''); // Unified content (URL or Note)
	const [mode, setMode] = useState<Mode>('auto'); // Current detected mode
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'enriching'>('idle');
	const [error, setError] = useState<string | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const [isVanishing, setIsVanishing] = useState(false);

	// Batch link upload state — per-link status tracking for parallel saves
	const [batchLinks, setBatchLinks] = useState<Map<string, LinkSaveStatus> | null>(null);
	const [batchPayloads, setBatchPayloads] = useState<SavePayload[] | null>(null);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// BYOA-style vanish: animate out, then unmount
	const vanishAndClose = useCallback(() => {
		setIsVanishing(true);
		setTimeout(() => {
			setIsVanishing(false);
			onClose();
		}, 150); // matches animation duration
	}, [onClose]);

	// Extract all URLs from text (for batch upload)
	const extractLinks = (text: string): string[] => {
		const urlRegex = /https?:\/\/[^\s<>"{}|\^\[\]`\n]+/gi;
		const matches = text.match(urlRegex) || [];
		return [...new Set(matches)]; // dedupe
	};

	const detectedLinks = extractLinks(content);
	const isMultiMode = detectedLinks.length > 1;

	// Auto-detect mode based on content
	useEffect(() => {
		if (imageFile) {
			setMode('image');
			return;
		}

		const trimmed = content.trim();
		// Check if purely a URL
		if (/^https?:\/\/[^\s]+$/i.test(trimmed) || /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/[^\s]*)?$/.test(trimmed)) {
			setMode('link');
		} else if (trimmed.length > 0) {
			setMode('note');
		} else {
			setMode('auto');
		}
	}, [content, imageFile]);

	// Focus on open
	useEffect(() => {
		if (isOpen) {
			setTimeout(() => {
				textareaRef.current?.focus();
			}, 100);
		}
	}, [isOpen]);

	// Reset state on close
	useEffect(() => {
		if (!isOpen) {
			setContent('');
			setImageFile(null);
			setImagePreview(null);
			setError(null);
			setMode('auto');
			setSaveStatus('idle');
			setBatchLinks(null);
			setBatchPayloads(null);
		}
	}, [isOpen]);

	const handleFile = (file: File) => {
		if (file.type.startsWith('image/')) {
			if (file.size > 5 * 1024 * 1024) {
				setError('Image must be less than 5MB');
				return;
			}
			setImageFile(file);
			setError(null);
			setBatchPayloads(null); // Clear any CSV data

			const reader = new FileReader();
			reader.onload = (e) => setImagePreview(e.target?.result as string);
			reader.readAsDataURL(file);
			return;
		}

		if (file.name.endsWith('.csv') || file.type.includes('csv')) {
			Papa.parse<any>(file, {
				header: true,
				skipEmptyLines: true,
				complete: (results) => {
					const payloads: SavePayload[] = [];
					for (const row of results.data) {
						const url = row.url || row.URL || row.Url || row.link || row.Link;
						const text = row.notes || row.Notes || row.text || row.Text || row.content || row.Content;
						const title = row.title || row.Title || row.name || row.Name;
						
						if (url && /^https?:\/\//i.test(url)) {
							payloads.push({ url, type: 'website', title });
						} else if (text) {
							payloads.push({ 
								type: 'note', 
								content: text, 
								title: title || (text.slice(0, 50) + (text.length > 50 ? '...' : '')) 
							});
						}
					}
					
					if (payloads.length > 0) {
						setBatchPayloads(payloads);
						setMode('auto');
						setContent(payloads.map(p => p.url || p.content).filter(Boolean).join('\n'));
						showToast(`Loaded ${payloads.length} items from CSV`, 'success');
					} else {
						setError('No readable bookmarks or notes found in CSV');
					}
				},
				error: (err: any) => {
					setError(`CSV Parse Error: ${err.message}`);
				}
			});
			return;
		}

		setError('Unsupported file type. Please upload an image or a CSV file.');
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
		const file = e.dataTransfer.files[0];
		if (file) handleFile(file);
	};

	const handleSubmit = useCallback(async () => {
		if (isSubmitting) return;

		// Corrections before submitting
		let payload: SavePayload = {};
		let finalContent = content.trim();

		if (mode === 'auto' && !finalContent && !imagePreview) return; // Nothing to save

		setIsSubmitting(true);
		setSaveStatus('saving');
		setError(null);

		try {
			const activeBatchPayloads = batchPayloads?.length ? batchPayloads : (isMultiMode ? detectedLinks.map(url => ({ url, type: 'website' } as SavePayload)) : null);

			// BATCH MODE: Multiple items detected — parallel with per-item progress
			if (activeBatchPayloads && activeBatchPayloads.length > 1) {
				const items = activeBatchPayloads;

				// Initialize all items as pending
				const statusMap = new Map<string, LinkSaveStatus>(
					items.map((item, idx) => [item.url || `note-${idx}`, 'pending'])
				);
				setBatchLinks(new Map(statusMap));

				const updateStatus = (key: string, status: LinkSaveStatus) => {
					statusMap.set(key, status);
					setBatchLinks(new Map(statusMap));
				};

				// Run saves in parallel, 3 at a time
				await promisePool(items, 3, async (item: SavePayload) => {
					const key = item.url || `note-${items.indexOf(item)}`;
					updateStatus(key, 'saving');
					try {
						const result = await saveCard({
							variables: { input: { 
								url: item.url, 
								type: item.type,
								title: item.title,
								content: item.content
							} },
						});
						if (result.data?.saveCard?.id) {
							updateStatus(key, 'done');
							// Fire per-card event so each card appears immediately in the grid
							window.dispatchEvent(new CustomEvent('card-saved', {
								detail: result.data.saveCard,
							}));
						} else {
							updateStatus(key, 'failed');
						}
					} catch (err) {
						console.error(`[AddModal] Failed to save ${key}:`, err);
						updateStatus(key, 'failed');
					}
				});

				const doneCount = [...statusMap.values()].filter((s) => s === 'done').length;
				const failedCount = [...statusMap.values()].filter((s) => s === 'failed').length;

				if (doneCount === 0) {
					throw new Error('Failed to save any items');
				}

				if (failedCount > 0) {
					// Keep modal open so user can retry failed items
					showToast(`Saved ${doneCount} of ${items.length} items`, 'success');
					setIsSubmitting(false);
					setSaveStatus('idle');
					return;
				}

				// All succeeded — vanish
				showToast(`Saved ${doneCount} items`, 'success');
				setBatchLinks(null);
				setBatchPayloads(null);
				vanishAndClose();
				return;
			}

			// SINGLE MODE: Original logic
			if (mode === 'image' && imagePreview) {
				payload = {
					type: 'image',
					title: imageFile?.name || 'Uploaded Image',
					imageUrl: imagePreview,
				};
			} else if (mode === 'link' || (mode === 'auto' && /^(http|\w+\.)/.test(finalContent))) {
				// Assume link — use 'website' as default type (DB has a type check constraint)
				if (!/^https?:\/\//i.test(finalContent)) {
					finalContent = 'https://' + finalContent;
				}
				payload = { url: finalContent, type: 'website' };
			} else {
				// Default to note
				const lines = finalContent.split('\n');
				const title = lines[0].length < 50 ? lines[0] : 'Untitled Note';
				payload = {
					type: 'note',
					title: title,
					content: finalContent
				};
			}

			// Race local AI classification against 3s timeout (non-blocking)
			let clientClassification: unknown = undefined;
			const localClassificationUrl =
				payload.url || (payload.content ? 'local://note' : null);
			const localClassificationContent =
				payload.content || payload.title || payload.url || finalContent;

			if (localAI.isReady && localClassificationUrl && localClassificationContent) {
				try {
					const classification = await Promise.race([
						localAI.classify(localClassificationUrl, localClassificationContent),
						new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
					]);
					if (classification) {
						clientClassification = classification;
					}
				} catch {
					// Graceful degradation: proceed without client classification
				}
			}

			const result = await saveCard({
				variables: {
					input: {
						url: payload.url,
						type: payload.type,
						title: payload.title,
						content: payload.content,
						imageUrl: payload.imageUrl,
						...(clientClassification ? { clientClassification } : {}),
					},
				},
			});

			const savedCard = result.data?.saveCard;
			if (!savedCard?.id) throw new Error('Failed to save');

			// BYOA-style vanish: animate out, card appears in timeline
			posthog?.capture('card_saved', { mode, type: savedCard.type })
			showToast('Saved', 'success')
			vanishAndClose();
			window.dispatchEvent(new CustomEvent('card-saved', {
				detail: {
					...savedCard,
					url: savedCard.url ?? payload.url,
					content: savedCard.content ?? payload.content,
					imageUrl: savedCard.imageUrl ?? payload.imageUrl,
				}
			}));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Something went wrong');
		} finally {
			setIsSubmitting(false);
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [content, mode, imageFile, imagePreview, isSubmitting, isMultiMode, detectedLinks, localAI.isReady, saveCard, vanishAndClose]);

	// Retry only the failed links from the last batch
	const handleRetryFailed = useCallback(async () => {
		if (!batchLinks) return;
		const failedUrls = [...batchLinks.entries()]
			.filter(([, s]) => s === 'failed')
			.map(([url]) => url);
		if (failedUrls.length === 0) return;

		setIsSubmitting(true);
		setError(null);

		// Copy current map, reset failed to pending
		const statusMap = new Map(batchLinks);
		for (const url of failedUrls) {
			statusMap.set(url, 'pending');
		}
		setBatchLinks(new Map(statusMap));

		const updateStatus = (key: string, status: LinkSaveStatus) => {
			statusMap.set(key, status);
			setBatchLinks(new Map(statusMap));
		};

		await promisePool(failedUrls, 3, async (key) => {
			updateStatus(key, 'saving');
			try {
				const payload = batchPayloads?.find(p => p.url === key || `note-${batchPayloads.indexOf(p)}` === key);
				
				const result = await saveCard({
					variables: { input: { 
						url: payload?.url || key, 
						type: payload?.type || 'website',
						title: payload?.title,
						content: payload?.content
					} },
				});
				if (result.data?.saveCard?.id) {
					updateStatus(key, 'done');
					window.dispatchEvent(new CustomEvent('card-saved', {
						detail: result.data.saveCard,
					}));
				} else {
					updateStatus(key, 'failed');
				}
			} catch (err) {
				console.error(`[AddModal] Retry failed for ${key}:`, err);
				updateStatus(key, 'failed');
			}
		});

		setIsSubmitting(false);

		const stillFailed = [...statusMap.values()].filter((s) => s === 'failed').length;
		const doneCount = [...statusMap.values()].filter((s) => s === 'done').length;

		if (stillFailed === 0) {
			showToast(`All ${doneCount} cards saved`, 'success');
			setBatchLinks(null);
			vanishAndClose();
		} else {
			showToast(`${doneCount} saved, ${stillFailed} still failing`, 'success');
		}
	}, [batchLinks, saveCard, showToast, vanishAndClose]);

	// Keyboard & Paste — must be declared AFTER handleSubmit (const with useCallback isn't hoisted)
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onClose();
			}
			if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
				e.preventDefault();
				handleSubmit();
			}
		};

		if (isOpen) {
			document.addEventListener('keydown', handleKeyDown);
			return () => {
				document.removeEventListener('keydown', handleKeyDown);
			};
		}
	}, [isOpen, onClose, handleSubmit]);

	if (!isOpen) return null;

	const platformInfo = (mode === 'link' || mode === 'auto') ? getPlatformInfo(content) : null;
	const canSubmit = (mode === 'image' && !!imagePreview) || content.trim().length > 0;

	return (
		<>
			{/* Backdrop with fade animation */}
			<div
				className={`fixed inset-0 z-[60] bg-black/60 backdrop-blur-md ${isVanishing ? 'animate-backdrop-vanish' : 'animate-backdrop-enter'}`}
				onClick={onClose}
			/>

			{/* Modal with entrance animation + link mode color wash */}
			<div
				className={`
					fixed inset-x-4 top-[15%] z-[70] mx-auto max-w-2xl
					sm:inset-x-6
					rounded-2xl shadow-2xl overflow-visible
					${isVanishing ? 'animate-modal-vanish' : 'animate-modal-enter'}
					transition-colors duration-300 ease-out
					${mode === 'link' ? 'bg-[var(--surface-accent)]' : 'bg-[var(--surface-elevated)]'}
					${isDragOver ? 'scale-105 ring-4 ring-[var(--accent-primary)]' : ''}
				`}
				onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={handleDrop}
			>
				{/* Close Button */}
				<button
					onClick={onClose}
					className="
						absolute -top-2 -right-2 sm:-top-3 sm:-right-3 z-10
						group min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full
						bg-[var(--surface-elevated)] text-[var(--foreground-muted)] shadow-lg border border-[var(--border-default)]
						transition-all duration-200 ease-out
						hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] hover:shadow-xl
						active:scale-95 active:shadow-md
						focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:outline-none
					"
					aria-label="Close"
				>
					<X className="w-5 h-5 transition-transform duration-200 group-hover:rotate-90" />
				</button>

				<div className="p-1">
					{/* Image Preview Area */}
					{mode === 'image' && imagePreview ? (
						<div className="relative w-full aspect-video rounded-xl overflow-hidden group bg-[var(--surface-secondary)]">
							<img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
							<div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
								<button
									onClick={() => { setImageFile(null); setImagePreview(null); }}
									className="opacity-0 group-hover:opacity-100 bg-[var(--surface-elevated)] text-red-500 px-4 py-2 rounded-full text-sm font-medium shadow-sm transform translate-y-2 group-hover:translate-y-0 transition-all"
								>
									Remove Image
								</button>
							</div>
						</div>
					) : (
						/* Main Input Area */
						<div className="relative p-6 pt-8">
							<textarea
								ref={textareaRef}
								value={content}
								onChange={(e) => setContent(e.target.value)}
								onKeyDown={(e) => {
									if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
										e.preventDefault()
										e.currentTarget.select()
										return
									}

									if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
										e.preventDefault()
										void handleSubmit()
										return
									}

									if (e.key === 'Escape') {
										e.preventDefault()
										onClose()
									}
								}}
								onPaste={(e) => {
									const items = e.clipboardData?.items
									if (items) {
										for (let i = 0; i < items.length; i++) {
											if (items[i].type.indexOf('image') !== -1) {
												const file = items[i].getAsFile()
												if (file) handleFile(file)
												e.preventDefault()
												return
											}
										}
									}
									// Text paste falls through naturally — no preventDefault
								}}
								placeholder="Save something... (paste multiple links to batch import)"
								className="
									w-full text-2xl font-display text-[var(--foreground)]
									placeholder:text-[var(--foreground-muted)] placeholder:transition-opacity placeholder:duration-150
									bg-transparent border-none resize-none leading-relaxed custom-scrollbar
									focus:outline-none focus:ring-0
									focus:placeholder:opacity-50
									focus:bg-[var(--surface-soft)]
									transition-all duration-150
									rounded-lg p-2 -m-2
								"
								rows={batchPayloads ? 6 : (isMultiMode ? 6 : (mode === 'link' ? 2 : 5))}
								disabled={isSubmitting}
							/>

							{/* Batch Mode Badge — shown before saving starts */}
							{(isMultiMode || batchPayloads) && !batchLinks && (
								<div className="flex items-center gap-2 mt-4 text-[var(--accent-primary)] bg-[var(--accent-primary)]/5 p-3 rounded-lg animate-badge-pulse">
									<Upload className="w-4 h-4" />
									<span className="text-sm font-medium">{batchPayloads ? batchPayloads.length : detectedLinks.length} items detected - will save all</span>
									<Sparkles className="w-3 h-3 ml-auto animate-pulse" />
								</div>
							)}

							{/* Per-link batch progress list */}
							{batchLinks && (
								<div className="mt-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-secondary)] p-3 space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
									{(() => {
										const entries = [...batchLinks.entries()];
										const doneCount = entries.filter(([, s]) => s === 'done').length;
										const failedCount = entries.filter(([, s]) => s === 'failed').length;
										const savingCount = entries.filter(([, s]) => s === 'saving').length;
										return (
											<>
												<div className="flex items-center justify-between mb-2">
													<span className="text-xs font-medium text-[var(--foreground-muted)]">
														{doneCount}/{entries.length} saved
														{savingCount > 0 && ` \u00b7 ${savingCount} in flight`}
														{failedCount > 0 && ` \u00b7 ${failedCount} failed`}
													</span>
													{savingCount > 0 && (
														<Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-primary)]" />
													)}
												</div>
												{entries.map(([url, status]) => {
													let displayLabel: string;
													if (url.startsWith('note-')) {
														displayLabel = 'Note';
													} else {
														try { displayLabel = new URL(url).hostname.replace(/^www\./, ''); }
														catch { displayLabel = url.slice(0, 40); }
													}
													
													return (
														<div key={url} className="flex items-center gap-2 text-sm leading-snug">
															{status === 'pending' && (
																<div className="w-4 h-4 rounded-full border border-[var(--border-default)]" />
															)}
															{status === 'saving' && (
																<Loader2 className="w-4 h-4 animate-spin text-[var(--accent-primary)] shrink-0" />
															)}
															{status === 'done' && (
																<Check className="w-4 h-4 text-emerald-500 shrink-0" />
															)}
															{status === 'failed' && (
																<AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
															)}
															<span className={`truncate ${
																status === 'done' ? 'text-[var(--foreground-muted)]' :
																status === 'failed' ? 'text-red-500' :
																status === 'saving' ? 'text-[var(--foreground)]' :
																'text-[var(--foreground-muted)]'
															}`}>
																{displayLabel}
															</span>
														</div>
													);
												})}
												{/* Retry button when batch is done with failures */}
												{failedCount > 0 && savingCount === 0 && (
													<button
														onClick={handleRetryFailed}
														disabled={isSubmitting}
														className="
															mt-2 flex items-center gap-1.5 text-sm font-medium
															text-[var(--accent-primary)] hover:text-[var(--accent-primary-hover)]
															transition-colors duration-150
														"
													>
														<RotateCcw className="w-3.5 h-3.5" />
														Retry {failedCount} failed
													</button>
												)}
											</>
										);
									})()}
								</div>
							)}

							{/* Single Link Detected Badge */}
							{mode === 'link' && !isMultiMode && platformInfo && (
								<div className="flex items-center gap-2 mt-4 text-[var(--accent-primary)] bg-[var(--accent-primary)]/5 p-3 rounded-lg animate-badge-pulse">
									<Globe className="w-4 h-4" />
									<span className="text-sm font-medium">Link detected: {platformInfo.name}</span>
									{content.length > 20 && <Sparkles className="w-3 h-3 ml-auto animate-pulse" />}
								</div>
							)}
						</div>
					)}

					{/* Footer / Controls */}
					<div className="flex items-center justify-between px-6 pb-6 pt-2">
						<div className="flex gap-1">
							{/* Image Upload Button - Polished */}
							<button
								onClick={() => fileInputRef.current?.click()}
								title="Upload Image"
								className={`
									p-2 rounded-lg transition-all duration-200
									${mode === 'image'
										? 'text-[var(--accent-primary)] bg-[var(--accent-primary)]/10'
										: 'text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] active:scale-95'
									}
									${isDragOver ? 'text-[var(--accent-primary)] animate-pulse' : ''}
								`}
							>
								<ImageIcon className="w-5 h-5" />
							</button>
							<input
								ref={fileInputRef}
								type="file"
								className="hidden"
								accept="image/*,.csv"
								onChange={(e) => {
									if (e.target.files?.[0]) handleFile(e.target.files[0]);
								}}
							/>

							{mode !== 'image' && (
								<div className="mx-2 h-6 w-px self-center bg-[var(--border-default)]" />
							)}

							{/* Mode Label - Context-aware pill */}
							{mode !== 'image' && (
								<span className={`
									text-xs font-medium tracking-wide uppercase px-2 py-1 rounded-full
									transition-all duration-200 self-center
									${mode === 'auto'
										? 'text-[var(--foreground-muted)] bg-transparent'
										: 'text-[var(--accent-primary)] bg-[var(--accent-primary)]/5'
									}
								`}>
									{mode === 'auto' ? 'Smart Mode' : mode}
								</span>
							)}
						</div>

						<div className="flex items-center gap-3">
							<span className="mr-2 hidden text-xs text-[var(--foreground-muted)] sm:inline">CMD + Enter to save</span>
							{/* Save Button - Refined lift + press */}
							<button
								onClick={handleSubmit}
								disabled={!canSubmit || isSubmitting}
								className={`
									group flex items-center gap-2 px-6 py-2.5 rounded-full font-medium
									transition-all duration-200 ease-out
									${canSubmit
										? 'bg-[var(--accent-primary)] text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97] active:shadow-sm'
										: 'bg-[var(--surface-hover)] text-[var(--foreground-muted)] cursor-not-allowed'
									}
								`}
							>
								{saveStatus === 'enriching' ? (
									<>
										<Sparkles className="w-4 h-4 animate-pulse" />
										<span>Saved! Enriching...</span>
									</>
								) : isSubmitting ? (
									<>
										<Loader2 className="w-4 h-4 animate-spin" />
										<span>Saving...</span>
									</>
								) : (
									<>
										<span>Save to Brain</span>
										<ArrowUp className={`w-4 h-4 transition-transform duration-200 ${canSubmit ? 'group-hover:-translate-y-0.5' : ''}`} />
									</>
								)}
							</button>
						</div>
					</div>

					{/* Error Toast - with subtle shake */}
					{error && (
						<div className="mx-6 mb-6 flex items-center gap-2 rounded-lg border border-red-400/20 bg-[var(--surface-danger)] p-3 text-sm text-red-500 animate-subtle-shake">
							<div className="w-1.5 h-1.5 rounded-full bg-red-500" />
							{error}
						</div>
					)}

					{/* Drop Zone Overlay (only when dragging) */}
					{isDragOver && (
						<div className="absolute inset-0 bg-[var(--accent-primary)]/10 backdrop-blur-sm flex flex-col items-center justify-center border-4 border-[var(--accent-primary)] border-dashed m-1 rounded-xl z-50">
							<Upload className="w-16 h-16 text-[var(--accent-primary)] mb-4 animate-bounce" />
							<h3 className="text-2xl font-display text-[var(--accent-primary)] font-bold">Drop visual</h3>
						</div>
					)}
				</div>
			</div>
		</>
	);
}

export default AddModal;
