import { memo, useCallback, useEffect, useState } from 'react'
import { Handle, Position, useConnection, type OnResizeEnd } from '@xyflow/react'
import { Brush, Check, Clock3, Download, Image as ImageIcon, Loader2, Maximize, Sparkles } from 'lucide-react'
import { CanvasImagePreview } from '@/components/CanvasImagePreview'
import { StableNodeToolbar } from '@/components/StableNodeToolbar'
import { ZoomableImagePreview } from '@/components/ZoomableImagePreview'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useImageEditorStore } from '@/store/useImageEditorStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import type { AppNodeProps } from '@/types'
import { themeClasses } from '@/styles/themeClasses'
import { recordComponentRender } from '@/utils/performanceDiagnostics'
import { downloadMediaAsBlob } from '@/api/image/shared'
import { NodeDeleteButton, NodeEmptyState, NodeResizerPreset, NodeStatusSurface } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { areNodeContentPropsEqual } from '../nodePropComparators'

type GeneratedPreviewNodeProps = AppNodeProps<'generatedPreviewNode'>

const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const UI_TEXT = {
  downloadFailed: '图片下载失败',
  retryLater: '图片下载失败，请稍后重试',
  deletePreviewNode: '删除生成预览节点',
  previewTitle: '生成预览',
  savePreviewImage: '保存预览图片',
  noPreviewImage: '当前没有可保存的预览图片',
  previewImage: '放大预览',
  closePreview: '关闭预览',
  saving: '保存中',
  waitingForResult: '等待生成结果',
  queued: '排队中',
  queuedDescription: '任务已进入全局队列，前面的生成完成后会自动开始。',
  generating: '生成中',
  idleTitle: '空预览组件',
  idleDescription: '手动添加时保持静态展示，连接生成结果后会在这里呈现图像。',
  generateFailed: '生成失败',
} as const

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim()
}

function formatPreviewDate(timestamp: number) {
  const date = new Date(timestamp)
  return [
    `${date.getFullYear()}/${padTimePart(date.getMonth() + 1)}/${padTimePart(date.getDate())}`,
    `${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}`,
  ].join(' ')
}

function padTimePart(value: number) {
  return String(value).padStart(2, '0')
}

function buildDownloadFileName(timestamp: number, extension: string) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = padTimePart(date.getHours())
  const minutes = padTimePart(date.getMinutes())
  const seconds = padTimePart(date.getSeconds())

  return `AIPure ${year}-${month}-${day} ${hours}_${minutes}_${seconds}.${extension}`
}

function formatResolution(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return null
  }

  return `${width}x${height}`
}

function formatModelLabel(model: string, modelName?: string) {
  const normalizedModelName = modelName?.trim()
  if (normalizedModelName) {
    return normalizedModelName
  }

  switch (model.toLowerCase()) {
    case 'gpt-image-1':
      return 'GPT Image 1'
    case 'gpt-image-1-mini':
      return 'GPT Image 1 Mini'
    case 'gpt-image-1.5':
      return 'GPT Image 1.5'
    case 'gpt-image-2':
    case 'gpt-img-2':
      return 'GPT Image 2'
    case 'mj':
      return 'MJ'
    case 'nano-banana-2':
      return 'Nano Banana 2'
    case 'nano-banana-pro':
      return 'Nano Banana Pro'
    case 'qwen-image-2.0-pro':
      return 'Qwen Image 2.0 Pro'
    default:
      return model.toUpperCase()
  }
}

function getPreviewTimestamp(data: GeneratedPreviewNodeProps['data']) {
  return typeof data.createdAt === 'number' && Number.isFinite(data.createdAt) ? data.createdAt : Date.now()
}

