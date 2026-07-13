import { migrateProjectRecordSnapshots } from '../../features/projectManager/migrations.ts'
import type {
  ProjectBundleManifest,
  ProjectImportResolution,
  WorkspaceProjectSummary,
} from '../types.ts'
import type { ProjectRecord, ProjectSnapshot } from '../../types/index.ts'
import { collectWorkspaceReferencedAssetPaths } from './workspaceBundle.ts'
import {
  normalizeRelativePath,
  readBlobFileAtPath,
  readJsonFile,
  sanitizePathSegment,
  writeBlobFileAtPath,
  writeJsonFile,
} from './workspaceFiles.ts'

export const PROJECT_BUNDLE_MANIFEST_FILE_NAME = 'project.json'
export const PROJECT_BUNDLE_PROJECT_DIRECTORY_NAME = 'projects'

function assertProjectBundle(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function projectFileName(projectId: string) {
  return `${sanitizePathSegment(projectId)}.json`
}

function getProjectSummary(project: ProjectRecord): WorkspaceProjectSummary {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastOpenedAt: project.lastOpenedAt,
    archivedAt: project.archivedAt ?? null,
  }
}

function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  const snapshot = value as Partial<ProjectSnapshot> | null
  return Boolean(snapshot?.canvas && Array.isArray(snapshot.canvas.nodes) && Array.isArray(snapshot.canvas.edges)
    && snapshot.taskQueue && Array.isArray(snapshot.taskQueue.tasks))
}

function parseProject(value: unknown, expectedId: string) {
  const project = value as Partial<ProjectRecord> | null
  assertProjectBundle(project?.id === expectedId, '项目目录包项目 ID 与清单不一致')
  assertProjectBundle(typeof project.name === 'string', '项目目录包名称不正确')
  assertProjectBundle(isProjectSnapshot(project.savedSnapshot), '项目目录包保存快照不正确')
  assertProjectBundle(isProjectSnapshot(project.workingSnapshot), '项目目录包工作快照不正确')
  return migrateProjectRecordSnapshots({
    id: project.id,
    name: project.name,
    savedSnapshot: project.savedSnapshot,
    workingSnapshot: project.workingSnapshot,
    createdAt: typeof project.createdAt === 'number' ? project.createdAt : Date.now(),
    updatedAt: typeof project.updatedAt === 'number' ? project.updatedAt : Date.now(),
    lastOpenedAt: typeof project.lastOpenedAt === 'number' ? project.lastOpenedAt : Date.now(),
    archivedAt: typeof project.archivedAt === 'number' ? project.archivedAt : null,
  })
}

export function parseProjectBundleManifest(value: unknown): ProjectBundleManifest {
  const manifest = value as Partial<ProjectBundleManifest> | null
  assertProjectBundle(manifest?.type === 'ai-canvas-project-bundle', '项目目录包类型不正确')
  assertProjectBundle(manifest.version === 1, '项目目录包版本不受支持')
  assertProjectBundle(manifest.projectRoot === 'projects' && manifest.assetRoot === 'images', '项目目录包目录结构不正确')
  assertProjectBundle(manifest.project && typeof manifest.project.id === 'string' && typeof manifest.project.name === 'string', '项目目录包摘要不正确')
  assertProjectBundle(manifest.project.fileName === projectFileName(manifest.project.id), '项目目录包文件名不正确')
  return manifest as ProjectBundleManifest
}

