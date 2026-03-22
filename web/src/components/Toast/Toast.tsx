/**
 * MyMind Clone - Toast Notification Component
 *
 * Minimal toast component for success/error/warning feedback.
 * Includes a confirmation variant with action buttons.
 *
 * @fileoverview Toast notifications
 */

import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { X, Check, AlertCircle, AlertTriangle } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
        id: string;
        message: string;
        type: ToastType;
        /** For confirm toasts: callback when user clicks the action button */
        onConfirm?: () => void;
        /** Label for the confirm button (default: "Confirm") */
        confirmLabel?: string;
}

interface ToastContextType {
        showToast: (message: string, type?: ToastType) => void;
        showConfirm: (message: string, onConfirm: () => void, confirmLabel?: string) => void;
}

// =============================================================================
// CONTEXT
// =============================================================================

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
        const context = useContext(ToastContext);
        if (!context) {
                throw new Error('useToast must be used within ToastProvider');
        }
        return context;
}

// =============================================================================
// PROVIDER
// =============================================================================

export function ToastProvider({ children }: { children: React.ReactNode }) {
        const [toasts, setToasts] = useState<Toast[]>([]);

        const showToast = useCallback((message: string, type: ToastType = 'success') => {
                const id = Math.random().toString(36).slice(2);
                setToasts(prev => [...prev, { id, message, type }]);
        }, []);

        const showConfirm = useCallback((message: string, onConfirm: () => void, confirmLabel?: string) => {
                const id = Math.random().toString(36).slice(2);
                setToasts(prev => [...prev, { id, message, type: 'warning', onConfirm, confirmLabel }]);
        }, []);

        const removeToast = useCallback((id: string) => {
                setToasts(prev => prev.filter(t => t.id !== id));
        }, []);

        return (
                <ToastContext.Provider value={{ showToast, showConfirm }}>
                        {children}

                        {/* Toast Container */}
                        <div className="fixed bottom-20 right-6 z-[100] flex flex-col gap-2">
                                {toasts.map(toast => (
                                        <ToastItem
                                                key={toast.id}
                                                toast={toast}
                                                onRemove={() => removeToast(toast.id)}
                                        />
                                ))}
                        </div>
                </ToastContext.Provider>
        );
}

// =============================================================================
// TOAST ITEM
// =============================================================================

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
        const isConfirm = !!toast.onConfirm;

        useEffect(() => {
                // Confirm toasts don't auto-dismiss
                if (isConfirm) return;
                const timer = setTimeout(onRemove, 3000);
                return () => clearTimeout(timer);
        }, [onRemove, isConfirm]);

        const Icon = toast.type === 'success' ? Check
                : toast.type === 'warning' ? AlertTriangle
                : AlertCircle;

        const bgColor = toast.type === 'success'
                ? 'bg-green-50 border-green-200'
                : toast.type === 'error'
                        ? 'bg-red-50 border-red-200'
                        : toast.type === 'warning'
                                ? 'bg-amber-50 border-amber-200'
                                : 'bg-blue-50 border-blue-200';

        const iconColor = toast.type === 'success'
                ? 'text-green-600'
                : toast.type === 'error'
                        ? 'text-red-600'
                        : toast.type === 'warning'
                                ? 'text-amber-600'
                                : 'text-blue-600';

        return (
                <div
                        className={`
        flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg
        animate-slide-up ${bgColor}
      `}
                >
                        <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
                        <span className="text-sm text-gray-800">{toast.message}</span>
                        {isConfirm ? (
                                <div className="flex items-center gap-2 ml-2">
                                        <button
                                                onClick={() => {
                                                        toast.onConfirm?.();
                                                        onRemove();
                                                }}
                                                className="px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                                        >
                                                {toast.confirmLabel || 'Confirm'}
                                        </button>
                                        <button
                                                onClick={onRemove}
                                                className="px-3 py-1.5 text-xs font-medium rounded-md bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                                        >
                                                Cancel
                                        </button>
                                </div>
                        ) : (
                                <button
                                        onClick={onRemove}
                                        className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                        <X className="h-4 w-4" />
                                </button>
                        )}
                </div>
        );
}

export default ToastProvider;
