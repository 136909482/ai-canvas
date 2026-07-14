import { memo, useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, type OnResizeEnd } from '@xyflow/react'
import { Clock3, Download, LoaderCircle, Maximize, Pause, Play, Upload, Video, Volume2, VolumeX, X } from 'lucide-react'
import { buildProjectAssetPath } from '@/features/projectManager/projectAssetPaths'
import { platformBridge } from '@/platform'
import { StableNodeToolbar } from '@/components/StableNodeToolbar'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useFeedbackStore } from '@/store/useFeedbackStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import type { AppNodeProps } from '@/types'
import { themeClasses } from '@/styles/themeClasses'
import { NodeDeleteButton, NodeEmptyState, NodeResizerPreset, NodeStatusSurface } from '../nodeShell'
import { getNodeShellClassName } from '../nodeShellClassName'
import { areNodeContentPropsEqual } from '../nodePropComparators'

type VideoNodeProps = AppNodeProps<'videoNode'>

const UI_TEXT = {
  invalidVideo: '请上传视频文件',
  deleteNode: '删除视频节点',
  videoFallbackName: '视频',
  replaceVideo: '替换视频',
  previewVideo: '放大预览',
  saveVideo: '保存视频',
  closePreview: '关闭预览',
  selectFile: '选择文件',
  dragHint: '或拖放文件到此处',
  supportHint: '支持视频素材',
  uploadFailed: '视频上传失败，请稍后重试',
  downloadFailed: '视频下载失败',
  retryLater: '视频下载失败，请稍后重试',
  queued: '排队中',
  queuedDescription: '任务已进入全局队列，前面的生成完成后会自动开始。',
  generating: '视频生成中',
  generatingDescription: '正在等待百炼返回视频结果。',
  generateFailed: '生成失败',
} as const

const VIDEO_MIME_EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

function padTimePart(value: number) {
  return String(value).padStart(2, '0')
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim()
}

function buildDownloadFileName(timestamp: number, extension: string) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = padTimePart(date.getHours())
  const minutes = padTimePart(date.getMinutes())
  const seconds = padTimePart(date.getSeconds())

  return `AIPure Video ${year}-${month}-${day} ${hours}_${minutes}_${seconds}.${extension}`
}

function inferVideoMimeType(url: string) {
  if (url.startsWith('data:')) {
    return url.slice(5, url.indexOf(';')) || 'video/mp4'
  }

  const normalizedUrl = url.toLowerCase()
  if (normalizedUrl.includes('.webm')) return 'video/webm'
  if (normalizedUrl.includes('.mov')) return 'video/quicktime'
  return 'video/mp4'
}

async function videoUrlToBlob(videoUrl: string) {
  const response = await fetch(videoUrl)
  if (!response.ok) {
    throw new Error(UI_TEXT.downloadFailed)
  }

  return response.blob()
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error(UI_TEXT.uploadFailed))
    }

    reader.onerror = () => {
      reject(reader.error ?? new Error(UI_TEXT.uploadFailed))
    }

    reader.readAsDataURL(file)
  })
}

function loadVideoMetadata(videoUrl: string) {
  return new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
    const video = document.createElement('video')

    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      resolve({
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      })
    }
    video.onerror = () => reject(new Error(UI_TEXT.uploadFailed))
    video.src = videoUrl
  })
}

function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '00:00'
  }

  const seconds = Math.round(totalSeconds)
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function getDisplaySize(width: number, height: number) {
  const MAX_SIZE = 520
  const MIN_SIZE = 180
  const aspectRatio = width > 0 && height > 0 ? width / height : 16 / 9
  let displayWidth: number
  let displayHeight: number

  if (aspectRatio >= 1) {
    displayWidth = MAX_SIZE
    displayHeight = MAX_SIZE / aspectRatio
  } else {
    displayHeight = MAX_SIZE
    displayWidth = MAX_SIZE * aspectRatio
  }

  if (displayWidth < MIN_SIZE) {
    displayWidth = MIN_SIZE
    displayHeight = MIN_SIZE / aspectRatio
  }

  if (displayHeight < MIN_SIZE) {
    displayHeight = MIN_SIZE
    displayWidth = MIN_SIZE * aspectRatio
  }

  return {
    width: Math.round(displayWidth + 12),
    height: Math.round(displayHeight + 12),
  }
}

