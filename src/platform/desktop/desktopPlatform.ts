import { migrateWorkspaceDataSnapshots } from '@/features/projectManager/migrations'
import { sanitizeWorkspaceDataForPersistence } from '@/features/projectManager/snapshotSize'
import { redactWorkspaceConfigSecrets } from '@/features/settings/providerSecrets'
import type { PlatformBridge, WorkflowFile, WorkflowImportResult } from '@/platform/types'
import type { CanvasSnapshot } from '@/types'

interface DesktopAssetPayload {
  bytes: Uint8Array | ArrayBuffer
  mimeType: string
}

interface DesktopApi {
  runtime: 'electron'
  getWorkspaceStatus: PlatformBridge['getWorkspaceStatus']
  pickWorkspaceDirectory: PlatformBridge['pickWorkspaceDirectory']
  loadWorkspaceData: PlatformBridge['loadWorkspaceData']
  saveWorkspaceData: PlatformBridge['saveWorkspaceData']
  listWorkspaceProjects: PlatformBridge['listWorkspaceProjects']
  loadWorkspaceProject: PlatformBridge['loadWorkspaceProject']
  saveWorkspaceProject: PlatformBridge['saveWorkspaceProject']
  deleteWorkspaceProject: PlatformBridge['deleteWorkspaceProject']
  loadWorkspaceConfig: PlatformBridge['loadWorkspaceConfig']
  saveWorkspaceConfig: PlatformBridge['saveWorkspaceConfig']
  loadWorkflowTemplates: PlatformBridge['loadWorkflowTemplates']
  saveWorkflowTemplates: PlatformBridge['saveWorkflowTemplates']
  queryWorkspaceAudit: PlatformBridge['queryWorkspaceAudit']
  searchWorkspace: PlatformBridge['searchWorkspace']
  writeWorkspaceAsset: (input: { pathSegments: string[]; fileName: string; bytes: ArrayBuffer; mimeType: string }) => ReturnType<PlatformBridge['writeWorkspaceAsset']>
  writeWorkspaceAssetAtPath: (input: { relativePath: string; bytes: ArrayBuffer; mimeType: string }) => ReturnType<PlatformBridge['writeWorkspaceAssetAtPath']>
  readWorkspaceAsset: (relativePath: string) => Promise<DesktopAssetPayload>
  inspectWorkspaceAssets: PlatformBridge['inspectWorkspaceAssets']
  cleanupUnusedWorkspaceAssets: PlatformBridge['cleanupUnusedWorkspaceAssets']
  exportWorkspaceBundle: PlatformBridge['exportWorkspaceBundle']
  importWorkspaceBundle: PlatformBridge['importWorkspaceBundle']
  exportProjectBundle: PlatformBridge['exportProjectBundle']
  prepareProjectBundleImport: PlatformBridge['prepareProjectBundleImport']
  commitProjectBundleImport: PlatformBridge['commitProjectBundleImport']
  exportWorkflowJson: (input: { workflow: WorkflowFile; suggestedName: string }) => Promise<void>
  importWorkflowJson: () => Promise<{ content: string; fileName: string }>
}

declare global {
  interface Window {
    aiCanvasDesktop?: DesktopApi
  }
}

const workspaceAssetUrlCache = new Map<string, string>()

function getDesktopApi() {
  const api = window.aiCanvasDesktop
  if (!api || api.runtime !== 'electron') throw new Error('Electron 桌面桥接不可用')
  return api
}

function clearWorkspaceAssetUrlCache() {
  for (const objectUrl of workspaceAssetUrlCache.values()) URL.revokeObjectURL(objectUrl)
  workspaceAssetUrlCache.clear()
}

function buildWorkflowFile(snapshot: CanvasSnapshot, suggestedName: string): WorkflowFile {
  return {
    type: 'ai-canvas-workflow',
    version: 1,
    meta: {
      name: suggestedName.replace(/\.json$/i, '').trim() || 'workflow',
      exportedAt: Date.now(),
    },
    nodes: snapshot.nodes,
    edges: snapshot.edges,
  }
}

function parseCanvasSnapshot(content: string): CanvasSnapshot {
  const parsed = JSON.parse(content) as Partial<CanvasSnapshot> | Partial<WorkflowFile> | null
  if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error('工作流文件格式不正确')
  }
  return { nodes: parsed.nodes, edges: parsed.edges }
}

export function isElectronRuntime() {
  return typeof window !== 'undefined' && window.aiCanvasDesktop?.runtime === 'electron'
}

