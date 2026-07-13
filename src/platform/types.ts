import type { CanvasSnapshot, ProjectRecord, WorkflowTemplateLibrary, WorkspaceConfigFile, WorkspaceData } from '@/types'

export interface WriteWorkspaceAssetInput {
  pathSegments: string[]
  fileName: string
  blob: Blob
}

export interface WriteWorkspaceAssetAtPathInput {
  relativePath: string
  blob: Blob
}

export interface WorkspaceAssetWriteResult {
  relativePath: string
  fileName: string
  mimeType: string
}

export type WorkspacePermissionState = PermissionState | 'unsupported'

export interface WorkspaceStatus {
  supported: boolean
  configured: boolean
  directoryName: string
  directoryPath?: string
  permission: WorkspacePermissionState
}

export interface WorkspaceProjectSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  archivedAt?: number | null
}

export interface WorkspaceProjectIndex {
  projects: WorkspaceProjectSummary[]
  activeProjectId: string | null
  lastOpenedProjectId: string | null
}

export interface SaveWorkspaceProjectInput {
  project: ProjectRecord
  activeProjectId?: string | null
  lastOpenedProjectId?: string | null
}

export interface DeleteWorkspaceProjectInput {
  projectId: string
  activeProjectId?: string | null
  lastOpenedProjectId?: string | null
}

export interface WorkflowImportResult {
  snapshot: CanvasSnapshot
  fileName: string
}

export interface CleanupWorkspaceAssetsResult {
  deletedCount: number
  deletedByteSize: number
}

export interface WorkspaceAssetDiskEntry {
  relativePath: string
  byteSize: number
}

export interface WorkspaceAssetDiskInspection {
  scannedAt: number
  totalFileCount: number
  totalByteSize: number
  referencedFileCount: number
  referencedByteSize: number
  orphanedFileCount: number
  orphanedByteSize: number
  orphanedFiles: WorkspaceAssetDiskEntry[]
  missingReferencedPaths: string[]
}

export type WorkspaceAuditScope = 'all' | 'workspace' | 'project' | 'settings' | 'template'
export type WorkspaceAuditDetailValue = string | number | boolean | null

export interface WorkspaceAuditEvent {
  id: number
  eventType: string
  entityId: string | null
  details: Record<string, WorkspaceAuditDetailValue>
  createdAt: number
}

export interface WorkspaceAuditQuery {
  scope?: WorkspaceAuditScope
  search?: string
  from?: number
  to?: number
  limit?: number
  offset?: number
}

export interface WorkspaceAuditQueryResult {
  supported: boolean
  entries: WorkspaceAuditEvent[]
  totalCount: number
  hasMore: boolean
}

export type WorkspaceSearchKind = 'project' | 'text' | 'asset'

export interface WorkspaceSearchQuery {
  text: string
  kinds?: WorkspaceSearchKind[]
  nodeTypes?: string[]
  limit?: number
}

export interface WorkspaceSearchEntry {
  documentId: string
  projectId: string
  projectName: string
  nodeId: string | null
  nodeType: string | null
  kind: WorkspaceSearchKind
  title: string
  snippet: string
  assetRelativePath: string | null
  updatedAt: number
  score: number
}

export interface WorkspaceSearchResult {
  supported: boolean
  indexedDocumentCount: number
  entries: WorkspaceSearchEntry[]
}

export type PlatformRuntimeKind = 'web' | 'desktop'

export interface WorkspaceBundleProjectSummary extends WorkspaceProjectSummary {
  fileName: string
}

export interface WorkspaceBundleManifest {
  type: 'ai-canvas-workspace-bundle'
  version: 1
  exportedAt: number
  projects: WorkspaceBundleProjectSummary[]
  activeProjectId: string | null
  lastOpenedProjectId: string | null
  includesConfig: boolean
  includesTemplates?: boolean
  projectRoot: 'projects'
  assetRoot: 'images'
}

export interface ExportWorkspaceBundleInput {
  data: WorkspaceData
  config?: WorkspaceConfigFile | null
  suggestedName?: string
}

