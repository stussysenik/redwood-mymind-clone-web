/**
 * Image Lightbox Component
 *
 * Full-screen image viewer with pinch-to-zoom, pan, and gallery support.
 * Designed for asset-first viewing of saved visual content.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'

interface ImageLightboxProps {
  images: string[]
  initialIndex?: number
  isOpen: boolean
  onClose: () => void
  onDeleteImage?: (imageUrl: string) => void
}

export function ImageLightbox({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  onDeleteImage,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const lastTranslate = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Touch tracking for pinch-to-zoom
  const lastPinchDist = useRef<number | null>(null)

  useEffect(() => {
    setCurrentIndex(initialIndex)
    resetZoom()
  }, [initialIndex, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
      if (e.key === '+' || e.key === '=') zoomIn()
      if (e.key === '-') zoomOut()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentIndex, images.length])

  const resetZoom = useCallback(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }, [])

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(s * 1.5, 5))
  }, [])

  const zoomOut = useCallback(() => {
    setScale((s) => {
      const newScale = Math.max(s / 1.5, 1)
      if (newScale === 1) setTranslate({ x: 0, y: 0 })
      return newScale
    })
  }, [])

  const next = useCallback(() => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex((i) => i + 1)
      resetZoom()
    }
  }, [currentIndex, images.length, resetZoom])

  const prev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1)
      resetZoom()
    }
  }, [currentIndex, resetZoom])

  // Mouse drag for panning when zoomed
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale <= 1) return
      e.preventDefault()
      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY }
      lastTranslate.current = translate
    },
    [scale, translate]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      setTranslate({
        x: lastTranslate.current.x + (e.clientX - dragStart.current.x),
        y: lastTranslate.current.y + (e.clientY - dragStart.current.y),
      })
    },
    [isDragging]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Scroll to zoom. React attaches onWheel as a *passive* listener, so
  // calling e.preventDefault() there logs a console warning and doesn't stop
  // the page from scrolling. Bind the native wheel listener imperatively with
  // passive:false so we can block the scroll and actually zoom.
  useEffect(() => {
    if (!isOpen) return
    const node = containerRef.current
    if (!node) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setScale((s) => {
        const newScale = Math.min(Math.max(s * delta, 1), 5)
        if (newScale === 1) setTranslate({ x: 0, y: 0 })
        return newScale
      })
    }

    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [isOpen])

  // Touch: pinch-to-zoom + pan
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch zoom
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        )
        if (lastPinchDist.current !== null) {
          const ratio = dist / lastPinchDist.current
          setScale((s) => Math.min(Math.max(s * ratio, 1), 5))
        }
        lastPinchDist.current = dist
      } else if (e.touches.length === 1 && scale > 1) {
        // Pan when zoomed
        if (isDragging) {
          setTranslate({
            x: lastTranslate.current.x + (e.touches[0].clientX - dragStart.current.x),
            y: lastTranslate.current.y + (e.touches[0].clientY - dragStart.current.y),
          })
        }
      }
    },
    [scale, isDragging]
  )

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1 && scale > 1) {
        setIsDragging(true)
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        lastTranslate.current = translate
      }
    },
    [scale, translate]
  )

  const handleTouchEnd = useCallback(() => {
    lastPinchDist.current = null
    setIsDragging(false)
  }, [])

  if (!isOpen || images.length === 0) return null

  const currentImage = images[currentIndex]

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-backdrop-enter"
      onClick={(e) => {
        if (e.target === containerRef.current) {
          if (scale > 1) resetZoom()
          else onClose()
        }
      }}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {onDeleteImage && (
          <button
            onClick={() => onDeleteImage(currentImage)}
            className="rounded-full bg-red-500/80 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-red-600 min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Remove this image"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={zoomOut}
          className="rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-white/20 min-w-[44px] min-h-[44px] flex items-center justify-center"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={zoomIn}
          className="rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-white/20 min-w-[44px] min-h-[44px] flex items-center justify-center"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          className="rounded-full bg-white/10 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-white/20 min-w-[44px] min-h-[44px] flex items-center justify-center"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation arrows */}
      {images.length > 1 && (
        <>
          {currentIndex > 0 && (
            <button
              onClick={prev}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur-sm transition-colors hover:bg-white/20 min-w-[48px] min-h-[48px] flex items-center justify-center z-10"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {currentIndex < images.length - 1 && (
            <button
              onClick={next}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur-sm transition-colors hover:bg-white/20 min-w-[48px] min-h-[48px] flex items-center justify-center z-10"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </>
      )}

      {/* Image */}
      <div
        className="flex items-center justify-center w-full h-full select-none"
        style={{ touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={currentImage}
          alt=""
          className="max-w-[90vw] max-h-[85vh] object-contain transition-transform duration-100"
          style={{
            transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
          }}
          draggable={false}
          onDoubleClick={() => {
            if (scale > 1) resetZoom()
            else zoomIn()
          }}
        />
      </div>

      {/* Gallery dots */}
      {images.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setCurrentIndex(i)
                resetZoom()
              }}
              className={`rounded-full transition-all ${
                i === currentIndex
                  ? 'w-2.5 h-2.5 bg-white'
                  : 'w-2 h-2 bg-white/40 hover:bg-white/60'
              }`}
            />
          ))}
          <span className="ml-2 text-xs text-white/60">
            {currentIndex + 1} / {images.length}
          </span>
        </div>
      )}
    </div>
  )
}

export default ImageLightbox
