import { migrateWorkspaceDataSnapshots } from '../../features/projectManager/migrations.ts'
import { redactWorkspaceConfigSecrets } from '../../features/settings/providerSecrets.ts'
import type {
  ImportWorkspaceBundleResult,
  WorkspaceBundleManifest,
  WorkspaceBundleProjectSummary,
} from '../types.ts'
import type {
  CanvasSnapshot,
  ProjectRecord,
  ProjectSnapshot,
  WorkspaceConfigFile,
  WorkspaceData,
  WorkflowTemplateLibrary,
} from '../../types/index.ts'
import {
  normalizeRelativePath,
  readBlobFileAtPath,
  readJsonFile,
  sanitizePathSegment,
  writeBlobFileAtPath,
  writeJsonFile,
} from './workspaceFiles.ts'

export const WORKSPACE_BUNDLE_MANIFEST_FILE_NAME = 'workspace.json'
export const WORKSPACE_BUNDLE_PROJECT_DIRECTORY_NAME = 'projects'
export const WORKSPACE_BUNDLE_CONFIG_DIRECTORY_NAME = '.config'
export const WORKSPACE_BUNDLE_CONFIG_FILE_NAME = 'config.json'
export const WORKSPACE_BUNDLE_TEMPLATE_FILE_NAME = 'workflow-templates.json'
export const WORKSPACE_BUNDLE_ASSET_DIRECTORY_NAME = 'images'

function assertBundle(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function getProjectSummary(project: ProjectRecord): WorkspaceBundleProjectSummary {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastOpenedAt: project.lastOpenedAt,
    archivedAt: project.archivedAt ?? null,
    fileName: getWorkspaceBundleProjectFileName(project.id),
  }
}

export function getWorkspaceBundleProjectFileName(projectId: string) {
  return `${sanitizePathSegment(projectId)}.json`
}

export function buildWorkspaceBundleManifest(
  data: WorkspaceData,
  includesConfig: boolean,
  exportedAt = Date.now(),
  includesTemplates = false,
): WorkspaceBundleManifest {
  return {
    type: 'ai-canvas-workspace-bundle',
    version: 1,
    exportedAt,
    projects: data.projects.map((project) => getProjectSummary(project)),
    activeProjectId: data.activeProjectId,
    lastOpenedProjectId: data.lastOpenedProjectId,
    includesConfig,
    includesTemplates,
    projectRoot: WORKSPACE_BUNDLE_PROJECT_DIRECTORY_NAME,
    assetRoot: WORKSPACE_BUNDLE_ASSET_DIRECTORY_NAME,
  }
}

function isBundleProjectSummary(value: unknown): value is WorkspaceBundleProjectSummary {
  if (!value || typeof value !== 'object') {
    return false
  }

  const project = value as Partial<WorkspaceBundleProjectSummary>
  return typeof project.id === 'string'
    && project.id.length > 0
    && typeof project.name === 'string'
    && typeof project.fileName === 'string'
    && typeof project.createdAt === 'number'
    && Number.isFinite(project.createdAt)
    && typeof project.updatedAt === 'number'
    && Number.isFinite(project.updatedAt)
    && typeof project.lastOpenedAt === 'number'
    && Number.isFinite(project.lastOpenedAt)
}

