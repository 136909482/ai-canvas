import type { CanvasSnapshot } from '@/types'

export const HISTORY_WARNING_BYTE_LIMIT = 50 * 1024 * 1024
export const HISTORY_DANGER_BYTE_LIMIT = 200 * 1024 * 1024

export type HistorySnapshotStack = 'past' | 'future' | 'pending'

export interface HistorySnapshotSizeEntry {
  stack: HistorySnapshotStack
  index: number
  byteSize: number
}

export interface HistorySizeReport {
  totalEntryCount: number
  pastEntryCount: number
  futureEntryCount: number
  pendingEntryCount: number
  totalByteSize: number
  warningByteLimit: number
  dangerByteLimit: number
  status: 'ok' | 'warning' | 'danger'
  largestSnapshot: HistorySnapshotSizeEntry | null
}

interface HistorySizeInput {
  past: CanvasSnapshot[]
  future: CanvasSnapshot[]
  pendingBaseline: CanvasSnapshot | null
}

function getUtf8ByteSize(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function getSnapshotByteSize(snapshot: CanvasSnapshot) {
  return getUtf8ByteSize(JSON.stringify(snapshot))
}

export function getHistorySizeStatus(byteSize: number): HistorySizeReport['status'] {
  if (byteSize >= HISTORY_DANGER_BYTE_LIMIT) {
    return 'danger'
  }

  if (byteSize >= HISTORY_WARNING_BYTE_LIMIT) {
    return 'warning'
  }

  return 'ok'
}

export function analyzeHistorySize(input: HistorySizeInput): HistorySizeReport {
  const entries: HistorySnapshotSizeEntry[] = [
    ...input.past.map((snapshot, index) => ({
      stack: 'past' as const,
      index,
      byteSize: getSnapshotByteSize(snapshot),
    })),
    ...input.future.map((snapshot, index) => ({
      stack: 'future' as const,
      index,
      byteSize: getSnapshotByteSize(snapshot),
    })),
    ...(input.pendingBaseline
      ? [{ stack: 'pending' as const, index: 0, byteSize: getSnapshotByteSize(input.pendingBaseline) }]
      : []),
  ]
  const totalByteSize = entries.reduce((sum, entry) => sum + entry.byteSize, 0)
  const largestSnapshot = entries.reduce<HistorySnapshotSizeEntry | null>(
    (largest, entry) => (!largest || entry.byteSize > largest.byteSize ? entry : largest),
    null,
  )

  return {
    totalEntryCount: entries.length,
    pastEntryCount: input.past.length,
    futureEntryCount: input.future.length,
    pendingEntryCount: input.pendingBaseline ? 1 : 0,
    totalByteSize,
    warningByteLimit: HISTORY_WARNING_BYTE_LIMIT,
    dangerByteLimit: HISTORY_DANGER_BYTE_LIMIT,
    status: getHistorySizeStatus(totalByteSize),
    largestSnapshot,
  }
}
