import { memo, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Handle, Position, type OnResizeEnd } from '@xyflow/react'
import { Maximize, Upload } from 'lucide-react'
import { CanvasImagePreview } from '@/components/CanvasImagePreview'
import { ZoomableImagePreview } from '@/components/ZoomableImagePreview'
import { importImageFile } from '@/features/imageImport/runtime'
import type { AppNodeProps } from '@/types'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useFeedbackStore } from '@/store/useFeedbackStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { NodeDeleteButton, NodeResizerPreset } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { areNodeContentPropsEqual } from '../nodePropComparators'

type TestImageNodeProps = AppNodeProps<'testImageNode'>

function getStoredImageDimension(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.round(value)
    }
  }

  return 0
}

const UI_TEXT = {
  invalidImage: '请上传图片文件',
  deleteNode: '删除测试图片节点',
  imageNode: '测试图片节点',
  imageFallbackName: '图片',
  replaceImage: '替换图片',
  selectFile: '选择文件',
  dragHint: '或拖放文件到此处',
  pasteHint: '或 Ctrl+V 粘贴',
  supportHint: '支持图片素材',
  uploadFailed: '图片上传失败，请稍后重试',
} as const

export const TestImageNode = memo(function TestImageNode({ id, data, selected }: TestImageNodeProps) {
  const MIN_IMAGE_NODE_WIDTH = 180
  const MIN_IMAGE_NODE_HEIGHT = 180
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const deleteNode = useCanvasStore((s) => s.deleteNode)
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
  const displayImageInfo = data.imageUrl ? storedImageInfo ?? imageInfo : { width: 0, height: 0, name: '' }

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
          resolution: `${importedImage.naturalWidth}x${importedImage.naturalHeight}`,
        })
      })
    } catch (error) {
      notify({ tone: 'error', title: '图片上传失败', message: error instanceof Error ? error.message : UI_TEXT.uploadFailed })
    }
  }, [activeProjectId, id, notify, runTracked, updateNodeData, workspaceConfigured])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void handleFile(file)
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
    if (file) void handleFile(file)
  }

  const handleResizeEnd: OnResizeEnd = useCallback(
    (_event, params) => {
      if (!data.imageUrl || imageInfo.width === 0) return

      const imgAspect = imageInfo.width / imageInfo.height
      const PADDING_X = 12
      const PADDING_Y = 12
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
    [data.imageUrl, id, imageInfo, runTracked, updateNodeData],
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
      if (cancelled) return
      setImageInfo((current) => ({
        width: image.naturalWidth,
        height: image.naturalHeight,
        name: typeof data.name === 'string' && data.name.trim().length > 0 ? data.name : current.name,
      }))
    }
    image.src = data.imageUrl
    return () => { cancelled = true }
  }, [data.imageUrl, data.name, storedImageInfo])

  useEffect(() => {
    if (!selected || data.imageUrl) return

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) void handleFile(file)
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
      if (event.key === 'Escape') setShowPreview(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showPreview])

  const nodeName = typeof data.name === 'string' && data.name.trim() ? data.name : displayImageInfo.name || UI_TEXT.imageNode

  return (
    <>
      <div
        data-testid={`node-${id}`}
        className={getNodeShellClassName({
          selected,
          className: isDragging ? 'bg-violet-400/5 border-violet-400' : '',
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
          <div className="relative flex flex-1 flex-col p-[6px]">
            <span className="pointer-events-none absolute -top-[22px] left-1 select-none whitespace-nowrap text-[11px] font-medium text-[var(--text-muted)]">
              {nodeName}
            </span>
            <div
              className="node-drag-handle flex-1 overflow-hidden rounded-lg"
              onDoubleClick={(event) => {
                event.stopPropagation()
                setShowPreview(true)
              }}
            >
              <CanvasImagePreview
                src={data.imageUrl}
                alt={nodeName}
                imageAsset={data.imageAsset}
                className="h-full w-full object-contain"
                draggable={false}
              />

              {displayImageInfo.width > 0 && (
                <span className="pointer-events-none absolute bottom-3 right-3 select-none whitespace-nowrap rounded-md bg-black/50 px-2 py-1 text-[10px] font-medium leading-none text-white shadow-[0_4px_12px_rgba(0,0,0,0.22)] backdrop-blur-sm">
                  {displayImageInfo.width} x {displayImageInfo.height}
                </span>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="nodrag nopan absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 text-white/60 opacity-0 backdrop-blur-sm transition hover:text-white group-hover:opacity-100"
                title={UI_TEXT.replaceImage}
                aria-label={UI_TEXT.replaceImage}
              >
                <Upload className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="nodrag nopan absolute bottom-2 left-10 flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 text-white/60 opacity-0 backdrop-blur-sm transition hover:text-white group-hover:opacity-100"
                title="放大预览"
                aria-label="放大预览"
              >
                <Maximize className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : (
          <div className="node-drag-handle flex flex-1 flex-col items-center justify-center select-none cursor-default active:cursor-grabbing">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="nodrag nopan mb-3 flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)]"
            >
              <Upload className="h-4 w-4" />
              {UI_TEXT.selectFile}
            </button>
            <p className="mb-1 text-xs text-[var(--text-muted)]">{UI_TEXT.dragHint}</p>
            <p className="mb-1 text-xs text-[var(--text-muted)]">{UI_TEXT.pasteHint}</p>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">{UI_TEXT.supportHint}</p>
          </div>
        )}
      </div>
      {showPreview && data.imageUrl ? (
        <ZoomableImagePreview
          key={data.imageUrl}
          imageUrl={data.imageUrl}
          alt={nodeName}
          closeLabel="关闭预览"
          onClose={() => setShowPreview(false)}
          overlayClassName="bg-black/96"
          closeButtonClassName="border-white/10 bg-black/50 text-white/70 hover:border-white/20 hover:bg-black/70 hover:text-white"
          captionClassName="text-white/70"
        >
          <span className="max-w-[320px] truncate">{nodeName}</span>
          {displayImageInfo.width > 0 ? (
            <>
              <span className="text-white/45">|</span>
              <span>{displayImageInfo.width} x {displayImageInfo.height}</span>
            </>
          ) : null}
        </ZoomableImagePreview>
      ) : null}
    </>
  )
}, areNodeContentPropsEqual)
