import { create } from 'zustand'

export type FeedbackToastTone = 'info' | 'success' | 'warning' | 'error'
export type FeedbackConfirmTone = 'default' | 'danger'

export interface FeedbackToast {
  id: string
  tone: FeedbackToastTone
  title: string
  message?: string
  durationMs: number
  diagnosticId?: string
}

export interface FeedbackConfirmRequest {
  id: string
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  tone: FeedbackConfirmTone
  resolve: (confirmed: boolean) => void
}

type NotifyOptions = {
  title: string
  message?: string
  tone?: FeedbackToastTone
  durationMs?: number
  diagnosticId?: string
}

type ConfirmOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: FeedbackConfirmTone
}

interface FeedbackStore {
  toasts: FeedbackToast[]
  confirmRequest: FeedbackConfirmRequest | null
  notify: (options: NotifyOptions) => string
  dismissToast: (id: string) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
  resolveConfirm: (confirmed: boolean) => void
}

function createFeedbackId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useFeedbackStore = create<FeedbackStore>()((set, get) => ({
  toasts: [],
  confirmRequest: null,

  notify: ({ title, message, tone = 'info', durationMs = 3600, diagnosticId }) => {
    const id = createFeedbackId('toast')
    const toast: FeedbackToast = {
      id,
      tone,
      title,
      message,
      durationMs,
      diagnosticId,
    }

    set((state) => ({
      toasts: [...state.toasts, toast].slice(-4),
    }))

    return id
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),

  confirm: (options) => {
    const previousRequest = get().confirmRequest
    previousRequest?.resolve(false)

    return new Promise<boolean>((resolve) => {
      set({
        confirmRequest: {
          id: createFeedbackId('confirm'),
          title: options.title,
          message: options.message,
          confirmLabel: options.confirmLabel ?? '确认',
          cancelLabel: options.cancelLabel ?? '取消',
          tone: options.tone ?? 'default',
          resolve,
        },
      })
    })
  },

  resolveConfirm: (confirmed) => {
    const request = get().confirmRequest
    if (!request) {
      return
    }

    request.resolve(confirmed)
    set({ confirmRequest: null })
  },
}))
