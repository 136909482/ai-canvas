import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Globe, Maximize, RotateCw, Upload } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { importImageFile } from '@/features/imageImport/runtime'
import { StableNodeToolbar } from '@/components/StableNodeToolbar'
import { getCanvasNodeById } from '@/store/canvasConnectionSources'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useFeedbackStore } from '@/store/useFeedbackStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { themeClasses } from '@/styles/themeClasses'
import { isImageSourceNodeType, type AppNodeProps } from '@/types'
import { recordComponentRender } from '@/utils/performanceDiagnostics'
import { NodeDeleteButton, NodeEmptyState, NodeResizerPreset } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { areNodeContentPropsEqual } from '../nodePropComparators'
import type { PanoramaViewerHandle } from './PanoramaViewer'

type PanoramaNodeProps = AppNodeProps<'panoramaNode'>

const UI_TEXT = {
  deleteNode: '删除全景节点',
  title: '全景图片',
  emptyTitle: '上传 360° 全景图',
  emptyDescription: '拖入或点击上传 360° 全景图（建议 2:1 等距矩形）',
  selectFile: '选择文件',
  uploadFailed: '图片上传失败，请稍后重试',
  invalidImage: '请上传图片文件',
  replace: '替换图片',
  toggleAutoRotate: '自动旋转',
  fullscreen: '全屏查看',
  pasteHint: '或 Ctrl+V 粘贴',
} as const

const NODE_TOOLBAR_CLASS_NAME = `nodrag nopan flex items-center gap-1 p-[5px] ${themeClasses.nodeToolbarPanel}`
const NODE_TOOLBAR_BUTTON_CLASS_NAME = `${themeClasses.nodeToolbarButton} h-7 w-7`
const PanoramaViewer = lazy(() => import('./PanoramaViewer').then((module) => ({
  default: module.PanoramaViewer,
})))

export const PanoramaNode = memo(function PanoramaNode({ id, data, selected, dragging }: PanoramaNodeProps) {
  recordComponentRender('PanoramaNode')
  const sourceImage = useCanvasStore(
    useShallow((state) => {
      const sourceImageNodeId = typeof data.sourceImageNodeId === 'string' ? data.sourceImageNodeId : null
      const candidate = getCanvasNodeById(state.nodes, sourceImageNodeId)
      const node = candidate && isImageSourceNodeType(candidate.type) ? candidate : null

      return {
        connected: Boolean(node),
        imageUrl: typeof node?.data?.imageUrl === 'string' ? node.data.imageUrl : '',
      }
    }),
  )
  const { updateNodeData, deleteNode } = useCanvasStore(
    useShallow((state) => ({
      updateNodeData: state.updateNodeData,
      deleteNode: state.deleteNode,
    })),
  )
  const runTracked = useHistoryStore((s) => s.runTracked)
  const workspaceConfigured = useSettingsStore((s) => s.runtime.workspaceConfigured)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const notify = useFeedbackStore((s) => s.notify)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const viewerRef = useRef<PanoramaViewerHandle | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const effectiveImageUrl = sourceImage.imageUrl || data.imageUrl || ''
  const hasSourceImage = sourceImage.connected
  const autoRotate = data.autoRotate === true

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      notify({ tone: 'warning', title: '无法上传文件', message: UI_TEXT.invalidImage })
      return
    }

    try {
      const importedImage = await importImageFile(file, workspaceConfigured, activeProjectId)

      runTracked(() => {
        updateNodeData(id, {
          imageUrl: importedImage.imageUrl,
          imageAsset: importedImage.imageAsset,
          name: importedImage.name,
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
    if (hasSourceImage) {
      return
    }
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
    if (hasSourceImage) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) {
      void handleFile(file)
    }
  }

  useEffect(() => {
    if (!selected || effectiveImageUrl || hasSourceImage) {
      return
    }

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
  }, [effectiveImageUrl, handleFile, hasSourceImage, selected])

  const handleToggleAutoRotate = useCallback(() => {
    runTracked(() => {
      updateNodeData(id, { autoRotate: !autoRotate })
    })
  }, [autoRotate, id, runTracked, updateNodeData])

  const handleEnterFullscreen = useCallback(() => {
    viewerRef.current?.enterFullscreen()
  }, [])

  const handleOpenFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const labelText = hasSourceImage ? `${UI_TEXT.title} · 已连接` : UI_TEXT.title

  return (
    <>
      {selected ? <StableNodeToolbar isVisible={!dragging && Boolean(effectiveImageUrl) ? undefined : false} position={Position.Top} offset={10}>
        <div className={NODE_TOOLBAR_CLASS_NAME}>
          {!hasSourceImage ? (
            <button
              type="button"
              onClick={handleOpenFilePicker}
              className={NODE_TOOLBAR_BUTTON_CLASS_NAME}
              aria-label={UI_TEXT.replace}
              title={UI_TEXT.replace}
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleToggleAutoRotate}
            className={`${NODE_TOOLBAR_BUTTON_CLASS_NAME} ${autoRotate ? 'border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)]' : ''}`}
            aria-label={UI_TEXT.toggleAutoRotate}
            aria-pressed={autoRotate}
            title={UI_TEXT.toggleAutoRotate}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleEnterFullscreen}
            className={NODE_TOOLBAR_BUTTON_CLASS_NAME}
            aria-label={UI_TEXT.fullscreen}
            title={UI_TEXT.fullscreen}
          >
            <Maximize className="h-3.5 w-3.5" />
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
          minWidth={200}
          minHeight={140}
          maxWidth={1200}
          maxHeight={800}
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

        {effectiveImageUrl ? (
          <div className="relative flex flex-1 flex-col">
            <div className="node-drag-handle flex h-6 shrink-0 cursor-grab items-center gap-1.5 px-2 text-[11px] font-medium text-[var(--text-secondary)] select-none active:cursor-grabbing">
              <Globe className="h-3 w-3 text-violet-500" aria-hidden="true" />
              <span className="truncate">{labelText}</span>
            </div>
            <div className="relative mx-[3px] mb-[3px] flex-1 overflow-hidden rounded-[9px] bg-black [backface-visibility:hidden] [clip-path:inset(0_round_9px)] [transform:translateZ(0)]">
              <div className="nodrag nopan absolute inset-0">
                <Suspense fallback={<div className="h-full w-full bg-black" />}>
                  <PanoramaViewer
                    ref={viewerRef}
                    imageUrl={effectiveImageUrl}
                    autoRotate={autoRotate}
                  />
                </Suspense>
              </div>
            </div>
          </div>
        ) : (
          <NodeEmptyState
            tone="violet"
            className="!border-transparent !bg-transparent"
            icon={<Upload className="h-5 w-5" />}
            title={UI_TEXT.emptyTitle}
            description={(
              <>
                {UI_TEXT.emptyDescription}
                <br />
                {UI_TEXT.pasteHint}
              </>
            )}
            action={(
              <button
                type="button"
                onClick={handleOpenFilePicker}
                className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-violet-400/25 bg-violet-400/10 px-3 text-sm font-medium text-violet-500 transition hover:border-violet-400/40 hover:bg-violet-400/14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/25"
              >
                <Upload className="h-4 w-4" />
                {UI_TEXT.selectFile}
              </button>
            )}
          />
        )}
      </div>
    </>
  )
}, areNodeContentPropsEqual)
