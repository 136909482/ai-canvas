import {
  buildWorkspaceBundleManifest,
  collectWorkspaceReferencedAssetPaths,
  copyWorkspaceBundleAssets,
  parseWorkspaceBundleManifest,
  readWorkspaceBundleDirectory,
  writeWorkspaceBundleDirectory,
} from './workspaceBundle.ts'
import { readFileSync } from 'node:fs'
import type {
  ProjectRecord,
  ProjectSnapshot,
  WorkflowTemplateLibrary,
  WorkspaceConfigFile,
  WorkspaceData,
} from '../../types/index.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function assertThrows(action: () => unknown, message: string) {
  try {
    action()
  } catch {
    return
  }

  throw new Error(message)
}

async function assertRejects(action: () => Promise<unknown>, message: string) {
  try {
    await action()
  } catch {
    return
  }

  throw new Error(message)
}

class MemoryFileHandle {
  readonly kind = 'file'
  readonly name: string
  content: Blob = new Blob()

  constructor(name: string) {
    this.name = name
  }

  async getFile() {
    return this.content as File
  }

  async createWritable() {
    return {
      write: async (data: FileSystemWriteChunkType) => {
        if (typeof data === 'string') {
          this.content = new Blob([data])
          return
        }

        if (data instanceof Blob) {
          this.content = data
          return
        }

        throw new Error('Unsupported in-memory write payload')
      },
      close: async () => undefined,
    } as FileSystemWritableFileStream
  }
}

class MemoryDirectoryHandle {
  readonly kind = 'directory'
  readonly name: string
  readonly entries = new Map<string, MemoryFileHandle | MemoryDirectoryHandle>()

  constructor(name: string) {
    this.name = name
  }

  async isSameEntry(other: FileSystemHandle) {
    return Object.is(other, this)
  }

  async getFileHandle(name: string, options?: FileSystemGetFileOptions) {
    const existing = this.entries.get(name)
    if (existing instanceof MemoryFileHandle) {
      return existing as unknown as FileSystemFileHandle
    }
    if (existing || !options?.create) {
      throw new DOMException(`Missing file: ${name}`, 'NotFoundError')
    }

    const file = new MemoryFileHandle(name)
    this.entries.set(name, file)
    return file as unknown as FileSystemFileHandle
  }

  async getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions) {
    const existing = this.entries.get(name)
    if (existing instanceof MemoryDirectoryHandle) {
      return existing as unknown as FileSystemDirectoryHandle
    }
    if (existing || !options?.create) {
      throw new DOMException(`Missing directory: ${name}`, 'NotFoundError')
    }

    const directory = new MemoryDirectoryHandle(name)
    this.entries.set(name, directory)
    return directory as unknown as FileSystemDirectoryHandle
  }

  async *values() {
    yield* this.entries.values() as Iterable<FileSystemFileHandle | FileSystemDirectoryHandle>
  }

  async removeEntry(name: string) {
    if (!this.entries.delete(name)) {
      throw new DOMException(`Missing entry: ${name}`, 'NotFoundError')
    }
  }
}

function asDirectoryHandle(handle: MemoryDirectoryHandle) {
  return handle as unknown as FileSystemDirectoryHandle
}

async function getMemoryFile(root: MemoryDirectoryHandle, relativePath: string) {
  const segments = relativePath.split('/')
  const fileName = segments.pop()
  let current = root

  for (const segment of segments) {
    const entry = current.entries.get(segment)
    assert(entry instanceof MemoryDirectoryHandle, `missing directory ${segment}`)
    current = entry
  }

  const file = current.entries.get(fileName ?? '')
  assert(file instanceof MemoryFileHandle, `missing file ${relativePath}`)
  return file
}

async function writeMemoryFile(root: MemoryDirectoryHandle, relativePath: string, content: string) {
  const segments = relativePath.split('/')
  const fileName = segments.pop()
  assert(fileName, 'memory file path should include a file name')
  let current = root

  for (const segment of segments) {
    const existing = current.entries.get(segment)
    if (existing instanceof MemoryDirectoryHandle) {
      current = existing
      continue
    }

    const directory = new MemoryDirectoryHandle(segment)
    current.entries.set(segment, directory)
    current = directory
  }

  const file = new MemoryFileHandle(fileName)
  file.content = new Blob([content])
  current.entries.set(fileName, file)
}