export async function writeProjectBundleDirectory(input: {
  sourceWorkspaceHandle: FileSystemDirectoryHandle
  bundleHandle: FileSystemDirectoryHandle
  project: ProjectRecord
}) {
  const projectDirectory = await input.bundleHandle.getDirectoryHandle(PROJECT_BUNDLE_PROJECT_DIRECTORY_NAME, { create: true })
  const manifest: ProjectBundleManifest = {
    type: 'ai-canvas-project-bundle',
    version: 1,
    exportedAt: Date.now(),
    project: { ...getProjectSummary(input.project), fileName: projectFileName(input.project.id) },
    projectRoot: 'projects',
    assetRoot: 'images',
  }
  await writeJsonFile(projectDirectory, manifest.project.fileName, input.project)
  const assetPaths = collectWorkspaceReferencedAssetPaths({
    projects: [input.project],
    activeProjectId: input.project.id,
    lastOpenedProjectId: input.project.id,
  })
  for (const relativePath of assetPaths) {
    await writeBlobFileAtPath(input.bundleHandle, relativePath, await readBlobFileAtPath(input.sourceWorkspaceHandle, relativePath))
  }
  await writeJsonFile(input.bundleHandle, PROJECT_BUNDLE_MANIFEST_FILE_NAME, manifest)
  return { manifest, assetPaths }
}

export async function readProjectBundleDirectory(bundleHandle: FileSystemDirectoryHandle) {
  const manifest = parseProjectBundleManifest(await readJsonFile<unknown>(bundleHandle, PROJECT_BUNDLE_MANIFEST_FILE_NAME))
  const projectDirectory = await bundleHandle.getDirectoryHandle(PROJECT_BUNDLE_PROJECT_DIRECTORY_NAME)
  const project = parseProject(await readJsonFile<unknown>(projectDirectory, manifest.project.fileName), manifest.project.id)
  const assetPaths = collectWorkspaceReferencedAssetPaths({ projects: [project], activeProjectId: project.id, lastOpenedProjectId: project.id })
  for (const relativePath of assetPaths) await readBlobFileAtPath(bundleHandle, relativePath)
  return { manifest, project, assetPaths }
}

function visitAssetPaths(project: ProjectRecord, visitor: (relativePath: string) => string) {
  const visitAsset = (asset: unknown) => {
    if (!asset || typeof asset !== 'object') return
    const record = asset as Record<string, unknown>
    for (const key of ['relativePath', 'thumbnailRelativePath', 'previewRelativePath']) {
      if (typeof record[key] === 'string') record[key] = visitor(record[key])
    }
  }
  for (const snapshot of [project.savedSnapshot, project.workingSnapshot]) {
    for (const node of snapshot.canvas.nodes) visitAsset(node.type === 'videoNode' ? node.data?.videoAsset : node.data?.imageAsset)
    for (const task of snapshot.taskQueue.tasks) {
      visitAsset(task.resultImageAsset)
      visitAsset(task.resultVideoAsset)
    }
  }
}

export function prepareImportedProject(project: ProjectRecord, resolution: ProjectImportResolution) {
  const sourceProjectId = project.id
  const nextProject = structuredClone(project)
  const pathMap = new Map<string, string>()
  const now = Date.now()
  if (resolution === 'copy') {
    nextProject.id = `project-${now}-${Math.random().toString(36).slice(2, 8)}`
    nextProject.name = `${nextProject.name}（导入）`
    let index = 0
    visitAssetPaths(nextProject, (rawPath) => {
      const relativePath = normalizeRelativePath(rawPath)
      const existing = pathMap.get(relativePath)
      if (existing) return existing
      const fileName = relativePath.split('/').at(-1) ?? `asset-${index}`
      const target = `images/imports/${sanitizePathSegment(nextProject.id)}/${String(index).padStart(3, '0')}-${sanitizePathSegment(fileName)}`
      index += 1
      pathMap.set(relativePath, target)
      return target
    })
  }
  nextProject.archivedAt = null
  nextProject.updatedAt = now
  nextProject.lastOpenedAt = now
  return { project: nextProject, sourceProjectId, pathMap }
}

export async function copyProjectBundleAssets(input: {
  bundleHandle: FileSystemDirectoryHandle
  workspaceHandle: FileSystemDirectoryHandle
  assetPaths: string[]
  pathMap: Map<string, string>
}) {
  for (const sourcePath of input.assetPaths) {
    const targetPath = input.pathMap.get(sourcePath) ?? sourcePath
    await writeBlobFileAtPath(input.workspaceHandle, targetPath, await readBlobFileAtPath(input.bundleHandle, sourcePath))
  }
  return input.assetPaths.length
}
