import type { ProjectRecord, ProjectSnapshot, CanvasSnapshot, WorkflowTemplateLibrary, WorkspaceConfigFile, WorkspaceData } from '@/types'
import { sanitizeWorkspaceDataForPersistence } from '@/features/projectManager/snapshotSize'
import type {
  DeleteWorkspaceProjectInput,
  ProjectBundleImportCandidate,
  PlatformBridge,
  SaveWorkspaceProjectInput,
  WorkflowFile,
  WorkflowImportResult,
  WorkspaceProjectIndex,
  WorkspaceProjectSummary,
  WorkspacePermissionState,
  WorkspaceStatus,
} from '@/platform/types'
import { getStoredWorkspaceDirectoryHandle, setStoredWorkspaceDirectoryHandle } from './workspaceHandleStore'
import {
  assertDistinctWorkspaceDirectories,
  collectWorkspaceReferencedAssetPaths,
  copyWorkspaceBundleAssets,
  createUniqueWorkspaceBundleDirectory,
  readWorkspaceBundleDirectory,
  writeWorkspaceBundleDirectory,
} from './workspaceBundle'
import {
  copyProjectBundleAssets,
  prepareImportedProject,
  readProjectBundleDirectory,
  writeProjectBundleDirectory,
} from './projectBundle'
import {
  WORKSPACE_CONFIG_DIRECTORY_NAME,
  WORKSPACE_CONFIG_FILE_NAME,
  WORKSPACE_TEMPLATE_FILE_NAME,
  WORKSPACE_IMAGE_DIRECTORY_NAME,
  WORKSPACE_MANIFEST_FILE_NAME,
  getImageExtension,
  getNestedDirectoryHandle,
  normalizeRelativePath,
  readJsonFile,
  removeFileIfExists,
  sanitizePathSegment,
  splitFileName,
  writeBlobFile,
  writeJsonFile,
  writeJsonFileIfChanged,
} from './workspaceFiles'
import {
  isLegacyWorkspaceData,
  isWorkspaceManifest,
  normalizeStoredProjectRecord,
  type StoredProjectRecord,
  type WorkspaceManifest,
  type WorkspaceManifestProject,
} from './workspaceCompatibility'
import { extractProjectSearchDocuments, searchWorkspaceDocuments } from '@/features/workspaceSearch/runtime'

const workspaceAssetUrlCache = new Map<string, string>()
const pendingProjectBundleImports = new Map<string, {
  bundleHandle: FileSystemDirectoryHandle
  project: ProjectRecord
  assetPaths: string[]
}>()

function clearWorkspaceAssetUrlCache() {
  for (const objectUrl of workspaceAssetUrlCache.values()) {
    URL.revokeObjectURL(objectUrl)
  }

  workspaceAssetUrlCache.clear()
}

interface WorkspaceProjectFileSummary extends WorkspaceProjectSummary {
  fileName: string
}

function supportsDirectoryPicker() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

function getProjectFileName(projectId: string) {
  return `${projectId}.json`
}

function getManifestProjectSummary(project: WorkspaceManifestProject): WorkspaceProjectSummary {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastOpenedAt: project.lastOpenedAt,
    archivedAt: project.archivedAt ?? null,
  }
}

function getProjectRecordSummary(project: ProjectRecord): WorkspaceProjectSummary {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastOpenedAt: project.lastOpenedAt,
    archivedAt: project.archivedAt ?? null,
  }
}

function getProjectManifestEntry(project: ProjectRecord): WorkspaceManifestProject {
  return {
    ...getProjectRecordSummary(project),
    fileName: getProjectFileName(project.id),
  }
}

function buildWorkspaceManifest(input: {
  projects: WorkspaceProjectFileSummary[]
  activeProjectId: string | null
  lastOpenedProjectId: string | null
}): WorkspaceManifest {
  return {
    activeProjectId: input.activeProjectId,
    lastOpenedProjectId: input.lastOpenedProjectId,
    projects: input.projects.map((project) => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      lastOpenedAt: project.lastOpenedAt,
      archivedAt: project.archivedAt ?? null,
      fileName: project.fileName,
    })),
  }
}

async function getDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  requestWritePermission: boolean,
): Promise<WorkspacePermissionState> {
  const options = { mode: 'readwrite' as const }
  const current = await handle.queryPermission(options)

  if (current === 'granted' || !requestWritePermission) {
    return current
  }

  return handle.requestPermission(options)
}

async function getWorkspaceDirectoryHandle(options?: { requestWritePermission?: boolean }) {
  const requestWritePermission = options?.requestWritePermission ?? false
  const handle = await getStoredWorkspaceDirectoryHandle()

  if (!handle) {
    return {
      handle: null,
      status: {
        supported: supportsDirectoryPicker(),
        configured: false,
        directoryName: '',
        permission: supportsDirectoryPicker() ? 'prompt' : 'unsupported',
      } satisfies WorkspaceStatus,
    }
  }

  try {
    const permission = await getDirectoryPermission(handle, requestWritePermission)

    if (permission === 'denied') {
      return {
        handle: null,
        status: {
          supported: true,
          configured: true,
          directoryName: handle.name,
          permission,
        } satisfies WorkspaceStatus,
      }
    }

    return {
      handle,
      status: {
        supported: true,
        configured: true,
        directoryName: handle.name,
        permission,
      } satisfies WorkspaceStatus,
    }
  } catch {
    return {
      handle,
      status: {
        supported: true,
        configured: true,
        directoryName: handle.name,
        permission: 'prompt',
      } satisfies WorkspaceStatus,
    }
  }
}

