import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createNativeWorkspaceService } from '../electron/nativeWorkspace.mjs'
import {
  WORKSPACE_DATABASE_RELATIVE_PATH,
  WORKSPACE_DATABASE_SCHEMA_VERSION,
  getWorkspaceDatabaseDiagnostics,
  initializeWorkspaceDatabase,
} from '../electron/nativeWorkspaceDatabase.mjs'

function createSnapshot(imageAsset = null) {
  return {
    canvas: {
      nodes: imageAsset ? [{ id: 'image-1', type: 'imageNode', position: { x: 0, y: 0 }, data: { imageAsset } }] : [],
      edges: [],
    },
    taskQueue: { tasks: [] },
  }
}

function createProject(id, imageAsset = null) {
  const snapshot = createSnapshot(imageAsset)
  return {
    id,
    name: `Project ${id}`,
    savedSnapshot: snapshot,
    workingSnapshot: snapshot,
    createdAt: 10,
    updatedAt: 20,
    lastOpenedAt: 30,
  }
}

function createService(input) {
  return createNativeWorkspaceService({
    stateFilePath: input.stateFilePath,
    selectDirectory: async ({ purpose }) => input.directories[purpose] ?? null,
    selectSaveFile: async () => input.workflowFile ?? null,
    selectOpenFile: async () => input.workflowFile ?? null,
  })
}

const workspaceFixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../test-fixtures/workspaces',
)

