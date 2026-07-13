import { memo, useEffect, useState } from 'react'
import { useCanvasPerformanceContext } from '@/components/CanvasPerformanceContext'
import {
  cacheThumbnail,
  getCachedThumbnailUrl,
  isAbortError,
  isDirectThumbnailUrl,
  loadThumbnail,
  scheduleIdleTask,
} from '@/components/canvasImagePreviewRuntime'
import { restoreWorkspaceImageThumbnailAsset } from '@/features/imageAssets/runtime'
import { platformBridge } from '@/platform'
import { useSettingsStore } from '@/store/useSettingsStore'
import type { WorkspaceImageAsset } from '@/types'
import { recordComponentRender } from '@/utils/performanceDiagnostics'

type CanvasImagePreviewProps = {
  src: string
  alt: string
  imageAsset?: Partial<Pick<WorkspaceImageAsset, 'relativePath' | 'fileName' | 'thumbnailRelativePath' | 'originalWidth' | 'originalHeight'>> | null
  className?: string
  draggable?: boolean
  forceLowQualityPreview?: boolean
}

export const CanvasImagePreview = memo(function CanvasImagePreview({
  src,
  alt,
  imageAsset = null,
  className = '',
  draggable = false,
  forceLowQualityPreview = false,
}: CanvasImagePreviewProps) {
  recordComponentRender('CanvasImagePreview')
  const highQualityPreviewEnabled = useSettingsStore((state) => state.config.storage.lowQualityPreviewEnabled)
  const canvasPerformanceMode = useSettingsStore((state) => state.config.storage.canvasPerformanceMode)
  const { forceLowQualityImages } = useCanvasPerformanceContext()
  const shouldUseLowQualityPreview = (
    forceLowQualityPreview
    || forceLowQualityImages
    || canvasPerformanceMode === 'performance'
    || !highQualityPreviewEnabled
  )

  return (
    <CanvasImagePreviewInner
      key={`${src}\u0000${imageAsset?.thumbnailRelativePath ?? ''}`}
      src={src}
      alt={alt}
      imageAsset={imageAsset}
      className={className}
      draggable={draggable}
      shouldUseLowQualityPreview={shouldUseLowQualityPreview}
    />
  )
})

type CanvasImagePreviewInnerProps = CanvasImagePreviewProps & {
  shouldUseLowQualityPreview: boolean
}

function CanvasImagePreviewInner({
  src,
  alt,
  imageAsset = null,
  className = '',
  draggable = false,
  shouldUseLowQualityPreview,
}: CanvasImagePreviewInnerProps) {
  recordComponentRender('CanvasImagePreviewInner')
  const persistentThumbnailRelativePath = typeof imageAsset?.thumbnailRelativePath === 'string'
    ? imageAsset.thumbnailRelativePath
    : ''
  const [thumbnailSrc, setThumbnailSrc] = useState(() => getCachedThumbnailUrl(src))
  const [persistentThumbnailSrc, setPersistentThumbnailSrc] = useState<string | null>(() => (
    persistentThumbnailRelativePath && isDirectThumbnailUrl(persistentThumbnailRelativePath)
      ? persistentThumbnailRelativePath
      : null
  ))
  const [persistentThumbnailUnavailable, setPersistentThumbnailUnavailable] = useState(false)
  const renderedSrc = shouldUseLowQualityPreview
    ? persistentThumbnailSrc ?? thumbnailSrc ?? src
    : src

  useEffect(() => {
    if (!persistentThumbnailRelativePath || isDirectThumbnailUrl(persistentThumbnailRelativePath)) {
      return
    }

    let cancelled = false
    const resolvePersistentThumbnail = async () => {
      try {
        const resolvedUrl = await platformBridge.resolveWorkspaceAssetUrl(persistentThumbnailRelativePath)
        if (!cancelled) {
          setPersistentThumbnailSrc(resolvedUrl)
        }
      } catch {
        if (imageAsset?.relativePath && imageAsset.fileName) {
          try {
            await restoreWorkspaceImageThumbnailAsset({
              asset: {
                relativePath: imageAsset.relativePath,
                fileName: imageAsset.fileName,
                thumbnailRelativePath: persistentThumbnailRelativePath,
                originalWidth: imageAsset.originalWidth,
                originalHeight: imageAsset.originalHeight,
              },
              imageUrl: src,
            })
            const restoredUrl = await platformBridge.resolveWorkspaceAssetUrl(persistentThumbnailRelativePath)

            if (!cancelled) {
              setPersistentThumbnailSrc(restoredUrl)
              setPersistentThumbnailUnavailable(false)
            }
            return
          } catch {
            // Fall back to the runtime thumbnail path below.
          }
        }

        if (!cancelled) {
          setPersistentThumbnailSrc(null)
          setPersistentThumbnailUnavailable(true)
        }
      }
    }

    void resolvePersistentThumbnail()

    return () => {
      cancelled = true
    }
  }, [imageAsset?.fileName, imageAsset?.originalHeight, imageAsset?.originalWidth, imageAsset?.relativePath, persistentThumbnailRelativePath, src])

  useEffect(() => {
    if (
      !src
      || getCachedThumbnailUrl(src)
      || (persistentThumbnailRelativePath && !persistentThumbnailUnavailable)
    ) {
      return
    }

    let cancelled = false
    const cancelIdleTask = scheduleIdleTask(() => {
      void loadThumbnail(src)
        .then((nextThumbnailSrc) => {
          if (cancelled) {
            return
          }

          setThumbnailSrc(nextThumbnailSrc)
        })
        .catch((error) => {
          if (cancelled) {
            return
          }

          if (isAbortError(error)) {
            return
          }

          cacheThumbnail(src, src)
          setThumbnailSrc(src)
        })
    })

    return () => {
      cancelled = true
      cancelIdleTask()
    }
  }, [persistentThumbnailRelativePath, persistentThumbnailUnavailable, src])

  return (
    <img
      src={renderedSrc}
      alt={alt}
      className={className}
      draggable={draggable}
      loading="lazy"
      decoding="async"
      data-low-quality-preview={shouldUseLowQualityPreview && (persistentThumbnailSrc ?? thumbnailSrc) ? 'true' : undefined}
      data-workspace-thumbnail-preview={shouldUseLowQualityPreview && persistentThumbnailSrc ? 'true' : undefined}
    />
  )
}