async function readWorkspaceDataFromManifest(
  handle: FileSystemDirectoryHandle,
  manifest: WorkspaceManifest,
) {
  const projects: ProjectRecord[] = []

  for (const project of manifest.projects) {
    const record = normalizeStoredProjectRecord(await readJsonFile<ProjectRecord | StoredProjectRecord>(handle, project.fileName))

    if (!record) {
      continue
    }

    projects.push(record)
  }

  return {
    projects,
    activeProjectId: manifest.activeProjectId,
    lastOpenedProjectId: manifest.lastOpenedProjectId,
  } satisfies WorkspaceData
}

function getWorkspaceProjectIndexFromManifest(manifest: WorkspaceManifest): WorkspaceProjectIndex {
  return {
    projects: manifest.projects.map((project) => getManifestProjectSummary(project)),
    activeProjectId: manifest.activeProjectId,
    lastOpenedProjectId: manifest.lastOpenedProjectId,
  }
}

function getWorkspaceProjectIndexFromData(data: WorkspaceData): WorkspaceProjectIndex {
  return {
    projects: data.projects.map((project) => getProjectRecordSummary(project)),
    activeProjectId: data.activeProjectId,
    lastOpenedProjectId: data.lastOpenedProjectId,
  }
}

function areProjectSnapshotsEqual(left: ProjectSnapshot, right: ProjectSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function compactProjectRecordForStorage(project: ProjectRecord): StoredProjectRecord {
  const snapshotsMatch = areProjectSnapshotsEqual(project.savedSnapshot, project.workingSnapshot)

  return {
    ...project,
    storageVersion: 2,
    savedSnapshot: snapshotsMatch ? null : project.savedSnapshot,
    savedSnapshotSameAsWorking: snapshotsMatch,
  }
}

async function readWorkspaceData(handle: FileSystemDirectoryHandle) {
  const raw = await readJsonFile<WorkspaceData | WorkspaceManifest>(handle, WORKSPACE_MANIFEST_FILE_NAME)

  if (!raw) {
    return null
  }

  if (isLegacyWorkspaceData(raw)) {
    return {
      projects: raw.projects
        .map((project) => normalizeStoredProjectRecord(project))
        .filter((project): project is ProjectRecord => Boolean(project)),
      activeProjectId: raw.activeProjectId,
      lastOpenedProjectId: raw.lastOpenedProjectId,
    } satisfies WorkspaceData
  }

  if (isWorkspaceManifest(raw)) {
    return readWorkspaceDataFromManifest(handle, raw)
  }

  throw new Error('缓存目录中的项目索引格式不正确')
}

async function readWorkspaceProjectIndex(handle: FileSystemDirectoryHandle) {
  const raw = await readJsonFile<WorkspaceData | WorkspaceManifest>(handle, WORKSPACE_MANIFEST_FILE_NAME)

  if (!raw) {
    return null
  }

  if (isLegacyWorkspaceData(raw)) {
    return getWorkspaceProjectIndexFromData({
      projects: raw.projects
        .map((project) => normalizeStoredProjectRecord(project))
        .filter((project): project is ProjectRecord => Boolean(project)),
      activeProjectId: raw.activeProjectId,
      lastOpenedProjectId: raw.lastOpenedProjectId,
    })
  }

  if (isWorkspaceManifest(raw)) {
    return getWorkspaceProjectIndexFromManifest(raw)
  }

  throw new Error('缓存目录中的项目索引格式不正确')
}

async function readWorkspaceProject(handle: FileSystemDirectoryHandle, projectId: string) {
  const raw = await readJsonFile<WorkspaceData | WorkspaceManifest>(handle, WORKSPACE_MANIFEST_FILE_NAME)

  if (!raw) {
    return null
  }

  if (isLegacyWorkspaceData(raw)) {
    return normalizeStoredProjectRecord(raw.projects.find((project) => project.id === projectId) ?? null)
  }

  if (isWorkspaceManifest(raw)) {
    const manifestProject = raw.projects.find((project) => project.id === projectId)

    if (!manifestProject) {
      return null
    }

    return normalizeStoredProjectRecord(await readJsonFile<ProjectRecord | StoredProjectRecord>(handle, manifestProject.fileName))
  }

  throw new Error('缓存目录中的项目索引格式不正确')
}

async function getWorkspaceConfigDirectoryHandle(handle: FileSystemDirectoryHandle, options?: { create?: boolean }) {
  return handle.getDirectoryHandle(WORKSPACE_CONFIG_DIRECTORY_NAME, { create: options?.create ?? false })
}

async function getWorkspaceImagesDirectoryHandle(handle: FileSystemDirectoryHandle, pathSegments: string[], options?: { create?: boolean }) {
  return getNestedDirectoryHandle(handle, [WORKSPACE_IMAGE_DIRECTORY_NAME, ...pathSegments], { create: options?.create })
}

async function readWorkspaceConfig(handle: FileSystemDirectoryHandle) {
  try {
    const configDirectoryHandle = await getWorkspaceConfigDirectoryHandle(handle)
    return await readJsonFile<WorkspaceConfigFile>(configDirectoryHandle, WORKSPACE_CONFIG_FILE_NAME)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return null
    }

    throw error
  }
}

