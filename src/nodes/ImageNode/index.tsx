import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { useMemo } from 'react'
import { Handle, Position, type OnResizeEnd } from '@xyflow/react'
import { Brush, Image as ImageIcon, Maximize, Upload } from 'lucide-react'
import { importImageFile } from '@/features/imageImport/runtime'
import type { AppNodeProps } from '@/types'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useFeedbackStore } from '@/store/useFeedbackStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useImageEditorStore } from '@/store/useImageEditorStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { CanvasImagePreview } from '@/components/CanvasImagePreview'
import { StableNodeToolbar } from '@/components/StableNodeToolbar'
import { ZoomableImagePreview } from '@/components/ZoomableImagePreview'
import { themeClasses } from '@/styles/themeClasses'
import { recordComponentRender } from '@/utils/performanceDiagnostics'
import { NodeDeleteButton, NodeEmptyState, NodeResizerPreset } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { areNodeContentPropsEqual } from '../nodePropComparators'

type ImageNodeProps = AppNodeProps<'imageNode'>

const UI_TEXT = {
  invalidImage: '请上传图片文件',
  deleteNode: '删除图片节点',
  imageNode: '图片组件',
  imageFallbackName: '图片',
  replaceImage: '替换图片',
  previewImage: '放大预览',
  closePreview: '关闭预览',
  selectFile: '选择文件',
  dragHint: '或拖放文件到此处',
  pasteHint: '或 Ctrl+V 粘贴',
  supportHint: '支持图片素材',
  uploadFailed: '图片上传失败，请稍后重试',
} as const

const NODE_TOOLBAR_CLASS_NAME = `nodrag nopan flex items-center gap-1 p-[5px] ${themeClasses.nodeToolbarPanel}`
const NODE_TOOLBAR_BUTTON_CLASS_NAME = `${themeClasses.nodeToolbarButton} h-7 w-7`
const IMAGE_NODE_CONTENT_PADDING = 3

function getStoredImageDimension(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.round(value)
    }
  }

  return 0
}