test('native workspace loads committed legacy and split workspace fixtures', async () => {
  for (const fixtureName of ['legacy-monolithic', 'split-v2']) {
    const root = await mkdtemp(path.join(os.tmpdir(), `ai-canvas-${fixtureName}-`))
    const workspace = path.join(root, 'workspace')

    try {
      await cp(path.join(workspaceFixtureRoot, fixtureName), workspace, { recursive: true })
      const service = createService({
        stateFilePath: path.join(root, 'state.json'),
        directories: { workspace },
      })
      await service.pickWorkspaceDirectory()

      const data = await service.loadWorkspaceData()
      assert.equal(data.projects.length, 1)
      assert.equal(data.activeProjectId, data.projects[0].id)
      assert.equal(data.projects[0].savedSnapshot.canvas.nodes.length, 1)
      assert.deepEqual(data.projects[0].savedSnapshot, data.projects[0].workingSnapshot)
      assert.equal((await service.listWorkspaceProjects()).projects[0].id, data.projects[0].id)
      assert.equal((await service.loadWorkspaceProject(data.projects[0].id)).id, data.projects[0].id)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
})

test('native workspace supports project, config, asset, bundle, and restart contracts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-canvas-native-'))
  const workspace = path.join(root, 'workspace')
  const exportParent = path.join(root, 'exports')
  const importedWorkspace = path.join(root, 'imported-workspace')
  const stateFilePath = path.join(root, 'state.json')

  try {
    const service = createService({ stateFilePath, directories: { workspace, export: exportParent } })
    const picked = await service.pickWorkspaceDirectory()
    assert.equal(picked.directoryPath, workspace)
    assert.equal((await service.getWorkspaceStatus()).configured, true)

    await service.saveWorkspaceProject({ project: createProject('one'), activeProjectId: 'one', lastOpenedProjectId: 'one' })
    assert.deepEqual((await service.listWorkspaceProjects()).projects.map((project) => project.id), ['one'])
    assert.equal((await service.loadWorkspaceProject('one')).savedSnapshot.canvas.nodes.length, 0)
    await service.saveWorkspaceProject({ project: { ...createProject('one'), archivedAt: 40 }, activeProjectId: null, lastOpenedProjectId: null })
    assert.equal((await service.listWorkspaceProjects()).projects[0].archivedAt, 40)
    assert.equal((await service.loadWorkspaceProject('one')).archivedAt, 40)
    await service.saveWorkspaceProject({ project: createProject('one'), activeProjectId: 'one', lastOpenedProjectId: 'one' })

    const keptAsset = await service.writeWorkspaceAsset({
      pathSegments: ['project-one'],
      fileName: 'reference.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]).buffer,
    })
    await service.writeWorkspaceAssetAtPath({
      relativePath: 'images/orphan.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([9]).buffer,
    })
    const project = createProject('one', { relativePath: keptAsset.relativePath, mimeType: 'image/png' })
    await service.saveWorkspaceProject({ project })
    assert.deepEqual([...new Uint8Array((await service.readWorkspaceAsset(keptAsset.relativePath)).bytes)], [1, 2, 3])
    const inspection = await service.inspectWorkspaceAssets({ projects: [project], activeProjectId: 'one', lastOpenedProjectId: 'one' })
    assert.equal(inspection.totalFileCount, 2)
    assert.equal(inspection.totalByteSize, 4)
    assert.equal(inspection.referencedFileCount, 1)
    assert.equal(inspection.orphanedFileCount, 1)
    assert.equal(inspection.orphanedByteSize, 1)
    assert.equal(inspection.orphanedFiles[0].relativePath, 'images/orphan.png')
    assert.deepEqual(inspection.missingReferencedPaths, [])
    const cleanup = await service.cleanupUnusedWorkspaceAssets({ projects: [project], activeProjectId: 'one', lastOpenedProjectId: 'one' })
    assert.equal(cleanup.deletedCount, 1)
    assert.equal(cleanup.deletedByteSize, 1)
    const missingInspection = await service.inspectWorkspaceAssets({
      projects: [createProject('missing', { relativePath: 'images/missing.png', mimeType: 'image/png' })],
      activeProjectId: 'missing',
      lastOpenedProjectId: 'missing',
    })
    assert.deepEqual(missingInspection.missingReferencedPaths, ['images/missing.png'])

    const config = {
      version: 1,
      model: 'image-model',
      customModels: [],
      providerProfiles: [{ id: 'provider', apiKey: 'secret', apiUrl: 'https://example.com' }],
      storage: {},
    }
    await service.saveWorkspaceConfig(config)
    assert.equal((await service.loadWorkspaceConfig()).providerProfiles[0].apiKey, 'secret')

    const templateLibrary = {
      type: 'ai-canvas-workflow-templates',
      version: 1,
      templates: [{
        id: 'template-1',
        name: 'Prompt to image',
        schemaVersion: 1,
        nodes: [{ id: 'text-1', type: 'textNode', position: { x: 0, y: 0 }, data: { text: 'hello' } }],
        edges: [],
        createdAt: 100,
        updatedAt: 100,
      }],
    }
    await service.saveWorkflowTemplates(templateLibrary)
    assert.deepEqual(await service.loadWorkflowTemplates(), templateLibrary)

    const allAudit = await service.queryWorkspaceAudit({ limit: 2 })
    assert.equal(allAudit.supported, true)
    assert.ok(allAudit.totalCount >= 4)
    assert.equal(allAudit.entries.length, 2)
    assert.equal(allAudit.hasMore, true)
    assert.ok(allAudit.entries[0].createdAt >= allAudit.entries[1].createdAt)
    const settingsAudit = await service.queryWorkspaceAudit({ scope: 'settings' })
    assert.deepEqual(settingsAudit.entries.map((entry) => entry.eventType), ['settings.save'])
    const templateAudit = await service.queryWorkspaceAudit({ search: 'workflow_templates' })
    assert.equal(templateAudit.entries[0].eventType, 'templates.save')
    assert.deepEqual(templateAudit.entries[0].details, { templateCount: 1 })

    const data = await service.loadWorkspaceData()
    assert.equal(data.projects.length, 1)
    const exported = await service.exportWorkspaceBundle({
      data: { projects: [], activeProjectId: null, lastOpenedProjectId: null },
      config,
      suggestedName: 'portable-workspace',
    })
    const exportedConfig = JSON.parse(await readFile(path.join(exported.directoryPath, '.config', 'config.json'), 'utf8'))
    assert.equal(exportedConfig.providerProfiles[0].apiKey, '')
    assert.deepEqual(
      JSON.parse(await readFile(path.join(exported.directoryPath, '.config', 'workflow-templates.json'), 'utf8')),
      templateLibrary,
    )

    const importStateFilePath = path.join(root, 'import-state.json')
    const importService = createService({
      stateFilePath: importStateFilePath,
      directories: { workspace: importedWorkspace, import: exported.directoryPath },
    })
    await importService.pickWorkspaceDirectory()
    const imported = await importService.importWorkspaceBundle()
    assert.equal(imported.data.projects[0].id, 'one')
    assert.equal(imported.importedAssetCount, 1)
    assert.deepEqual(imported.templates, templateLibrary)
    assert.deepEqual(await importService.loadWorkflowTemplates(), templateLibrary)
    assert.equal((await readdir(path.join(importedWorkspace, '.ai-canvas', 'backups'))).length, 1)
    assert.deepEqual([...new Uint8Array((await importService.readWorkspaceAsset(keptAsset.relativePath)).bytes)], [1, 2, 3])

    const restartedService = createService({ stateFilePath: importStateFilePath, directories: {} })
    assert.equal((await restartedService.getWorkspaceStatus()).directoryPath, importedWorkspace)
    assert.equal((await restartedService.loadWorkspaceProject('one')).name, 'Project one')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('native workspace imports a legacy monolithic manifest into SQLite on first open', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-canvas-native-legacy-'))
  const workspace = path.join(root, 'workspace')
  const stateFilePath = path.join(root, 'state.json')

  try {
    await mkdir(workspace, { recursive: true })
    const legacyData = { projects: [createProject('legacy')], activeProjectId: 'legacy', lastOpenedProjectId: 'legacy' }
    await writeFile(path.join(workspace, 'ai-canvas-workspace.json'), JSON.stringify(legacyData), 'utf8')
    const service = createService({ stateFilePath, directories: { workspace } })
    await service.pickWorkspaceDirectory()

    assert.equal((await service.loadWorkspaceProject('legacy')).id, 'legacy')
    await service.saveWorkspaceProject({ project: createProject('legacy') })
    const databaseStat = await stat(path.join(workspace, WORKSPACE_DATABASE_RELATIVE_PATH))
    assert.ok(databaseStat.size > 0)
    const diagnostics = getWorkspaceDatabaseDiagnostics(workspace)
    assert.equal(diagnostics.version, WORKSPACE_DATABASE_SCHEMA_VERSION)
    assert.equal(diagnostics.projectCount, 1)
    assert.ok(diagnostics.auditCount >= 2)
    assert.equal((await service.loadWorkspaceProject('legacy')).savedSnapshot.canvas.nodes.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('native SQLite workspace indexes tasks and assets without storing media blobs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-canvas-native-sqlite-index-'))
  const workspace = path.join(root, 'workspace')
  try {
    const service = createService({
      stateFilePath: path.join(root, 'state.json'),
      directories: { workspace },
    })
    await service.pickWorkspaceDirectory()
    const project = createProject('indexed', { relativePath: 'images/indexed/result.png', mimeType: 'image/png' })
    project.workingSnapshot.taskQueue.tasks.push({
      id: 'task-1',
      kind: 'image',
      status: 'queued',
      createdAt: 50,
      resultImageAsset: { relativePath: 'images/indexed/result.png', mimeType: 'image/png' },
    })
    project.workingSnapshot.canvas.nodes.push({
      id: 'text-search',
      type: 'textNode',
      position: { x: 100, y: 100 },
      data: { label: '城市分镜', text: '雨夜里的霓虹街道' },
    })
    await service.saveWorkspaceProject({ project, activeProjectId: project.id, lastOpenedProjectId: project.id })

    const textSearch = await service.searchWorkspace({ text: '霓虹街' })
    assert.equal(textSearch.supported, true)
    assert.equal(textSearch.entries[0].nodeId, 'text-search')
    const assetSearch = await service.searchWorkspace({ text: 'result.png', kinds: ['asset'] })
    assert.equal(assetSearch.entries[0].nodeId, 'image-1')
    assert.equal(assetSearch.entries[0].assetRelativePath, 'images/indexed/result.png')

    const diagnostics = getWorkspaceDatabaseDiagnostics(workspace)
    assert.deepEqual(diagnostics, {
      version: WORKSPACE_DATABASE_SCHEMA_VERSION,
      projectCount: 1,
      taskCount: 1,
      assetCount: 1,
      auditCount: 1,
      searchDocumentCount: 3,
    })
    await assert.rejects(stat(path.join(workspace, 'images', 'indexed', 'result.png')), /ENOENT/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('native SQLite schema migration backs up an existing older database', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-canvas-native-sqlite-backup-'))
  try {
    const databasePath = path.join(root, WORKSPACE_DATABASE_RELATIVE_PATH)
    await mkdir(path.dirname(databasePath), { recursive: true })
    const database = new DatabaseSync(databasePath)
    database.exec('PRAGMA user_version = 1')
    database.close()

    const result = await initializeWorkspaceDatabase(root)
    assert.equal(result.previousVersion, 1)
    assert.ok(result.backupPath)
    assert.deepEqual(await readdir(path.dirname(result.backupPath)), [path.basename(result.backupPath)])
    assert.equal(getWorkspaceDatabaseDiagnostics(root).version, WORKSPACE_DATABASE_SCHEMA_VERSION)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('current SQLite schema initialization does not rebuild search indexes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-canvas-native-sqlite-current-'))
  const workspace = path.join(root, 'workspace')
  let service
  try {
    service = createService({
      stateFilePath: path.join(root, 'state.json'),
      directories: { workspace },
    })
    await service.pickWorkspaceDirectory()
    const project = createProject('current-schema')
    project.workingSnapshot.canvas.nodes.push({
      id: 'current-text',
      type: 'textNode',
      position: { x: 0, y: 0 },
      data: { text: 'original search content' },
    })
    await service.saveWorkspaceProject({ project, activeProjectId: project.id })

    const database = new DatabaseSync(path.join(workspace, WORKSPACE_DATABASE_RELATIVE_PATH))
    database.prepare("UPDATE search_documents SET content_text = 'sentinel' WHERE project_id = ? AND kind = 'text'").run(project.id)
    database.close()

    await initializeWorkspaceDatabase(workspace)

    const reopened = new DatabaseSync(path.join(workspace, WORKSPACE_DATABASE_RELATIVE_PATH))
    const row = reopened.prepare("SELECT content_text FROM search_documents WHERE project_id = ? AND kind = 'text'").get(project.id)
    reopened.close()
    assert.equal(row.content_text, 'sentinel')
  } finally {
    await service?.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('persistence worker keeps the main event loop responsive while SQLite is busy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-canvas-native-sqlite-busy-'))
  const workspace = path.join(root, 'workspace')
  let service
  let lockingDatabase
  try {
    service = createService({
      stateFilePath: path.join(root, 'state.json'),
      directories: { workspace },
    })
    await service.pickWorkspaceDirectory()
    lockingDatabase = new DatabaseSync(path.join(workspace, WORKSPACE_DATABASE_RELATIVE_PATH))
    lockingDatabase.exec('BEGIN IMMEDIATE')

    let timerFired = false
    const releaseLock = new Promise((resolve) => {
      setTimeout(() => {
        timerFired = true
        lockingDatabase.exec('ROLLBACK')
        resolve()
      }, 250)
    })
    const save = service.saveWorkspaceProject({
      project: createProject('busy-retry'),
      activeProjectId: 'busy-retry',
    })

    await Promise.all([save, releaseLock])
    assert.equal(timerFired, true)
    assert.equal((await service.loadWorkspaceProject('busy-retry')).id, 'busy-retry')
  } finally {
    try {
      lockingDatabase?.exec('ROLLBACK')
    } catch {
      // The timed release rolled back the lock in the success path.
    }
    lockingDatabase?.close()
    await service?.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('consecutive project autosaves keep only the latest queued snapshot', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-canvas-native-save-queue-'))
  const workspace = path.join(root, 'workspace')
  let service
  try {
    service = createService({
      stateFilePath: path.join(root, 'state.json'),
      directories: { workspace },
    })
    await service.pickWorkspaceDirectory()
    const versions = ['first', 'middle', 'latest'].map((name) => ({
      ...createProject('queued-project'),
      name,
      updatedAt: 100,
    }))

    await Promise.all(versions.map((project) => service.saveWorkspaceProject({
      project,
      activeProjectId: project.id,
      lastOpenedProjectId: project.id,
    })))

    assert.equal((await service.loadWorkspaceProject('queued-project')).name, 'latest')
    const audit = await service.queryWorkspaceAudit({ scope: 'project', limit: 20 })
    assert.equal(audit.entries.filter((entry) => entry.eventType === 'project.save').length, 2)
  } finally {
    await service?.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('native project bundles require explicit conflict resolution and isolate copied assets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-canvas-native-project-bundle-'))
  const sourceWorkspace = path.join(root, 'source-workspace')
  const targetWorkspace = path.join(root, 'target-workspace')
  const exportParent = path.join(root, 'exports')
  const relativePath = 'images/source/reference.png'

  try {
    const sourceService = createService({
      stateFilePath: path.join(root, 'source-state.json'),
      directories: { workspace: sourceWorkspace, 'export-project': exportParent },
    })
    await sourceService.pickWorkspaceDirectory()
    await sourceService.writeWorkspaceAssetAtPath({
      relativePath,
      mimeType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]).buffer,
    })
    const sourceProject = createProject('shared-id', { relativePath, mimeType: 'image/png' })
    await sourceService.saveWorkspaceProject({ project: sourceProject, activeProjectId: sourceProject.id })
    const exported = await sourceService.exportProjectBundle({ project: sourceProject, suggestedName: 'shared-project' })

    const targetService = createService({
      stateFilePath: path.join(root, 'target-state.json'),
      directories: { workspace: targetWorkspace, 'import-project': exported.directoryPath },
    })
    await targetService.pickWorkspaceDirectory()

    const firstCandidate = await targetService.prepareProjectBundleImport()
    assert.equal(firstCandidate.hasIdConflict, false)
    const preserved = await targetService.commitProjectBundleImport({ candidateId: firstCandidate.candidateId, resolution: 'preserve' })
    assert.equal(preserved.project.id, 'shared-id')
    assert.equal((await targetService.listWorkspaceProjects()).projects.length, 1)

    const conflictCandidate = await targetService.prepareProjectBundleImport()
    assert.equal(conflictCandidate.hasIdConflict, true)
    await assert.rejects(
      targetService.commitProjectBundleImport({ candidateId: conflictCandidate.candidateId, resolution: 'preserve' }),
      /项目 ID 已存在/,
    )

    await targetService.writeWorkspaceAssetAtPath({
      relativePath,
      mimeType: 'image/png',
      bytes: new Uint8Array([9]).buffer,
    })
    const copied = await targetService.commitProjectBundleImport({ candidateId: conflictCandidate.candidateId, resolution: 'copy' })
    assert.notEqual(copied.project.id, 'shared-id')
    const copiedPath = copied.project.workingSnapshot.canvas.nodes[0].data.imageAsset.relativePath
    assert.match(copiedPath, new RegExp(`^images/imports/${copied.project.id}/`))
    assert.deepEqual([...new Uint8Array((await targetService.readWorkspaceAsset(relativePath)).bytes)], [9])
    assert.deepEqual([...new Uint8Array((await targetService.readWorkspaceAsset(copiedPath)).bytes)], [1, 2, 3])
    assert.equal((await targetService.listWorkspaceProjects()).projects.length, 2)

    const replacementProject = { ...sourceProject, name: 'Replacement project', updatedAt: 200 }
    await writeFile(
      path.join(exported.directoryPath, 'projects', 'shared-id.json'),
      JSON.stringify(replacementProject),
      'utf8',
    )
    await writeFile(path.join(exported.directoryPath, relativePath), new Uint8Array([4, 5]))
    const replacementCandidate = await targetService.prepareProjectBundleImport()
    const replaced = await targetService.commitProjectBundleImport({ candidateId: replacementCandidate.candidateId, resolution: 'replace' })
    assert.equal(replaced.project.id, 'shared-id')
    assert.equal((await targetService.loadWorkspaceProject('shared-id')).name, 'Replacement project')
    assert.deepEqual([...new Uint8Array((await targetService.readWorkspaceAsset(relativePath)).bytes)], [4, 5])
    assert.equal((await targetService.listWorkspaceProjects()).projects.length, 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('native workflow file round trip preserves the selected filename', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-canvas-native-workflow-'))
  const workflowFile = path.join(root, 'workflow.json')
  try {
    const service = createService({ stateFilePath: path.join(root, 'state.json'), directories: {}, workflowFile })
    const workflow = { type: 'ai-canvas-workflow', version: 1, meta: { name: 'workflow', exportedAt: 1 }, nodes: [], edges: [] }
    await service.exportWorkflowJson({ workflow, suggestedName: 'workflow.json' })
    assert.deepEqual(JSON.parse((await service.importWorkflowJson()).content), workflow)
    assert.equal((await service.importWorkflowJson()).fileName, 'workflow.json')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('native bundle validation rejects malformed data before replacing the workspace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-canvas-native-invalid-'))
  const workspace = path.join(root, 'workspace')
  const bundle = path.join(root, 'bundle')
  const stateFilePath = path.join(root, 'state.json')
  try {
    const service = createService({ stateFilePath, directories: { workspace, import: bundle } })
    await service.pickWorkspaceDirectory()
    await service.saveWorkspaceProject({ project: createProject('kept'), activeProjectId: 'kept' })
    await assert.rejects(service.importWorkspaceBundle(), /工作区目录包清单格式不正确/)
    assert.equal((await service.loadWorkspaceProject('kept')).id, 'kept')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