async function writeWorkspaceConfig(handle: FileSystemDirectoryHandle, config: WorkspaceConfigFile) {
  const configDirectoryHandle = await getWorkspaceConfigDirectoryHandle(handle, { create: true })
  await writeJsonFile(configDirectoryHandle, WORKSPACE_CONFIG_FILE_NAME, config)
}

async function readWorkflowTemplates(handle: FileSystemDirectoryHandle) {
  try {
    const configDirectory = await handle.getDirectoryHandle(WORKSPACE_CONFIG_DIRECTORY_NAME)
    return readJsonFile<WorkflowTemplateLibrary>(configDirectory, WORKSPACE_TEMPLATE_FILE_NAME)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null
    throw error
  }
}

async function writeWorkflowTemplates(handle: FileSystemDirectoryHandle, library: WorkflowTemplateLibrary) {
  const configDirectory = await handle.getDirectoryHandle(WORKSPACE_CONFIG_DIRECTORY_NAME, { create: true })
  await writeJsonFileIfChanged(configDirectory, WORKSPACE_TEMPLATE_FILE_NAME, library)
}

async function writeWorkspaceAsset(
  handle: FileSystemDirectoryHandle,
  input: { pathSegments: string[]; fileName: string; blob: Blob },
) {
  const mimeType = input.blob.type || 'image/png'
  const directoryHandle = await getWorkspaceImagesDirectoryHandle(handle, input.pathSegments, { create: true })
  const { name } = splitFileName(input.fileName)
  const extension = getImageExtension(input.fileName, mimeType)
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const nextFileName = `${name || 'image'}-${uniqueSuffix}.${extension}`
  const fileHandle = await directoryHandle.getFileHandle(nextFileName, { create: true })

  await writeBlobFile(fileHandle, input.blob)

  return {
    relativePath: [WORKSPACE_IMAGE_DIRECTORY_NAME, ...input.pathSegments.map((segment) => sanitizePathSegment(segment)), nextFileName].join('/'),
    fileName: nextFileName,
    mimeType,
  }
}

async function writeWorkspaceAssetAtPath(
  handle: FileSystemDirectoryHandle,
  input: { relativePath: string; blob: Blob },
) {
  const normalizedPath = normalizeRelativePath(input.relativePath)
  const segments = normalizedPath.split('/')
  const fileName = segments.pop()

  if (!fileName || segments[0] !== WORKSPACE_IMAGE_DIRECTORY_NAME) {
    throw new Error('资源路径不合法')
  }

  const parentDirectory = await getNestedDirectoryHandle(handle, segments, { create: true })
  const fileHandle = await parentDirectory.getFileHandle(fileName, { create: true })

  await writeBlobFile(fileHandle, input.blob)

  const cachedUrl = workspaceAssetUrlCache.get(normalizedPath)
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl)
    workspaceAssetUrlCache.delete(normalizedPath)
  }

  return {
    relativePath: normalizedPath,
    fileName,
    mimeType: input.blob.type || 'image/png',
  }
}

async function resolveWorkspaceAssetUrl(handle: FileSystemDirectoryHandle, relativePath: string) {
  const normalizedPath = normalizeRelativePath(relativePath)
  const cachedUrl = workspaceAssetUrlCache.get(normalizedPath)

  if (cachedUrl) {
    return cachedUrl
  }

  const segments = normalizedPath.split('/')
  const fileName = segments.pop()

  if (!fileName || segments.length === 0) {
    throw new Error('资源路径不合法')
  }

  const parentDirectory = await getNestedDirectoryHandle(handle, segments)
  const fileHandle = await parentDirectory.getFileHandle(fileName)
  const file = await fileHandle.getFile()
  const objectUrl = URL.createObjectURL(file)

  workspaceAssetUrlCache.set(normalizedPath, objectUrl)
  return objectUrl
}

async function listWorkspaceAssetDiskEntries(
  directoryHandle: FileSystemDirectoryHandle,
  parentSegments: string[] = [],
): Promise<Array<{ relativePath: string; byteSize: number }>> {
  const entries: Array<{ relativePath: string; byteSize: number }> = []

  for await (const entry of directoryHandle.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile()
      entries.push({
        relativePath: [WORKSPACE_IMAGE_DIRECTORY_NAME, ...parentSegments, entry.name].join('/'),
        byteSize: file.size,
      })
      continue
    }

    entries.push(...await listWorkspaceAssetDiskEntries(entry, [...parentSegments, entry.name]))
  }

  return entries
}