export const ImageNode = memo(function ImageNode({ id, data, selected, dragging }: ImageNodeProps) {
  recordComponentRender('ImageNode')
  const MIN_IMAGE_NODE_WIDTH = 180
  const MIN_IMAGE_NODE_HEIGHT = 180
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const deleteNode = useCanvasStore((s) => s.deleteNode)
  const openImageEditor = useImageEditorStore((s) => s.open)
  const beginTransaction = useHistoryStore((s) => s.beginTransaction)
  const runTracked = useHistoryStore((s) => s.runTracked)
  const workspaceConfigured = useSettingsStore((s) => s.runtime.workspaceConfigured)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const notify = useFeedbackStore((s) => s.notify)
  const [isDragging, setIsDragging] = useState(false)
  const [imageInfo, setImageInfo] = useState({ width: 0, height: 0, name: '' })
  const [showPreview, setShowPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const storedImageInfo = useMemo(() => {
    const width = getStoredImageDimension(
      data.imageAsset?.originalWidth,
      data.imageNaturalWidth,
      data.imageWidth,
    )
    const height = getStoredImageDimension(
      data.imageAsset?.originalHeight,
      data.imageNaturalHeight,
      data.imageHeight,
    )

    if (width <= 0 || height <= 0) {
      return null
    }

    return {
      width,
      height,
      name: typeof data.name === 'string' && data.name.trim().length > 0 ? data.name : '',
    }
  }, [
    data.imageAsset?.originalHeight,
    data.imageAsset?.originalWidth,
    data.imageHeight,
    data.imageNaturalHeight,
    data.imageNaturalWidth,
    data.imageWidth,
    data.name,
  ])

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      notify({ tone: 'warning', title: '无法上传文件', message: UI_TEXT.invalidImage })
      return
    }

    try {
      const importedImage = await importImageFile(file, workspaceConfigured, activeProjectId)

      setImageInfo({
        width: importedImage.naturalWidth,
        height: importedImage.naturalHeight,
        name: importedImage.name,
      })

      runTracked(() => {
        updateNodeData(id, {
          imageUrl: importedImage.imageUrl,
          imageAsset: importedImage.imageAsset,
          name: importedImage.name,
          imageNaturalWidth: importedImage.naturalWidth,
          imageNaturalHeight: importedImage.naturalHeight,
          width: importedImage.width,
          height: importedImage.height,
        })
      })
    } catch (error) {
      notify({ tone: 'error', title: '图片上传失败', message: error instanceof Error ? error.message : UI_TEXT.uploadFailed })
    }
  }, [activeProjectId, id, notify, runTracked, updateNodeData, workspaceConfigured])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      void handleFile(file)
    }
    event.target.value = ''
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) {
      void handleFile(file)
    }
  }

  const effectiveImageInfo = useMemo(
    () => data.imageUrl ? storedImageInfo ?? imageInfo : { width: 0, height: 0, name: '' },
    [data.imageUrl, imageInfo, storedImageInfo],
  )

  const handleResizeEnd: OnResizeEnd = useCallback(
    (_event, params) => {
      if (!data.imageUrl || effectiveImageInfo.width === 0) return

      const imgAspect = effectiveImageInfo.width / effectiveImageInfo.height
      const PADDING_X = IMAGE_NODE_CONTENT_PADDING * 2
      const PADDING_Y = IMAGE_NODE_CONTENT_PADDING * 2
      const contentW = Math.max(Math.round(params.width - PADDING_X), MIN_IMAGE_NODE_WIDTH - PADDING_X)
      const contentH = Math.round(contentW / imgAspect)
      const nextHeight = Math.max(contentH + PADDING_Y, MIN_IMAGE_NODE_HEIGHT)

      runTracked(() => {
        updateNodeData(id, {
          width: contentW + PADDING_X,
          height: nextHeight,
        })
      })
    },
    [data.imageUrl, effectiveImageInfo, id, runTracked, updateNodeData],
  )

  useEffect(() => {
    if (!data.imageUrl) {
      return
    }

    if (storedImageInfo) {
      return
    }

    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled) {
        return
      }
      setImageInfo((current) => ({
        width: image.naturalWidth,
        height: image.naturalHeight,
        name: typeof data.name === 'string' && data.name.trim().length > 0 ? data.name : current.name,
      }))
    }
    image.src = data.imageUrl
    return () => {
      cancelled = true
    }
  }, [data.imageUrl, data.name, storedImageInfo])

  useEffect(() => {
    if (!selected || data.imageUrl) return

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            void handleFile(file)
          }
          break
        }
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [data.imageUrl, handleFile, selected])

  useEffect(() => {
    if (!showPreview) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowPreview(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showPreview])

  const nodeName = typeof data.name === 'string' && data.name.trim()
    ? data.name
    : effectiveImageInfo.name || UI_TEXT.imageFallbackName
  const handleOpenImageEditor = useCallback(() => {
    if (!data.imageUrl) {
      return
    }

    openImageEditor({
      nodeId: id,
      nodeType: 'imageNode',
      imageUrl: data.imageUrl,
      imageAsset: data.imageAsset ?? null,
      title: nodeName,
    })
  }, [data.imageAsset, data.imageUrl, id, nodeName, openImageEditor])

  return (
    <>
      {selected ? <StableNodeToolbar isVisible={!dragging && Boolean(data.imageUrl) ? undefined : false} position={Position.Top} offset={10}>
        <div className={NODE_TOOLBAR_CLASS_NAME}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={NODE_TOOLBAR_BUTTON_CLASS_NAME}
            aria-label={UI_TEXT.replaceImage}
            title={UI_TEXT.replaceImage}
          >
            <Upload className="h-3.5 w-3.5" />
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
        </div>
      </StableNodeToolbar> : null}
      <div
        data-testid={`node-${id}`}
        className={getNodeShellClassName({
          selected,
          className: isDragging ? 'border-violet-400 bg-violet-400/5' : '',
        })}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <NodeDeleteButton
          id={id}
          selected={selected}
          ariaLabel={UI_TEXT.deleteNode}
          onDelete={() => runTracked(() => deleteNode(id))}
        />

        <NodeResizerPreset
          selected={selected}
          minWidth={MIN_IMAGE_NODE_WIDTH}
          minHeight={MIN_IMAGE_NODE_HEIGHT}
          maxWidth={800}
          maxHeight={800}
          keepAspectRatio={Boolean(data.imageUrl)}
          onResizeStart={data.imageUrl ? beginTransaction : undefined}
          onResizeEnd={data.imageUrl ? handleResizeEnd : undefined}
          hideVisuals
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0 !z-30"
        >
          <span className="handle-orb">
            <span className="handle-orb__glow" />
            <span className="handle-orb__ring" />
            <span className="handle-orb__dot" />
          </span>
        </Handle>

        {data.imageUrl ? (
          <div className="relative flex flex-1 flex-col p-[3px]">
            <span className="pointer-events-none absolute -top-[22px] left-1 flex select-none items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-[var(--text-secondary)]">
              <ImageIcon className="h-3 w-3 text-violet-500" aria-hidden="true" />
              {nodeName}
            </span>
            <div
              className="node-drag-handle flex-1 overflow-hidden rounded-[9px] bg-[var(--node-bg)] [backface-visibility:hidden] [clip-path:inset(0_round_9px)] [transform:translateZ(0)]"
              onDoubleClick={(event) => {
                event.stopPropagation()
                setShowPreview(true)
              }}
            >
              <CanvasImagePreview
                src={data.imageUrl}
                alt={nodeName}
                imageAsset={data.imageAsset}
                className="h-full w-full rounded-[inherit] object-contain [backface-visibility:hidden] [transform:translateZ(0)]"
                draggable={false}
              />

              {effectiveImageInfo.width > 0 && (
                <span className="pointer-events-none absolute bottom-3 right-3 select-none whitespace-nowrap rounded-md bg-black/50 px-2 py-1 text-[10px] font-medium leading-none text-white shadow-[0_4px_12px_rgba(0,0,0,0.22)] backdrop-blur-sm">
                  {effectiveImageInfo.width} x {effectiveImageInfo.height}
                </span>
              )}

            </div>
          </div>
        ) : (
          <NodeEmptyState
            tone="violet"
            className="!border-transparent !bg-transparent"
            icon={<Upload className="h-5 w-5" />}
            title={UI_TEXT.selectFile}
            description={(
              <>
                {UI_TEXT.dragHint}
                <br />
                {UI_TEXT.pasteHint} · {UI_TEXT.supportHint}
              </>
            )}
            action={(
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-violet-400/25 bg-violet-400/10 px-3 text-sm font-medium text-violet-500 transition hover:border-violet-400/40 hover:bg-violet-400/14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/25"
            >
              <Upload className="h-4 w-4" />
              {UI_TEXT.selectFile}
            </button>
            )}
          />
        )}
      </div>
      {showPreview && data.imageUrl ? (
        <ZoomableImagePreview
          key={data.imageUrl}
          imageUrl={data.imageUrl}
          alt={nodeName}
          closeLabel={UI_TEXT.closePreview}
          onClose={() => setShowPreview(false)}
        >
          <span className="max-w-[320px] truncate">{nodeName}</span>
          {effectiveImageInfo.width > 0 ? (
            <>
              <span className="text-white/35">|</span>
              <span>{effectiveImageInfo.width} x {effectiveImageInfo.height}</span>
            </>
          ) : null}
        </ZoomableImagePreview>
      ) : null}
    </>
  )
}, areNodeContentPropsEqual)
