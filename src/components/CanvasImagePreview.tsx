import { memo, useEffect, useState } from 'react'
import { useCanvasPerformanceContext } from '@/components/CanvasPerformanceContext'
import {
  cacheThumbnail,
  decodeImageSource,
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
  const { forceLowQualityImages, imagePreviewQuality } = useCanvasPerformanceContext()
  const shouldUseLowQualityPreview = (
    forceLowQualityPreview
    || forceLowQualityImages
    || imagePreviewQuality === 'thumbnail'
    || canvasPerformanceMode === 'performance'
    || !highQualityPreviewEnabled
  )

  return (
    <CanvasImagePreviewInner
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
  const directPersistentThumbnailSrc = persistentThumbnailRelativePath
    && isDirectThumbnailUrl(persistentThumbnailRelativePath)
    ? persistentThumbnailRelativePath
    : null
  const [persistentThumbnailState, setPersistentThumbnailState] = useState<{
    path: string
    url: string | null
    unavailable: boolean
  }>(() => ({
    path: persistentThumbnailRelativePath,
    url: directPersistentThumbnailSrc,
    unavailable: false,
  }))
  const [runtimeThumbnailState, setRuntimeThumbnailState] = useState<{
    source: string
    url: string | null
  }>(() => ({ source: src, url: getCachedThumbnailUrl(src) }))
  const persistentThumbnailSrc = directPersistentThumbnailSrc
    ?? (persistentThumbnailState.path === persistentThumbnailRelativePath
      ? persistentThumbnailState.url
      : null)
  const persistentThumbnailUnavailable = Boolean(persistentThumbnailRelativePath)
    && !directPersistentThumbnailSrc
    && persistentThumbnailState.path === persistentThumbnailRelativePath
    && persistentThumbnailState.unavailable
  const runtimeThumbnailSrc = runtimeThumbnailState.source === src
    ? runtimeThumbnailState.url
    : getCachedThumbnailUrl(src)
  const desiredSourceSrc = shouldUseLowQualityPreview
    ? persistentThumbnailSrc ?? runtimeThumbnailSrc ?? src
    : src
  const desiredSourceType = shouldUseLowQualityPreview && persistentThumbnailSrc
    ? 'workspace-thumbnail'
    : shouldUseLowQualityPreview && runtimeThumbnailSrc && runtimeThumbnailSrc !== src
      ? 'runtime-thumbnail'
      : 'original'
  const [renderedSource, setRenderedSource] = useState<{
    src: string
    type: 'original' | 'workspace-thumbnail' | 'runtime-thumbnail'
  }>(() => ({ src, type: 'original' }))

  useEffect(() => {
    if (!persistentThumbnailRelativePath || isDirectThumbnailUrl(persistentThumbnailRelativePath)) {
      return
    }

    let cancelled = false
    const resolvePersistentThumbnail = async () => {
      try {
        const resolvedUrl = await platformBridge.resolveWorkspaceAssetUrl(persistentThumbnailRelativePath)
        if (!cancelled) {
          setPersistentThumbnailState({
            path: persistentThumbnailRelativePath,
            url: resolvedUrl,
            unavailable: false,
          })
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
              setPersistentThumbnailState({
                path: persistentThumbnailRelativePath,
                url: restoredUrl,
                unavailable: false,
              })
            }
            return
          } catch {
            // Fall back to the runtime thumbnail path below.
          }
        }

        if (!cancelled) {
          setPersistentThumbnailState({
            path: persistentThumbnailRelativePath,
            url: null,
            unavailable: true,
          })
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

          setRuntimeThumbnailState({ source: src, url: nextThumbnailSrc })
        })
        .catch((error) => {
          if (cancelled) {
            return
          }

          if (isAbortError(error)) {
            return
          }

          cacheThumbnail(src, src)
          setRuntimeThumbnailState({ source: src, url: src })
        })
    })

    return () => {
      cancelled = true
      cancelIdleTask()
    }
  }, [persistentThumbnailRelativePath, persistentThumbnailUnavailable, src])

  useEffect(() => {
    if (
      !desiredSourceSrc
      || (renderedSource.src === desiredSourceSrc && renderedSource.type === desiredSourceType)
    ) {
      return
    }

    let cancelled = false
    void decodeImageSource(desiredSourceSrc, {
      serialized: desiredSourceType !== renderedSource.type,
    })
      .then(() => {
        if (!cancelled) {
          setRenderedSource({ src: desiredSourceSrc, type: desiredSourceType })
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [desiredSourceSrc, desiredSourceType, renderedSource.src, renderedSource.type])

  const isLowQualitySource = renderedSource.type !== 'original'

  return (
    <img
      src={renderedSource.src}
      alt={alt}
      className={className}
      draggable={draggable}
      loading="lazy"
      decoding="async"
      data-canvas-image-source={renderedSource.type}
      data-low-quality-preview={isLowQualitySource ? 'true' : undefined}
      data-workspace-thumbnail-preview={renderedSource.type === 'workspace-thumbnail' ? 'true' : undefined}
    />
  )
}