async function inspectWorkspaceAssets(handle: FileSystemDirectoryHandle, data: WorkspaceData) {
  let imagesDirectoryHandle: FileSystemDirectoryHandle
  try {
    imagesDirectoryHandle = await getWorkspaceImagesDirectoryHandle(handle, [])
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      const missingReferencedPaths = collectWorkspaceReferencedAssetPaths(data)
      return {
        scannedAt: Date.now(),
        totalFileCount: 0,
        totalByteSize: 0,
        referencedFileCount: 0,
        referencedByteSize: 0,
        orphanedFileCount: 0,
        orphanedByteSize: 0,
        orphanedFiles: [],
        missingReferencedPaths,
      }
    }
    throw error
  }

  const referencedPaths = new Set(collectWorkspaceReferencedAssetPaths(data))
  const files = (await listWorkspaceAssetDiskEntries(imagesDirectoryHandle))
    .sort((left, right) => right.byteSize - left.byteSize || left.relativePath.localeCompare(right.relativePath))
  const existingPaths = new Set(files.map((file) => file.relativePath))
  const referencedFiles = files.filter((file) => referencedPaths.has(file.relativePath))
  const orphanedFiles = files.filter((file) => !referencedPaths.has(file.relativePath))

  return {
    scannedAt: Date.now(),
    totalFileCount: files.length,
    totalByteSize: files.reduce((total, file) => total + file.byteSize, 0),
    referencedFileCount: referencedFiles.length,
    referencedByteSize: referencedFiles.reduce((total, file) => total + file.byteSize, 0),
    orphanedFileCount: orphanedFiles.length,
    orphanedByteSize: orphanedFiles.reduce((total, file) => total + file.byteSize, 0),
    orphanedFiles,
    missingReferencedPaths: [...referencedPaths].filter((relativePath) => !existingPaths.has(relativePath)).sort(),
  }
}

async function removeWorkspaceAsset(handle: FileSystemDirectoryHandle, relativePath: string) {
  const normalizedPath = normalizeRelativePath(relativePath)
  const segments = normalizedPath.split('/')
  const fileName = segments.pop()

  if (!fileName || segments.length === 0) {
    throw new Error('资源路径不合法')
  }

  const parentDirectory = await getNestedDirectoryHandle(handle, segments)
  await removeFileIfExists(parentDirectory, fileName)

  const cachedUrl = workspaceAssetUrlCache.get(normalizedPath)
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl)
    workspaceAssetUrlCache.delete(normalizedPath)
  }
}

async function cleanupUnusedWorkspaceAssets(handle: FileSystemDirectoryHandle, data: WorkspaceData) {
  let imagesDirectoryHandle: FileSystemDirectoryHandle

  try {
    imagesDirectoryHandle = await getWorkspaceImagesDirectoryHandle(handle, [])
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return { deletedCount: 0, deletedByteSize: 0 }
    }

    throw error
  }

  const referencedPaths = new Set(collectWorkspaceReferencedAssetPaths(data))
  const existingPaths = await listWorkspaceAssetDiskEntries(imagesDirectoryHandle)
  let deletedCount = 0
  let deletedByteSize = 0

  for (const entry of existingPaths) {
    const normalizedPath = normalizeRelativePath(entry.relativePath)
    if (referencedPaths.has(normalizedPath)) {
      continue
    }

    await removeWorkspaceAsset(handle, normalizedPath)
    deletedCount += 1
    deletedByteSize += entry.byteSize
  }

  return { deletedCount, deletedByteSize }
}

async function writeWorkspaceData(handle: FileSystemDirectoryHandle, data: WorkspaceData) {
  const previousManifest = await readJsonFile<WorkspaceManifest | WorkspaceData>(handle, WORKSPACE_MANIFEST_FILE_NAME)
  const previousFileNames = isWorkspaceManifest(previousManifest)
    ? previousManifest.projects.map((project) => project.fileName)
    : isLegacyWorkspaceData(previousManifest)
      ? previousManifest.projects.map((project) => getProjectFileName(project.id))
      : []

  const manifest: WorkspaceManifest = {
    activeProjectId: data.activeProjectId,
    lastOpenedProjectId: data.lastOpenedProjectId,
    projects: data.projects.map((project) => getProjectManifestEntry(project)),
  }

  for (const project of data.projects) {
    await writeJsonFileIfChanged(handle, getProjectFileName(project.id), compactProjectRecordForStorage(project))
  }

  const nextFileNames = new Set(manifest.projects.map((project) => project.fileName))
  for (const fileName of previousFileNames) {
    if (!nextFileNames.has(fileName)) {
      await removeFileIfExists(handle, fileName)
    }
  }

  await writeJsonFileIfChanged(handle, WORKSPACE_MANIFEST_FILE_NAME, manifest)
}

