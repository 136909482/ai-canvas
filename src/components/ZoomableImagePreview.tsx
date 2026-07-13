import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

type ZoomableImagePreviewProps = {
  imageUrl: string
  alt: string
  closeLabel: string
  onClose: () => void
  children?: ReactNode
  overlayClassName?: string
  closeButtonClassName?: string
  captionClassName?: string
}

const DEFAULT_OVERLAY_CLASS_NAME = 'bg-black/90'
const DEFAULT_CLOSE_BUTTON_CLASS_NAME = 'border-white/10 bg-black/50 text-white/70 hover:border-white/20 hover:bg-black/70 hover:text-white'
const DEFAULT_CAPTION_CLASS_NAME = 'text-white/60'

export function ZoomableImagePreview({
  imageUrl,
  alt,
  closeLabel,
  onClose,
  children,
  overlayClassName = DEFAULT_OVERLAY_CLASS_NAME,
  closeButtonClassName = DEFAULT_CLOSE_BUTTON_CLASS_NAME,
  captionClassName = DEFAULT_CAPTION_CLASS_NAME,
}: ZoomableImagePreviewProps) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragState, setDragState] = useState<{
    pointerId: number
    startX: number
    startY: number
    panX: number
    panY: number
  } | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const overlay = overlayRef.current

    if (!overlay) {
      return undefined
    }

    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()

      const direction = event.deltaY < 0 ? 1 : -1
      setZoom((value) => {
        const nextZoom = Math.min(4, Math.max(0.25, Number((value + direction * 0.12).toFixed(2))))
        if (nextZoom <= 1) {
          setPan({ x: 0, y: 0 })
        }
        return nextZoom
      })
    }

    overlay.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      overlay.removeEventListener('wheel', handleWheel)
    }
  }, [])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    })
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setPan({
      x: dragState.panX + event.clientX - dragState.startX,
      y: dragState.panY + event.clientY - dragState.startY,
    })
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDragState(null)
  }

  return createPortal(
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-[9999] overflow-hidden animate-[modal-fade-in_0.2s_ease-out] ${overlayClassName}`}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className={`absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border transition ${closeButtonClassName}`}
        aria-label={closeLabel}
      >
        <X className="h-5 w-5" />
      </button>
      <div className="flex h-full w-full items-center justify-center">
        <div
          className={dragState ? 'cursor-grabbing select-none' : 'cursor-grab select-none'}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img
            src={imageUrl}
            alt={alt}
            className={`pointer-events-none max-h-screen max-w-screen object-contain shadow-[0_0_80px_rgba(255,255,255,0.04)] ${dragState ? '' : 'transition-transform duration-100'}`}
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            }}
          />
        </div>
      </div>
      {children ? (
        <div
          className={`fixed bottom-5 left-1/2 z-10 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-4 rounded-full border border-white/10 bg-black/45 px-4 py-2 text-xs shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md ${captionClassName}`}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