function createSnapshot(assetPrefix: string): ProjectSnapshot {
  return {
    schemaVersion: 1,
    canvas: {
      nodes: [
        {
          id: `${assetPrefix}-image`,
          type: 'imageNode',
          position: { x: 0, y: 0 },
          data: {
            imageAsset: {
              relativePath: `images/originals/${assetPrefix}.png`,
              thumbnailRelativePath: `images/thumbnails/${assetPrefix}.webp`,
              previewRelativePath: `images/previews/${assetPrefix}.webp`,
            },
          },
        },
      ],
      edges: [],
    },
    taskQueue: {
      tasks: [],
    },
  }
}

function createProject(id: string): ProjectRecord {
  const snapshot = createSnapshot(id)

  return {
    id,
    name: `Project ${id}`,
    savedSnapshot: snapshot,
    workingSnapshot: snapshot,
    createdAt: 1,
    updatedAt: 2,
    lastOpenedAt: 3,
  }
}

async function runWorkspaceBundleTests() {
  const data: WorkspaceData = {
    projects: [createProject('project-a'), createProject('project-b')],
    activeProjectId: 'project-a',
    lastOpenedProjectId: 'project-b',
  }
  const manifest = buildWorkspaceBundleManifest(data, true, 123)

  assert(manifest.type === 'ai-canvas-workspace-bundle', 'bundle type should be explicit')
  assert(manifest.version === 1, 'bundle schema should start at version 1')
  assert(manifest.exportedAt === 123, 'bundle export timestamp should be deterministic when provided')
  assert(manifest.projects[0]?.fileName === 'project-a.json', 'project files should be deterministic')
  assert(manifest.activeProjectId === 'project-a', 'active project should survive export')
  assert(manifest.lastOpenedProjectId === 'project-b', 'recent project should survive export')
  assert(parseWorkspaceBundleManifest(manifest).projects.length === 2, 'valid bundle manifests should parse')

  assertThrows(
    () => parseWorkspaceBundleManifest({ ...manifest, version: 2 }),
    'newer bundle versions should be rejected',
  )
  assertThrows(
    () => parseWorkspaceBundleManifest({
      ...manifest,
      projects: [{ ...manifest.projects[0], fileName: '../escape.json' }],
    }),
    'project file traversal should be rejected',
  )
  assertThrows(
    () => parseWorkspaceBundleManifest({
      ...manifest,
      projects: [manifest.projects[0], manifest.projects[0]],
    }),
    'duplicate project ids should be rejected',
  )
  assertThrows(
    () => parseWorkspaceBundleManifest({ ...manifest, activeProjectId: 'missing' }),
    'missing active project ids should be rejected',
  )

  const assetPaths = collectWorkspaceReferencedAssetPaths(data)
  assert(assetPaths.length === 6, 'saved and working snapshots should deduplicate repeated asset paths')
  assert(assetPaths[0] === 'images/originals/project-a.png', 'asset paths should be sorted')
  assert(assetPaths.includes('images/previews/project-b.webp'), 'preview assets should be included')
  assert(assetPaths.includes('images/thumbnails/project-a.webp'), 'thumbnail assets should be included')

  const sourceWorkspace = new MemoryDirectoryHandle('source-workspace')
  for (const relativePath of assetPaths) {
    await writeMemoryFile(sourceWorkspace, relativePath, relativePath)
  }

  const config: WorkspaceConfigFile = {
    version: 1,
    model: 'gpt-image-1',
    customModels: [],
    providerProfiles: [{
      id: 'openai',
      name: 'OpenAI',
      kind: 'image',
      provider: 'openai',
      apiKey: 'sk-bundle-secret',
      apiUrl: 'https://api.openai.com/v1',
      requestMode: 'sync',
      enabled: true,
    }],
    storage: {
      autosaveIntervalMs: 30_000,
      canvasTopBarCollapsed: false,
      alignmentGuidesEnabled: true,
      themeMode: 'dark',
      canvasPerformanceMode: 'quality',
      canvasGridEnabled: true,
      lowQualityPreviewEnabled: true,
      edgeStyle: 'animated',
    },
  }
  const bundle = new MemoryDirectoryHandle('bundle')
  const templates: WorkflowTemplateLibrary = {
    type: 'ai-canvas-workflow-templates',
    version: 1,
    templates: [{ id: 'template-1', name: 'Starter', schemaVersion: 1, nodes: [], edges: [], createdAt: 1, updatedAt: 1 }],
  }
  await writeWorkspaceBundleDirectory({
    sourceWorkspaceHandle: asDirectoryHandle(sourceWorkspace),
    bundleHandle: asDirectoryHandle(bundle),
    data,
    config,
    templates,
  })

  const exportedConfig = JSON.parse(await (await getMemoryFile(bundle, '.config/config.json')).content.text()) as WorkspaceConfigFile
  assert(exportedConfig.providerProfiles?.[0]?.apiKey === '', 'bundle config should redact provider API keys')
  assert(config.providerProfiles?.[0]?.apiKey === 'sk-bundle-secret', 'bundle export should not mutate source config')

  const imported = await readWorkspaceBundleDirectory(asDirectoryHandle(bundle))
  assert(imported.data.projects.length === 2, 'bundle reader should restore every project')
  assert(imported.importedAssetCount === assetPaths.length, 'bundle reader should count referenced assets')
  assert(imported.templates?.templates[0]?.id === 'template-1', 'bundle reader should restore workflow templates')

  const destination = new MemoryDirectoryHandle('destination')
  const copiedCount = await copyWorkspaceBundleAssets({
    bundleHandle: asDirectoryHandle(bundle),
    workspaceHandle: asDirectoryHandle(destination),
    data: imported.data,
  })
  assert(copiedCount === assetPaths.length, 'asset installation should report copied file count')
  assert(
    await (await getMemoryFile(destination, 'images/originals/project-a.png')).content.text() === 'images/originals/project-a.png',
    'asset installation should preserve content and relative paths',
  )

  const projectDirectory = bundle.entries.get('projects')
  assert(projectDirectory instanceof MemoryDirectoryHandle, 'bundle should contain project directory')
  const removedProject = projectDirectory.entries.get('project-a.json')
  projectDirectory.entries.delete('project-a.json')
  await assertRejects(
    () => readWorkspaceBundleDirectory(asDirectoryHandle(bundle)),
    'missing project files should reject bundle import',
  )
  assert(removedProject, 'project fixture should exist')
  projectDirectory.entries.set('project-a.json', removedProject)

  const originalAssetDirectory = bundle.entries.get('images')
  assert(originalAssetDirectory instanceof MemoryDirectoryHandle, 'bundle should contain images directory')
  const originalsDirectory = originalAssetDirectory.entries.get('originals')
  assert(originalsDirectory instanceof MemoryDirectoryHandle, 'bundle should contain originals directory')
  const removedAsset = originalsDirectory.entries.get('project-a.png')
  originalsDirectory.entries.delete('project-a.png')
  await assertRejects(
    () => readWorkspaceBundleDirectory(asDirectoryHandle(bundle)),
    'missing referenced assets should reject bundle import',
  )
  assert(removedAsset, 'asset fixture should exist')
  originalsDirectory.entries.set('project-a.png', removedAsset)

  const projectFile = await getMemoryFile(bundle, 'projects/project-a.json')
  const legacySnapshot = JSON.parse(readFileSync(
    new URL('../../../test-fixtures/snapshots/v0-unversioned.json', import.meta.url),
    'utf8',
  )) as ProjectSnapshot
  const legacyProject = JSON.parse(await projectFile.content.text()) as ProjectRecord
  legacyProject.savedSnapshot = legacySnapshot
  legacyProject.workingSnapshot = legacySnapshot
  projectFile.content = new Blob([JSON.stringify(legacyProject)])
  const migrated = await readWorkspaceBundleDirectory(asDirectoryHandle(bundle))
  assert(migrated.data.projects[0]?.savedSnapshot.schemaVersion === 1, 'bundle import should migrate legacy saved snapshots')
  assert(migrated.data.projects[0]?.workingSnapshot.schemaVersion === 1, 'bundle import should migrate legacy working snapshots')
}

await runWorkspaceBundleTests()