async function writeWorkspaceProject(handle: FileSystemDirectoryHandle, input: SaveWorkspaceProjectInput) {
  const previousManifest = await readJsonFile<WorkspaceManifest | WorkspaceData>(handle, WORKSPACE_MANIFEST_FILE_NAME)
  const previousProjects: WorkspaceProjectFileSummary[] = []

  if (isWorkspaceManifest(previousManifest)) {
    previousProjects.push(...previousManifest.projects.map((project) => ({
      ...getManifestProjectSummary(project),
      fileName: project.fileName,
    })))
  } else if (isLegacyWorkspaceData(previousManifest)) {
    const nextLegacyProjects = previousManifest.projects.map((project) => (
      project.id === input.project.id ? input.project : project
    ))
    const hasExistingProject = previousManifest.projects.some((project) => project.id === input.project.id)

    for (const project of hasExistingProject ? nextLegacyProjects : [...nextLegacyProjects, input.project]) {
      const normalizedProject = normalizeStoredProjectRecord(project)

      if (!normalizedProject) {
        continue
      }

      await writeJsonFileIfChanged(handle, getProjectFileName(normalizedProject.id), compactProjectRecordForStorage(normalizedProject))
      previousProjects.push({
        ...getProjectRecordSummary(normalizedProject),
        fileName: getProjectFileName(normalizedProject.id),
      })
    }
  } else if (previousManifest) {
    throw new Error('缓存目录中的项目索引格式不正确')
  }

  if (!previousProjects.some((project) => project.id === input.project.id)) {
    previousProjects.push({
      ...getProjectRecordSummary(input.project),
      fileName: getProjectFileName(input.project.id),
    })
  }

  const nextProjects = previousProjects.map((project) => (
    project.id === input.project.id
      ? {
          ...getProjectRecordSummary(input.project),
          fileName: getProjectFileName(input.project.id),
        }
      : project
  ))

  const previousActiveProjectId = isWorkspaceManifest(previousManifest) || isLegacyWorkspaceData(previousManifest)
    ? previousManifest.activeProjectId
    : null
  const previousLastOpenedProjectId = isWorkspaceManifest(previousManifest) || isLegacyWorkspaceData(previousManifest)
    ? previousManifest.lastOpenedProjectId
    : null

  await writeJsonFileIfChanged(handle, getProjectFileName(input.project.id), compactProjectRecordForStorage(input.project))
  await writeJsonFileIfChanged(handle, WORKSPACE_MANIFEST_FILE_NAME, buildWorkspaceManifest({
    projects: nextProjects,
    activeProjectId: 'activeProjectId' in input ? input.activeProjectId ?? null : previousActiveProjectId,
    lastOpenedProjectId: 'lastOpenedProjectId' in input ? input.lastOpenedProjectId ?? null : previousLastOpenedProjectId,
  }))
}

async function deleteWorkspaceProject(handle: FileSystemDirectoryHandle, input: DeleteWorkspaceProjectInput) {
  const previousManifest = await readJsonFile<WorkspaceManifest | WorkspaceData>(handle, WORKSPACE_MANIFEST_FILE_NAME)

  if (!previousManifest) {
    return
  }

  let previousProjects: WorkspaceProjectFileSummary[]
  if (isWorkspaceManifest(previousManifest)) {
    previousProjects = previousManifest.projects.map((project) => ({
      ...getManifestProjectSummary(project),
      fileName: project.fileName,
    }))
  } else if (isLegacyWorkspaceData(previousManifest)) {
    previousProjects = []

    for (const project of previousManifest.projects) {
      const normalizedProject = normalizeStoredProjectRecord(project)

      if (!normalizedProject || normalizedProject.id === input.projectId) {
        continue
      }

      await writeJsonFileIfChanged(handle, getProjectFileName(normalizedProject.id), compactProjectRecordForStorage(normalizedProject))
      previousProjects.push({
        ...getProjectRecordSummary(normalizedProject),
        fileName: getProjectFileName(normalizedProject.id),
      })
    }
  } else {
    throw new Error('缓存目录中的项目索引格式不正确')
  }

  const nextProjects = previousProjects.filter((project) => project.id !== input.projectId)
  const fallbackProjectId = nextProjects[0]?.id ?? null
  const previousActiveProjectId = previousManifest.activeProjectId
  const previousLastOpenedProjectId = previousManifest.lastOpenedProjectId
  const activeProjectId = 'activeProjectId' in input
    ? input.activeProjectId ?? null
    : previousActiveProjectId === input.projectId
      ? fallbackProjectId
      : previousActiveProjectId
  const lastOpenedProjectId = 'lastOpenedProjectId' in input
    ? input.lastOpenedProjectId ?? null
    : previousLastOpenedProjectId === input.projectId
      ? activeProjectId
      : previousLastOpenedProjectId

  await removeFileIfExists(handle, getProjectFileName(input.projectId))
  await writeJsonFileIfChanged(handle, WORKSPACE_MANIFEST_FILE_NAME, buildWorkspaceManifest({
    projects: nextProjects,
    activeProjectId,
    lastOpenedProjectId,
  }))
}