function inferMimeType(url: string) {
  if (url.startsWith('data:')) {
    return url.slice(5, url.indexOf(';')) || 'image/png'
  }

  const normalizedUrl = url.toLowerCase()
  if (normalizedUrl.endsWith('.jpg') || normalizedUrl.endsWith('.jpeg')) return 'image/jpeg'
  if (normalizedUrl.endsWith('.webp')) return 'image/webp'
  if (normalizedUrl.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

async function imageUrlToBlob(imageUrl: string) {
  return downloadMediaAsBlob(imageUrl, UI_TEXT.downloadFailed)
}

function fallbackDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

function getAppliedImageNodeSize(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return { width: 320, height: 260 }
  }

  const maxSize = 500
  const minSize = 100
  const aspectRatio = width / height
  let contentWidth: number
  let contentHeight: number

  if (width >= height) {
    contentWidth = maxSize
    contentHeight = maxSize / aspectRatio
  } else {
    contentHeight = maxSize
    contentWidth = maxSize * aspectRatio
  }

  if (contentWidth < minSize) {
    contentWidth = minSize
    contentHeight = minSize / aspectRatio
  }
  if (contentHeight < minSize) {
    contentHeight = minSize
    contentWidth = minSize * aspectRatio
  }

  return {
    width: Math.round(contentWidth + 12),
    height: Math.round(contentHeight + 12),
  }
}

const NODE_TOOLBAR_CLASS_NAME = `nodrag nopan flex items-center gap-1 p-[5px] ${themeClasses.nodeToolbarPanel}`
const NODE_TOOLBAR_BUTTON_CLASS_NAME = `${themeClasses.nodeToolbarButton} h-7 w-7`

export const GeneratedPreviewNode = memo(function GeneratedPreviewNode({ id, data, selected, dragging }: GeneratedPreviewNodeProps) {
  recordComponentRender('GeneratedPreviewNode')
  const deleteNode = useCanvasStore((s) => s.deleteNode)
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const openImageEditor = useImageEditorStore((s) => s.open)
  const modelName = useSettingsStore((s) => s.getModelConfig(data.model)?.name)
  const beginTransaction = useHistoryStore((s) => s.beginTransaction)
  const runTracked = useHistoryStore((s) => s.runTracked)
  const connection = useConnection()
  const isConnecting = connection.inProgress && connection.fromNode?.id === id
  const hasImage = Boolean(data.imageUrl)
  const isQueued = data.status === 'queued'
  const isGenerating = data.status === 'generating'
  const isError = data.status === 'error'
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const previewTimestamp = getPreviewTimestamp(data)
  const previewDate = formatPreviewDate(previewTimestamp)
  const actualResolution = formatResolution(data.imageWidth, data.imageHeight)
  const previewMetaParts = [formatModelLabel(data.model, modelName)]
  const apiProfileName = typeof data.apiProfileName === 'string' ? data.apiProfileName.trim() : ''

  const handleResizeEnd: OnResizeEnd = useCallback(
    (_event, params: { x: number; y: number; width: number; height: number }) => {
      if (!data.imageUrl || data.imageWidth <= 0 || data.imageHeight <= 0) {
        return
      }

      const imageAspect = data.imageWidth / data.imageHeight
      const PADDING_X = 12
      const PADDING_Y = 12
      const minContentWidth = 260 - PADDING_X
      const minNodeHeight = 200
      const contentWidth = Math.max(params.width - PADDING_X, minContentWidth)
      const contentHeight = Math.round(contentWidth / imageAspect)
      const nextHeight = Math.max(contentHeight + PADDING_Y, minNodeHeight)

      useCanvasStore.getState().updateNodeData(id, {
        width: Math.round(contentWidth) + PADDING_X,
        height: nextHeight,
      })
    },
    [data.imageHeight, data.imageUrl, data.imageWidth, id],
  )

  previewMetaParts.push(previewDate)
  if (apiProfileName) {
    previewMetaParts.splice(1, 0, apiProfileName)
  }

  const previewMeta = previewMetaParts.join(' / ')
  const nodeTitle = hasImage ? previewMeta : UI_TEXT.previewTitle

  useEffect(() => {
    if (!showPreview) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowPreview(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showPreview])

  const handleSaveImage = async () => {
    if (!data.imageUrl || isSaving) {
      return
    }

    setIsSaving(true)
    setSaveError('')

    try {
      const blob = await imageUrlToBlob(data.imageUrl)
      const mimeType = blob.type || data.imageAsset?.mimeType || inferMimeType(data.imageUrl)
      const extension = IMAGE_MIME_EXTENSIONS[mimeType] || 'png'
      const fileName = sanitizeFileName(buildDownloadFileName(Date.now(), extension))
      fallbackDownload(blob, fileName)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : UI_TEXT.retryLater)
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpenImageEditor = useCallback(() => {
    if (!data.imageUrl) {
      return
    }

    openImageEditor({
      nodeId: id,
      nodeType: 'generatedPreviewNode',
      imageUrl: data.imageUrl,
      imageAsset: data.imageAsset ?? null,
      title: nodeTitle,
      sourceImageNodeId: data.sourceImageNodeId ?? null,
    })
  }, [data.imageAsset, data.imageUrl, data.sourceImageNodeId, id, nodeTitle, openImageEditor])

  const handleApplyToSourceImage = useCallback(() => {
    if (!data.imageUrl || !data.sourceImageNodeId) {
      return
    }

    runTracked(() => {
      const sourceNode = useCanvasStore.getState().nodes.find((node) => node.id === data.sourceImageNodeId)
      if (sourceNode?.type !== 'imageNode') {
        return
      }

      updateNodeData(sourceNode.id, {
        imageUrl: data.imageUrl,
        imageAsset: data.imageAsset ?? null,
        name: nodeTitle,
        imageNaturalWidth: data.imageWidth,
        imageNaturalHeight: data.imageHeight,
        ...getAppliedImageNodeSize(data.imageWidth, data.imageHeight),
      })
    })
  }, [data.imageAsset, data.imageHeight, data.imageUrl, data.imageWidth, data.sourceImageNodeId, nodeTitle, runTracked, updateNodeData])

  const imageMeta = actualResolution
  const canApplyToSourceImage = hasImage
    && data.originOperation === 'image-edit'
    && typeof data.sourceImageNodeId === 'string'
    && data.sourceImageNodeId.length > 0

  return (
    <>
      {selected ? <StableNodeToolbar isVisible={!dragging && hasImage ? undefined : false} position={Position.Top} offset={10}>
        <div className={NODE_TOOLBAR_CLASS_NAME}>
          <button
            type="button"
            onClick={handleSaveImage}
            disabled={isSaving}
            className={NODE_TOOLBAR_BUTTON_CLASS_NAME}
            aria-label={UI_TEXT.savePreviewImage}
            title={UI_TEXT.savePreviewImage}
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className={NODE_TOOLBAR_BUTTON_CLASS_NAME}
            aria-label={UI_TEXT.previewImage}
            title={UI_TEXT.previewImage}
          >
            <Maximize className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleOpenImageEditor}
            className={NODE_TOOLBAR_BUTTON_CLASS_NAME}
            aria-label="编辑图片"
            title="编辑图片"
          >
            <Brush className="h-3.5 w-3.5" />
          </button>
          {canApplyToSourceImage ? (
            <button
              type="button"
              onClick={handleApplyToSourceImage}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent bg-transparent text-[var(--text-secondary)] transition hover:border-emerald-400/25 hover:bg-emerald-400/10 hover:text-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/20"
              aria-label="应用回原图"
              title="应用回原图"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </StableNodeToolbar> : null}
      <div
        data-testid={`node-${id}`}
        className={getNodeShellClassName({ selected })}
      >
        <NodeDeleteButton
          id={id}
          selected={selected}
          ariaLabel={UI_TEXT.deletePreviewNode}
          onDelete={() => runTracked(() => deleteNode(id))}
        />

        <NodeResizerPreset
          selected={selected}
          minWidth={260}
          minHeight={200}
          maxWidth={900}
          maxHeight={900}
          onResizeStart={hasImage ? beginTransaction : undefined}
          onResizeEnd={hasImage ? handleResizeEnd : undefined}
          hideVisuals
        />

        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0 !z-30"
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
          id="output"
          className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0 !z-30"
        >
          <span className={`handle-orb handle-orb--source ${isConnecting ? 'is-connecting' : ''}`}>
            <span className="handle-orb__glow" />
            <span className="handle-orb__ring" />
            <span className="handle-orb__dot" />
          </span>
        </Handle>

        <div className="relative flex min-h-0 flex-1 flex-col p-[6px]">
          <span className="pointer-events-none absolute -top-[22px] left-1 flex select-none items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-[var(--text-secondary)]">
            <ImageIcon className="h-3 w-3 text-violet-500" aria-hidden="true" />
            {nodeTitle}
          </span>

          <div
            className={`node-drag-handle relative flex min-h-0 flex-1 overflow-hidden rounded-lg ${
              hasImage
                ? ''
                : 'border border-[var(--border-subtle)] bg-[var(--control-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]'
            }`}
          >
            {hasImage ? (
              <div
                className="relative h-full w-full overflow-hidden rounded-lg"
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  setShowPreview(true)
                }}
              >
                <CanvasImagePreview
                  src={data.imageUrl}
                  alt={nodeTitle}
                  imageAsset={data.imageAsset}
                  className="h-full w-full rounded-lg object-contain"
                  draggable={false}
                />

                {imageMeta ? (
                  <span className="pointer-events-none absolute bottom-3 right-3 select-none whitespace-nowrap rounded-md bg-black/50 px-2 py-1 text-[10px] font-medium leading-none text-white shadow-[0_4px_12px_rgba(0,0,0,0.22)] backdrop-blur-sm">
                    {imageMeta}
                  </span>
                ) : null}
              </div>
            ) : isError ? (
              <NodeStatusSurface
                tone="red"
                icon={<Sparkles className="h-5 w-5" />}
                title={UI_TEXT.generateFailed}
                description={data.errorMsg || UI_TEXT.retryLater}
                className="border-0 bg-transparent"
              />
            ) : isQueued ? (
              <NodeStatusSurface
                tone="amber"
                icon={<Clock3 className="h-5 w-5" />}
                title={UI_TEXT.queued}
                description={UI_TEXT.queuedDescription}
                className="border-0 bg-transparent"
              />
            ) : isGenerating ? (
              <>
                <div className="preview-generating-surface absolute inset-0 overflow-hidden rounded-lg">
                  <div className="preview-grid-overlay absolute inset-0" />
                  <div className="preview-aurora preview-aurora-a absolute -left-12 top-[-10%] h-44 w-44" />
                  <div className="preview-aurora preview-aurora-b absolute right-[-8%] top-[16%] h-40 w-40" />
                  <div className="preview-aurora preview-aurora-c absolute left-[18%] bottom-[-18%] h-48 w-48" />
                  <div className="preview-wave absolute inset-x-[-14%] top-[18%] h-24" />
                  <div className="preview-wave preview-wave-delayed absolute inset-x-[-18%] bottom-[16%] h-28" />
                  <div className="preview-flow-sheen absolute inset-y-[-16%] left-[-30%] w-[58%]" />
                  <div className="preview-core-glow absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div className="preview-vignette absolute inset-0 rounded-lg" />
                <div className="relative z-10 flex flex-1 items-center justify-center">
                  <div className="rounded-full border border-violet-400/30 bg-[var(--panel-bg)] px-3 py-1 text-[11px] font-medium text-violet-500 backdrop-blur">
                    {UI_TEXT.generating}
                  </div>
                </div>
              </>
            ) : (
              <NodeEmptyState
                tone="violet"
                icon={<Sparkles className="h-5 w-5" />}
                title={UI_TEXT.idleTitle}
                description={UI_TEXT.idleDescription}
                className="border-0 bg-transparent"
              />
            )}
          </div>

          {saveError && (
            <p className="mt-2 px-1 text-[11px] leading-5 text-amber-300">
              {saveError}
            </p>
          )}
        </div>
      </div>
      {showPreview && data.imageUrl ? (
        <ZoomableImagePreview
          key={data.imageUrl}
          imageUrl={data.imageUrl}
          alt={nodeTitle}
          closeLabel={UI_TEXT.closePreview}
          onClose={() => setShowPreview(false)}
        >
          <span className="max-w-[320px] truncate">{nodeTitle}</span>
          {imageMeta ? (
            <>
              <span className="text-white/35">|</span>
              <span>{imageMeta}</span>
            </>
          ) : null}
        </ZoomableImagePreview>
      ) : null}
    </>
  )
}, areNodeContentPropsEqual)
