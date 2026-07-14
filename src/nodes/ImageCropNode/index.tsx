import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Columns3, Link2, Loader2, Play, Rows3, ScissorsLineDashed } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import {
  buildEvenlyDistributedCuts,
  clampCropSegmentCount,
  normalizeCropCuts,
} from '@/features/imageCrop/runtime'
import { CanvasImagePreview } from '@/components/CanvasImagePreview'
import { getCanvasNodeById } from '@/store/canvasConnectionSources'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useProjectStore } from '@/store/useProjectStore'
import { isImageSourceNodeType, type AppNodeProps, type WorkspaceImageAsset } from '@/types'
import { themeClasses } from '@/styles/themeClasses'
import { getWorkspaceAssetThumbnailRelativePath } from '@/utils/workspaceImageAsset'
import { recordComponentRender } from '@/utils/performanceDiagnostics'
import { NodeDeleteButton, NodeHeader, NodeResizerPreset } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { InlineSelect, type InlineSelectOption } from '../InlineSelect'
import { areNodeContentPropsEqual } from '../nodePropComparators'

type ImageCropNodeProps = AppNodeProps<'imageCropNode'>

type ImageInfo = {
  width: number
  height: number
}

type DragAxis = 'horizontal' | 'vertical'

type DragState = {
  axis: DragAxis
  index: number
}

const MIN_PREVIEW_STAGE_HEIGHT = 220
const LINE_GAP = 0.04
const MIN_IMAGE_CROP_MENU_SEGMENTS = 1
const MAX_IMAGE_CROP_MENU_SEGMENTS = 5

const UI_TEXT = {
  deleteNode: '删除图像裁切节点',
  title: '图像裁切',
  linked: '已连接图片',
  unlinked: '等待图片输入',
  columns: '列数',
  rows: '行数',
  hint: '拖拽画面上的切线，调整每一刀的位置',
  emptyTitle: '连接图片后开始裁切',
  emptyDescription: '左侧接入一张图片，设置行列后拖动切线，再点击运行生成预览。',
  run: '运行裁切',
  running: '正在裁切',
  ready: '裁切完成',
  idle: '等待运行',
  sourceMissing: '当前没有可裁切的图片',
} as const

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getSourceNodeLabel(node: { id: string; data?: Record<string, unknown> } | null | undefined) {
  if (!node) {
    return ''
  }

  if (typeof node.data?.name === 'string' && node.data.name.trim()) {
    return node.data.name
  }

  if (typeof node.data?.label === 'string' && node.data.label.trim()) {
    return node.data.label
  }

  if (typeof node.data?.prompt === 'string' && node.data.prompt.trim()) {
    return node.data.prompt
  }

  return node.id
}

