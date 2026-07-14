import { memo, useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Brush, Eraser, Eye, EyeOff, ImagePlus, Link2, Trash2 } from 'lucide-react'
import { CanvasImagePreview } from '@/components/CanvasImagePreview'
import { getCanvasNodeById } from '@/store/canvasConnectionSources'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { themeClasses } from '@/styles/themeClasses'
import { getWorkspaceAssetThumbnailRelativePath } from '@/utils/workspaceImageAsset'
import { recordComponentRender } from '@/utils/performanceDiagnostics'
import { type AppNodeProps, type ImageEditBrushMode, type WorkspaceImageAsset } from '@/types'
import { useShallow } from 'zustand/react/shallow'
import { NodeDeleteButton, NodeHeader, NodeResizerPreset } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { areNodeContentPropsEqual } from '../nodePropComparators'

type ImageEditNodeProps = AppNodeProps<'imageEditNode'>

const MIN_BRUSH_SIZE = 4
const MAX_BRUSH_SIZE = 96

const UI_TEXT = {
  deleteNode: '删除局部编辑节点',
  title: '局部编辑',
  baseImage: '主图',
  noBaseImage: '连接一张主图后开始局部编辑',
  noBaseImageHint: '从图片节点或生成预览节点连到左侧主图接口。',
  noMask: '在图上涂抹要修改的区域',
  paint: '画笔',
  erase: '橡皮',
  clearMask: '清空蒙版',
  showMask: '显示蒙版',
  hideMask: '隐藏蒙版',
  brushSize: '画笔大小',
} as const

function hasMaskPixels(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (!context || canvas.width === 0 || canvas.height === 0) {
    return false
  }

  const data = context.getImageData(0, 0, canvas.width, canvas.height).data
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 0) {
      return true
    }
  }

  return false
}

interface MaskCanvasProps {
  imageUrl: string
  imageLabel: string
  thumbnailRelativePath?: string
  maskDataUrl: string | null
  brushSize: number
  brushMode: ImageEditBrushMode
  maskVisible: boolean
  onMaskChange: (maskDataUrl: string | null) => void
}

