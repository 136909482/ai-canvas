import { createContext, useContext } from 'react'

interface CanvasPerformanceContextValue {
  forceLowQualityImages: boolean
  deferThumbnailWork: boolean
}

const DEFAULT_CANVAS_PERFORMANCE_CONTEXT: CanvasPerformanceContextValue = {
  forceLowQualityImages: false,
  deferThumbnailWork: false,
}

export const CanvasPerformanceContext = createContext<CanvasPerformanceContextValue>(DEFAULT_CANVAS_PERFORMANCE_CONTEXT)

export const CanvasPerformanceProvider = CanvasPerformanceContext.Provider

export function useCanvasPerformanceContext() {
  return useContext(CanvasPerformanceContext)
}