function triggerDownload(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function buildWorkflowFile(snapshot: CanvasSnapshot, suggestedName: string): WorkflowFile {
  const workflowName = suggestedName.replace(/\.json$/i, '').trim() || 'workflow'

  return {
    type: 'ai-canvas-workflow',
    version: 1,
    meta: {
      name: workflowName,
      exportedAt: Date.now(),
    },
    nodes: snapshot.nodes,
    edges: snapshot.edges,
  }
}

function isWorkflowFile(value: Partial<CanvasSnapshot> | Partial<WorkflowFile> | null): value is WorkflowFile {
  return Boolean(
    value
    && typeof value === 'object'
    && 'type' in value
    && 'version' in value
    && value.type === 'ai-canvas-workflow'
    && value.version === 1
    && Array.isArray(value.nodes)
    && Array.isArray(value.edges),
  )
}

function parseCanvasSnapshot(content: string) {
  const parsed = JSON.parse(content) as
    | Partial<CanvasSnapshot>
    | Partial<WorkflowFile>
    | null

  if (isWorkflowFile(parsed)) {
    return {
      nodes: parsed.nodes,
      edges: parsed.edges,
    } satisfies CanvasSnapshot
  }

  if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error('工作流文件格式不正确')
  }

  return {
    nodes: parsed.nodes,
    edges: parsed.edges,
  } satisfies CanvasSnapshot
}

async function chooseWorkflowFile() {
  return new Promise<File>((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'

    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        reject(new Error('未选择工作流文件'))
        return
      }

      resolve(file)
    }

    input.click()
  })
}