function MaskCanvas({
  imageUrl,
  imageLabel,
  thumbnailRelativePath,
  maskDataUrl,
  brushSize,
  brushMode,
  maskVisible,
  onMaskChange,
}: MaskCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (!cancelled) {
        setImageSize({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 })
      }
    }
    image.src = imageUrl

    return () => {
      cancelled = true
    }
  }, [imageUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !imageSize) {
      return
    }

    canvas.width = imageSize.width
    canvas.height = imageSize.height
    context.clearRect(0, 0, canvas.width, canvas.height)

    if (!maskDataUrl) {
      return
    }

    const maskImage = new Image()
    maskImage.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(maskImage, 0, 0, canvas.width, canvas.height)
    }
    maskImage.src = maskDataUrl
  }, [imageSize, maskDataUrl])

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) {
      return null
    }

    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const drawStroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }

    context.save()
    context.lineWidth = brushSize
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.globalCompositeOperation = brushMode === 'erase' ? 'destination-out' : 'source-over'
    context.strokeStyle = 'rgba(248, 113, 113, 0.56)'
    context.beginPath()
    context.moveTo(from.x, from.y)
    context.lineTo(to.x, to.y)
    context.stroke()
    context.restore()
  }

  const commitMask = () => {
    const canvas = canvasRef.current
    if (!canvas) {
      onMaskChange(null)
      return
    }

    onMaskChange(hasMaskPixels(canvas) ? canvas.toDataURL('image/png') : null)
  }

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event)
    if (!point) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    isDrawingRef.current = true
    lastPointRef.current = point
    drawStroke(point, point)
  }

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) {
      return
    }

    const point = getCanvasPoint(event)
    const lastPoint = lastPointRef.current
    if (!point || !lastPoint) {
      return
    }

    drawStroke(lastPoint, point)
    lastPointRef.current = point
  }

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) {
      return
    }

    event.currentTarget.releasePointerCapture(event.pointerId)
    isDrawingRef.current = false
    lastPointRef.current = null
    commitMask()
  }

  const aspectRatio = imageSize ? `${imageSize.width} / ${imageSize.height}` : '4 / 3'
  const imageAsset: WorkspaceImageAsset | null = thumbnailRelativePath
    ? {
        relativePath: '',
        mimeType: '',
        fileName: '',
        thumbnailRelativePath,
      }
    : null

  return (
    <div
      className="node-drag-handle relative overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)]"
      style={{ aspectRatio }}
    >
      <CanvasImagePreview
        src={imageUrl}
        alt={imageLabel}
        imageAsset={imageAsset}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <canvas
        ref={canvasRef}
        className={`nodrag nopan absolute inset-0 h-full w-full touch-none ${brushMode === 'erase' ? 'cursor-cell' : 'cursor-crosshair'} ${maskVisible ? 'opacity-100' : 'opacity-0'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label="蒙版绘制画布"
      />
      {!maskDataUrl ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-bg-strong)] px-3 py-2 text-center text-[11px] leading-5 text-[var(--text-secondary)] shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur">
          {UI_TEXT.noMask}
        </div>
      ) : null}
    </div>
  )
}

export const ImageEditNode = memo(function ImageEditNode({ id, data, selected }: ImageEditNodeProps) {
  recordComponentRender('ImageEditNode')
  const previousBaseSourceNodeIdRef = useRef<string | null>(data.sourceImageNodeId)
  const baseSourceNodeId = typeof data.sourceImageNodeId === 'string' ? data.sourceImageNodeId : null
  const baseSource = useCanvasStore(
    useShallow((state) => {
      const candidate = getCanvasNodeById(state.nodes, baseSourceNodeId)
      const node = (
        candidate?.type === 'imageNode'
        || candidate?.type === 'generatedPreviewNode'
        || candidate?.type === 'testImageNode'
      )
        ? candidate
        : null
      const imageUrl = typeof node?.data?.imageUrl === 'string' ? node.data.imageUrl : ''
      const label = typeof node?.data?.name === 'string' && node.data.name.trim()
        ? node.data.name
        : typeof node?.data?.label === 'string' && node.data.label.trim()
          ? node.data.label
          : UI_TEXT.baseImage
      const thumbnailRelativePath = getWorkspaceAssetThumbnailRelativePath(node?.data?.imageAsset)

      return { imageUrl, label, thumbnailRelativePath }
    }),
  )
  const { updateNodeData, deleteNode } = useCanvasStore(
    useShallow((state) => ({
      updateNodeData: state.updateNodeData,
      deleteNode: state.deleteNode,
    })),
  )
  const runTracked = useHistoryStore((s) => s.runTracked)

  const baseImageUrl = baseSource.imageUrl
  const baseLabel = baseSource.label
  const hasBaseImage = Boolean(baseImageUrl)
  const brushSize = typeof data.brushSize === 'number' ? Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, data.brushSize)) : 28
  const brushMode = data.brushMode === 'erase' ? 'erase' : 'paint'
  const maskVisible = typeof data.maskVisible === 'boolean' ? data.maskVisible : true

  useEffect(() => {
    const previousBaseSourceNodeId = previousBaseSourceNodeIdRef.current
    if (previousBaseSourceNodeId && previousBaseSourceNodeId !== baseSourceNodeId && data.maskDataUrl) {
      updateNodeData(id, { maskDataUrl: null, maskUpdatedAt: null })
    }

    previousBaseSourceNodeIdRef.current = baseSourceNodeId
  }, [baseSourceNodeId, data.maskDataUrl, id, updateNodeData])

  const setMaskDataUrl = useCallback((maskDataUrl: string | null) => {
    updateNodeData(id, {
      maskDataUrl,
      maskUpdatedAt: maskDataUrl ? Date.now() : null,
    })
  }, [id, updateNodeData])

  const updateBrushMode = (nextBrushMode: ImageEditBrushMode) => {
    runTracked(() => updateNodeData(id, { brushMode: nextBrushMode }))
  }

  return (
    <div
      data-testid={`node-${id}`}
      className={getNodeShellClassName({ selected })}
    >
      <NodeResizerPreset
        selected={selected}
        minWidth={380}
        minHeight={320}
        maxWidth={820}
        maxHeight={760}
        hideVisuals
      />

      <NodeDeleteButton
        id={id}
        selected={selected}
        ariaLabel={UI_TEXT.deleteNode}
        onDelete={() => runTracked(() => deleteNode(id))}
      />

      <Handle
        type="target"
        position={Position.Left}
        id="base"
        className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0"
        style={{ top: '50%' }}
      >
        <span className="handle-orb handle-orb--target">
          <span className="handle-orb__glow" />
          <span className="handle-orb__ring" />
          <span className="handle-orb__dot" />
        </span>
      </Handle>

      <Handle
        type="source"
        position={Position.Right}
        id="image"
        className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0"
      >
        <span className="handle-orb handle-orb--source">
          <span className="handle-orb__glow" />
          <span className="handle-orb__ring" />
          <span className="handle-orb__dot" />
        </span>
      </Handle>

      <NodeHeader
        icon={<ImagePlus className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
        title={UI_TEXT.title}
        right={(
          <span className={`ml-auto ${themeClasses.nodeBadge} ${themeClasses.nodeBadgeAmber}`}>
            <Link2 className="h-3 w-3" />
            Mask
          </span>
        )}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
        {hasBaseImage ? (
              <MaskCanvas
                imageUrl={baseImageUrl}
                imageLabel={baseLabel}
                thumbnailRelativePath={baseSource.thumbnailRelativePath}
                maskDataUrl={data.maskDataUrl}
                brushSize={brushSize}
            brushMode={brushMode}
            maskVisible={maskVisible}
            onMaskChange={(maskDataUrl) => runTracked(() => setMaskDataUrl(maskDataUrl))}
          />
        ) : (
          <div className="node-drag-handle flex min-h-[220px] flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--control-bg)] px-5 text-center">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">{UI_TEXT.noBaseImage}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{UI_TEXT.noBaseImageHint}</p>
            </div>
          </div>
        )}

        <div className={`grid grid-cols-[auto_auto_auto_minmax(86px,1fr)_auto] items-center gap-1.5 ${themeClasses.nodeSegmentGroup} p-1.5`}>
          <button
            type="button"
            onClick={() => updateBrushMode('paint')}
            className={`nodrag nopan flex h-8 w-8 items-center justify-center rounded-md transition ${brushMode === 'paint' ? 'bg-amber-400/90 text-white shadow-[inset_0_0_0_1px_rgba(251,191,36,0.22)]' : `${themeClasses.nodeSegmentButton} px-0`}`}
            aria-label={UI_TEXT.paint}
            title={UI_TEXT.paint}
          >
            <Brush className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => updateBrushMode('erase')}
            className={`nodrag nopan flex h-8 w-8 items-center justify-center rounded-md transition ${brushMode === 'erase' ? 'bg-amber-400/90 text-white shadow-[inset_0_0_0_1px_rgba(251,191,36,0.22)]' : `${themeClasses.nodeSegmentButton} px-0`}`}
            aria-label={UI_TEXT.erase}
            title={UI_TEXT.erase}
          >
            <Eraser className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => runTracked(() => updateNodeData(id, { maskVisible: !maskVisible }))}
            className={`nodrag nopan h-8 w-8 px-0 ${themeClasses.nodeSegmentButton}`}
            aria-label={maskVisible ? UI_TEXT.hideMask : UI_TEXT.showMask}
            title={maskVisible ? UI_TEXT.hideMask : UI_TEXT.showMask}
          >
            {maskVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <label className="nodrag nopan flex min-w-0 items-center gap-2 px-1 text-[10px] text-[var(--text-muted)]">
            <span className="shrink-0">{UI_TEXT.brushSize}</span>
            <input
              type="range"
              min={MIN_BRUSH_SIZE}
              max={MAX_BRUSH_SIZE}
              value={brushSize}
              onChange={(event) => updateNodeData(id, { brushSize: Number(event.currentTarget.value) })}
              className="h-1 min-w-0 flex-1 accent-amber-300"
            />
          </label>
          <button
            type="button"
            onClick={() => runTracked(() => setMaskDataUrl(null))}
            disabled={!data.maskDataUrl}
            className={`nodrag nopan h-8 w-8 px-0 ${themeClasses.nodeSegmentButton} hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:text-[var(--text-muted)]`}
            aria-label={UI_TEXT.clearMask}
            title={UI_TEXT.clearMask}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}, areNodeContentPropsEqual)
