import { useEffect } from 'react'
import { useSettingsStore } from '@/store/useSettingsStore'
import type { ThemeMode } from '@/types'

function resolveThemeMode(themeMode: ThemeMode) {
  if (themeMode !== 'system' || typeof window === 'undefined') {
    return themeMode === 'light' ? 'light' : 'dark'
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function ThemeProvider() {
  const themeMode = useSettingsStore((state) => state.config.storage.themeMode)
  const canvasPerformanceMode = useSettingsStore((state) => state.config.storage.canvasPerformanceMode)

  useEffect(() => {
    const root = document.documentElement

    const applyTheme = () => {
      const nextTheme = resolveThemeMode(themeMode)
      root.dataset.theme = nextTheme
      root.style.colorScheme = nextTheme
    }

    applyTheme()

    if (themeMode !== 'system') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
    mediaQuery.addEventListener('change', applyTheme)
    return () => mediaQuery.removeEventListener('change', applyTheme)
  }, [themeMode])

  useEffect(() => {
    document.documentElement.dataset.canvasPerformance = canvasPerformanceMode
  }, [canvasPerformanceMode])

  return null
}