export interface ImportWorkspaceBundleResult {
  data: WorkspaceData
  config: WorkspaceConfigFile | null
  templates: WorkflowTemplateLibrary | null
  manifest: WorkspaceBundleManifest
  importedAssetCount: number
}

export type ProjectImportResolution = 'preserve' | 'replace' | 'copy'

export interface ProjectBundleManifest {
  type: 'ai-canvas-project-bundle'
  version: 1
  exportedAt: number
  project: WorkspaceBundleProjectSummary
  projectRoot: 'projects'
  assetRoot: 'images'
}

export interface ExportProjectBundleInput {
  project: ProjectRecord
  suggestedName?: string
}

export interface ProjectBundleImportCandidate {
  candidateId: string
  project: WorkspaceProjectSummary
  assetCount: number
  hasIdConflict: boolean
}

export interface CommitProjectBundleImportInput {
  candidateId: string
  resolution: ProjectImportResolution
}

export interface CommitProjectBundleImportResult {
  project: ProjectRecord
  importedAssetCount: number
  resolution: ProjectImportResolution
  sourceProjectId: string
}

export interface WorkflowFile {
  type: 'ai-canvas-workflow'
  version: 1
  meta: {
    name: string
    exportedAt: number
  }
  nodes: CanvasSnapshot['nodes']
  edges: CanvasSnapshot['edges']
}

export interface PlatformBridge {
  getWorkspaceStatus: () => Promise<WorkspaceStatus>
  pickWorkspaceDirectory: () => Promise<WorkspaceStatus>
  loadWorkspaceData: () => Promise<WorkspaceData | null>
  saveWorkspaceData: (data: WorkspaceData) => Promise<void>
  listWorkspaceProjects: () => Promise<WorkspaceProjectIndex | null>
  loadWorkspaceProject: (projectId: string) => Promise<ProjectRecord | null>
  saveWorkspaceProject: (input: SaveWorkspaceProjectInput) => Promise<void>
  deleteWorkspaceProject: (input: DeleteWorkspaceProjectInput) => Promise<void>
  loadWorkspaceConfig: () => Promise<WorkspaceConfigFile | null>
  saveWorkspaceConfig: (config: WorkspaceConfigFile) => Promise<void>
  loadWorkflowTemplates: () => Promise<WorkflowTemplateLibrary | null>
  saveWorkflowTemplates: (library: WorkflowTemplateLibrary) => Promise<void>
  writeWorkspaceAsset: (input: WriteWorkspaceAssetInput) => Promise<WorkspaceAssetWriteResult>
  writeWorkspaceAssetAtPath: (input: WriteWorkspaceAssetAtPathInput) => Promise<WorkspaceAssetWriteResult>
  resolveWorkspaceAssetUrl: (relativePath: string) => Promise<string>
  clearWorkspaceAssetUrlCache: () => void
  inspectWorkspaceAssets: (data: WorkspaceData) => Promise<WorkspaceAssetDiskInspection>
  cleanupUnusedWorkspaceAssets: (data: WorkspaceData) => Promise<CleanupWorkspaceAssetsResult>
  queryWorkspaceAudit: (query: WorkspaceAuditQuery) => Promise<WorkspaceAuditQueryResult>
  searchWorkspace: (query: WorkspaceSearchQuery) => Promise<WorkspaceSearchResult>
  exportWorkflowJson: (snapshot: CanvasSnapshot, suggestedName: string) => Promise<void>
  importWorkflowJson: () => Promise<WorkflowImportResult>
  exportWorkspaceBundle: (input: ExportWorkspaceBundleInput) => Promise<void>
  importWorkspaceBundle: () => Promise<ImportWorkspaceBundleResult>
  exportProjectBundle: (input: ExportProjectBundleInput) => Promise<void>
  prepareProjectBundleImport: () => Promise<ProjectBundleImportCandidate>
  commitProjectBundleImport: (input: CommitProjectBundleImportInput) => Promise<CommitProjectBundleImportResult>
}