export const VideoNode = memo(function VideoNode({ id, data, selected, dragging }: VideoNodeProps) {
  const MIN_VIDEO_NODE_WIDTH = 220
  const MIN_VIDEO_NODE_HEIGHT = 160
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const deleteNode = useCanvasStore((s) => s.deleteNode)
  const beginTransaction = useHistoryStore((s) => s.beginTransaction)
  const runTracked = useHistoryStore((s) => s.runTracked)
  const workspaceConfigured = useSettingsStore((s) => s.runtime.workspaceConfigured)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const notify = useFeedbackStore((s) => s.notify)
  const [isDragging, setIsDragging] = useState(false)
  const [videoInfo, setVideoInfo] = useState({ duration: 0, width: 0, height: 0, name: '' })
  const [showPreview, setShowPreview] = useState(false)
  const [isHoveringVideo, setIsHoveringVideo] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/')) {
      notify({ tone: 'warning', title: '无法上传文件', message: UI_TEXT.invalidVideo })
      return
    }

    const tempVideoUrl = URL.createObjectURL(file)

    try {
      const metadata = await loadVideoMetadata(tempVideoUrl)
      const asset = workspaceConfigured
        ? await platformBridge.writeWorkspaceAsset({
            pathSegments: buildProjectAssetPath(activeProjectId, 'uploads'),
            fileName: file.name,
            blob: file,
          })
        : null
      const videoUrl = asset
        ? await platformBridge.resolveWorkspaceAssetUrl(asset.relativePath)
        : await readFileAsDataUrl(file)
      const nextSize = getDisplaySize(metadata.width, metadata.height)

      setVideoInfo({
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        name: file.name,
      })

      runTracked(() => {
        updateNodeData(id, {
          videoUrl,
          videoAsset: asset,
          name: file.name,
          duration: metadata.duration,
          videoWidth: metadata.width,
          videoHeight: metadata.height,
          width: nextSize.width,
          height: nextSize.height,
        })
      })
    } catch (error) {
      notify({ tone: 'error', title: '视频上传失败', message: error instanceof Error ? error.message : UI_TEXT.uploadFailed })
    } finally {
      URL.revokeObjectURL(tempVideoUrl)
    }
  }, [activeProjectId, id, notify, runTracked, updateNodeData, workspaceConfigured])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      void handleFile(file)
    }
    event.target.value = ''
  }

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) {
      void handleFile(file)
    }
  }

  const handleResizeEnd: OnResizeEnd = useCallback(
    (_event, params) => {
      if (!data.videoUrl || videoInfo.width === 0 || videoInfo.height === 0) return

      const videoAspect = videoInfo.width / videoInfo.height
      const PADDING_X = 12
      const PADDING_Y = 12
      const contentW = Math.max(Math.round(params.width - PADDING_X), MIN_VIDEO_NODE_WIDTH - PADDING_X)
      const contentH = Math.round(contentW / videoAspect)
      const nextHeight = Math.max(contentH + PADDING_Y, MIN_VIDEO_NODE_HEIGHT)

      runTracked(() => {
        updateNodeData(id, {
          width: contentW + PADDING_X,
          height: nextHeight,
        })
      })
    },
    [data.videoUrl, id, runTracked, updateNodeData, videoInfo.height, videoInfo.width],
  )

  const playNodeVideo = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    video.muted = isMuted
    const playPromise = video.play()
    if (playPromise) {
      void playPromise
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
    } else {
      setIsPlaying(true)
    }
  }, [isMuted])

  const pauseNodeVideo = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    video.pause()
    setIsPlaying(false)
  }, [])

  const handleVideoMouseEnter = () => {
    setIsHoveringVideo(true)
    playNodeVideo()
  }

  const handleVideoMouseLeave = () => {
    setIsHoveringVideo(false)
    pauseNodeVideo()
  }

  const toggleNodePlayback = () => {
    if (isPlaying) {
      pauseNodeVideo()
      return
    }

    playNodeVideo()
  }

  const toggleMuted = () => {
    const nextMuted = !isMuted
    setIsMuted(nextMuted)
    if (videoRef.current) {
      videoRef.current.muted = nextMuted
    }
  }

  const handleSaveVideo = async () => {
    if (!data.videoUrl || isSaving) {
      return
    }

    setIsSaving(true)
    setSaveError('')

    try {
      const blob = await videoUrlToBlob(data.videoUrl)
      const mimeType = blob.type || data.videoAsset?.mimeType || inferVideoMimeType(data.videoUrl)
      const extension = VIDEO_MIME_EXTENSIONS[mimeType] || 'mp4'
      const fileName = sanitizeFileName(buildDownloadFileName(Date.now(), extension))
      fallbackDownload(blob, fileName)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : UI_TEXT.retryLater)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.currentTarget.value)
    if (!Number.isFinite(nextTime)) {
      return
    }

    if (videoRef.current) {
      videoRef.current.currentTime = nextTime
    }
    setCurrentTime(nextTime)
  }

  useEffect(() => {
    if (!data.videoUrl) {
      setVideoInfo({ duration: 0, width: 0, height: 0, name: '' })
      setCurrentTime(0)
      setIsPlaying(false)
      return
    }

    let cancelled = false
    void loadVideoMetadata(data.videoUrl)
      .then((metadata) => {
        if (cancelled) {
          return
        }

        setVideoInfo((current) => ({
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          name: typeof data.name === 'string' && data.name.trim().length > 0 ? data.name : current.name,
        }))
      })
      .catch(() => {
        if (!cancelled) {
          setVideoInfo((current) => ({ ...current, name: typeof data.name === 'string' ? data.name : current.name }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [data.name, data.videoUrl])

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
    : videoInfo.name || UI_TEXT.videoFallbackName
  const width = videoInfo.width || data.videoWidth
  const height = videoInfo.height || data.videoHeight
  const duration = videoInfo.duration || data.duration
  const sliderMax = duration > 0 ? duration : 0
  const sliderValue = sliderMax > 0 ? Math.min(currentTime, sliderMax) : 0
  const isQueued = data.status === 'queued'
  const isGenerating = data.status === 'generating'
  const isError = data.status === 'error'

  return (
    <>
      {selected ? <StableNodeToolbar isVisible={!dragging && Boolean(data.videoUrl) ? undefined : false} position={Position.Top} offset={10}>
        <div className={`nodrag nopan flex items-center gap-1 p-[5px] ${themeClasses.nodeToolbarPanel}`}>
          <button
            type="button"
            onClick={handleSaveVideo}
            disabled={isSaving}
            className={`${themeClasses.nodeToolbarButton} h-7 w-7`}
            aria-label={UI_TEXT.saveVideo}
            title={UI_TEXT.saveVideo}
          >
            {isSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`${themeClasses.nodeToolbarButton} h-7 w-7`}
            aria-label={UI_TEXT.replaceVideo}
            title={UI_TEXT.replaceVideo}
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className={`${themeClasses.nodeToolbarButton} h-7 w-7`}
            aria-label={UI_TEXT.previewVideo}
            title={UI_TEXT.previewVideo}
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
          minWidth={MIN_VIDEO_NODE_WIDTH}
          minHeight={MIN_VIDEO_NODE_HEIGHT}
          maxWidth={900}
          maxHeight={700}
          keepAspectRatio={Boolean(data.videoUrl)}
          onResizeStart={data.videoUrl ? beginTransaction : undefined}
          onResizeEnd={data.videoUrl ? handleResizeEnd : undefined}
          hideVisuals
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
        />

        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className="handle-orb-anchor !w-[18px] !h-[18px] !rounded-full !border-0 !bg-transparent !p-0 !z-30"
          title="视频输入"
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
          <span className="handle-orb">
            <span className="handle-orb__glow" />
            <span className="handle-orb__ring" />
            <span className="handle-orb__dot" />
          </span>
        </Handle>

        {data.videoUrl ? (
          <div className="relative flex flex-1 flex-col p-[6px]">
            <span className="pointer-events-none absolute -top-[22px] left-1 flex select-none items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-[var(--text-secondary)]">
              <Video className="h-3 w-3 text-violet-500" aria-hidden="true" />
              {nodeName}
            </span>
            <div
              className="node-drag-handle relative flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-black"
              onMouseEnter={handleVideoMouseEnter}
              onMouseLeave={handleVideoMouseLeave}
            >
              <video
                ref={videoRef}
                src={data.videoUrl}
                className="h-full w-full object-contain"
                muted={isMuted}
                playsInline
                preload="metadata"
                draggable={false}
                onLoadedMetadata={(event) => {
                  const video = event.currentTarget
                  setVideoInfo((current) => ({
                    ...current,
                    duration: Number.isFinite(video.duration) ? video.duration : current.duration,
                    width: video.videoWidth || current.width,
                    height: video.videoHeight || current.height,
                  }))
                }}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/18 via-transparent to-black/68" />
              <div
                className={`nodrag nopan absolute inset-x-3 bottom-3 flex items-center gap-2 px-1 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] transition duration-150 ${
                  isHoveringVideo || isPlaying ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
                }`}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={toggleNodePlayback}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  aria-label={isPlaying ? '暂停视频' : '播放视频'}
                  title={isPlaying ? '暂停视频' : '播放视频'}
                >
                  {isPlaying ? <Pause className="h-4 w-4 fill-white" /> : <Play className="h-4 w-4 fill-white" />}
                </button>
                <span className="w-10 shrink-0 text-center text-[11px] font-semibold tabular-nums text-white/88">
                  {formatDuration(sliderValue)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={sliderMax}
                  step={0.05}
                  value={sliderValue}
                  onChange={handleSeek}
                  className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/24 accent-white [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
                  aria-label="视频时间轴"
                />
                <span className="w-10 shrink-0 text-center text-[11px] font-semibold tabular-nums text-white/88">
                  {formatDuration(duration)}
                </span>
                <button
                  type="button"
                  onClick={toggleMuted}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  aria-label={isMuted ? '取消静音' : '静音'}
                  title={isMuted ? '取消静音' : '静音'}
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  aria-label={UI_TEXT.previewVideo}
                  title={UI_TEXT.previewVideo}
                >
                  <Maximize className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {saveError && (
              <p className="mt-2 px-1 text-[11px] leading-5 text-amber-300">
                {saveError}
              </p>
            )}
          </div>
        ) : isGenerating ? (
          <div className="node-drag-handle relative flex flex-1 cursor-default overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] select-none active:cursor-grabbing">
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
            <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-8 text-center">
              <div className="max-w-[250px]">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-violet-400/25 bg-violet-400/10 text-violet-500 shadow-[0_0_0_1px_rgba(167,139,250,0.08)] backdrop-blur">
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{UI_TEXT.generating}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{UI_TEXT.generatingDescription}</p>
              </div>
            </div>
          </div>
        ) : isQueued ? (
          <NodeStatusSurface
            tone="amber"
            icon={<Clock3 className="h-5 w-5" />}
            title={UI_TEXT.queued}
            description={UI_TEXT.queuedDescription}
          />
        ) : isError ? (
          <NodeStatusSurface
            tone="red"
            icon={<Video className="h-5 w-5" />}
            title={UI_TEXT.generateFailed}
            description={data.errorMsg || UI_TEXT.uploadFailed}
          />
        ) : (
          <NodeEmptyState
            tone="violet"
            icon={<Upload className="h-5 w-5" />}
            title={UI_TEXT.selectFile}
            description={(
              <>
                {UI_TEXT.dragHint}
                <br />
                {UI_TEXT.supportHint}
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

      {showPreview && data.videoUrl && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 animate-[modal-fade-in_0.2s_ease-out]"
          onClick={() => setShowPreview(false)}
        >
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/70 transition hover:border-white/20 hover:bg-black/70 hover:text-white"
            aria-label={UI_TEXT.closePreview}
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex max-w-[92vw] flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
            <video
              src={data.videoUrl}
              className="max-h-[82vh] max-w-[88vw] rounded-xl object-contain shadow-[0_0_80px_rgba(255,255,255,0.04)]"
              controls
              autoPlay
              playsInline
            />
            <div className="flex items-center gap-4 text-xs text-white/60">
              <span className="max-w-[320px] truncate">{nodeName}</span>
              {width > 0 && height > 0 && (
                <>
                  <span className="text-white/35">|</span>
                  <span>{width} x {height}</span>
                </>
              )}
              <span className="text-white/35">|</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}, areNodeContentPropsEqual)
