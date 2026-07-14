import { createContext, useContext } from 'react'
import type { CanvasImagePreviewQuality } from '@/features/canvasPerformance/rendering'

interface CanvasPerformanceContextValue {
  forceLowQualityImages: boolean
  imagePreviewQuality: CanvasImagePreviewQuality
  deferThumbnailWork: boolean
}

const DEFAULT_CANVAS_PERFORMANCE_CONTEXT: CanvasPerformanceContextValue = {
  forceLowQualityImages: false,
  imagePreviewQuality: 'full',
  deferThumbnailWork: false,
}

export const CanvasPerformanceContext = createContext<CanvasPerformanceContextValue>(DEFAULT_CANVAS_PERFORMANCE_CONTEXT)

export const CanvasPerformanceProvider = CanvasPerformanceContext.Provider

export function useCanvasPerformanceContext() {
  return useContext(CanvasPerformanceContext)
}