function getImageDisplayRect(stageWidth: number, stageHeight: number, imageWidth: number, imageHeight: number) {
  if (stageWidth <= 0 || stageHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return null
  }

  const scale = Math.min(stageWidth / imageWidth, stageHeight / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale

  return {
    left: (stageWidth - width) / 2,
    top: (stageHeight - height) / 2,
    width,
    height,
  }
}

function replaceCut(cuts: number[], index: number, nextValue: number) {
  return cuts.map((value, cutIndex) => (cutIndex === index ? nextValue : value))
}

export const ImageCropNode = memo(function ImageCropNode({ id, data, selected }: ImageCropNodeProps) {
  recordComponentRender('ImageCropNode')
  const sourceImage = useCanvasStore(
    useShallow((state) => {
      const sourceImageNodeId = typeof data.sourceImageNodeId === 'string' ? data.sourceImageNodeId : null
      const node = getCanvasNodeById(state.nodes, sourceImageNodeId)
      if (!node || !isImageSourceNodeType(node.type)) {
        return {
          connected: false,
          imageUrl: '',
          label: '',
          thumbnailRelativePath: undefined as string | undefined,
        }
      }

      return {
        connected: true,
        imageUrl: typeof node.data?.imageUrl === 'string' ? node.data.imageUrl : '',
        label: getSourceNodeLabel(node),
        thumbnailRelativePath: getWorkspaceAssetThumbnailRelativePath(node.data?.imageAsset),
      }
    }),
  )
  const { runImageCropNode, updateNodeData, deleteNode } = useCanvasStore(
    useShallow((state) => ({
      runImageCropNode: state.runImageCropNode,
      updateNodeData: state.updateNodeData,
      deleteNode: state.deleteNode,
    })),
  )
  const runTracked = useHistoryStore((state) => state.runTracked)
  const beginTransaction = useHistoryStore((state) => state.beginTransaction)
  const scheduleCommit = useHistoryStore((state) => state.scheduleCommit)
  const commitTransaction = useHistoryStore((state) => state.commitTransaction)
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const previewAreaRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const horizontalCutsRef = useRef<number[]>([])
  const verticalCutsRef = useRef<number[]>([])
  const [imageInfo, setImageInfo] = useState<ImageInfo>({ width: 0, height: 0 })
  const [stageSize, setStageSize] = useState({ width: 0, height: MIN_PREVIEW_STAGE_HEIGHT })

  const rowCount = clampCropSegmentCount(typeof data.rowCount === 'number' ? data.rowCount : undefined)
  const columnCount = clampCropSegmentCount(typeof data.columnCount === 'number' ? data.columnCount : undefined)
  const menuRowCount = clamp(rowCount, MIN_IMAGE_CROP_MENU_SEGMENTS, MAX_IMAGE_CROP_MENU_SEGMENTS)
  const menuColumnCount = clamp(columnCount, MIN_IMAGE_CROP_MENU_SEGMENTS, MAX_IMAGE_CROP_MENU_SEGMENTS)
  const horizontalCuts = useMemo(() => normalizeCropCuts(data.horizontalCuts, rowCount), [data.horizontalCuts, rowCount])
  const verticalCuts = useMemo(() => normalizeCropCuts(data.verticalCuts, columnCount), [columnCount, data.verticalCuts])
  const isRunning = data.status === 'running'
  const sourceImageUrl = sourceImage.imageUrl
  const sourceImageAsset = sourceImage.thumbnailRelativePath
    ? {
        relativePath: '',
        mimeType: '',
        fileName: '',
        thumbnailRelativePath: sourceImage.thumbnailRelativePath,
      } satisfies WorkspaceImageAsset
    : null
  const sourceLabel = sourceImage.label
  const displayRect = getImageDisplayRect(stageSize.width, stageSize.height, imageInfo.width, imageInfo.height)
  const columnCountOptions = useMemo<InlineSelectOption[]>(() => (
    Array.from({ length: MAX_IMAGE_CROP_MENU_SEGMENTS }, (_, index) => {
      const count = index + MIN_IMAGE_CROP_MENU_SEGMENTS
      return {
      value: String(count),
      label: `${count}列`,
      icon: <Columns3 className="h-3.5 w-3.5 text-[var(--text-muted)]" />,
      }
    })
  ), [])
  const rowCountOptions = useMemo<InlineSelectOption[]>(() => (
    Array.from({ length: MAX_IMAGE_CROP_MENU_SEGMENTS }, (_, index) => {
      const count = index + MIN_IMAGE_CROP_MENU_SEGMENTS
      return {
      value: String(count),
      label: `${count}行`,
      icon: <Rows3 className="h-3.5 w-3.5 text-[var(--text-muted)]" />,
      }
    })
  ), [])

  horizontalCutsRef.current = horizontalCuts
  verticalCutsRef.current = verticalCuts

  useEffect(() => {
    if (!sourceImageUrl) {
      setImageInfo({ width: 0, height: 0 })
      return
    }

    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled) {
        return
      }

      setImageInfo({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }
    image.src = sourceImageUrl

    return () => {
      cancelled = true
    }
  }, [sourceImageUrl])

  useEffect(() => {
    const element = previewAreaRef.current
    if (!element) {
      return
    }

    const updateSize = () => {
      setStageSize({
        width: element.clientWidth,
        height: element.clientHeight,
      })
    }

    updateSize()

    const observer = new ResizeObserver(() => updateSize())
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  const stopCanvasGesture = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

  const setRowCount = (nextValue: number | string) => {
    const safeRowCount = clamp(Math.round(Number(nextValue)), MIN_IMAGE_CROP_MENU_SEGMENTS, MAX_IMAGE_CROP_MENU_SEGMENTS)
    const nextRowCount = clampCropSegmentCount(safeRowCount, rowCount)
    runTracked(() => {
      updateNodeData(id, {
        rowCount: nextRowCount,
        horizontalCuts: buildEvenlyDistributedCuts(nextRowCount),
        errorMsg: '',
      })
    })
  }

  const setColumnCount = (nextValue: number | string) => {
    const safeColumnCount = clamp(Math.round(Number(nextValue)), MIN_IMAGE_CROP_MENU_SEGMENTS, MAX_IMAGE_CROP_MENU_SEGMENTS)
    const nextColumnCount = clampCropSegmentCount(safeColumnCount, columnCount)
    runTracked(() => {
      updateNodeData(id, {
        columnCount: nextColumnCount,
        verticalCuts: buildEvenlyDistributedCuts(nextColumnCount),
        errorMsg: '',
      })
    })
  }

  const updateDraggedLine = useCallback((clientX: number, clientY: number) => {
    const dragState = dragStateRef.current
    const stageElement = stageRef.current

    if (!dragState || !stageElement) {
      return
    }

    const rect = stageElement.getBoundingClientRect()

    if (dragState.axis === 'vertical') {
      const currentCuts = verticalCutsRef.current
      const previousCut = dragState.index > 0 ? currentCuts[dragState.index - 1] : 0
      const nextCut = dragState.index < currentCuts.length - 1 ? currentCuts[dragState.index + 1] : 1
      const nextValue = clamp(
        (clientX - rect.left) / rect.width,
        previousCut + LINE_GAP,
        nextCut - LINE_GAP,
      )
      updateNodeData(id, {
        verticalCuts: replaceCut(currentCuts, dragState.index, nextValue),
        errorMsg: '',
      })
      return
    }

    const currentCuts = horizontalCutsRef.current
    const previousCut = dragState.index > 0 ? currentCuts[dragState.index - 1] : 0
    const nextCut = dragState.index < currentCuts.length - 1 ? currentCuts[dragState.index + 1] : 1
    const nextValue = clamp(
      (clientY - rect.top) / rect.height,
      previousCut + LINE_GAP,
      nextCut - LINE_GAP,
    )
    updateNodeData(id, {
      horizontalCuts: replaceCut(currentCuts, dragState.index, nextValue),
      errorMsg: '',
    })
  }, [id, updateNodeData])

  const handleWindowPointerMove = useCallback((event: PointerEvent) => {
    updateDraggedLine(event.clientX, event.clientY)
  }, [updateDraggedLine])

  const finishLineDrag = useCallback(() => {
    if (!dragStateRef.current) {
      return
    }

    dragStateRef.current = null
    window.removeEventListener('pointermove', handleWindowPointerMove)
    window.removeEventListener('pointerup', finishLineDrag)
    window.removeEventListener('pointercancel', finishLineDrag)
    scheduleCommit()
  }, [handleWindowPointerMove, scheduleCommit])

  useEffect(() => {
    return () => {
      dragStateRef.current = null
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', finishLineDrag)
      window.removeEventListener('pointercancel', finishLineDrag)
    }
  }, [finishLineDrag, handleWindowPointerMove])

  const startLineDrag = (axis: DragAxis, index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    stopCanvasGesture(event)
    event.preventDefault()
    beginTransaction()
    dragStateRef.current = { axis, index }
    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', finishLineDrag)
    window.addEventListener('pointercancel', finishLineDrag)
  }

  const handleRun = async () => {
    beginTransaction()
    try {
      await runImageCropNode(id, activeProjectId)
    } finally {
      commitTransaction()
    }
  }

  return (
    <div
      data-testid={`node-${id}`}
      className={getNodeShellClassName({ selected })}
    >
      <NodeDeleteButton
        id={id}
        selected={selected}
        ariaLabel={UI_TEXT.deleteNode}
        onDelete={() => runTracked(() => deleteNode(id))}
      />

      <NodeResizerPreset
        selected={selected}
        minWidth={380}
        minHeight={360}
        maxWidth={820}
        maxHeight={860}
        hideVisuals
      />

      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0"
      >
        <span className="handle-orb handle-orb--target">
          <span className="handle-orb__glow" />
          <span className="handle-orb__ring" />
          <span className="handle-orb__dot" />
        </span>
      </Handle>

      <NodeHeader
        icon={<ScissorsLineDashed className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
        title={UI_TEXT.title}
        right={(
          <div className="ml-auto flex items-center gap-2">
            <span className="rounded-full border border-violet-400/18 bg-violet-400/8 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
              {rowCount} × {columnCount}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              sourceImage.connected
                ? 'border-violet-400/20 bg-violet-400/8 text-violet-200'
                : 'border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-muted)]'
            }`}>
              <Link2 className="h-3 w-3" />
              {sourceImage.connected ? UI_TEXT.linked : UI_TEXT.unlinked}
            </span>
          </div>
        )}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
        <div
          ref={previewAreaRef}
          className="flex min-h-[220px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--control-bg)]"
          style={{ minHeight: MIN_PREVIEW_STAGE_HEIGHT }}
        >
          {sourceImageUrl && displayRect ? (
            <div
              ref={stageRef}
              className="relative overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-bg-strong)] shadow-[var(--shadow-panel)]"
              style={{
                width: displayRect.width,
                height: displayRect.height,
              }}
            >
              <CanvasImagePreview
                src={sourceImageUrl}
                alt={sourceLabel || UI_TEXT.title}
                imageAsset={sourceImageAsset}
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />

                <div className="pointer-events-none absolute inset-0 bg-black/38" />

                <div className="pointer-events-none absolute inset-0">
                  {verticalCuts.map((cut, index) => (
                    <button
                      key={`vertical-cut-${index}`}
                      type="button"
                      onPointerDown={(event) => startLineDrag('vertical', index, event)}
                      className="nodrag nopan pointer-events-auto absolute top-0 bottom-0 z-10 w-7 -translate-x-1/2 cursor-col-resize"
                      style={{ left: `${cut * 100}%` }}
                      aria-label={`调整第 ${index + 1} 条纵向切线`}
                    >
                      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-yellow-300/8 blur-[2px]" />
                      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-yellow-950/35" />
                      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-amber-200 shadow-[0_0_4px_rgba(255,232,74,0.42)]" />
                      <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-2 w-2 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-amber-200/90 bg-amber-50 shadow-[0_0_0_1px_rgba(40,35,8,0.2),0_1px_5px_rgba(0,0,0,0.18),0_0_5px_rgba(255,232,74,0.36)]">
                        <span className="h-1 w-1 rounded-full bg-amber-50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.72)]" />
                      </span>
                    </button>
                  ))}

                  {horizontalCuts.map((cut, index) => (
                    <button
                      key={`horizontal-cut-${index}`}
                      type="button"
                      onPointerDown={(event) => startLineDrag('horizontal', index, event)}
                      className="nodrag nopan pointer-events-auto absolute left-0 right-0 z-10 h-7 -translate-y-1/2 cursor-row-resize"
                      style={{ top: `${cut * 100}%` }}
                      aria-label={`调整第 ${index + 1} 条横向切线`}
                    >
                      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-yellow-300/8 blur-[2px]" />
                      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-yellow-950/35" />
                      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-amber-200 shadow-[0_0_4px_rgba(255,232,74,0.42)]" />
                      <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-2 w-2 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-amber-200/90 bg-amber-50 shadow-[0_0_0_1px_rgba(40,35,8,0.2),0_1px_5px_rgba(0,0,0,0.18),0_0_5px_rgba(255,232,74,0.36)]">
                        <span className="h-1 w-1 rounded-full bg-amber-50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.72)]" />
                      </span>
                    </button>
                  ))}
                </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div className="max-w-[260px]">
                <p className="text-sm font-medium text-[var(--text-primary)]">{UI_TEXT.emptyTitle}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{UI_TEXT.emptyDescription}</p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border-subtle)] bg-transparent px-0 pt-1.5">
          <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5">
            <InlineSelect
              value={String(menuColumnCount)}
              options={columnCountOptions}
              ariaLabel={UI_TEXT.columns}
              onChange={setColumnCount}
              stopCanvasGesture={stopCanvasGesture}
            />

            <InlineSelect
              value={String(menuRowCount)}
              options={rowCountOptions}
              ariaLabel={UI_TEXT.rows}
              onChange={setRowCount}
              stopCanvasGesture={stopCanvasGesture}
            />

            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={!sourceImageUrl || isRunning}
              className={`${themeClasses.nodePrimaryButton} nodrag nopan h-8 w-8 shrink-0`}
              data-testid={`run-image-crop-${id}`}
              aria-label={isRunning ? UI_TEXT.running : UI_TEXT.run}
            >
              {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}, areNodeContentPropsEqual)
