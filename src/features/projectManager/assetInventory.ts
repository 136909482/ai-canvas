import type { CanvasSnapshot, ProjectSnapshot, WorkspaceData } from '@/types'

export type WorkspaceAssetReferenceKind = 'original' | 'thumbnail' | 'preview'
export type WorkspaceAssetSnapshotKind = 'saved' | 'working'
export type WorkspaceAssetSourceKind = 'node' | 'task'

export interface WorkspaceAssetReference {
  path: string
  kind: WorkspaceAssetReferenceKind
  projectId: string
  projectName: string
  snapshotKind: WorkspaceAssetSnapshotKind
  sourceKind: WorkspaceAssetSourceKind
  sourceId: string
  assetField: 'imageAsset' | 'videoAsset' | 'resultImageAsset' | 'resultVideoAsset'
}

export interface ProjectAssetInventorySummary {
  projectId: string
  projectName: string
  uniquePathCount: number
  originalCount: number
  thumbnailCount: number
  previewCount: number
}

export interface WorkspaceAssetInventorySummary {
  totalUniquePathCount: number
  originalCount: number
  thumbnailCount: number
  previewCount: number
  nodeReferenceCount: number
  taskReferenceCount: number
  projectSummaries: ProjectAssetInventorySummary[]
  activeProjectSummary: ProjectAssetInventorySummary | null
}

interface ReferenceContext {
  projectId: string
  projectName: string
  snapshotKind: WorkspaceAssetSnapshotKind
  sourceKind: WorkspaceAssetSourceKind
  sourceId: string
  assetField: WorkspaceAssetReference['assetField']
}

interface MutableProjectSummary {
  projectId: string
  projectName: string
  paths: Set<string>
  originalPaths: Set<string>
  thumbnailPaths: Set<string>
  previewPaths: Set<string>
}

function normalizeWorkspaceAssetReferencePath(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.replace(/\\+/g, '/').replace(/\/+/g, '/').trim()
  return normalized ? normalized : null
}

function collectAssetReferences(
  asset: unknown,
  context: ReferenceContext,
  references: WorkspaceAssetReference[],
) {
  if (!asset || typeof asset !== 'object') {
    return
  }

  const candidate = asset as {
    relativePath?: unknown
    thumbnailRelativePath?: unknown
    previewRelativePath?: unknown
  }
  const paths: Array<[WorkspaceAssetReferenceKind, unknown]> = [
    ['original', candidate.relativePath],
    ['thumbnail', candidate.thumbnailRelativePath],
    ['preview', candidate.previewRelativePath],
  ]

  for (const [kind, rawPath] of paths) {
    const path = normalizeWorkspaceAssetReferencePath(rawPath)
    if (!path) {
      continue
    }

    references.push({
      ...context,
      kind,
      path,
    })
  }
}

function getNodeAssetReference(node: CanvasSnapshot['nodes'][number]) {
  if (node.type === 'videoNode') {
    return {
      asset: node.data?.videoAsset,
      assetField: 'videoAsset' as const,
    }
  }

  return {
    asset: node.data?.imageAsset,
    assetField: 'imageAsset' as const,
  }
}

function collectSnapshotAssetReferences(
  snapshot: ProjectSnapshot,
  context: Pick<ReferenceContext, 'projectId' | 'projectName' | 'snapshotKind'>,
  references: WorkspaceAssetReference[],
) {
  for (const node of snapshot.canvas.nodes) {
    const nodeAsset = getNodeAssetReference(node)
    collectAssetReferences(nodeAsset.asset, {
      ...context,
      sourceKind: 'node',
      sourceId: node.id,
      assetField: nodeAsset.assetField,
    }, references)
  }

  for (const task of snapshot.taskQueue.tasks) {
    collectAssetReferences(task.resultImageAsset, {
      ...context,
      sourceKind: 'task',
      sourceId: task.id,
      assetField: 'resultImageAsset',
    }, references)
    collectAssetReferences(task.resultVideoAsset, {
      ...context,
      sourceKind: 'task',
      sourceId: task.id,
      assetField: 'resultVideoAsset',
    }, references)
  }
}

export function collectWorkspaceAssetReferences(data: WorkspaceData) {
  const references: WorkspaceAssetReference[] = []

  for (const project of data.projects) {
    const context = {
      projectId: project.id,
      projectName: project.name,
    }

    collectSnapshotAssetReferences(project.savedSnapshot, {
      ...context,
      snapshotKind: 'saved',
    }, references)
    collectSnapshotAssetReferences(project.workingSnapshot, {
      ...context,
      snapshotKind: 'working',
    }, references)
  }

  return references
}

function getOrCreateProjectSummary(
  summaries: Map<string, MutableProjectSummary>,
  reference: WorkspaceAssetReference,
) {
  const existing = summaries.get(reference.projectId)
  if (existing) {
    return existing
  }

  const nextSummary: MutableProjectSummary = {
    projectId: reference.projectId,
    projectName: reference.projectName,
    paths: new Set(),
    originalPaths: new Set(),
    thumbnailPaths: new Set(),
    previewPaths: new Set(),
  }
  summaries.set(reference.projectId, nextSummary)
  return nextSummary
}

function finalizeProjectSummary(summary: MutableProjectSummary): ProjectAssetInventorySummary {
  return {
    projectId: summary.projectId,
    projectName: summary.projectName,
    uniquePathCount: summary.paths.size,
    originalCount: summary.originalPaths.size,
    thumbnailCount: summary.thumbnailPaths.size,
    previewCount: summary.previewPaths.size,
  }
}

export function summarizeWorkspaceAssetReferences(data: WorkspaceData): WorkspaceAssetInventorySummary {
  const references = collectWorkspaceAssetReferences(data)
  const paths = new Set<string>()
  const originalPaths = new Set<string>()
  const thumbnailPaths = new Set<string>()
  const previewPaths = new Set<string>()
  const projectSummaryMap = new Map<string, MutableProjectSummary>()
  let nodeReferenceCount = 0
  let taskReferenceCount = 0

  for (const reference of references) {
    paths.add(reference.path)

    if (reference.kind === 'original') {
      originalPaths.add(reference.path)
    } else if (reference.kind === 'thumbnail') {
      thumbnailPaths.add(reference.path)
    } else {
      previewPaths.add(reference.path)
    }

    if (reference.sourceKind === 'node') {
      nodeReferenceCount += 1
    } else {
      taskReferenceCount += 1
    }

    const projectSummary = getOrCreateProjectSummary(projectSummaryMap, reference)
    projectSummary.paths.add(reference.path)
    if (reference.kind === 'original') {
      projectSummary.originalPaths.add(reference.path)
    } else if (reference.kind === 'thumbnail') {
      projectSummary.thumbnailPaths.add(reference.path)
    } else {
      projectSummary.previewPaths.add(reference.path)
    }
  }

  const projectSummaries = Array.from(projectSummaryMap.values())
    .map(finalizeProjectSummary)
    .sort((left, right) => left.projectName.localeCompare(right.projectName))

  return {
    totalUniquePathCount: paths.size,
    originalCount: originalPaths.size,
    thumbnailCount: thumbnailPaths.size,
    previewCount: previewPaths.size,
    nodeReferenceCount,
    taskReferenceCount,
    projectSummaries,
    activeProjectSummary: data.activeProjectId
      ? projectSummaries.find((summary) => summary.projectId === data.activeProjectId) ?? null
      : null,
  }
}
