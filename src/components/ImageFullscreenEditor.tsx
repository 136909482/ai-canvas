import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { Brush, Check, Circle, Download, Minus, MousePointer2, Plus, RectangleHorizontal, RotateCcw, Save, Slash, Trash2, Type, Undo2, X } from 'lucide-react'
import { TooltipIconButton } from '@/components/TooltipIconButton'
import { writeWorkspaceImageAsset } from '@/features/imageAssets/runtime'
import { platformBridge } from '@/platform'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useFeedbackStore } from '@/store/useFeedbackStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useImageEditorStore } from '@/store/useImageEditorStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { themeClasses } from '@/styles/themeClasses'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import {
  EDITOR_COLOR_SWATCHES,
  MAX_BRUSH_SIZE,
  MAX_TEXT_SIZE,
  MAX_UNDO_HISTORY,
  MIN_BRUSH_SIZE,
  MIN_TEXT_BOX_HEIGHT,
  MIN_TEXT_BOX_WIDTH,
  MIN_TEXT_SIZE,
  TEXT_BOX_PADDING_X,
  TEXT_BOX_PADDING_Y,
  canvasToDataUrl,
  dataUrlToBlob,
  downloadDataUrl,
  drawTextAnnotation,
  getDownloadFileName,
  getImageNodeSize,
  getTextAnnotationMetrics,
  loadImage,
  type CanvasPoint,
  type DrawMode,
  type StrokeSegment,
  type TextAnnotation,
  type TextDraft,
  type ToolMode,
  type UndoSnapshot,
} from '@/components/imageEditor/runtime'
const TOOLBAR_ICON_BUTTON_CLASS = `${themeClasses.iconButton} h-7 w-7 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:text-[var(--text-muted)]`
const TOOLBAR_ICON_BUTTON_ACTIVE_CLASS = 'h-7 w-7 border-violet-400/30 bg-violet-400/10 text-violet-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-violet-400/30 hover:bg-violet-400/10 hover:text-violet-500'
const EDITOR_ACTION_BUTTON_CLASS = 'flex h-9 items-center gap-2 rounded-lg border border-violet-400/25 bg-violet-400/10 px-3 text-xs font-semibold text-violet-100 transition hover:border-violet-300/45 hover:bg-violet-400/18'


