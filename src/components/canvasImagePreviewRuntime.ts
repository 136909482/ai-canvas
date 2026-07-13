const LOW_QUALITY_PREVIEW_MAX_SIZE = 512
const MAX_THUMBNAIL_CACHE_ENTRIES = 80
const MAX_CONCURRENT_THUMBNAIL_JOBS = 1
const THUMBNAIL_PREWARM_DELAY_MS = 1200

type ThumbnailCacheEntry = {
  url: string
  revokeOnEvict: boolean
}

type ThumbnailJob = {
  start: () => void
  reject: (error: unknown) => void
}

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  cancelIdleCallback?: (handle: number) => void
}

const thumbnailCache = new Map<string, ThumbnailCacheEntry>()
const thumbnailRequests = new Map<string, Promise<string>>()
const thumbnailJobQueue: ThumbnailJob[] = []
const activeThumbnailControllers = new Set<AbortController>()
let activeThumbnailJobs = 0
let thumbnailQueuePauseCount = 0

export function getCachedThumbnailUrl(src: string) {
  return thumbnailCache.get(src)?.url ?? null
}

export function cacheThumbnail(src: string, thumbnailSrc: string, revokeOnEvict = thumbnailSrc !== src && thumbnailSrc.startsWith('blob:')) {
  if (thumbnailCache.has(src)) {
    revokeCachedThumbnail(thumbnailCache.get(src))
    thumbnailCache.delete(src)
  }

  thumbnailCache.set(src, {
    url: thumbnailSrc,
    revokeOnEvict,
  })

  while (thumbnailCache.size > MAX_THUMBNAIL_CACHE_ENTRIES) {
    const oldestKey = thumbnailCache.keys().next().value
    if (!oldestKey) {
      return
    }
    revokeCachedThumbnail(thumbnailCache.get(oldestKey))
    thumbnailCache.delete(oldestKey)
  }
}

function revokeCachedThumbnail(entry: ThumbnailCacheEntry | undefined) {
  if (entry?.revokeOnEvict && entry.url.startsWith('blob:')) {
    URL.revokeObjectURL(entry.url)
  }
}

export function clearCanvasImagePreviewCache() {
  for (const entry of thumbnailCache.values()) {
    revokeCachedThumbnail(entry)
  }

  thumbnailCache.clear()
  thumbnailRequests.clear()
  thumbnailJobQueue.length = 0

  for (const controller of activeThumbnailControllers) {
    controller.abort()
  }
}

export function scheduleIdleTask(callback: () => void) {
  const idleWindow = window as WindowWithIdleCallback
  let cancelIdleTask: (() => void) | null = null

  const timeoutHandle = window.setTimeout(() => {
    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleHandle = idleWindow.requestIdleCallback(callback, { timeout: 2400 })
      cancelIdleTask = () => idleWindow.cancelIdleCallback?.(idleHandle)
      return
    }

    const fallbackHandle = window.setTimeout(callback, 160)
    cancelIdleTask = () => window.clearTimeout(fallbackHandle)
  }, THUMBNAIL_PREWARM_DELAY_MS)

  return () => {
    window.clearTimeout(timeoutHandle)
    cancelIdleTask?.()
  }
}

function runNextThumbnailJob() {
  if (thumbnailQueuePauseCount > 0) {
    return
  }

  if (activeThumbnailJobs >= MAX_CONCURRENT_THUMBNAIL_JOBS) {
    return
  }

  const nextJob = thumbnailJobQueue.shift()
  if (!nextJob) {
    return
  }

  activeThumbnailJobs += 1
  nextJob.start()
}

function enqueueThumbnailJob(task: (signal: AbortSignal) => Promise<string>) {
  return new Promise<string>((resolve, reject) => {
    thumbnailJobQueue.push({
      reject,
      start: () => {
        const controller = new AbortController()
        activeThumbnailControllers.add(controller)

        void task(controller.signal)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            activeThumbnailControllers.delete(controller)
            activeThumbnailJobs -= 1
            runNextThumbnailJob()
          })
      },
    })
    runNextThumbnailJob()
  })
}