export function parseWorkspaceBundleManifest(value: unknown): WorkspaceBundleManifest {
  assertBundle(value && typeof value === 'object', '工作区目录包清单格式不正确')
  const manifest = value as Partial<WorkspaceBundleManifest>

  assertBundle(manifest.type === 'ai-canvas-workspace-bundle', '工作区目录包类型不正确')
  assertBundle(manifest.version === 1, '工作区目录包版本不受支持')
  assertBundle(typeof manifest.exportedAt === 'number' && Number.isFinite(manifest.exportedAt), '工作区目录包导出时间不正确')
  assertBundle(manifest.projectRoot === WORKSPACE_BUNDLE_PROJECT_DIRECTORY_NAME, '工作区目录包项目目录不正确')
  assertBundle(manifest.assetRoot === WORKSPACE_BUNDLE_ASSET_DIRECTORY_NAME, '工作区目录包资产目录不正确')
  assertBundle(typeof manifest.includesConfig === 'boolean', '工作区目录包配置标记不正确')
  assertBundle(Array.isArray(manifest.projects), '工作区目录包项目列表不正确')

  const projectIds = new Set<string>()
  for (const project of manifest.projects) {
    assertBundle(isBundleProjectSummary(project), '工作区目录包项目摘要不正确')
    assertBundle(sanitizePathSegment(project.id) === project.id, '工作区目录包项目 ID 不合法')
    assertBundle(project.fileName === getWorkspaceBundleProjectFileName(project.id), '工作区目录包项目文件名不合法')
    assertBundle(!projectIds.has(project.id), '工作区目录包存在重复项目 ID')
    projectIds.add(project.id)
  }

  const activeProjectId = manifest.activeProjectId ?? null
  const lastOpenedProjectId = manifest.lastOpenedProjectId ?? null
  assertBundle(activeProjectId === null || projectIds.has(activeProjectId), '工作区目录包当前项目不存在')
  assertBundle(lastOpenedProjectId === null || projectIds.has(lastOpenedProjectId), '工作区目录包最近项目不存在')

  return {
    type: manifest.type,
    version: manifest.version,
    exportedAt: manifest.exportedAt,
    projects: manifest.projects,
    activeProjectId,
    lastOpenedProjectId,
    includesConfig: manifest.includesConfig,
    includesTemplates: manifest.includesTemplates === true,
    projectRoot: manifest.projectRoot,
    assetRoot: manifest.assetRoot,
  }
}

function collectAssetPaths(asset: unknown, referencedPaths: Set<string>) {
  if (!asset || typeof asset !== 'object') {
    return
  }

  const candidate = asset as {
    relativePath?: unknown
    thumbnailRelativePath?: unknown
    previewRelativePath?: unknown
  }

  for (const path of [candidate.relativePath, candidate.thumbnailRelativePath, candidate.previewRelativePath]) {
    if (typeof path !== 'string') {
      continue
    }

    const normalizedPath = normalizeRelativePath(path)
    assertBundle(
      normalizedPath === WORKSPACE_BUNDLE_ASSET_DIRECTORY_NAME
      || normalizedPath.startsWith(`${WORKSPACE_BUNDLE_ASSET_DIRECTORY_NAME}/`),
      '工作区资产路径必须位于 images/ 目录',
    )
    referencedPaths.add(normalizedPath)
  }
}

function getNodeAsset(node: CanvasSnapshot['nodes'][number]) {
  return node.type === 'videoNode' ? node.data?.videoAsset : node.data?.imageAsset
}

function collectSnapshotAssetPaths(snapshot: ProjectSnapshot, referencedPaths: Set<string>) {
  for (const node of snapshot.canvas.nodes) {
    collectAssetPaths(getNodeAsset(node), referencedPaths)
  }

  for (const task of snapshot.taskQueue.tasks) {
    collectAssetPaths(task.resultImageAsset, referencedPaths)
    collectAssetPaths(task.resultVideoAsset, referencedPaths)
  }
}

export function collectWorkspaceReferencedAssetPaths(data: WorkspaceData) {
  const referencedPaths = new Set<string>()

  for (const project of data.projects) {
    collectSnapshotAssetPaths(project.savedSnapshot, referencedPaths)
    collectSnapshotAssetPaths(project.workingSnapshot, referencedPaths)
  }

  return [...referencedPaths].sort((left, right) => left.localeCompare(right))
}

function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }

  const snapshot = value as Partial<ProjectSnapshot>
  return Boolean(
    snapshot.canvas
    && typeof snapshot.canvas === 'object'
    && Array.isArray(snapshot.canvas.nodes)
    && Array.isArray(snapshot.canvas.edges)
    && snapshot.taskQueue
    && typeof snapshot.taskQueue === 'object'
    && Array.isArray(snapshot.taskQueue.tasks),
  )
}