export const browserPlatformBridge: PlatformBridge = {
  async getWorkspaceStatus() {
    if (!supportsDirectoryPicker()) {
      return {
        supported: false,
        configured: false,
        directoryName: '',
        permission: 'unsupported',
      }
    }

    const { status } = await getWorkspaceDirectoryHandle()
    return status
  },

  async pickWorkspaceDirectory() {
    if (!supportsDirectoryPicker()) {
      return {
        supported: false,
        configured: false,
        directoryName: '',
        permission: 'unsupported',
      }
    }

    const showDirectoryPicker = window.showDirectoryPicker

    if (!showDirectoryPicker) {
      throw new Error('当前浏览器不支持目录授权')
    }

    clearWorkspaceAssetUrlCache()

    const handle = await showDirectoryPicker({ mode: 'readwrite' })
    const permission = await getDirectoryPermission(handle, true)

    if (permission !== 'granted') {
      throw new Error('未获得缓存目录读写权限')
    }

    await setStoredWorkspaceDirectoryHandle(handle)

    return {
      supported: true,
      configured: true,
      directoryName: handle.name,
      permission,
    }
  },

  async loadWorkspaceData() {
    const { handle } = await getWorkspaceDirectoryHandle()

    if (!handle) {
      clearWorkspaceAssetUrlCache()
      return null
    }

    return readWorkspaceData(handle)
  },

  async saveWorkspaceData(data) {
    const { handle, status } = await getWorkspaceDirectoryHandle({ requestWritePermission: true })

    if (!handle) {
      if (status.permission === 'denied') {
        throw new Error('缓存目录权限不可用，请重新选择目录')
      }

      throw new Error('请先设置缓存目录')
    }

    await writeWorkspaceData(handle, data)
  },

  async listWorkspaceProjects() {
    const { handle } = await getWorkspaceDirectoryHandle()

    if (!handle) {
      return null
    }

    return readWorkspaceProjectIndex(handle)
  },

  async loadWorkspaceProject(projectId) {
    const { handle } = await getWorkspaceDirectoryHandle()

    if (!handle) {
      return null
    }

    return readWorkspaceProject(handle, projectId)
  },

  async saveWorkspaceProject(input) {
    const { handle, status } = await getWorkspaceDirectoryHandle({ requestWritePermission: true })

    if (!handle) {
      if (status.permission === 'denied') {
        throw new Error('缓存目录权限不可用，请重新选择目录')
      }

      throw new Error('请先设置缓存目录')
    }

    await writeWorkspaceProject(handle, input)
  },

  async deleteWorkspaceProject(input) {
    const { handle, status } = await getWorkspaceDirectoryHandle({ requestWritePermission: true })

    if (!handle) {
      if (status.permission === 'denied') {
        throw new Error('缓存目录权限不可用，请重新选择目录')
      }

      throw new Error('请先设置缓存目录')
    }

    await deleteWorkspaceProject(handle, input)
  },

  async loadWorkspaceConfig() {
    const { handle } = await getWorkspaceDirectoryHandle()

    if (!handle) {
      return null
    }

    return readWorkspaceConfig(handle)
  },

  async saveWorkspaceConfig(config) {
    const { handle, status } = await getWorkspaceDirectoryHandle({ requestWritePermission: true })

    if (!handle) {
      if (status.permission === 'denied') {
        throw new Error('缓存目录权限不可用，请重新选择目录')
      }

      throw new Error('请先设置缓存目录')
    }

    await writeWorkspaceConfig(handle, config)
  },

  async loadWorkflowTemplates() {
    const { handle } = await getWorkspaceDirectoryHandle()
    return handle ? readWorkflowTemplates(handle) : null
  },

  async saveWorkflowTemplates(library) {
    const { handle, status } = await getWorkspaceDirectoryHandle({ requestWritePermission: true })
    if (!handle) {
      if (status.permission === 'denied') throw new Error('缓存目录权限不可用，请重新选择目录')
      throw new Error('请先设置缓存目录')
    }
    await writeWorkflowTemplates(handle, library)
  },

  async queryWorkspaceAudit() {
    return { supported: false, entries: [], totalCount: 0, hasMore: false }
  },

  async searchWorkspace(query) {
    const { handle } = await getWorkspaceDirectoryHandle()
    if (!handle) return { supported: true, indexedDocumentCount: 0, entries: [] }
    const index = await readWorkspaceProjectIndex(handle)
    if (!index) return { supported: true, indexedDocumentCount: 0, entries: [] }
    const projects = (await Promise.all(index.projects.map((summary) => readWorkspaceProject(handle, summary.id))))
      .filter((project): project is ProjectRecord => Boolean(project))
    const documents = projects.flatMap(extractProjectSearchDocuments)
    return {
      supported: true,
      indexedDocumentCount: documents.length,
      entries: searchWorkspaceDocuments(documents, query),
    }
  },

  async writeWorkspaceAsset(input) {
    const { handle, status } = await getWorkspaceDirectoryHandle({ requestWritePermission: true })

    if (!handle) {
      if (status.permission === 'denied') {
        throw new Error('缓存目录权限不可用，请重新选择目录')
      }

      throw new Error('请先设置缓存目录')
    }

    return writeWorkspaceAsset(handle, {
      pathSegments: input.pathSegments,
      fileName: input.fileName,
      blob: input.blob,
    })
  },

  async writeWorkspaceAssetAtPath(input) {
    const { handle, status } = await getWorkspaceDirectoryHandle({ requestWritePermission: true })

    if (!handle) {
      if (status.permission === 'denied') {
        throw new Error('缂撳瓨鐩綍鏉冮檺涓嶅彲鐢紝璇烽噸鏂伴€夋嫨鐩綍')
      }

      throw new Error('璇峰厛璁剧疆缂撳瓨鐩綍')
    }

    return writeWorkspaceAssetAtPath(handle, {
      relativePath: input.relativePath,
      blob: input.blob,
    })
  },

  async resolveWorkspaceAssetUrl(relativePath) {
    const { handle, status } = await getWorkspaceDirectoryHandle()

    if (!handle) {
      if (status.permission === 'denied') {
        throw new Error('缓存目录权限不可用，请重新选择目录')
      }

      throw new Error('请先设置缓存目录')
    }

    return resolveWorkspaceAssetUrl(handle, relativePath)
  },

  clearWorkspaceAssetUrlCache,

  async inspectWorkspaceAssets(data) {
    const { handle, status } = await getWorkspaceDirectoryHandle()

    if (!handle) {
      if (status.permission === 'denied') {
        throw new Error('缓存目录权限不可用，请重新选择目录')
      }

      throw new Error('请先设置缓存目录')
    }

    return inspectWorkspaceAssets(handle, data)
  },

  async cleanupUnusedWorkspaceAssets(data) {
    const { handle, status } = await getWorkspaceDirectoryHandle({ requestWritePermission: true })

    if (!handle) {
      if (status.permission === 'denied') {
        throw new Error('缓存目录权限不可用，请重新选择目录')
      }

      throw new Error('请先设置缓存目录')
    }

    return cleanupUnusedWorkspaceAssets(handle, data)
  },

  async exportWorkspaceBundle(input) {
    const { handle: sourceHandle, status } = await getWorkspaceDirectoryHandle()

    if (!sourceHandle) {
      if (status.permission === 'denied') {
        throw new Error('工作区目录权限不可用，请重新选择目录')
      }

      throw new Error('请先设置工作区目录')
    }

    const showDirectoryPicker = window.showDirectoryPicker
    if (!showDirectoryPicker) {
      throw new Error('当前浏览器不支持目录导出')
    }

    const parentHandle = await showDirectoryPicker({ mode: 'readwrite' })
    await assertDistinctWorkspaceDirectories(sourceHandle, parentHandle)

    const permission = await getDirectoryPermission(parentHandle, true)
    if (permission !== 'granted') {
      throw new Error('未获得导出目录读写权限')
    }

    const bundleHandle = await createUniqueWorkspaceBundleDirectory(
      parentHandle,
      input.suggestedName ?? 'ai-canvas-workspace',
    )
    await writeWorkspaceBundleDirectory({
      sourceWorkspaceHandle: sourceHandle,
      bundleHandle,
      data: sanitizeWorkspaceDataForPersistence(input.data),
      config: input.config ?? null,
      templates: await readWorkflowTemplates(sourceHandle),
    })
  },

  async importWorkspaceBundle() {
    const { handle: workspaceHandle, status } = await getWorkspaceDirectoryHandle({ requestWritePermission: true })

    if (!workspaceHandle) {
      if (status.permission === 'denied') {
        throw new Error('工作区目录权限不可用，请重新选择目录')
      }

      throw new Error('请先设置工作区目录')
    }

    const showDirectoryPicker = window.showDirectoryPicker
    if (!showDirectoryPicker) {
      throw new Error('当前浏览器不支持目录导入')
    }

    const bundleHandle = await showDirectoryPicker({ mode: 'read' })
    await assertDistinctWorkspaceDirectories(workspaceHandle, bundleHandle)

    const imported = await readWorkspaceBundleDirectory(bundleHandle)
    const importedAssetCount = await copyWorkspaceBundleAssets({
      bundleHandle,
      workspaceHandle,
      data: imported.data,
    })

    await writeWorkspaceData(workspaceHandle, imported.data)
    if (imported.config) {
      await writeWorkspaceConfig(workspaceHandle, imported.config)
    }
    if (imported.templates) {
      await writeWorkflowTemplates(workspaceHandle, imported.templates)
    }
    await cleanupUnusedWorkspaceAssets(workspaceHandle, imported.data)
    clearWorkspaceAssetUrlCache()

    return {
      ...imported,
      importedAssetCount,
    }
  },

  async exportProjectBundle(input) {
    const { handle: sourceHandle, status } = await getWorkspaceDirectoryHandle()
    if (!sourceHandle) {
      if (status.permission === 'denied') throw new Error('工作区目录权限不可用，请重新选择目录')
      throw new Error('请先设置工作区目录')
    }
    const showDirectoryPicker = window.showDirectoryPicker
    if (!showDirectoryPicker) throw new Error('当前浏览器不支持目录导出')
    const parentHandle = await showDirectoryPicker({ mode: 'readwrite' })
    await assertDistinctWorkspaceDirectories(sourceHandle, parentHandle)
    const bundleHandle = await createUniqueWorkspaceBundleDirectory(parentHandle, input.suggestedName ?? input.project.name)
    await writeProjectBundleDirectory({ sourceWorkspaceHandle: sourceHandle, bundleHandle, project: input.project })
  },

  async prepareProjectBundleImport(): Promise<ProjectBundleImportCandidate> {
    const { handle: workspaceHandle, status } = await getWorkspaceDirectoryHandle()
    if (!workspaceHandle) {
      if (status.permission === 'denied') throw new Error('工作区目录权限不可用，请重新选择目录')
      throw new Error('请先设置工作区目录')
    }
    const showDirectoryPicker = window.showDirectoryPicker
    if (!showDirectoryPicker) throw new Error('当前浏览器不支持目录导入')
    const bundleHandle = await showDirectoryPicker({ mode: 'read' })
    await assertDistinctWorkspaceDirectories(workspaceHandle, bundleHandle)
    const imported = await readProjectBundleDirectory(bundleHandle)
    const index = await readWorkspaceProjectIndex(workspaceHandle)
    const candidateId = crypto.randomUUID()
    pendingProjectBundleImports.set(candidateId, {
      bundleHandle,
      project: imported.project,
      assetPaths: imported.assetPaths,
    })
    return {
      candidateId,
      project: getProjectRecordSummary(imported.project),
      assetCount: imported.assetPaths.length,
      hasIdConflict: Boolean(index?.projects.some((project) => project.id === imported.project.id)),
    }
  },

  async commitProjectBundleImport(input) {
    const pending = pendingProjectBundleImports.get(input.candidateId)
    if (!pending) throw new Error('项目导入候选已失效，请重新选择目录包')
    const { handle: workspaceHandle, status } = await getWorkspaceDirectoryHandle({ requestWritePermission: true })
    if (!workspaceHandle) {
      if (status.permission === 'denied') throw new Error('工作区目录权限不可用，请重新选择目录')
      throw new Error('请先设置工作区目录')
    }
    const index = await readWorkspaceProjectIndex(workspaceHandle)
    const hasConflict = Boolean(index?.projects.some((project) => project.id === pending.project.id))
    if (hasConflict && input.resolution === 'preserve') throw new Error('项目 ID 已存在，请选择导入副本或替换现有项目')
    if (!hasConflict && input.resolution === 'replace') throw new Error('当前工作区不存在可替换的同 ID 项目')
    const prepared = prepareImportedProject(pending.project, input.resolution)
    const importedAssetCount = await copyProjectBundleAssets({
      bundleHandle: pending.bundleHandle,
      workspaceHandle,
      assetPaths: pending.assetPaths,
      pathMap: prepared.pathMap,
    })
    const activeProjectId = index?.activeProjectId ?? prepared.project.id
    const lastOpenedProjectId = index?.lastOpenedProjectId ?? prepared.project.id
    await writeWorkspaceProject(workspaceHandle, {
      project: prepared.project,
      activeProjectId,
      lastOpenedProjectId,
    })
    pendingProjectBundleImports.delete(input.candidateId)
    return {
      project: prepared.project,
      importedAssetCount,
      resolution: input.resolution,
      sourceProjectId: prepared.sourceProjectId,
    }
  },

  async exportWorkflowJson(snapshot, suggestedName) {
    const json = JSON.stringify(buildWorkflowFile(snapshot, suggestedName), null, 2)

    if (typeof window.showSaveFilePicker === 'function') {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'JSON Files',
            accept: {
              'application/json': ['.json'],
            },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(json)
      await writable.close()
      return
    }

    triggerDownload(json, suggestedName)
  },

  async importWorkflowJson(): Promise<WorkflowImportResult> {
    const file = await chooseWorkflowFile()
    const content = await file.text()

    return {
      snapshot: parseCanvasSnapshot(content),
      fileName: file.name,
    }
  },
}
