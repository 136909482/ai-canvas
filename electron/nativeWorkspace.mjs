import { randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createNativeWorkspaceDatabaseClient } from './nativeWorkspaceDatabaseClient.mjs'

const WORKSPACE_MANIFEST_FILE_NAME = 'ai-canvas-workspace.json'
const WORKSPACE_CONFIG_PATH = path.join('.config', 'config.json')
const WORKSPACE_TEMPLATE_PATH = path.join('.config', 'workflow-templates.json')
const WORKSPACE_IMAGE_DIRECTORY_NAME = 'images'
const BUNDLE_MANIFEST_FILE_NAME = 'workspace.json'
const BUNDLE_PROJECT_DIRECTORY_NAME = 'projects'
const PROJECT_BUNDLE_MANIFEST_FILE_NAME = 'project.json'

const MIME_TYPES = new Map([
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
])

function sanitizePathSegment(segment) {
  const normalized = String(segment).replace(/[\\/]+/g, '-').replace(/\.+/g, '.').trim()
  if (!normalized || normalized === '.' || normalized === '..') throw new Error('资源路径不合法')
  return normalized.replace(/[<>:"|?*]/g, '-').trim()
}

function normalizeRelativePath(relativePath) {
  const segments = String(relativePath).replace(/\\+/g, '/').trim().split('/').map(sanitizePathSegment)
  if (segments.length === 0) throw new Error('资源路径不合法')
  return segments.join('/')
}

function resolveInside(root, relativePath) {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, ...normalizeRelativePath(relativePath).split('/'))
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('资源路径不合法')
  }
  return resolved
}

