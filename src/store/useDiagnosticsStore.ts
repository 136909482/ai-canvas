import { create } from 'zustand'
import { createAppDiagnostic, type AppDiagnostic, type CreateDiagnosticInput } from '../features/diagnostics/runtime.ts'
import { useFeedbackStore } from './useFeedbackStore.ts'

const MAX_DIAGNOSTICS = 50
const DEDUPE_WINDOW_MS = 5_000

interface DiagnosticsStore {
  diagnostics: AppDiagnostic[]
  isOpen: boolean
  add: (diagnostic: AppDiagnostic) => void
  open: (diagnosticId?: string) => void
  close: () => void
  clear: () => void
}

export const useDiagnosticsStore = create<DiagnosticsStore>()((set) => ({
  diagnostics: [],
  isOpen: false,
  add: (diagnostic) => set((state) => ({
    diagnostics: [diagnostic, ...state.diagnostics].slice(0, MAX_DIAGNOSTICS),
  })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  clear: () => set({ diagnostics: [] }),
}))

export function reportDiagnostic(input: CreateDiagnosticInput, options?: { notify?: boolean }) {
  const diagnostic = createAppDiagnostic(input)
  const existing = useDiagnosticsStore.getState().diagnostics.find((item) => (
    item.code === diagnostic.code
    && item.message === diagnostic.message
    && diagnostic.occurredAt - item.occurredAt < DEDUPE_WINDOW_MS
  ))

  if (existing) {
    return existing
  }

  useDiagnosticsStore.getState().add(diagnostic)

  if (options?.notify ?? true) {
    useFeedbackStore.getState().notify({
      tone: 'error',
      title: diagnostic.title,
      message: diagnostic.message,
      diagnosticId: diagnostic.id,
      durationMs: 6_000,
    })
  }

  return diagnostic
}