export function ImageFullscreenEditor() {
  const session = useImageEditorStore((state) => state.session)
  const close = useImageEditorStore((state) => state.close)
  const updateNodeData = useCanvasStore((state) => state.updateNodeData)
  const createGeneratedPreviewNode = useCanvasStore((state) => state.createGeneratedPreviewNode)
  const runTracked = useHistoryStore((state) => state.runTracked)
  const workspaceConfigured = useSettingsStore((state) => state.runtime.workspaceConfigured)
  const notify = useFeedbackStore((state) => state.notify)
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const annotationCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const annotationContextRef = useRef<CanvasRenderingContext2D | null>(null)
  const maskContextRef = useRef<CanvasRenderingContext2D | null>(null)
  const editorViewportRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const pendingZoomAnchorRef = useRef<{ pointerX: number; pointerY: number; anchorX: number; anchorY: number } | null>(null)
  const brushCursorElementRef = useRef<HTMLDivElement | null>(null)
  const textDraftInputRef = useRef<HTMLTextAreaElement | null>(null)
  const brushCursorFrameRef = useRef<number | null>(null)
  const brushCursorRef = useRef({ x: 0, y: 0, visible: false })
  const strokeFrameRef = useRef<number | null>(null)
  const pendingStrokeSegmentsRef = useRef<StrokeSegment[]>([])
  const textDragRef = useRef<{ id: string; pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const drawModeRef = useRef<DrawMode>('annotation')
  const isDrawingRef = useRef(false)
  const isPanningRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const shapeStartPointRef = useRef<CanvasPoint | null>(null)
  const shapePreviewSnapshotRef = useRef<UndoSnapshot | null>(null)
  const undoHistoryRef = useRef<Record<DrawMode, UndoSnapshot[]>>({ annotation: [], mask: [] })
  const [undoCounts, setUndoCounts] = useState<Record<DrawMode, number>>({ annotation: 0, mask: 0 })
  const [drawMode, setDrawMode] = useState<DrawMode>('annotation')
  const [toolMode, setToolMode] = useState<ToolMode>('select')
  const [brushSize, setBrushSize] = useState(24)
  const [textSize, setTextSize] = useState(32)
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null)
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([])
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [brushColor, setBrushColor] = useState<string>(EDITOR_COLOR_SWATCHES[0])
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [colorPaletteOpen, setColorPaletteOpen] = useState(false)
  const [isSavingOutput, setIsSavingOutput] = useState(false)
  const [loadError, setLoadError] = useState<{ imageUrl: string; message: string } | null>(null)
  const [loadedImage, setLoadedImage] = useState<{
    imageUrl: string
    image: HTMLImageElement
    width: number
    height: number
  } | null>(null)
  const activeImage = session && loadedImage?.imageUrl === session.imageUrl ? loadedImage : null
  const imageSize = activeImage ? { width: activeImage.width, height: activeImage.height } : { width: 0, height: 0 }
  const errorMsg = session && loadError?.imageUrl === session.imageUrl ? loadError.message : ''
  const dialogRef = useDialogFocus<HTMLDivElement>(Boolean(session), close)

  const releaseEditorBuffers = useCallback(() => {
    for (const stack of Object.values(undoHistoryRef.current)) {
      for (const snapshot of stack) {
        snapshot.width = 0
        snapshot.height = 0
      }
    }

    undoHistoryRef.current = { annotation: [], mask: [] }
    pendingStrokeSegmentsRef.current = []
    shapePreviewSnapshotRef.current = null
    lastPointRef.current = null
    shapeStartPointRef.current = null
    textDragRef.current = null
    isDrawingRef.current = false
    isPanningRef.current = false
    annotationContextRef.current = null
    maskContextRef.current = null

    for (const canvas of [imageCanvasRef.current, annotationCanvasRef.current, maskCanvasRef.current]) {
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
    }
  }, [])

  const selectDrawMode = (nextDrawMode: DrawMode) => {
    drawModeRef.current = nextDrawMode
    setDrawMode(nextDrawMode)
    setToolMode(nextDrawMode === 'annotation' ? 'select' : 'brush')
    setTextDraft(null)
    setSelectedTextId(null)
  }

  useEffect(() => {
    drawModeRef.current = drawMode
  }, [drawMode])

  useEffect(() => {
    if (!textDraft) {
      return
    }

    const input = textDraftInputRef.current
    if (!input || document.activeElement === input) {
      return
    }

    input.focus()
    const cursorPosition = input.value.length
    input.setSelectionRange(cursorPosition, cursorPosition)
  }, [textDraft])

  const updateUndoCountsFromHistory = useCallback(() => {
    setUndoCounts({
      annotation: undoHistoryRef.current.annotation.length,
      mask: undoHistoryRef.current.mask.length,
    })
  }, [])

  const undoDrawingForMode = useCallback((mode: DrawMode) => {
    const canvas = mode === 'mask' ? maskCanvasRef.current : annotationCanvasRef.current
    const context = mode === 'mask' ? maskContextRef.current : annotationContextRef.current
    const snapshot = undoHistoryRef.current[mode].pop()
    if (!canvas || !context || !snapshot) {
      return
    }

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(snapshot, 0, 0)
    updateUndoCountsFromHistory()
  }, [updateUndoCountsFromHistory])

  const applyBrushCursor = useCallback(() => {
    const cursorElement = brushCursorElementRef.current
    if (!cursorElement) {
      return
    }

    const cursor = brushCursorRef.current
    cursorElement.style.display = cursor.visible ? 'block' : 'none'
    cursorElement.style.transform = `translate3d(${cursor.x}px, ${cursor.y}px, 0) translate(-50%, -50%)`
  }, [])

  const scheduleBrushCursor = useCallback((x: number, y: number, visible: boolean) => {
    brushCursorRef.current = { x, y, visible }

    if (brushCursorFrameRef.current !== null) {
      return
    }

    brushCursorFrameRef.current = requestAnimationFrame(() => {
      brushCursorFrameRef.current = null
      applyBrushCursor()
    })
  }, [applyBrushCursor])

  useEffect(() => () => {
    if (brushCursorFrameRef.current !== null) {
      cancelAnimationFrame(brushCursorFrameRef.current)
      brushCursorFrameRef.current = null
    }
    if (strokeFrameRef.current !== null) {
      cancelAnimationFrame(strokeFrameRef.current)
      strokeFrameRef.current = null
    }
    releaseEditorBuffers()
  }, [releaseEditorBuffers])

  useEffect(() => {
    if (!session) {
      return
    }

    let cancelled = false

    loadImage(session.imageUrl)
      .then((image) => {
        if (cancelled) {
          return
        }

        const width = image.naturalWidth || image.width || 1
        const height = image.naturalHeight || image.height || 1
        undoHistoryRef.current = { annotation: [], mask: [] }
        setUndoCounts({ annotation: 0, mask: 0 })
        setTextAnnotations([])
        setSelectedTextId(null)
        setTextDraft(null)
        setLoadedImage({ imageUrl: session.imageUrl, image, width, height })
        setLoadError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setLoadError({
          imageUrl: session.imageUrl,
          message: error instanceof Error ? error.message : '图片加载失败',
        })
      })

    return () => {
      cancelled = true
    }
  }, [session])

  useLayoutEffect(() => {
    if (!activeImage || imageSize.width <= 0 || imageSize.height <= 0) {
      return
    }

    const imageCanvas = imageCanvasRef.current
    const annotationCanvas = annotationCanvasRef.current
    const maskCanvas = maskCanvasRef.current
    const imageContext = imageCanvas?.getContext('2d')
    const annotationContext = annotationCanvas?.getContext('2d')
    const maskContext = maskCanvas?.getContext('2d')
    if (!imageCanvas || !annotationCanvas || !maskCanvas || !imageContext || !annotationContext || !maskContext) {
      return
    }

    imageCanvas.width = imageSize.width
    imageCanvas.height = imageSize.height
    annotationCanvas.width = imageSize.width
    annotationCanvas.height = imageSize.height
    maskCanvas.width = imageSize.width
    maskCanvas.height = imageSize.height
    imageContext.clearRect(0, 0, imageSize.width, imageSize.height)
    annotationContext.clearRect(0, 0, imageSize.width, imageSize.height)
    maskContext.clearRect(0, 0, imageSize.width, imageSize.height)
    imageContext.drawImage(activeImage.image, 0, 0, imageSize.width, imageSize.height)
    annotationContextRef.current = annotationContext
    maskContextRef.current = maskContext
  }, [activeImage, imageSize.height, imageSize.width])

  useEffect(() => {
    if (!session) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault()
        undoDrawingForMode(drawModeRef.current)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [close, session, undoDrawingForMode])

  useEffect(() => {
    const viewport = editorViewportRef.current
    if (!session || !viewport) {
      return
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()

      const stage = stageRef.current
      const direction = event.deltaY < 0 ? 1 : -1
      const nextZoom = Math.min(4, Math.max(0.25, Number((zoom + direction * 0.1).toFixed(2))))
      if (!stage || nextZoom === zoom) {
        return
      }

      const stageRect = stage.getBoundingClientRect()
      pendingZoomAnchorRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        anchorX: stageRect.width > 0 ? Math.min(1, Math.max(0, (event.clientX - stageRect.left) / stageRect.width)) : 0.5,
        anchorY: stageRect.height > 0 ? Math.min(1, Math.max(0, (event.clientY - stageRect.top) / stageRect.height)) : 0.5,
      }
      setZoom(nextZoom)
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [session, zoom])

  useLayoutEffect(() => {
    const anchor = pendingZoomAnchorRef.current
    const viewport = editorViewportRef.current
    const stage = stageRef.current
    if (!anchor || !viewport || !stage) {
      return
    }

    pendingZoomAnchorRef.current = null
    const stageRect = stage.getBoundingClientRect()
    viewport.scrollLeft += stageRect.left + stageRect.width * anchor.anchorX - anchor.pointerX
    viewport.scrollTop += stageRect.top + stageRect.height * anchor.anchorY - anchor.pointerY
    scheduleBrushCursor(
      stageRect.width * anchor.anchorX,
      stageRect.height * anchor.anchorY,
      brushCursorRef.current.visible,
    )
  }, [scheduleBrushCursor, zoom])

  if (!session) {
    return null
  }

  const getPointerCanvasPosition = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget
    if (!canvas) {
      return null
    }

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    return {
      cursor: { x, y },
      point: {
        x: x * (canvas.width / rect.width),
        y: y * (canvas.height / rect.height),
      },
    }
  }

  const updateBrushCursor = (event: PointerEvent<HTMLCanvasElement>) => {
    const position = getPointerCanvasPosition(event)
    if (!position) {
      return null
    }

    const shouldShowBrushCursor = drawMode === 'mask' || (drawMode === 'annotation' && toolMode !== 'select' && toolMode !== 'text')
    scheduleBrushCursor(position.cursor.x, position.cursor.y, shouldShowBrushCursor)
    return position
  }

  const hideBrushCursor = () => {
    const cursor = brushCursorRef.current
    scheduleBrushCursor(cursor.x, cursor.y, false)
  }

  const getDrawCanvas = (mode: DrawMode) => (
    mode === 'mask' ? maskCanvasRef.current : annotationCanvasRef.current
  )

  const getDrawContext = (mode: DrawMode) => (
    mode === 'mask' ? maskContextRef.current : annotationContextRef.current
  )

  const getActiveDrawCanvas = () => getDrawCanvas(drawMode)

  const updateUndoCounts = () => {
    updateUndoCountsFromHistory()
  }

  const pushUndoSnapshot = () => {
    const canvas = getActiveDrawCanvas()
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
      return
    }

    const snapshot = document.createElement('canvas')
    snapshot.width = canvas.width
    snapshot.height = canvas.height
    const snapshotContext = snapshot.getContext('2d')
    if (!snapshotContext) {
      return
    }

    snapshotContext.drawImage(canvas, 0, 0)
    const stack = undoHistoryRef.current[drawMode]
    stack.push(snapshot)
    if (stack.length > MAX_UNDO_HISTORY) {
      const removedSnapshot = stack.shift()
      if (removedSnapshot) {
        removedSnapshot.width = 0
        removedSnapshot.height = 0
      }
    }
    updateUndoCounts()
  }

  const createCanvasSnapshot = (canvas: HTMLCanvasElement) => {
    if (canvas.width <= 0 || canvas.height <= 0) {
      return null
    }

    const snapshot = document.createElement('canvas')
    snapshot.width = canvas.width
    snapshot.height = canvas.height
    const snapshotContext = snapshot.getContext('2d')
    if (!snapshotContext) {
      return null
    }

    snapshotContext.drawImage(canvas, 0, 0)
    return snapshot
  }

  const restoreCanvasSnapshot = (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, snapshot: UndoSnapshot) => {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(snapshot, 0, 0)
  }

  const undoDrawing = () => {
    undoDrawingForMode(drawMode)
  }

  const drawShape = (from: CanvasPoint, to: CanvasPoint, mode: Extract<ToolMode, 'line' | 'rect' | 'ellipse'>) => {
    const canvas = getActiveDrawCanvas()
    const context = getDrawContext(drawMode)
    if (!canvas || !context) {
      return
    }

    context.save()
    context.lineWidth = brushSize
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.globalCompositeOperation = 'source-over'
    context.strokeStyle = brushColor
    context.beginPath()
    if (mode === 'line') {
      context.moveTo(from.x, from.y)
      context.lineTo(to.x, to.y)
    } else if (mode === 'rect') {
      context.rect(
        Math.min(from.x, to.x),
        Math.min(from.y, to.y),
        Math.abs(to.x - from.x),
        Math.abs(to.y - from.y),
      )
    } else {
      context.ellipse(
        (from.x + to.x) / 2,
        (from.y + to.y) / 2,
        Math.abs(to.x - from.x) / 2,
        Math.abs(to.y - from.y) / 2,
        0,
        0,
        Math.PI * 2,
      )
    }
    context.stroke()
    context.restore()
  }

  const drawStrokeSegments = (segments: StrokeSegment[]) => {
    if (segments.length === 0) {
      return
    }

    const canvas = getActiveDrawCanvas()
    const context = getDrawContext(drawMode)
    if (!canvas || !context) {
      return
    }

    context.save()
    context.lineWidth = brushSize
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.globalCompositeOperation = 'source-over'
    context.strokeStyle = brushColor
    context.beginPath()
    for (const segment of segments) {
      context.moveTo(segment.from.x, segment.from.y)
      context.lineTo(segment.to.x, segment.to.y)
    }
    context.stroke()
    context.restore()
  }

  const commitTextDraft = () => {
    if (!textDraft) {
      return
    }

    if (!textDraft.value.trim()) {
      setTextDraft(null)
      return
    }

    const annotation: TextAnnotation = {
      id: textDraft.id ?? `text-annotation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      x: textDraft.x,
      y: textDraft.y,
      value: textDraft.value,
      fontSize: textDraft.fontSize,
      color: textDraft.color,
      rotation: textDraft.rotation,
    }
    setTextAnnotations((annotations) => {
      const existingIndex = annotations.findIndex((item) => item.id === annotation.id)
      if (existingIndex < 0) {
        return [...annotations, annotation]
      }

      return annotations.map((item) => item.id === annotation.id ? annotation : item)
    })
    setSelectedTextId(annotation.id)
    setToolMode('select')
    setTextDraft(null)
  }

  const flushStrokeSegments = () => {
    strokeFrameRef.current = null
    const segments = pendingStrokeSegmentsRef.current
    pendingStrokeSegmentsRef.current = []
    drawStrokeSegments(segments)
  }

  const scheduleStrokeSegment = (from: CanvasPoint, to: CanvasPoint) => {
    pendingStrokeSegmentsRef.current.push({ from, to })

    if (strokeFrameRef.current !== null) {
      return
    }

    strokeFrameRef.current = requestAnimationFrame(flushStrokeSegments)
  }

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button === 1) {
      hideBrushCursor()
      return
    }

    const position = toolMode === 'text' ? getPointerCanvasPosition(event) : updateBrushCursor(event)
    if (toolMode === 'text') {
      hideBrushCursor()
    }
    if (!position) {
      return
    }

    const { point } = position
    if (drawMode === 'annotation' && toolMode === 'text') {
      event.preventDefault()
      if (textDraft) {
        commitTextDraft()
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)
      setTextDraft({
        ...point,
        id: null,
        value: '',
        fontSize: textSize,
        color: brushColor,
        rotation: 0,
      })
      return
    }

    if (drawMode === 'annotation' && toolMode === 'select') {
      setSelectedTextId(null)
      return
    }

    pushUndoSnapshot()
    event.currentTarget.setPointerCapture(event.pointerId)
    isDrawingRef.current = true
    lastPointRef.current = point
    if (drawMode === 'annotation' && (toolMode === 'line' || toolMode === 'rect' || toolMode === 'ellipse')) {
      const canvas = getActiveDrawCanvas()
      shapeStartPointRef.current = point
      shapePreviewSnapshotRef.current = canvas ? createCanvasSnapshot(canvas) : null
      drawShape(point, point, toolMode)
      return
    }

    scheduleStrokeSegment(point, point)
  }

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (isPanningRef.current || event.buttons === 4) {
      hideBrushCursor()
      return
    }

    const position = toolMode === 'text' ? getPointerCanvasPosition(event) : updateBrushCursor(event)
    if (toolMode === 'text') {
      hideBrushCursor()
    }
    if (drawMode === 'annotation' && toolMode === 'text') {
      return
    }

    if (!isDrawingRef.current || !position) {
      return
    }

    const { point } = position
    const lastPoint = lastPointRef.current
    if (!lastPoint) {
      return
    }

    if (drawMode === 'annotation' && (toolMode === 'line' || toolMode === 'rect' || toolMode === 'ellipse')) {
      const canvas = getActiveDrawCanvas()
      const context = getDrawContext(drawMode)
      const startPoint = shapeStartPointRef.current
      const previewSnapshot = shapePreviewSnapshotRef.current
      if (!canvas || !context || !startPoint || !previewSnapshot) {
        return
      }

      restoreCanvasSnapshot(canvas, context, previewSnapshot)
      drawShape(startPoint, point, toolMode)
      lastPointRef.current = point
      return
    }

    scheduleStrokeSegment(lastPoint, point)
    lastPointRef.current = point
  }

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button === 1 || isPanningRef.current) {
      hideBrushCursor()
      return
    }

    if (toolMode === 'text') {
      getPointerCanvasPosition(event)
    } else {
      updateBrushCursor(event)
    }
    if (drawMode === 'annotation' && toolMode === 'text') {
      event.currentTarget.releasePointerCapture(event.pointerId)
      return
    }

    if (!isDrawingRef.current) {
      return
    }

    event.currentTarget.releasePointerCapture(event.pointerId)
    if (strokeFrameRef.current !== null) {
      cancelAnimationFrame(strokeFrameRef.current)
      flushStrokeSegments()
    }
    isDrawingRef.current = false
    lastPointRef.current = null
    shapeStartPointRef.current = null
    shapePreviewSnapshotRef.current = null
  }

  const handleViewportPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) {
      return
    }

    const viewport = editorViewportRef.current
    if (!viewport) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    hideBrushCursor()
    viewport.setPointerCapture(event.pointerId)
    viewport.dataset.panStartX = String(event.clientX)
    viewport.dataset.panStartY = String(event.clientY)
    viewport.dataset.panScrollLeft = String(viewport.scrollLeft)
    viewport.dataset.panScrollTop = String(viewport.scrollTop)
    isPanningRef.current = true
    setIsPanning(true)
  }

  const handleViewportPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = editorViewportRef.current
    if (!viewport || !isPanningRef.current || event.buttons !== 4) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const startX = Number(viewport.dataset.panStartX || event.clientX)
    const startY = Number(viewport.dataset.panStartY || event.clientY)
    const startScrollLeft = Number(viewport.dataset.panScrollLeft || viewport.scrollLeft)
    const startScrollTop = Number(viewport.dataset.panScrollTop || viewport.scrollTop)
    viewport.scrollLeft = startScrollLeft - (event.clientX - startX)
    viewport.scrollTop = startScrollTop - (event.clientY - startY)
  }

  const handleViewportPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = editorViewportRef.current
    if (!viewport || !isPanningRef.current) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    viewport.releasePointerCapture(event.pointerId)
    delete viewport.dataset.panStartX
    delete viewport.dataset.panStartY
    delete viewport.dataset.panScrollLeft
    delete viewport.dataset.panScrollTop
    isPanningRef.current = false
    setIsPanning(false)
  }

  const clearDrawing = () => {
    const canvas = getActiveDrawCanvas()
    const context = getDrawContext(drawMode)
    if (!canvas || !context) {
      return
    }

    pushUndoSnapshot()
    setTextDraft(null)
    if (drawMode === 'annotation') {
      setTextAnnotations([])
      setSelectedTextId(null)
    }
    context.clearRect(0, 0, canvas.width, canvas.height)
  }

  const editTextAnnotation = (annotation: TextAnnotation) => {
    setTextDraft({
      id: annotation.id,
      x: annotation.x,
      y: annotation.y,
      value: annotation.value,
      fontSize: annotation.fontSize,
      color: annotation.color,
      rotation: annotation.rotation,
    })
    setTextAnnotations((annotations) => annotations.filter((item) => item.id !== annotation.id))
    setSelectedTextId(annotation.id)
    setToolMode('text')
  }

  const handleTextAnnotationPointerDown = (event: PointerEvent<HTMLDivElement>, annotation: TextAnnotation) => {
    if (toolMode !== 'select') {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setSelectedTextId(annotation.id)
    const stage = stageRef.current
    if (!stage) {
      return
    }

    const stageRect = stage.getBoundingClientRect()
    const pointerX = (event.clientX - stageRect.left) / displayScale
    const pointerY = (event.clientY - stageRect.top) / displayScale
    textDragRef.current = {
      id: annotation.id,
      pointerId: event.pointerId,
      offsetX: pointerX - annotation.x,
      offsetY: pointerY - annotation.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleTextAnnotationPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = textDragRef.current
    const stage = stageRef.current
    if (!drag || drag.pointerId !== event.pointerId || !stage) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const stageRect = stage.getBoundingClientRect()
    const pointerX = (event.clientX - stageRect.left) / displayScale
    const pointerY = (event.clientY - stageRect.top) / displayScale
    setTextAnnotations((annotations) => annotations.map((annotation) => (
      annotation.id === drag.id
        ? {
            ...annotation,
            x: Math.max(0, Math.min(imageSize.width - getTextAnnotationMetrics(annotation).width, pointerX - drag.offsetX)),
            y: Math.max(0, Math.min(imageSize.height - MIN_TEXT_BOX_HEIGHT, pointerY - drag.offsetY)),
          }
        : annotation
    )))
  }

  const handleTextAnnotationPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = textDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    textDragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const drawTextAnnotations = (context: CanvasRenderingContext2D) => {
    textAnnotations.forEach((annotation) => drawTextAnnotation(context, annotation))
  }

  const createCompositedImage = () => {
    const imageCanvas = imageCanvasRef.current
    const annotationCanvas = annotationCanvasRef.current
    const maskCanvas = maskCanvasRef.current
    if (!imageCanvas || !annotationCanvas || !maskCanvas || imageSize.width <= 0 || imageSize.height <= 0) {
      return null
    }

    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = imageSize.width
    outputCanvas.height = imageSize.height
    const context = outputCanvas.getContext('2d')
    if (!context) {
      return null
    }

    context.drawImage(imageCanvas, 0, 0)
    context.drawImage(annotationCanvas, 0, 0)
    drawTextAnnotations(context)
    context.save()
    context.globalAlpha = 0.22
    context.drawImage(maskCanvas, 0, 0)
    context.restore()
    return canvasToDataUrl(outputCanvas)
  }

  const createMaskImage = () => {
    const maskCanvas = maskCanvasRef.current
    if (!maskCanvas || maskCanvas.width <= 0 || maskCanvas.height <= 0) {
      return null
    }

    return canvasToDataUrl(maskCanvas)
  }

  const persistEditorOutputImage = async (imageUrl: string, fileName: string) => {
    if (!workspaceConfigured) {
      return {
        imageUrl,
        imageAsset: null,
      }
    }

    const blob = await dataUrlToBlob(imageUrl)
    const imageAsset = await writeWorkspaceImageAsset({
      pathSegments: ['manual-edits'],
      fileName,
      blob,
      originalWidth: imageSize.width,
      originalHeight: imageSize.height,
    })

    return {
      imageUrl: await platformBridge.resolveWorkspaceAssetUrl(imageAsset.relativePath),
      imageAsset,
    }
  }

  const applyToCurrentNode = async () => {
    if (isSavingOutput) {
      return
    }

    const imageUrl = createCompositedImage()
    if (!imageUrl) {
      return
    }

    const size = getImageNodeSize(imageSize.width, imageSize.height)
    setIsSavingOutput(true)

    try {
      const persistedImage = await persistEditorOutputImage(imageUrl, getDownloadFileName(session.title))
      runTracked(() => {
        updateNodeData(session.nodeId, {
          imageUrl: persistedImage.imageUrl,
          imageAsset: persistedImage.imageAsset,
          name: session.title,
          label: session.title,
          imageWidth: imageSize.width,
          imageHeight: imageSize.height,
          ...size,
        })
      })
      setIsSavingOutput(false)
      close()
    } catch (error) {
      setIsSavingOutput(false)
      notify({ tone: 'error', title: '图片保存失败', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const saveAsNewNode = async () => {
    if (isSavingOutput) {
      return
    }

    const saveMode = drawModeRef.current
    const isMaskOutput = saveMode === 'mask'
    const imageUrl = isMaskOutput ? createMaskImage() : createCompositedImage()
    if (!imageUrl) {
      return
    }

    setIsSavingOutput(true)

    try {
      const fileName = getDownloadFileName(session.title, isMaskOutput ? '-mask' : '-edit')
      const persistedImage = await persistEditorOutputImage(imageUrl, fileName)

      runTracked(() => {
        createGeneratedPreviewNode(session.nodeId, {
        label: isMaskOutput ? getDownloadFileName(session.title, '-mask') : `${session.title} 编辑`,
        imageUrl: persistedImage.imageUrl,
        imageAsset: persistedImage.imageAsset,
        prompt: isMaskOutput ? '蒙版图' : '',
        model: isMaskOutput ? 'manual-mask' : 'manual-edit',
        ratio: 'Auto',
        status: 'done',
        errorMsg: '',
        imageWidth: imageSize.width,
        imageHeight: imageSize.height,
        sourceImageNodeId: isMaskOutput ? null : session.nodeType === 'imageNode' ? session.nodeId : session.sourceImageNodeId ?? null,
        originOperation: isMaskOutput ? 'generate' : 'image-edit',
        taskId: null,
        })
      })
      setIsSavingOutput(false)
      close()
    } catch (error) {
      setIsSavingOutput(false)
      notify({ tone: 'error', title: '图片保存失败', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const downloadImage = () => {
    const downloadMode = drawModeRef.current
    const imageUrl = downloadMode === 'mask' ? createMaskImage() : createCompositedImage()
    if (imageUrl) {
      downloadDataUrl(imageUrl, getDownloadFileName(session.title, downloadMode === 'mask' ? '-mask' : ''))
    }
  }


  const viewportWidth = Math.max(320, window.innerWidth - 96)
  const viewportHeight = Math.max(240, window.innerHeight - 84)
  const fitScale = imageSize.width > 0 && imageSize.height > 0
    ? Math.min(viewportWidth / imageSize.width, viewportHeight / imageSize.height, 1)
    : 1
  const displayScale = fitScale * zoom
  const stageWidth = imageSize.width * displayScale
  const stageHeight = imageSize.height * displayScale
  const brushCursorSize = Math.max(18, Math.min(44, brushSize * displayScale + 12))
  const brushCursorDotSize = Math.max(6, Math.min(16, brushSize * displayScale * 0.5))
  const selectedTextAnnotation = selectedTextId ? textAnnotations.find((annotation) => annotation.id === selectedTextId) ?? null : null
  const activeSize = toolMode === 'text' ? textSize : selectedTextAnnotation ? selectedTextAnnotation.fontSize : brushSize
  const activeSizeMin = toolMode === 'text' || selectedTextAnnotation ? MIN_TEXT_SIZE : MIN_BRUSH_SIZE
  const activeSizeMax = toolMode === 'text' || selectedTextAnnotation ? MAX_TEXT_SIZE : MAX_BRUSH_SIZE
  const textDraftLeft = textDraft ? textDraft.x * displayScale : 0
  const textDraftTop = textDraft ? textDraft.y * displayScale : 0
  const textDraftMetrics = textDraft
    ? getTextAnnotationMetrics({ value: textDraft.value || ' ', fontSize: textDraft.fontSize })
    : { width: MIN_TEXT_BOX_WIDTH, height: MIN_TEXT_BOX_HEIGHT, lines: [] }
  const textDraftWidth = textDraftMetrics.width * displayScale
  const textDraftHeight = textDraft
    ? textDraftMetrics.height * displayScale
    : MIN_TEXT_BOX_HEIGHT * displayScale
  const annotationCanvasCursorClassName = toolMode === 'text' ? 'cursor-text' : toolMode === 'select' ? 'cursor-default' : 'cursor-none'
  const canUndo = undoCounts[drawMode] > 0

  const getTextAnnotationStyle = (annotation: TextAnnotation) => {
    const { height, width } = getTextAnnotationMetrics(annotation)
    return {
      left: annotation.x * displayScale,
      top: annotation.y * displayScale,
      width: width * displayScale,
      minHeight: height * displayScale,
      padding: `${TEXT_BOX_PADDING_Y * displayScale}px ${TEXT_BOX_PADDING_X * displayScale}px`,
      fontSize: Math.max(1, annotation.fontSize * displayScale),
      color: annotation.color,
      transform: `rotate(${annotation.rotation}deg)`,
      transformOrigin: '0 0',
    }
  }

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="图片全屏编辑器" tabIndex={-1} className="fixed inset-0 z-[10000] bg-[var(--canvas-bg)] text-[var(--text-primary)]">
      <div className={`absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-1 p-[5px] ${themeClasses.strongPanel}`}>
        <div className={`${themeClasses.nodeSegmentGroup} h-7 w-[112px]`}>
          <button
            type="button"
            onClick={() => selectDrawMode('annotation')}
            className={`${themeClasses.nodeSegmentButton} whitespace-nowrap ${drawMode === 'annotation' ? themeClasses.nodeSegmentButtonActive : ''}`}
            aria-pressed={drawMode === 'annotation'}
            title="标注"
          >
            <span>标注</span>
          </button>
          <button
            type="button"
            onClick={() => selectDrawMode('mask')}
            className={`${themeClasses.nodeSegmentButton} whitespace-nowrap ${drawMode === 'mask' ? themeClasses.nodeSegmentButtonActive : ''}`}
            aria-pressed={drawMode === 'mask'}
            title="蒙版"
          >
            <span>蒙版</span>
          </button>
        </div>
        {drawMode === 'annotation' ? (
          <>
            <div className="mx-1 h-5 w-px bg-[var(--border-subtle)]" />
            <TooltipIconButton
              label="选择"
              onClick={() => {
                commitTextDraft()
                setToolMode('select')
              }}
              className={toolMode === 'select' ? TOOLBAR_ICON_BUTTON_ACTIVE_CLASS : TOOLBAR_ICON_BUTTON_CLASS}
              icon={<MousePointer2 className="h-3.5 w-3.5" />}
            />
            <TooltipIconButton
              label="画笔"
              onClick={() => {
                commitTextDraft()
                setToolMode('brush')
              }}
              className={toolMode === 'brush' ? TOOLBAR_ICON_BUTTON_ACTIVE_CLASS : TOOLBAR_ICON_BUTTON_CLASS}
              icon={<Brush className="h-3.5 w-3.5" />}
            />
            <TooltipIconButton
              label="直线"
              onClick={() => {
                commitTextDraft()
                setToolMode('line')
              }}
              className={toolMode === 'line' ? TOOLBAR_ICON_BUTTON_ACTIVE_CLASS : TOOLBAR_ICON_BUTTON_CLASS}
              icon={<Slash className="h-3.5 w-3.5" />}
            />
            <TooltipIconButton
              label="矩形"
              onClick={() => {
                commitTextDraft()
                setToolMode('rect')
              }}
              className={toolMode === 'rect' ? TOOLBAR_ICON_BUTTON_ACTIVE_CLASS : TOOLBAR_ICON_BUTTON_CLASS}
              icon={<RectangleHorizontal className="h-3.5 w-3.5" />}
            />
            <TooltipIconButton
              label="圆形"
              onClick={() => {
                commitTextDraft()
                setToolMode('ellipse')
              }}
              className={toolMode === 'ellipse' ? TOOLBAR_ICON_BUTTON_ACTIVE_CLASS : TOOLBAR_ICON_BUTTON_CLASS}
              icon={<Circle className="h-3.5 w-3.5" />}
            />
            <TooltipIconButton
              label="文字"
              onClick={() => setToolMode('text')}
              className={toolMode === 'text' ? TOOLBAR_ICON_BUTTON_ACTIVE_CLASS : TOOLBAR_ICON_BUTTON_CLASS}
              icon={<Type className="h-3.5 w-3.5" />}
            />
          </>
        ) : null}
        {drawMode === 'annotation' && selectedTextId ? (
          <>
            <div className="mx-1 h-5 w-px bg-[var(--border-subtle)]" />
            <TooltipIconButton
              label="重新编辑文字"
              onClick={() => {
                const annotation = textAnnotations.find((item) => item.id === selectedTextId)
                if (annotation) {
                  editTextAnnotation(annotation)
                }
              }}
              className={TOOLBAR_ICON_BUTTON_CLASS}
              icon={<Type className="h-3.5 w-3.5" />}
            />
            <TooltipIconButton
              label="删除文字"
              onClick={() => {
                setTextAnnotations((annotations) => annotations.filter((item) => item.id !== selectedTextId))
                setSelectedTextId(null)
              }}
              className={TOOLBAR_ICON_BUTTON_CLASS}
              icon={<Trash2 className="h-3.5 w-3.5" />}
            />
          </>
        ) : null}
        <div className="mx-1 h-5 w-px bg-[var(--border-subtle)]" />
        <TooltipIconButton
          label="缩小"
          onClick={() => setZoom((value) => Math.max(0.25, value - 0.1))}
          className={TOOLBAR_ICON_BUTTON_CLASS}
          icon={<Minus className="h-3.5 w-3.5" />}
        />
        <span className="flex h-7 w-11 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] text-[11px] font-medium tabular-nums text-[var(--text-secondary)]">
          {Math.round(displayScale * 100)}%
        </span>
        <TooltipIconButton
          label="放大"
          onClick={() => setZoom((value) => Math.min(4, value + 0.1))}
          className={TOOLBAR_ICON_BUTTON_CLASS}
          icon={<Plus className="h-3.5 w-3.5" />}
        />
        <div className="mx-1 h-5 w-px bg-[var(--border-subtle)]" />
        <div className="relative">
          <button
            type="button"
            onClick={() => setColorPaletteOpen((open) => !open)}
            className={`${TOOLBAR_ICON_BUTTON_CLASS} h-7 w-7`}
            aria-label="选择颜色"
            aria-expanded={colorPaletteOpen}
          >
            <span
              className="h-3.5 w-3.5 rounded-full border border-white/70 shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_2px_6px_rgba(0,0,0,0.32)]"
              style={{ backgroundColor: brushColor }}
            />
          </button>
          {colorPaletteOpen ? (
            <div className={`absolute left-1/2 top-full z-30 mt-2 grid w-[8.5rem] -translate-x-1/2 grid-cols-4 justify-items-center gap-2 p-2 ${themeClasses.strongPanel}`}>
              {EDITOR_COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    setBrushColor(color)
                    if (selectedTextId) {
                      setTextAnnotations((annotations) => annotations.map((annotation) => (
                        annotation.id === selectedTextId ? { ...annotation, color } : annotation
                      )))
                    }
                    setColorPaletteOpen(false)
                  }}
                  className={`h-5 w-5 rounded-full border transition ${brushColor === color ? 'border-white shadow-[0_0_0_2px_var(--accent-violet)]' : 'border-white/40 hover:border-white/80'}`}
                  style={{ backgroundColor: color }}
                  aria-label={`选择颜色 ${color}`}
                  aria-pressed={brushColor === color}
                />
              ))}
            </div>
          ) : null}
        </div>
        <label className="flex h-7 items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] px-2 text-[11px] text-[var(--text-muted)]">
          <span className="w-8 text-right tabular-nums">{activeSize}px</span>
          <input
            type="range"
            min={activeSizeMin}
            max={activeSizeMax}
            value={activeSize}
            onChange={(event) => {
              const nextSize = Number(event.currentTarget.value)
              if (toolMode === 'text') {
                setTextSize(nextSize)
              } else if (toolMode === 'select' && selectedTextId) {
                setTextAnnotations((annotations) => annotations.map((annotation) => (
                  annotation.id === selectedTextId ? { ...annotation, fontSize: nextSize } : annotation
                )))
              } else {
                setBrushSize(nextSize)
              }
            }}
            className="w-28"
            style={{ accentColor: brushColor }}
            aria-label={toolMode === 'text' ? '字体大小' : '画笔大小'}
          />
        </label>
        <TooltipIconButton
          label="撤销"
          onClick={undoDrawing}
          disabled={!canUndo}
          className={TOOLBAR_ICON_BUTTON_CLASS}
          icon={<Undo2 className="h-3.5 w-3.5" />}
        />
        <TooltipIconButton
          label="清空当前图层"
          onClick={clearDrawing}
          className={TOOLBAR_ICON_BUTTON_CLASS}
          icon={<Trash2 className="h-3.5 w-3.5" />}
        />
        <TooltipIconButton
          label="重置缩放"
          onClick={() => setZoom(1)}
          className={TOOLBAR_ICON_BUTTON_CLASS}
          icon={<RotateCcw className="h-3.5 w-3.5" />}
        />
        <TooltipIconButton
          label={drawMode === 'mask' ? '下载蒙版' : '下载图片'}
          onClick={downloadImage}
          className={TOOLBAR_ICON_BUTTON_CLASS}
          icon={<Download className="h-3.5 w-3.5" />}
        />
        <TooltipIconButton
          label="关闭"
          onClick={close}
          className={TOOLBAR_ICON_BUTTON_CLASS}
          icon={<X className="h-3.5 w-3.5" />}
        />
      </div>

      <div className={`absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 p-1.5 ${themeClasses.strongPanel}`}>
        {drawMode === 'annotation' ? (
          <button
            type="button"
            onClick={applyToCurrentNode}
            disabled={isSavingOutput}
            className={EDITOR_ACTION_BUTTON_CLASS}
          >
            <Check className="h-3.5 w-3.5" />
            应用到当前节点
          </button>
        ) : null}
        <button
          type="button"
          onClick={saveAsNewNode}
          disabled={isSavingOutput}
          className={EDITOR_ACTION_BUTTON_CLASS}
        >
          <Save className="h-3.5 w-3.5" />
          {drawMode === 'mask' ? '另存为蒙版节点' : '另存为新节点'}
        </button>
      </div>

      <div
        ref={editorViewportRef}
        className={`image-editor-scrollbar h-full w-full overflow-auto ${isPanning ? 'cursor-grabbing' : ''}`}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerCancel={handleViewportPointerUp}
      >
        <div
          className="grid place-items-center p-12"
          style={{
            minWidth: '100%',
            minHeight: '100%',
            width: imageSize.width > 0 ? stageWidth + 96 : '100%',
            height: imageSize.height > 0 ? stageHeight + 96 : '100%',
          }}
        >
        {errorMsg ? (
          <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-500 shadow-[var(--shadow-panel)] backdrop-blur-xl">{errorMsg}</div>
        ) : (
          null
        )}
        {imageSize.width > 0 && imageSize.height > 0 ? (
          <div
            ref={stageRef}
            className="relative shrink-0 shadow-[0_24px_80px_rgba(0,0,0,0.42)]"
            style={{
              width: stageWidth,
              height: stageHeight,
            }}
          >
            <canvas ref={imageCanvasRef} className="absolute inset-0 h-full w-full" />
            <canvas
              ref={annotationCanvasRef}
              className={`absolute inset-0 h-full w-full touch-none ${annotationCanvasCursorClassName} ${drawMode === 'annotation' ? 'pointer-events-auto' : 'pointer-events-none'}`}
              onPointerEnter={updateBrushCursor}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={hideBrushCursor}
            />
            <canvas
              ref={maskCanvasRef}
              className={`absolute inset-0 h-full w-full touch-none cursor-none opacity-[0.22] ${drawMode === 'mask' ? 'pointer-events-auto' : 'pointer-events-none'}`}
              onPointerEnter={updateBrushCursor}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={hideBrushCursor}
            />
            {drawMode === 'annotation' ? textAnnotations.map((annotation) => {
              const selected = selectedTextId === annotation.id
              return (
                <div
                  key={annotation.id}
                  role="button"
                  tabIndex={0}
                  title="双击重新编辑"
                  className={`nodrag nopan absolute z-10 box-border select-none whitespace-pre rounded-sm border bg-transparent font-semibold leading-tight outline-none ${selected ? 'border-white/90 ring-1 ring-violet-400/70' : 'border-transparent'} ${toolMode === 'select' ? 'cursor-move hover:border-white/70' : 'pointer-events-none'}`}
                  style={getTextAnnotationStyle(annotation)}
                  onPointerDown={(event) => handleTextAnnotationPointerDown(event, annotation)}
                  onPointerMove={handleTextAnnotationPointerMove}
                  onPointerUp={handleTextAnnotationPointerUp}
                  onPointerCancel={handleTextAnnotationPointerUp}
                  onDoubleClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    editTextAnnotation(annotation)
                  }}
                >
                  {annotation.value}
                </div>
              )
            }) : null}
            {textDraft && drawMode === 'annotation' ? (
              <div
                className="nodrag nopan absolute z-20"
                style={{
                  left: textDraftLeft,
                  top: textDraftTop,
                  width: textDraftWidth,
                  height: Math.max(textDraftHeight, textSize * displayScale * 2.1),
                }}
              >
              <textarea
                ref={textDraftInputRef}
                wrap="off"
                value={textDraft.value}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setTextDraft((draft) => draft ? { ...draft, value } : draft)
                }}
                onBlur={commitTextDraft}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setTextDraft(null)
                    return
                  }

                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault()
                    commitTextDraft()
                  }
                }}
                className="h-full w-full resize-none overflow-hidden whitespace-pre rounded-sm border border-white/80 bg-transparent font-semibold leading-tight outline-none focus:border-white focus:ring-1 focus:ring-white/55"
                style={{
                  boxSizing: 'border-box',
                  padding: `${TEXT_BOX_PADDING_Y * displayScale}px ${TEXT_BOX_PADDING_X * displayScale}px`,
                  fontSize: Math.max(1, textSize * displayScale),
                  color: brushColor,
                }}
              />
              </div>
            ) : null}
            <div
              ref={brushCursorElementRef}
              className="pointer-events-none absolute left-0 top-0 z-10 hidden will-change-transform"
              style={{
                width: brushCursorSize,
                height: brushCursorSize,
                transform: 'translate3d(0, 0, 0) translate(-50%, -50%)',
              }}
            >
              <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/95 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]" />
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/95 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]" />
              <span
                className="absolute left-1/2 top-1/2 rounded-full border border-white/95 bg-transparent shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_1px_6px_rgba(0,0,0,0.28)]"
                style={{
                  width: brushCursorDotSize,
                  height: brushCursorDotSize,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  )
}
