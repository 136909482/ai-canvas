import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Viewer } from '@photo-sphere-viewer/core'
import { AutorotatePlugin } from '@photo-sphere-viewer/autorotate-plugin'
import '@photo-sphere-viewer/core/index.css'

export interface PanoramaViewerHandle {
  enterFullscreen: () => void
}

type PanoramaViewerProps = {
  imageUrl: string
  autoRotate: boolean
}

export const PanoramaViewer = forwardRef<PanoramaViewerHandle, PanoramaViewerProps>(function PanoramaViewer(
  { imageUrl, autoRotate },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<Viewer | null>(null)

  useImperativeHandle(ref, () => ({
    enterFullscreen: () => {
      viewerRef.current?.enterFullscreen()
    },
  }), [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !imageUrl) {
      return
    }

    let viewer: Viewer | null = null
    let cancelled = false

    // Defer construction past React StrictMode's synchronous mount→cleanup→mount.
    // Without this, two viewers are created and destroyed back-to-back on the same
    // container in dev, leaving the second one stuck on "loading".
    const timer = window.setTimeout(() => {
      if (cancelled || !containerRef.current) return

      viewer = new Viewer({
        container: containerRef.current,
        panorama: imageUrl,
        navbar: false,
        loadingTxt: '加载中…',
        defaultZoomLvl: 0,
        mousewheel: true,
        mousemove: true,
        touchmoveTwoFingers: false,
        plugins: [
          [AutorotatePlugin, {
            autorotateSpeed: '0.5rpm',
            autostartDelay: null,
            autostartOnIdle: false,
          }],
        ],
      })
      viewerRef.current = viewer
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (viewer) {
        viewerRef.current = null
        viewer.destroy()
      }
    }
  }, [imageUrl])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) {
      return
    }

    const plugin = viewer.getPlugin<AutorotatePlugin>(AutorotatePlugin)
    if (!plugin) {
      return
    }

    if (autoRotate) {
      plugin.start()
    } else {
      plugin.stop()
    }
  }, [autoRotate, imageUrl])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const observer = new ResizeObserver(() => {
      viewerRef.current?.needsUpdate()
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  return <div ref={containerRef} className="h-full w-full" />
})