export const desktopPlatformBridge: PlatformBridge = {
  getWorkspaceStatus: () => getDesktopApi().getWorkspaceStatus(),

  async pickWorkspaceDirectory() {
    clearWorkspaceAssetUrlCache()
    return getDesktopApi().pickWorkspaceDirectory()
  },

  loadWorkspaceData: () => getDesktopApi().loadWorkspaceData(),
  saveWorkspaceData: (data) => getDesktopApi().saveWorkspaceData(sanitizeWorkspaceDataForPersistence(data)),
  listWorkspaceProjects: () => getDesktopApi().listWorkspaceProjects(),
  loadWorkspaceProject: (projectId) => getDesktopApi().loadWorkspaceProject(projectId),
  saveWorkspaceProject: (input) => getDesktopApi().saveWorkspaceProject(input),
  deleteWorkspaceProject: (input) => getDesktopApi().deleteWorkspaceProject(input),
  loadWorkspaceConfig: () => getDesktopApi().loadWorkspaceConfig(),
  saveWorkspaceConfig: (config) => getDesktopApi().saveWorkspaceConfig(config),
  loadWorkflowTemplates: () => getDesktopApi().loadWorkflowTemplates(),
  saveWorkflowTemplates: (library) => getDesktopApi().saveWorkflowTemplates(library),
  queryWorkspaceAudit: (query) => getDesktopApi().queryWorkspaceAudit(query),
  searchWorkspace: (query) => getDesktopApi().searchWorkspace(query),

  async writeWorkspaceAsset(input) {
    return getDesktopApi().writeWorkspaceAsset({
      pathSegments: input.pathSegments,
      fileName: input.fileName,
      bytes: await input.blob.arrayBuffer(),
      mimeType: input.blob.type,
    })
  },

  async writeWorkspaceAssetAtPath(input) {
    const result = await getDesktopApi().writeWorkspaceAssetAtPath({
      relativePath: input.relativePath,
      bytes: await input.blob.arrayBuffer(),
      mimeType: input.blob.type,
    })
    const cachedUrl = workspaceAssetUrlCache.get(result.relativePath)
    if (cachedUrl) {
      URL.revokeObjectURL(cachedUrl)
      workspaceAssetUrlCache.delete(result.relativePath)
    }
    return result
  },

  async resolveWorkspaceAssetUrl(relativePath) {
    const cachedUrl = workspaceAssetUrlCache.get(relativePath)
    if (cachedUrl) return cachedUrl
    const asset = await getDesktopApi().readWorkspaceAsset(relativePath)
    const bytes = asset.bytes instanceof ArrayBuffer ? new Uint8Array(asset.bytes) : Uint8Array.from(asset.bytes)
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: asset.mimeType }))
    workspaceAssetUrlCache.set(relativePath, objectUrl)
    return objectUrl
  },

  clearWorkspaceAssetUrlCache,
  inspectWorkspaceAssets: (data) => getDesktopApi().inspectWorkspaceAssets(data),
  cleanupUnusedWorkspaceAssets: (data) => getDesktopApi().cleanupUnusedWorkspaceAssets(data),

  async exportWorkspaceBundle(input) {
    await getDesktopApi().exportWorkspaceBundle({
      ...input,
      data: sanitizeWorkspaceDataForPersistence(input.data),
      config: input.config ? redactWorkspaceConfigSecrets(input.config) : null,
    })
  },

  async importWorkspaceBundle() {
    const result = await getDesktopApi().importWorkspaceBundle()
    clearWorkspaceAssetUrlCache()
    return {
      ...result,
      data: migrateWorkspaceDataSnapshots(result.data),
    }
  },

  exportProjectBundle: (input) => getDesktopApi().exportProjectBundle(input),
  prepareProjectBundleImport: () => getDesktopApi().prepareProjectBundleImport(),
  async commitProjectBundleImport(input) {
    const result = await getDesktopApi().commitProjectBundleImport(input)
    clearWorkspaceAssetUrlCache()
    return result
  },

  exportWorkflowJson: (snapshot, suggestedName) => getDesktopApi().exportWorkflowJson({
    workflow: buildWorkflowFile(snapshot, suggestedName),
    suggestedName,
  }),

  async importWorkflowJson(): Promise<WorkflowImportResult> {
    const result = await getDesktopApi().importWorkflowJson()
    return { snapshot: parseCanvasSnapshot(result.content), fileName: result.fileName }
  },
}
