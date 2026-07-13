import { useEffect, useRef } from 'react'
import { platformBridge } from '@/platform'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskQueueStore } from '@/store/useTaskQueueStore'
import type { CanvasSnapshot } from '@/types'

const AUTOSAVE_IDLE_TIMEOUT_MS = 2_000

function hasDraggingNode({ nodes }: CanvasSnapshot) {
  return nodes.some((node) => node.dragging)
}

export function ProjectBootstrap() {
  const isReady = useProjectStore((state) => state.isReady)
  const hasHydrated = useProjectStore((state) => state.hasHydrated)
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const ensureInitialized = useProjectStore((state) => state.ensureInitialized)
  const persistWorkspaceFile = useProjectStore((state) => state.persistWorkspaceFile)
  const autosaveIntervalMs = useSettingsStore((state) => state.config.storage.autosaveIntervalMs)
  const workspaceConfigured = useSettingsStore((state) => state.runtime.workspaceConfigured)
  const settingsHydrated = useSettingsStore((state) => state.runtime.hydrated)
  const setWorkspaceRuntimeStatus = useSettingsStore((state) => state.setWorkspaceRuntimeStatus)
  const hydrateFromWorkspace = useSettingsStore((state) => state.hydrateFromWorkspace)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) {
      return
    }

    initializedRef.current = true

    void (async () => {
      try {
        const status = await platformBridge.getWorkspaceStatus()
        setWorkspaceRuntimeStatus({
          configured: status.configured,
          directoryName: status.directoryName,
          permission: status.permission,
        })
      } catch {
        setWorkspaceRuntimeStatus({
          configured: false,
          directoryName: '',
          permission: 'prompt',
        })
      }

      await hydrateFromWorkspace()
      await ensureInitialized()
    })()
  }, [ensureInitialized, hydrateFromWorkspace, setWorkspaceRuntimeStatus])

  useEffect(() => {
    if (!settingsHydrated || !hasHydrated || !isReady || workspaceConfigured) {
      return
    }

    const handleBeforeUnloadWithoutWorkspace = (event: BeforeUnloadEvent) => {
      if (!useProjectStore.getState().hasUnsavedChanges()) {
        return
      }

      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnloadWithoutWorkspace)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnloadWithoutWorkspace)
    }
  }, [hasHydrated, isReady, settingsHydrated, workspaceConfigured])

  useEffect(() => {
    if (!settingsHydrated || !hasHydrated || !isReady || !activeProjectId || !workspaceConfigured) {
      return
    }

    let debounceId: number | null = null
    let cancelScheduledIdleSave: (() => void) | null = null
    let isPersisting = false
    let pendingAfterPersist = false

    const cancelIdleSave = () => {
      if (!cancelScheduledIdleSave) {
        return
      }

      cancelScheduledIdleSave()
      cancelScheduledIdleSave = null
    }

    const cancelDebounce = () => {
      if (debounceId === null) {
        return
      }

      window.clearTimeout(debounceId)
      debounceId = null
    }

    const runAutosave = () => {
      cancelScheduledIdleSave = null

      if (isPersisting) {
        pendingAfterPersist = true
        return
      }

      if (!useProjectStore.getState().hasPersistedChanges()) {
        return
      }

      isPersisting = true
      void persistWorkspaceFile()
        .catch(() => undefined)
        .finally(() => {
          isPersisting = false

          if (pendingAfterPersist) {
            pendingAfterPersist = false
            scheduleAutosave()
          }
        })
    }

    const scheduleIdleSave = () => {
      cancelIdleSave()
      const idleScheduler = globalThis as typeof globalThis & {
        requestIdleCallback?: Window['requestIdleCallback']
        cancelIdleCallback?: Window['cancelIdleCallback']
      }

      if (idleScheduler.requestIdleCallback && idleScheduler.cancelIdleCallback) {
        const idleId = idleScheduler.requestIdleCallback(runAutosave, { timeout: AUTOSAVE_IDLE_TIMEOUT_MS })
        cancelScheduledIdleSave = () => idleScheduler.cancelIdleCallback?.(idleId)
        return
      }

      const timeoutId = globalThis.setTimeout(runAutosave, 0)
      cancelScheduledIdleSave = () => globalThis.clearTimeout(timeoutId)
    }

    function scheduleAutosave() {
      cancelDebounce()
      cancelIdleSave()
      debounceId = window.setTimeout(() => {
        debounceId = null
        scheduleIdleSave()
      }, autosaveIntervalMs)
    }

    scheduleAutosave()

    const flushAutosave = () => {
      cancelDebounce()
      cancelIdleSave()
      runAutosave()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushAutosave()
      }
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!useProjectStore.getState().hasPersistedChanges()) {
        return
      }

      flushAutosave()
      event.preventDefault()
      event.returnValue = ''
    }

    const unsubscribeCanvas = useCanvasStore.subscribe((state, previousState) => {
      if (hasDraggingNode(state) || hasDraggingNode(previousState)) {
        if (hasDraggingNode(state)) {
          return
        }
      }

      scheduleAutosave()
    })
    const unsubscribeTasks = useTaskQueueStore.subscribe(scheduleAutosave)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', flushAutosave)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      unsubscribeCanvas()
      unsubscribeTasks()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', flushAutosave)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      cancelDebounce()
      cancelIdleSave()
    }
  }, [activeProjectId, autosaveIntervalMs, hasHydrated, isReady, persistWorkspaceFile, settingsHydrated, workspaceConfigured])

  return null
}
