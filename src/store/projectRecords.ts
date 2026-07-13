import type { WorkspaceProjectSummary } from '@/platform/types'
import type { ProjectRecord, ProjectSnapshot, WorkspaceData } from '@/types'
import {
  DEFAULT_PROJECT_NAME,
  cloneProjectSnapshot,
  createEmptyProjectSnapshot,
  serializeProjectSnapshot,
} from '@/features/projectManager/runtime'

function createProjectId() {
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeProjectName(name?: string) {
  return name?.trim() || DEFAULT_PROJECT_NAME
}

export function createProjectRecord(
  name?: string,
  snapshot: ProjectSnapshot = createEmptyProjectSnapshot(),
): ProjectRecord {
  const now = Date.now()
  const clonedSnapshot = cloneProjectSnapshot(snapshot)

  return {
    id: createProjectId(),
    name: normalizeProjectName(name),
    savedSnapshot: clonedSnapshot,
    workingSnapshot: cloneProjectSnapshot(clonedSnapshot),
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    archivedAt: null,
  }
}

export function createProjectRecordFromSummary(summary: WorkspaceProjectSummary): ProjectRecord {
  const emptySnapshot = createEmptyProjectSnapshot()

  return {
    id: summary.id,
    name: summary.name,
    savedSnapshot: emptySnapshot,
    workingSnapshot: cloneProjectSnapshot(emptySnapshot),
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    lastOpenedAt: summary.lastOpenedAt,
    archivedAt: summary.archivedAt ?? null,
  }
}

export function buildPersistedSnapshotMap(projects: ProjectRecord[]) {
  return projects.reduce<Record<string, string>>((accumulator, project) => {
    accumulator[project.id] = serializeProjectSnapshot(project.workingSnapshot)
    return accumulator
  }, {})
}

export function getFallbackProject(data: WorkspaceData) {
  const availableProjects = data.projects.filter((project) => !project.archivedAt)
  return availableProjects.find((project) => project.id === data.lastOpenedProjectId)
    ?? availableProjects.find((project) => project.id === data.activeProjectId)
    ?? availableProjects[0]
    ?? null
}

export function getFallbackProjectSummary(data: {
  projects: WorkspaceProjectSummary[]
  activeProjectId: string | null
  lastOpenedProjectId: string | null
}) {
  const availableProjects = data.projects.filter((project) => !project.archivedAt)
  return availableProjects.find((project) => project.id === data.lastOpenedProjectId)
    ?? availableProjects.find((project) => project.id === data.activeProjectId)
    ?? availableProjects[0]
    ?? null
}