async function readJson(filePath) {
  try {
    const content = await readFile(filePath, 'utf8')
    return content.trim() ? JSON.parse(content) : null
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function writeJsonIfChanged(filePath, value) {
  const content = JSON.stringify(value, null, 2)
  try {
    if (await readFile(filePath, 'utf8') === content) return false
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}-${randomUUID()}.tmp`
  await writeFile(temporaryPath, content, 'utf8')
  await rename(temporaryPath, filePath)
  return true
}

function isProjectSnapshot(value) {
  return Boolean(value?.canvas && Array.isArray(value.canvas.nodes) && Array.isArray(value.canvas.edges)
    && value.taskQueue && Array.isArray(value.taskQueue.tasks))
}

function normalizeProject(project) {
  if (!project || typeof project !== 'object' || !isProjectSnapshot(project.workingSnapshot)) return null
  return {
    ...project,
    savedSnapshot: isProjectSnapshot(project.savedSnapshot) ? project.savedSnapshot : project.workingSnapshot,
    createdAt: Number.isFinite(project.createdAt) ? project.createdAt : Date.now(),
    updatedAt: Number.isFinite(project.updatedAt) ? project.updatedAt : Date.now(),
    lastOpenedAt: Number.isFinite(project.lastOpenedAt) ? project.lastOpenedAt : Date.now(),
    archivedAt: Number.isFinite(project.archivedAt) ? project.archivedAt : null,
  }
}

function projectSummary(project) {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastOpenedAt: project.lastOpenedAt,
    archivedAt: project.archivedAt ?? null,
  }
}

function projectFileName(projectId) {
  return `${sanitizePathSegment(projectId)}.json`
}

function isLegacyWorkspaceData(value) {
  return Boolean(value && Array.isArray(value.projects)
    && value.projects.every((project) => project && 'workingSnapshot' in project))
}

function isWorkspaceManifest(value) {
  return Boolean(value && Array.isArray(value.projects)
    && value.projects.every((project) => typeof project?.fileName === 'string'))
}

function redactConfigSecrets(config) {
  return {
    ...config,
    providerProfiles: config.providerProfiles?.map((profile) => ({ ...profile, apiKey: '' })),
  }
}

async function readWorkspaceDataAt(workspacePath) {
  const raw = await readJson(path.join(workspacePath, WORKSPACE_MANIFEST_FILE_NAME))
  if (!raw) return null
  if (isLegacyWorkspaceData(raw)) {
    return {
      projects: raw.projects.map(normalizeProject).filter(Boolean),
      activeProjectId: raw.activeProjectId ?? null,
      lastOpenedProjectId: raw.lastOpenedProjectId ?? null,
    }
  }
  if (!isWorkspaceManifest(raw)) throw new Error('缓存目录中的项目索引格式不正确')

  const projects = []
  for (const item of raw.projects) {
    const project = normalizeProject(await readJson(resolveInside(workspacePath, item.fileName)))
    if (project) projects.push(project)
  }
  return { projects, activeProjectId: raw.activeProjectId ?? null, lastOpenedProjectId: raw.lastOpenedProjectId ?? null }
}

function collectAsset(value, output) {
  if (!value || typeof value !== 'object') return
  for (const key of ['relativePath', 'thumbnailRelativePath', 'previewRelativePath']) {
    if (typeof value[key] === 'string') {
      const normalized = normalizeRelativePath(value[key])
      if (!normalized.startsWith(`${WORKSPACE_IMAGE_DIRECTORY_NAME}/`)) throw new Error('工作区资产路径必须位于 images/ 目录')
      output.add(normalized)
    }
  }
}

function collectWorkspaceAssets(data) {
  const output = new Set()
  for (const project of data.projects) {
    for (const snapshot of [project.savedSnapshot, project.workingSnapshot]) {
      for (const node of snapshot.canvas.nodes) collectAsset(node.type === 'videoNode' ? node.data?.videoAsset : node.data?.imageAsset, output)
      for (const task of snapshot.taskQueue.tasks) {
        collectAsset(task.resultImageAsset, output)
        collectAsset(task.resultVideoAsset, output)
      }
    }
  }
  return [...output].sort()
}

async function listFileDetails(directory, root = directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        files.push(...await listFileDetails(entryPath, root))
      } else if (entry.isFile()) {
        const fileStat = await stat(entryPath)
        files.push({
          relativePath: path.relative(root, entryPath).split(path.sep).join('/'),
          byteSize: fileStat.size,
        })
      }
    }
    return files
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

function assertBundleManifest(manifest) {
  if (!manifest || manifest.type !== 'ai-canvas-workspace-bundle' || manifest.version !== 1
    || manifest.projectRoot !== 'projects' || manifest.assetRoot !== 'images' || !Array.isArray(manifest.projects)) {
    throw new Error('工作区目录包清单格式不正确')
  }
  const ids = new Set()
  for (const project of manifest.projects) {
    if (!project?.id || project.fileName !== projectFileName(project.id) || ids.has(project.id)) {
      throw new Error('工作区目录包项目摘要不正确')
    }
    ids.add(project.id)
  }
  if (manifest.activeProjectId && !ids.has(manifest.activeProjectId)) throw new Error('工作区目录包当前项目不存在')
  if (manifest.lastOpenedProjectId && !ids.has(manifest.lastOpenedProjectId)) throw new Error('工作区目录包最近项目不存在')
}

function parseBundleProject(value, expectedId) {
  const project = normalizeProject(value)
  if (!project || project.id !== expectedId || typeof project.name !== 'string') {
    throw new Error('工作区目录包项目文件格式不正确')
  }
  return project
}

function parseBundleConfig(value) {
  if (!value || value.version !== 1 || typeof value.model !== 'string'
    || !Array.isArray(value.customModels) || !value.storage || typeof value.storage !== 'object') {
    throw new Error('工作区目录包配置格式不正确')
  }
  return value
}

function parseProjectBundleManifest(manifest) {
  if (!manifest || manifest.type !== 'ai-canvas-project-bundle' || manifest.version !== 1
    || manifest.projectRoot !== 'projects' || manifest.assetRoot !== 'images'
    || !manifest.project?.id || manifest.project.fileName !== projectFileName(manifest.project.id)) {
    throw new Error('项目目录包清单格式不正确')
  }
  return manifest
}

function visitProjectAssetPaths(project, visitor) {
  const visitAsset = (asset) => {
    if (!asset || typeof asset !== 'object') return
    for (const key of ['relativePath', 'thumbnailRelativePath', 'previewRelativePath']) {
      if (typeof asset[key] === 'string') asset[key] = visitor(asset[key])
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

function prepareImportedProject(project, resolution) {
  const sourceProjectId = project.id
  const nextProject = structuredClone(project)
  const pathMap = new Map()
  const now = Date.now()
  if (resolution === 'copy') {
    nextProject.id = `project-${now}-${Math.random().toString(36).slice(2, 8)}`
    nextProject.name = `${nextProject.name}（导入）`
    let index = 0
    visitProjectAssetPaths(nextProject, (rawPath) => {
      const relativePath = normalizeRelativePath(rawPath)
      const existing = pathMap.get(relativePath)
      if (existing) return existing
      const fileName = relativePath.split('/').at(-1) ?? `asset-${index}`
      const targetPath = `images/imports/${sanitizePathSegment(nextProject.id)}/${String(index).padStart(3, '0')}-${sanitizePathSegment(fileName)}`
      index += 1
      pathMap.set(relativePath, targetPath)
      return targetPath
    })
  }
  nextProject.archivedAt = null
  nextProject.updatedAt = now
  nextProject.lastOpenedAt = now
  return { project: nextProject, sourceProjectId, pathMap }
}

export function createNativeWorkspaceService(options) {
  const { stateFilePath, selectDirectory, selectSaveFile, selectOpenFile } = options
  const databaseClient = options.databaseClient ?? createNativeWorkspaceDatabaseClient()
  const pendingProjectImports = new Map()
  const initializedWorkspaceDatabases = new Map()
  let cachedWorkspacePath = null
  let workspacePathLoad = null

  function getWorkspacePath() {
    if (cachedWorkspacePath) return Promise.resolve(cachedWorkspacePath)
    if (workspacePathLoad) return workspacePathLoad

    workspacePathLoad = (async () => {
      const state = await readJson(stateFilePath)
      if (!state?.workspacePath) return null
      try {
        const workspacePath = path.resolve(state.workspacePath)
        if (!(await stat(workspacePath)).isDirectory()) return null
        cachedWorkspacePath = workspacePath
        return workspacePath
      } catch {
        return null
      }
    })().finally(() => {
      workspacePathLoad = null
    })

    return workspacePathLoad
  }

  async function requireWorkspacePath() {
    const workspacePath = await getWorkspacePath()
    if (!workspacePath) throw new Error('请先设置缓存目录')
    return workspacePath
  }

  async function initializeWorkspaceDatabaseAt(workspacePath) {
    const initialization = await databaseClient.initializeWorkspaceDatabase(workspacePath)
    if (initialization.created || initialization.previousVersion === 0) {
      const legacyData = await readWorkspaceDataAt(workspacePath)
      if (legacyData) {
        await databaseClient.replaceWorkspaceDataInDatabase(workspacePath, legacyData, 'workspace.import-json')
      }
      const legacyConfig = await readJson(path.join(workspacePath, WORKSPACE_CONFIG_PATH))
      if (legacyConfig) await databaseClient.saveWorkspaceConfigToDatabase(workspacePath, legacyConfig)
    }
    return workspacePath
  }

  function ensureWorkspaceDatabaseAt(workspacePath) {
    const normalizedPath = path.resolve(workspacePath)
    const existing = initializedWorkspaceDatabases.get(normalizedPath)
    if (existing) return existing

    const initialization = initializeWorkspaceDatabaseAt(normalizedPath).catch((error) => {
      initializedWorkspaceDatabases.delete(normalizedPath)
      throw error
    })
    initializedWorkspaceDatabases.set(normalizedPath, initialization)
    return initialization
  }

  async function requireWorkspaceDatabase() {
    return ensureWorkspaceDatabaseAt(await requireWorkspacePath())
  }

  return {
    async getWorkspaceStatus() {
      const workspacePath = await getWorkspacePath()
      return workspacePath
        ? { supported: true, configured: true, directoryName: path.basename(workspacePath), directoryPath: workspacePath, permission: 'granted' }
        : { supported: true, configured: false, directoryName: '', permission: 'prompt' }
    },

    async pickWorkspaceDirectory() {
      const selected = await selectDirectory({ purpose: 'workspace' })
      if (!selected) throw new Error('未选择缓存目录')
      const workspacePath = path.resolve(selected)
      await mkdir(workspacePath, { recursive: true })
      await writeJsonIfChanged(stateFilePath, { version: 1, workspacePath })
      cachedWorkspacePath = workspacePath
      workspacePathLoad = null
      await ensureWorkspaceDatabaseAt(workspacePath)
      return { supported: true, configured: true, directoryName: path.basename(workspacePath), directoryPath: workspacePath, permission: 'granted' }
    },

    async loadWorkspaceData() {
      const workspacePath = await getWorkspacePath()
      return workspacePath ? databaseClient.readWorkspaceDataFromDatabase(await ensureWorkspaceDatabaseAt(workspacePath)) : null
    },

    async saveWorkspaceData(data) {
      await databaseClient.replaceWorkspaceDataInDatabase(await requireWorkspaceDatabase(), data)
    },

    async listWorkspaceProjects() {
      const workspacePath = await getWorkspacePath()
      return workspacePath ? databaseClient.listWorkspaceProjectsFromDatabase(await ensureWorkspaceDatabaseAt(workspacePath)) : null
    },

    async loadWorkspaceProject(projectId) {
      const workspacePath = await getWorkspacePath()
      if (!workspacePath) return null
      return databaseClient.loadWorkspaceProjectFromDatabase(await ensureWorkspaceDatabaseAt(workspacePath), projectId)
    },

    async saveWorkspaceProject(input) {
      await databaseClient.saveWorkspaceProjectToDatabase(await requireWorkspaceDatabase(), input)
    },

    async deleteWorkspaceProject(input) {
      await databaseClient.deleteWorkspaceProjectFromDatabase(await requireWorkspaceDatabase(), input)
    },

    async loadWorkspaceConfig() {
      const workspacePath = await getWorkspacePath()
      return workspacePath ? databaseClient.loadWorkspaceConfigFromDatabase(await ensureWorkspaceDatabaseAt(workspacePath)) : null
    },

    async saveWorkspaceConfig(config) {
      await databaseClient.saveWorkspaceConfigToDatabase(await requireWorkspaceDatabase(), config)
    },

    async loadWorkflowTemplates() {
      const workspacePath = await getWorkspacePath()
      return workspacePath ? databaseClient.loadWorkflowTemplatesFromDatabase(await ensureWorkspaceDatabaseAt(workspacePath)) : null
    },

    async saveWorkflowTemplates(library) {
      await databaseClient.saveWorkflowTemplatesToDatabase(await requireWorkspaceDatabase(), library)
    },

    async queryWorkspaceAudit(query) {
      const workspacePath = await getWorkspacePath()
      return workspacePath
        ? databaseClient.queryWorkspaceAuditFromDatabase(await ensureWorkspaceDatabaseAt(workspacePath), query)
        : { supported: true, entries: [], totalCount: 0, hasMore: false }
    },

    async searchWorkspace(query) {
      const workspacePath = await getWorkspacePath()
      return workspacePath
        ? databaseClient.searchWorkspaceFromDatabase(await ensureWorkspaceDatabaseAt(workspacePath), query)
        : { supported: true, indexedDocumentCount: 0, entries: [] }
    },

    async writeWorkspaceAsset(input) {
      const workspacePath = await requireWorkspacePath()
      const mimeType = input.mimeType || 'image/png'
      const parsed = path.parse(sanitizePathSegment(input.fileName))
      const extension = parsed.ext || [...MIME_TYPES.entries()].find(([, mime]) => mime === mimeType)?.[0] || '.png'
      const fileName = `${parsed.name || 'image'}-${Date.now()}-${randomUUID().slice(0, 6)}${extension}`
      const relativePath = [WORKSPACE_IMAGE_DIRECTORY_NAME, ...input.pathSegments.map(sanitizePathSegment), fileName].join('/')
      const target = resolveInside(workspacePath, relativePath)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, new Uint8Array(input.bytes))
      return { relativePath, fileName, mimeType }
    },

    async writeWorkspaceAssetAtPath(input) {
      const workspacePath = await requireWorkspacePath()
      const relativePath = normalizeRelativePath(input.relativePath)
      if (!relativePath.startsWith(`${WORKSPACE_IMAGE_DIRECTORY_NAME}/`)) throw new Error('资源路径不合法')
      const target = resolveInside(workspacePath, relativePath)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, new Uint8Array(input.bytes))
      return { relativePath, fileName: path.basename(target), mimeType: input.mimeType || MIME_TYPES.get(path.extname(target).toLowerCase()) || 'application/octet-stream' }
    },

    async readWorkspaceAsset(relativePath) {
      const workspacePath = await requireWorkspacePath()
      const normalized = normalizeRelativePath(relativePath)
      if (!normalized.startsWith(`${WORKSPACE_IMAGE_DIRECTORY_NAME}/`)) throw new Error('资源路径不合法')
      const filePath = resolveInside(workspacePath, normalized)
      return { bytes: await readFile(filePath), mimeType: MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream' }
    },

    async inspectWorkspaceAssets(data) {
      const workspacePath = await requireWorkspacePath()
      const referencedPaths = new Set(collectWorkspaceAssets(data))
      const files = (await listFileDetails(path.join(workspacePath, WORKSPACE_IMAGE_DIRECTORY_NAME)))
        .map((file) => ({ ...file, relativePath: `${WORKSPACE_IMAGE_DIRECTORY_NAME}/${file.relativePath}` }))
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
    },

    async cleanupUnusedWorkspaceAssets(data) {
      const workspacePath = await requireWorkspacePath()
      const referenced = new Set(collectWorkspaceAssets(data))
      const files = await listFileDetails(path.join(workspacePath, WORKSPACE_IMAGE_DIRECTORY_NAME))
      let deletedCount = 0
      let deletedByteSize = 0
      for (const file of files) {
        const relativePath = `${WORKSPACE_IMAGE_DIRECTORY_NAME}/${file.relativePath}`
        if (!referenced.has(relativePath)) {
          await rm(resolveInside(workspacePath, relativePath), { force: true })
          deletedCount += 1
          deletedByteSize += file.byteSize
        }
      }
      return { deletedCount, deletedByteSize }
    },

    async exportWorkspaceBundle(input) {
      const workspacePath = await requireWorkspacePath()
      const databasePath = await ensureWorkspaceDatabaseAt(workspacePath)
      const data = await databaseClient.readWorkspaceDataFromDatabase(databasePath) ?? input.data
      const config = await databaseClient.loadWorkspaceConfigFromDatabase(databasePath) ?? input.config
      const templates = await databaseClient.loadWorkflowTemplatesFromDatabase(databasePath)
      const parent = await selectDirectory({ purpose: 'export' })
      if (!parent) throw new Error('未选择导出目录')
      if (path.resolve(parent) === path.resolve(workspacePath)) throw new Error('工作区目录包不能与当前工作区使用同一目录')
      const name = sanitizePathSegment(String(input.suggestedName || 'ai-canvas-workspace').replace(/\.zip$/i, ''))
      const bundlePath = path.join(parent, `${name}-${Date.now()}`)
      await mkdir(path.join(bundlePath, BUNDLE_PROJECT_DIRECTORY_NAME), { recursive: true })
      const manifest = { type: 'ai-canvas-workspace-bundle', version: 1, exportedAt: Date.now(), projects: data.projects.map((project) => ({ ...projectSummary(project), fileName: projectFileName(project.id) })), activeProjectId: data.activeProjectId, lastOpenedProjectId: data.lastOpenedProjectId, includesConfig: Boolean(config), includesTemplates: Boolean(templates), projectRoot: 'projects', assetRoot: 'images' }
      for (const project of data.projects) await writeJsonIfChanged(path.join(bundlePath, BUNDLE_PROJECT_DIRECTORY_NAME, projectFileName(project.id)), project)
      if (config) await writeJsonIfChanged(path.join(bundlePath, WORKSPACE_CONFIG_PATH), redactConfigSecrets(config))
      if (templates) await writeJsonIfChanged(path.join(bundlePath, WORKSPACE_TEMPLATE_PATH), templates)
      for (const relativePath of collectWorkspaceAssets(data)) {
        const destination = resolveInside(bundlePath, relativePath)
        await mkdir(path.dirname(destination), { recursive: true })
        await cp(resolveInside(workspacePath, relativePath), destination)
      }
      await writeJsonIfChanged(path.join(bundlePath, BUNDLE_MANIFEST_FILE_NAME), manifest)
      return { directoryPath: bundlePath }
    },

    async importWorkspaceBundle() {
      const workspacePath = await requireWorkspaceDatabase()
      const bundlePath = await selectDirectory({ purpose: 'import' })
      if (!bundlePath) throw new Error('未选择导入目录')
      if (path.resolve(bundlePath) === path.resolve(workspacePath)) throw new Error('工作区目录包不能与当前工作区使用同一目录')
      const manifest = await readJson(path.join(bundlePath, BUNDLE_MANIFEST_FILE_NAME))
      assertBundleManifest(manifest)
      const projects = []
      for (const summary of manifest.projects) {
        projects.push(parseBundleProject(
          await readJson(path.join(bundlePath, BUNDLE_PROJECT_DIRECTORY_NAME, summary.fileName)),
          summary.id,
        ))
      }
      const data = { projects, activeProjectId: manifest.activeProjectId ?? null, lastOpenedProjectId: manifest.lastOpenedProjectId ?? null }
      const config = manifest.includesConfig
        ? parseBundleConfig(await readJson(path.join(bundlePath, WORKSPACE_CONFIG_PATH)))
        : null
      const templates = manifest.includesTemplates
        ? await readJson(path.join(bundlePath, WORKSPACE_TEMPLATE_PATH))
        : null
      if (templates && (templates.type !== 'ai-canvas-workflow-templates' || templates.version !== 1 || !Array.isArray(templates.templates))) {
        throw new Error('工作区目录包模板格式不正确')
      }
      const assets = collectWorkspaceAssets(data)
      for (const relativePath of assets) await stat(resolveInside(bundlePath, relativePath))
      await databaseClient.backupWorkspaceDatabase(workspacePath, 'before-bundle-import')
      await databaseClient.replaceWorkspaceDataInDatabase(workspacePath, data, 'workspace.import-bundle')
      if (config) await databaseClient.saveWorkspaceConfigToDatabase(workspacePath, config)
      if (templates) await databaseClient.saveWorkflowTemplatesToDatabase(workspacePath, templates)
      for (const relativePath of assets) {
        const destination = resolveInside(workspacePath, relativePath)
        await mkdir(path.dirname(destination), { recursive: true })
        await cp(resolveInside(bundlePath, relativePath), destination)
      }
      await this.cleanupUnusedWorkspaceAssets(data)
      return { data, config, templates, manifest, importedAssetCount: assets.length }
    },

    async exportProjectBundle(input) {
      const workspacePath = await requireWorkspacePath()
      const parent = await selectDirectory({ purpose: 'export-project' })
      if (!parent) throw new Error('未选择项目导出目录')
      if (path.resolve(parent) === path.resolve(workspacePath)) throw new Error('项目目录包不能与当前工作区使用同一目录')
      const bundleName = sanitizePathSegment(String(input.suggestedName || input.project.name || 'ai-canvas-project'))
      const bundlePath = path.join(parent, `${bundleName}-${Date.now()}`)
      await mkdir(path.join(bundlePath, BUNDLE_PROJECT_DIRECTORY_NAME), { recursive: true })
      const manifest = {
        type: 'ai-canvas-project-bundle',
        version: 1,
        exportedAt: Date.now(),
        project: { ...projectSummary(input.project), fileName: projectFileName(input.project.id) },
        projectRoot: 'projects',
        assetRoot: 'images',
      }
      await writeJsonIfChanged(path.join(bundlePath, BUNDLE_PROJECT_DIRECTORY_NAME, manifest.project.fileName), input.project)
      const assetPaths = collectWorkspaceAssets({ projects: [input.project] })
      for (const relativePath of assetPaths) {
        const destination = resolveInside(bundlePath, relativePath)
        await mkdir(path.dirname(destination), { recursive: true })
        await cp(resolveInside(workspacePath, relativePath), destination)
      }
      await writeJsonIfChanged(path.join(bundlePath, PROJECT_BUNDLE_MANIFEST_FILE_NAME), manifest)
      return { directoryPath: bundlePath }
    },

    async prepareProjectBundleImport() {
      const workspacePath = await requireWorkspacePath()
      const bundlePath = await selectDirectory({ purpose: 'import-project' })
      if (!bundlePath) throw new Error('未选择项目目录包')
      if (path.resolve(bundlePath) === path.resolve(workspacePath)) throw new Error('项目目录包不能与当前工作区使用同一目录')
      const manifest = parseProjectBundleManifest(await readJson(path.join(bundlePath, PROJECT_BUNDLE_MANIFEST_FILE_NAME)))
      const project = parseBundleProject(
        await readJson(path.join(bundlePath, BUNDLE_PROJECT_DIRECTORY_NAME, manifest.project.fileName)),
        manifest.project.id,
      )
      const assetPaths = collectWorkspaceAssets({ projects: [project] })
      for (const relativePath of assetPaths) await stat(resolveInside(bundlePath, relativePath))
      const workspaceData = await databaseClient.readWorkspaceDataFromDatabase(await ensureWorkspaceDatabaseAt(workspacePath))
      const candidateId = randomUUID()
      pendingProjectImports.set(candidateId, { bundlePath, project, assetPaths })
      return {
        candidateId,
        project: projectSummary(project),
        assetCount: assetPaths.length,
        hasIdConflict: Boolean(workspaceData?.projects.some((item) => item.id === project.id)),
      }
    },

    async commitProjectBundleImport(input) {
      const workspacePath = await requireWorkspacePath()
      const pending = pendingProjectImports.get(input.candidateId)
      if (!pending) throw new Error('项目导入候选已失效，请重新选择目录包')
      const workspaceData = await databaseClient.readWorkspaceDataFromDatabase(await ensureWorkspaceDatabaseAt(workspacePath))
        ?? { projects: [], activeProjectId: null, lastOpenedProjectId: null }
      const hasConflict = workspaceData.projects.some((project) => project.id === pending.project.id)
      if (hasConflict && input.resolution === 'preserve') throw new Error('项目 ID 已存在，请选择导入副本或替换现有项目')
      if (!hasConflict && input.resolution === 'replace') throw new Error('当前工作区不存在可替换的同 ID 项目')
      const prepared = prepareImportedProject(pending.project, input.resolution)
      for (const sourcePath of pending.assetPaths) {
        const targetPath = prepared.pathMap.get(sourcePath) ?? sourcePath
        const destination = resolveInside(workspacePath, targetPath)
        await mkdir(path.dirname(destination), { recursive: true })
        await cp(resolveInside(pending.bundlePath, sourcePath), destination)
      }
      const existingIndex = workspaceData.projects.findIndex((project) => project.id === prepared.project.id)
      if (existingIndex >= 0) workspaceData.projects[existingIndex] = prepared.project
      else workspaceData.projects.push(prepared.project)
      workspaceData.activeProjectId ??= prepared.project.id
      workspaceData.lastOpenedProjectId ??= prepared.project.id
      await databaseClient.replaceWorkspaceDataInDatabase(workspacePath, workspaceData, 'project.import-bundle')
      pendingProjectImports.delete(input.candidateId)
      return {
        project: prepared.project,
        importedAssetCount: pending.assetPaths.length,
        resolution: input.resolution,
        sourceProjectId: prepared.sourceProjectId,
      }
    },

    async exportWorkflowJson(input) {
      const filePath = await selectSaveFile({ suggestedName: input.suggestedName })
      if (!filePath) throw new Error('未选择工作流保存位置')
      await writeJsonIfChanged(filePath, input.workflow)
    },

    async importWorkflowJson() {
      const filePath = await selectOpenFile()
      if (!filePath) throw new Error('未选择工作流文件')
      return { content: await readFile(filePath, 'utf8'), fileName: path.basename(filePath) }
    },

    dispose: () => databaseClient.dispose(),
  }
}
