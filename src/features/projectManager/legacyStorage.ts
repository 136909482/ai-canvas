import type { WorkspaceData } from '@/types'

const LEGACY_PROJECT_STORAGE_KEY = 'ai-canvas-projects'

interface LegacyPersistedProjectStore {
  state?: WorkspaceData
}

export function readLegacyWorkspaceData() {
  try {
    const raw = window.localStorage.getItem(LEGACY_PROJECT_STORAGE_KEY)

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as LegacyPersistedProjectStore | WorkspaceData | null
    const maybeState = parsed && typeof parsed === 'object' && 'state' in parsed ? parsed.state : parsed

    if (!maybeState || !Array.isArray((maybeState as WorkspaceData).projects)) {
      return null
    }

    const state = maybeState as WorkspaceData

    return {
      projects: state.projects,
      activeProjectId: state.activeProjectId ?? null,
      lastOpenedProjectId: state.lastOpenedProjectId ?? null,
    } satisfies WorkspaceData
  } catch {
    return null
  }
}