function parseProjectRecord(value: unknown, expectedId: string): ProjectRecord {
  assertBundle(value && typeof value === 'object', '工作区目录包项目文件格式不正确')
  const project = value as Partial<ProjectRecord>
  assertBundle(project.id === expectedId, '工作区目录包项目 ID 与清单不一致')
  assertBundle(typeof project.name === 'string', '工作区目录包项目名称不正确')
  assertBundle(isProjectSnapshot(project.savedSnapshot), '工作区目录包保存快照不正确')
  assertBundle(isProjectSnapshot(project.workingSnapshot), '工作区目录包工作快照不正确')

  return {
    id: project.id,
    name: project.name,
    savedSnapshot: project.savedSnapshot,
    workingSnapshot: project.workingSnapshot,
    createdAt: typeof project.createdAt === 'number' ? project.createdAt : Date.now(),
    updatedAt: typeof project.updatedAt === 'number' ? project.updatedAt : Date.now(),
    lastOpenedAt: typeof project.lastOpenedAt === 'number' ? project.lastOpenedAt : Date.now(),
    archivedAt: typeof project.archivedAt === 'number' ? project.archivedAt : null,
  }
}

function parseWorkspaceConfig(value: unknown): WorkspaceConfigFile {
  assertBundle(value && typeof value === 'object', '工作区目录包配置格式不正确')
  const config = value as Partial<WorkspaceConfigFile>
  assertBundle(config.version === 1, '工作区目录包配置版本不受支持')
  assertBundle(typeof config.model === 'string', '工作区目录包默认模型不正确')
  assertBundle(Array.isArray(config.customModels), '工作区目录包模型列表不正确')
  assertBundle(config.storage && typeof config.storage === 'object', '工作区目录包存储配置不正确')
  return config as WorkspaceConfigFile
}

function parseWorkflowTemplates(value: unknown): WorkflowTemplateLibrary {
  assertBundle(value && typeof value === 'object', '工作区目录包模板格式不正确')
  const library = value as Partial<WorkflowTemplateLibrary>
  assertBundle(library.type === 'ai-canvas-workflow-templates' && library.version === 1, '工作区目录包模板版本不受支持')
  assertBundle(Array.isArray(library.templates), '工作区目录包模板列表不正确')
  return library as WorkflowTemplateLibrary
}

export async function writeWorkspaceBundleDirectory(input: {
  sourceWorkspaceHandle: FileSystemDirectoryHandle
  bundleHandle: FileSystemDirectoryHandle
  data: WorkspaceData
  config: WorkspaceConfigFile | null
  templates?: WorkflowTemplateLibrary | null
}) {
  if (await input.sourceWorkspaceHandle.isSameEntry(input.bundleHandle)) {
    throw new Error('导出目录不能与当前工作区相同')
  }

  const manifest = buildWorkspaceBundleManifest(input.data, Boolean(input.config), Date.now(), Boolean(input.templates))
  const projectDirectory = await input.bundleHandle.getDirectoryHandle(WORKSPACE_BUNDLE_PROJECT_DIRECTORY_NAME, { create: true })

  for (const project of input.data.projects) {
    await writeJsonFile(projectDirectory, getWorkspaceBundleProjectFileName(project.id), project)
  }

  if (input.config) {
    const configDirectory = await input.bundleHandle.getDirectoryHandle(WORKSPACE_BUNDLE_CONFIG_DIRECTORY_NAME, { create: true })
    await writeJsonFile(configDirectory, WORKSPACE_BUNDLE_CONFIG_FILE_NAME, redactWorkspaceConfigSecrets(input.config))
  }

  if (input.templates) {
    const configDirectory = await input.bundleHandle.getDirectoryHandle(WORKSPACE_BUNDLE_CONFIG_DIRECTORY_NAME, { create: true })
    await writeJsonFile(configDirectory, WORKSPACE_BUNDLE_TEMPLATE_FILE_NAME, input.templates)
  }

  for (const relativePath of collectWorkspaceReferencedAssetPaths(input.data)) {
    const sourceFile = await readBlobFileAtPath(input.sourceWorkspaceHandle, relativePath)
    await writeBlobFileAtPath(input.bundleHandle, relativePath, sourceFile)
  }

  await writeJsonFile(input.bundleHandle, WORKSPACE_BUNDLE_MANIFEST_FILE_NAME, manifest)
  return manifest
}