export function pauseThumbnailQueue() {
  thumbnailQueuePauseCount += 1

  for (const controller of activeThumbnailControllers) {
    controller.abort()
  }

  const abortError = new DOMException('Thumbnail generation aborted', 'AbortError')
  while (thumbnailJobQueue.length > 0) {
    thumbnailJobQueue.shift()?.reject(abortError)
  }
}

export function resumeThumbnailQueue() {
  thumbnailQueuePauseCount = Math.max(0, thumbnailQueuePauseCount - 1)

  if (thumbnailQueuePauseCount === 0) {
    runNextThumbnailJob()
  }
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function isDirectThumbnailUrl(value: string) {
  return (
    value.startsWith('blob:')
    || value.startsWith('data:')
    || value.startsWith('http://')
    || value.startsWith('https://')
    || value.startsWith('/')
  )
}

function canvasToThumbnailUrl(canvas: HTMLCanvasElement, signal: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Thumbnail generation aborted', 'AbortError'))
      return
    }

    canvas.toBlob((blob) => {
      if (signal.aborted) {
        reject(new DOMException('Thumbnail generation aborted', 'AbortError'))
        return
      }

      if (!blob) {
        resolve(canvas.toDataURL('image/jpeg', 0.58))
        return
      }

      resolve(URL.createObjectURL(blob))
    }, 'image/jpeg', 0.58)
  })
}

function createThumbnail(src: string, signal: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    let settled = false
    image.crossOrigin = 'anonymous'

    const abort = () => {
      image.onload = null
      image.onerror = null
      image.src = ''
      finishReject(new DOMException('Thumbnail generation aborted', 'AbortError'))
    }

    const cleanup = () => {
      signal.removeEventListener('abort', abort)
      image.onload = null
      image.onerror = null
    }

    function finishResolve(value: string) {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      resolve(value)
    }

    function finishReject(error: unknown) {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      reject(error)
    }

    if (signal.aborted) {
      abort()
      return
    }

    signal.addEventListener('abort', abort, { once: true })

    image.onload = () => {
      try {
        if (signal.aborted) {
          abort()
          return
        }

        const width = image.naturalWidth || image.width
        const height = image.naturalHeight || image.height

        if (width <= 0 || height <= 0) {
          finishResolve(src)
          return
        }

        const scale = Math.min(1, LOW_QUALITY_PREVIEW_MAX_SIZE / Math.max(width, height))
        if (scale >= 1) {
          finishResolve(src)
          return
        }

        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))

        const context = canvas.getContext('2d', { alpha: true })
        if (!context) {
          finishResolve(src)
          return
        }

        context.imageSmoothingEnabled = true
        context.imageSmoothingQuality = 'medium'
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        void canvasToThumbnailUrl(canvas, signal).then(finishResolve).catch(finishReject)
      } catch (error) {
        if (isAbortError(error)) {
          finishReject(error)
          return
        }

        finishResolve(src)
      }
    }

    image.onerror = () => finishReject(new Error('Failed to create low quality preview'))
    image.src = src
  })
}

export function loadThumbnail(src: string) {
  const cachedThumbnail = getCachedThumbnailUrl(src)
  if (cachedThumbnail) {
    return Promise.resolve(cachedThumbnail)
  }

  const pendingThumbnail = thumbnailRequests.get(src)
  if (pendingThumbnail) {
    return pendingThumbnail
  }

  const request = enqueueThumbnailJob((signal) => createThumbnail(src, signal))
    .then((thumbnailSrc) => {
      cacheThumbnail(src, thumbnailSrc)
      thumbnailRequests.delete(src)
      return thumbnailSrc
    })
    .catch((error) => {
      thumbnailRequests.delete(src)
      throw error
    })

  thumbnailRequests.set(src, request)
  return request
}
