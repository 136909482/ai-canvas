import type { CSSProperties, PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { Handle, Position } from '@xyflow/react'
import { ArrowLeftRight, Columns2, Eye, EyeOff, MousePointerClick } from 'lucide-react'
import { CanvasImagePreview } from '@/components/CanvasImagePreview'
import { getCanvasNodeById } from '@/store/canvasConnectionSources'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { themeClasses } from '@/styles/themeClasses'
import { getWorkspaceAssetThumbnailRelativePath } from '@/utils/workspaceImageAsset'
import { isImageSourceNodeType, type AppNodeProps, type CompareImageSlot, type CompareMode, type WorkspaceImageAsset } from '@/types'
import { recordComponentRender } from '@/utils/performanceDiagnostics'
import { useShallow } from 'zustand/react/shallow'
import { NodeDeleteButton, NodeHeader, NodeResizerPreset } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { areNodeContentPropsEqual } from '../nodePropComparators'

type CompareNodeProps = AppNodeProps<'compareNode'>

type CompareImageSource = {
  slot: CompareImageSlot
  imageUrl: string | null
  label: string
  thumbnailRelativePath?: string
}

const COMPARE_IMAGE_KEY_SEPARATOR = '\u0000'

function encodeCompareImageSource(source: CompareImageSource) {
  return [
    source.slot,
    source.imageUrl ?? '',
    source.label,
    source.thumbnailRelativePath ?? '',
  ].join(COMPARE_IMAGE_KEY_SEPARATOR)
}

function decodeCompareImageSource(key: string, fallbackSlot: CompareImageSlot): CompareImageSource {
  const [slot, imageUrl = '', label = slotLabel(fallbackSlot), thumbnailRelativePath = ''] = key.split(COMPARE_IMAGE_KEY_SEPARATOR)
  return {
    slot: slot === 'image2' ? 'image2' : 'image1',
    imageUrl: imageUrl || null,
    label,
    thumbnailRelativePath: thumbnailRelativePath || undefined,
  }
}

function buildCompareImageAsset(source: CompareImageSource): WorkspaceImageAsset | null {
  return source.thumbnailRelativePath
    ? {
        relativePath: '',
        mimeType: '',
        fileName: '',
        thumbnailRelativePath: source.thumbnailRelativePath,
      }
    : null
}

const UI_TEXT = {
  deleteNode: '删除图片对比节点',
  title: '图片对比',
  sliderMode: '滑块',
  toggleMode: '切换',
  image1: '图1',
  image2: '图2',
  emptyTitle: '连接两张图片开始对比',
  emptyDescription: '左侧上方接图1，左侧下方接图2。支持原图和生成图做前后对比。',
  missingImage1: '等待连接图1',
  missingImage2: '等待连接图2',
  sliderLabel: '对比滑块',
} as const

function clampSliderPosition(value: number) {
  if (Number.isNaN(value)) {
    return 50
  }

  return Math.min(100, Math.max(0, value))
}

function slotLabel(slot: CompareImageSlot) {
  return slot === 'image1' ? UI_TEXT.image1 : UI_TEXT.image2
}

export const CompareNode = memo(function CompareNode({ id, data, selected }: CompareNodeProps) {
  recordComponentRender('CompareNode')
  const connectedImageKeys = useCanvasStore(
    useShallow((s) => {
      const bySlot = new Map<CompareImageSlot, CompareImageSource>()

      for (const edge of s.edges) {
        if (edge.target !== id || (edge.targetHandle !== 'image1' && edge.targetHandle !== 'image2')) {
          continue
        }

        const sourceNode = getCanvasNodeById(s.nodes, edge.source)
        if (!sourceNode || !isImageSourceNodeType(sourceNode.type)) {
          continue
        }

        const imageUrl = typeof sourceNode.data?.imageUrl === 'string' ? sourceNode.data.imageUrl : null
        const label = typeof sourceNode.data?.label === 'string'
          ? sourceNode.data.label
          : typeof sourceNode.data?.name === 'string' && sourceNode.data.name.trim()
            ? sourceNode.data.name
            : typeof sourceNode.data?.prompt === 'string' && sourceNode.data.prompt.trim()
              ? sourceNode.data.prompt
              : sourceNode.id
        const thumbnailRelativePath = getWorkspaceAssetThumbnailRelativePath(sourceNode.data?.imageAsset)

        bySlot.set(edge.targetHandle, {
          slot: edge.targetHandle,
          imageUrl,
          label,
          thumbnailRelativePath,
        })
      }

      return [
        encodeCompareImageSource(bySlot.get('image1') ?? { slot: 'image1', imageUrl: null, label: UI_TEXT.image1 }),
        encodeCompareImageSource(bySlot.get('image2') ?? { slot: 'image2', imageUrl: null, label: UI_TEXT.image2 }),
      ]
    }),
  )
  const { updateNodeData, deleteNode } = useCanvasStore(
    useShallow((s) => ({
      updateNodeData: s.updateNodeData,
      deleteNode: s.deleteNode,
    })),
  )
  const runTracked = useHistoryStore((s) => s.runTracked)

  const connectedImages = useMemo(() => {
    return {
      image1: decodeCompareImageSource(connectedImageKeys[0] ?? '', 'image1'),
      image2: decodeCompareImageSource(connectedImageKeys[1] ?? '', 'image2'),
    }
  }, [connectedImageKeys])

  const stopCanvasGesture = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

  const stageRef = useRef<HTMLDivElement | null>(null)

  const mode = data.mode === 'toggle' ? 'toggle' : 'slider'
  const activeSlot: CompareImageSlot = data.activeSlot === 'image2' ? 'image2' : 'image1'
  const sliderPosition = clampSliderPosition(typeof data.sliderPosition === 'number' ? data.sliderPosition : 50)
  const liveSliderPositionRef = useRef(sliderPosition)
  const hasImage1 = Boolean(connectedImages.image1.imageUrl)
  const hasImage2 = Boolean(connectedImages.image2.imageUrl)
  const hasBothImages = hasImage1 && hasImage2
  const activeImage = activeSlot === 'image2' ? connectedImages.image2 : connectedImages.image1

  const setMode = (nextMode: CompareMode) => {
    runTracked(() => updateNodeData(id, { mode: nextMode }))
  }

  const setActiveSlot = (slot: CompareImageSlot) => {
    runTracked(() => updateNodeData(id, { activeSlot: slot }))
  }

  const toggleActiveSlot = () => {
    setActiveSlot(activeSlot === 'image1' ? 'image2' : 'image1')
  }

  const handleTogglePreview = (event: SyntheticEvent) => {
    stopCanvasGesture(event)
    if (!hasBothImages) {
      return
    }
    toggleActiveSlot()
  }

  const updateStageSliderPosition = useCallback((value: number) => {
    const nextValue = clampSliderPosition(value)
    liveSliderPositionRef.current = nextValue
    stageRef.current?.style.setProperty('--compare-slider-position', `${nextValue}%`)
  }, [])

  useEffect(() => {
    updateStageSliderPosition(sliderPosition)
  }, [sliderPosition, updateStageSliderPosition])

  const commitSliderPosition = useCallback(() => {
    const nextValue = clampSliderPosition(liveSliderPositionRef.current)
    if (nextValue !== sliderPosition) {
      runTracked(() => updateNodeData(id, { sliderPosition: nextValue }))
    }
  }, [id, runTracked, sliderPosition, updateNodeData])

  const getSliderPositionFromClientX = useCallback((clientX: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) {
      return 50
    }

    return clampSliderPosition(((clientX - rect.left) / rect.width) * 100)
  }, [])

  const handleSliderPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    stopCanvasGesture(event)
    updateStageSliderPosition(getSliderPositionFromClientX(event.clientX))
  }

  return (
    <div data-testid={`node-${id}`} className={getNodeShellClassName({ selected })}>
      <NodeDeleteButton
        id={id}
        selected={selected}
        ariaLabel={UI_TEXT.deleteNode}
        onDelete={() => runTracked(() => deleteNode(id))}
      />

      <NodeResizerPreset
        selected={selected}
        minWidth={320}
        minHeight={260}
        maxWidth={960}
        maxHeight={760}
        hideVisuals
      />

      <Handle
        type="target"
        position={Position.Left}
        id="image1"
        style={{ top: '32%' }}
        className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0"
      >
        <span className="handle-orb handle-orb--target">
          <span className="handle-orb__glow" />
          <span className="handle-orb__ring" />
          <span className="handle-orb__dot" />
        </span>
      </Handle>

      <Handle
        type="target"
        position={Position.Left}
        id="image2"
        style={{ top: '70%' }}
        className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0"
      >
        <span className="handle-orb handle-orb--target">
          <span className="handle-orb__glow" />
          <span className="handle-orb__ring" />
          <span className="handle-orb__dot" />
        </span>
      </Handle>

      <NodeHeader
        icon={<ArrowLeftRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
        title={UI_TEXT.title}
        right={(
          <div className="nodrag nopan flex items-center gap-1" onPointerDown={stopCanvasGesture} onMouseDown={stopCanvasGesture}>
            <button
              type="button"
              onClick={(event) => {
                stopCanvasGesture(event)
                setMode('slider')
              }}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition ${
                mode === 'slider' ? themeClasses.nodeSegmentButtonActive : themeClasses.nodeSegmentButton
              }`}
              title={UI_TEXT.sliderMode}
            >
              <Columns2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                stopCanvasGesture(event)
                setMode('toggle')
              }}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition ${
                mode === 'toggle' ? themeClasses.nodeSegmentButtonActive : themeClasses.nodeSegmentButton
              }`}
              title={UI_TEXT.toggleMode}
            >
              <MousePointerClick className="h-3 w-3" />
            </button>
          </div>
        )}
      />

      <div className="flex min-h-0 flex-1 flex-col p-2">
        <div
          ref={stageRef}
          className={`relative min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--control-bg)] ${
            mode === 'slider' && hasBothImages ? 'nodrag nopan select-none' : ''
          }`}
          style={{ '--compare-slider-position': `${sliderPosition}%` } as CSSProperties}
          onPointerMove={mode === 'slider' && hasBothImages ? handleSliderPointerMove : undefined}
          onPointerDown={mode === 'slider' && hasBothImages ? handleSliderPointerMove : undefined}
          onPointerLeave={mode === 'slider' && hasBothImages ? commitSliderPosition : undefined}
        >
          {!hasImage1 && !hasImage2 ? (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{UI_TEXT.emptyTitle}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{UI_TEXT.emptyDescription}</p>
              </div>
            </div>
          ) : mode === 'slider' && hasBothImages ? (
            <>
              <CanvasImagePreview
                src={connectedImages.image2.imageUrl ?? ''}
                alt={UI_TEXT.image2}
                imageAsset={buildCompareImageAsset(connectedImages.image2)}
                className="absolute inset-0 h-full w-full object-contain"
                draggable={false}
              />
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: 'inset(0 calc(100% - var(--compare-slider-position)) 0 0)' }}
              >
                <CanvasImagePreview
                  src={connectedImages.image1.imageUrl ?? ''}
                  alt={UI_TEXT.image1}
                  imageAsset={buildCompareImageAsset(connectedImages.image1)}
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              </div>
              <div
                className="pointer-events-none absolute inset-y-0 w-px bg-[var(--accent-violet-strong)] shadow-[0_0_0_1px_var(--accent-violet-soft),0_0_18px_var(--accent-violet-glow)]"
                style={{ left: 'var(--compare-slider-position)' }}
              />
            </>
          ) : (
            <div
              className={`relative h-full w-full ${hasBothImages ? 'cursor-pointer' : ''}`}
              onClick={hasBothImages ? handleTogglePreview : undefined}
              onPointerDown={hasBothImages ? stopCanvasGesture : undefined}
            >
              {activeImage.imageUrl ? (
                <CanvasImagePreview
                  src={activeImage.imageUrl}
                  alt={slotLabel(activeSlot)}
                  imageAsset={buildCompareImageAsset(activeImage)}
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-xs text-[var(--text-muted)]">
                  {activeSlot === 'image1' ? UI_TEXT.missingImage1 : UI_TEXT.missingImage2}
                </div>
              )}

              {hasBothImages ? (
                <button
                  type="button"
                  onPointerDown={stopCanvasGesture}
                  onClick={handleTogglePreview}
                  className="nodrag nopan absolute bottom-3 right-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--panel-bg-strong)] text-[var(--text-secondary)] shadow-[var(--shadow-panel)] backdrop-blur transition hover:border-[var(--accent-violet-muted)] hover:bg-[var(--accent-violet-soft)] hover:text-[var(--accent-violet-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-violet-soft)]"
                  aria-label="切换查看"
                  title="切换查看"
                >
                  {activeSlot === 'image1' ? (
                    <Eye className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  ) : (
                    <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  )}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}, areNodeContentPropsEqual)