export async function readWorkspaceBundleDirectory(
  bundleHandle: FileSystemDirectoryHandle,
): Promise<ImportWorkspaceBundleResult> {
  const rawManifest = await readJsonFile<unknown>(bundleHandle, WORKSPACE_BUNDLE_MANIFEST_FILE_NAME)
  const manifest = parseWorkspaceBundleManifest(rawManifest)
  const projectDirectory = await bundleHandle.getDirectoryHandle(WORKSPACE_BUNDLE_PROJECT_DIRECTORY_NAME)
  const projects: ProjectRecord[] = []

  for (const summary of manifest.projects) {
    const project = await readJsonFile<unknown>(projectDirectory, summary.fileName)
    projects.push(parseProjectRecord(project, summary.id))
  }

  let config: WorkspaceConfigFile | null = null
  if (manifest.includesConfig) {
    const configDirectory = await bundleHandle.getDirectoryHandle(WORKSPACE_BUNDLE_CONFIG_DIRECTORY_NAME)
    config = parseWorkspaceConfig(await readJsonFile<unknown>(configDirectory, WORKSPACE_BUNDLE_CONFIG_FILE_NAME))
  }

  let templates: WorkflowTemplateLibrary | null = null
  if (manifest.includesTemplates) {
    const configDirectory = await bundleHandle.getDirectoryHandle(WORKSPACE_BUNDLE_CONFIG_DIRECTORY_NAME)
    templates = parseWorkflowTemplates(await readJsonFile<unknown>(configDirectory, WORKSPACE_BUNDLE_TEMPLATE_FILE_NAME))
  }

  const data = migrateWorkspaceDataSnapshots({
    projects,
    activeProjectId: manifest.activeProjectId,
    lastOpenedProjectId: manifest.lastOpenedProjectId,
  })
  const assetPaths = collectWorkspaceReferencedAssetPaths(data)

  for (const relativePath of assetPaths) {
    await readBlobFileAtPath(bundleHandle, relativePath)
  }

  return {
    data,
    config,
    templates,
    manifest,
    importedAssetCount: assetPaths.length,
  }
}

export async function copyWorkspaceBundleAssets(input: {
  bundleHandle: FileSystemDirectoryHandle
  workspaceHandle: FileSystemDirectoryHandle
  data: WorkspaceData
}) {
  const assetPaths = collectWorkspaceReferencedAssetPaths(input.data)

  for (const relativePath of assetPaths) {
    const sourceFile = await readBlobFileAtPath(input.bundleHandle, relativePath)
    await writeBlobFileAtPath(input.workspaceHandle, relativePath, sourceFile)
  }

  return assetPaths.length
}

export async function createUniqueWorkspaceBundleDirectory(
  parentHandle: FileSystemDirectoryHandle,
  suggestedName: string,
) {
  const baseName = sanitizePathSegment(suggestedName.replace(/\.zip$/i, '').trim() || 'ai-canvas-workspace')
  const uniqueName = `${baseName}-${Date.now()}`
  return parentHandle.getDirectoryHandle(uniqueName, { create: true })
}

export async function assertDistinctWorkspaceDirectories(
  left: FileSystemDirectoryHandle,
  right: FileSystemDirectoryHandle,
) {
  assertBundle(!(await left.isSameEntry(right)), '工作区目录包不能与当前工作区使用同一目录')
}
