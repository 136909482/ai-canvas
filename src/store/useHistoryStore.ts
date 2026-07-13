import { create } from 'zustand'
import type { CanvasSnapshot } from '@/types'
import { useCanvasStore } from '@/store/useCanvasStore'
import { cloneSerializable } from '@/utils/clone'

const HISTORY_COMMIT_IDLE_TIMEOUT_MS = 1_000
const HISTORY_COMMIT_FALLBACK_DELAY_MS = 120

let cancelScheduledCommit: (() => void) | null = null

function cloneSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  return cloneSerializable(snapshot)
}

function serializeSnapshot(snapshot: CanvasSnapshot) {
  return JSON.stringify(snapshot)
}

function snapshotsEqual(left: CanvasSnapshot, right: CanvasSnapshot) {
  return serializeSnapshot(left) === serializeSnapshot(right)
}

function cancelPendingScheduledCommit() {
  if (!cancelScheduledCommit) {
    return
  }

  cancelScheduledCommit()
  cancelScheduledCommit = null
}

function scheduleDeferredCommit(commit: () => void) {
  const idleScheduler = globalThis as typeof globalThis & {
    requestIdleCallback?: Window['requestIdleCallback']
    cancelIdleCallback?: Window['cancelIdleCallback']
  }

  if (idleScheduler.requestIdleCallback && idleScheduler.cancelIdleCallback) {
    const idleId = idleScheduler.requestIdleCallback(commit, { timeout: HISTORY_COMMIT_IDLE_TIMEOUT_MS })
    cancelScheduledCommit = () => idleScheduler.cancelIdleCallback?.(idleId)
    return
  }

  const timeoutId = window.setTimeout(commit, HISTORY_COMMIT_FALLBACK_DELAY_MS)
  cancelScheduledCommit = () => window.clearTimeout(timeoutId)
}

interface HistoryStore {
  past: CanvasSnapshot[]
  future: CanvasSnapshot[]
  pendingBaseline: CanvasSnapshot | null
  isApplyingHistory: boolean
  canUndo: () => boolean
  canRedo: () => boolean
  beginTransaction: () => void
  commitTransaction: () => void
  scheduleCommit: () => void
  cancelTransaction: () => void
  clearHistory: () => void
  undo: () => void
  redo: () => void
  runTracked: <T>(action: () => T, options?: { deferCommit?: boolean }) => T
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  past: [],
  future: [],
  pendingBaseline: null,
  isApplyingHistory: false,

  canUndo: () => Boolean(get().pendingBaseline) || get().past.length > 0,

  canRedo: () => get().future.length > 0,

  beginTransaction: () => {
    if (get().isApplyingHistory || get().pendingBaseline) {
      return
    }

    set({ pendingBaseline: cloneSnapshot(useCanvasStore.getState().getHistorySnapshot()) })
  },

  commitTransaction: () => {
    cancelPendingScheduledCommit()

    const state = get()
    if (state.isApplyingHistory || !state.pendingBaseline) {
      return
    }

    const currentSnapshot = cloneSnapshot(useCanvasStore.getState().getHistorySnapshot())
    if (snapshotsEqual(state.pendingBaseline, currentSnapshot)) {
      set({ pendingBaseline: null })
      return
    }

    set({
      past: [...state.past, state.pendingBaseline],
      future: [],
      pendingBaseline: null,
    })
  },

  scheduleCommit: () => {
    cancelPendingScheduledCommit()

    scheduleDeferredCommit(() => {
      cancelScheduledCommit = null
      get().commitTransaction()
    })
  },

  cancelTransaction: () => {
    cancelPendingScheduledCommit()

    if (!get().pendingBaseline) {
      return
    }

    set({ pendingBaseline: null })
  },

  clearHistory: () => {
    cancelPendingScheduledCommit()

    set({
      past: [],
      future: [],
      pendingBaseline: null,
      isApplyingHistory: false,
    })
  },

  undo: () => {
    if (cancelScheduledCommit) {
      get().commitTransaction()
    }

    const state = get()
    if (state.isApplyingHistory || state.past.length === 0) {
      return
    }

    const previousSnapshot = state.past[state.past.length - 1]
    const currentSnapshot = cloneSnapshot(useCanvasStore.getState().getHistorySnapshot())

    set({
      isApplyingHistory: true,
      pendingBaseline: null,
      past: state.past.slice(0, -1),
      future: [currentSnapshot, ...state.future],
    })

    useCanvasStore.getState().replaceSnapshot(previousSnapshot)
    set({ isApplyingHistory: false })
  },

  redo: () => {
    if (cancelScheduledCommit) {
      get().commitTransaction()
    }

    const state = get()
    if (state.isApplyingHistory || state.future.length === 0) {
      return
    }

    const nextSnapshot = state.future[0]
    const currentSnapshot = cloneSnapshot(useCanvasStore.getState().getHistorySnapshot())

    set({
      isApplyingHistory: true,
      pendingBaseline: null,
      past: [...state.past, currentSnapshot],
      future: state.future.slice(1),
    })

    useCanvasStore.getState().replaceSnapshot(nextSnapshot)
    set({ isApplyingHistory: false })
  },

  runTracked: (action, options) => {
    if (get().isApplyingHistory) {
      return action()
    }

    const startedHere = !get().pendingBaseline
    if (startedHere) {
      get().beginTransaction()
    }

    const result = action()

    if (startedHere) {
      if (options?.deferCommit) {
        get().scheduleCommit()
      } else {
        get().commitTransaction()
      }
    }

    return result
  },
}))
