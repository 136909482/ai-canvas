import assert from 'node:assert/strict'
import { once } from 'node:events'
import { access, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const outputDirectory = path.join(root, 'output', 'playwright')
const packagedExecutable = process.env.AI_CANVAS_ELECTRON_EXECUTABLE
if (packagedExecutable) {
  await access(path.join(path.dirname(packagedExecutable), 'resources', 'app.asar')).catch(() => {
    throw new Error('AI_CANVAS_ELECTRON_EXECUTABLE 必须指向 win-unpacked 中的应用。')
  })
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'ai-canvas-electron-ui-'))
const userDataPath = path.join(temporaryRoot, 'user-data')
const workspacePath = path.join(temporaryRoot, 'workspace')
const exportParentPath = path.join(temporaryRoot, 'exports')
const projectExportParentPath = path.join(temporaryRoot, 'project-exports')
const assetRelativePath = 'images/originals/p0-source.png'
const assetBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZC1sAAAAASUVORK5CYII=', 'base64')

function createSnapshot(imageAsset = null) {
  return {
    schemaVersion: 1,
    canvas: {
      nodes: imageAsset ? [{
        id: 'p0-image-node',
        type: 'imageNode',
        position: { x: 80, y: 80 },
        width: 240,
        height: 240,
        data: {
          name: 'P0 source asset',
          imageUrl: null,
          imageAsset,
          imageNaturalWidth: 1,
          imageNaturalHeight: 1,
        },
      }] : [],
      edges: [],
    },
    taskQueue: { tasks: [] },
  }
}

function createProject(id, name, imageAsset = null) {
  const snapshot = createSnapshot(imageAsset)
  return {
    id,
    name,
    savedSnapshot: snapshot,
    workingSnapshot: snapshot,
    createdAt: 10,
    updatedAt: 20,
    lastOpenedAt: 30,
  }
}

function createConfig(apiKey) {
  return {
    version: 1,
    model: 'p0-image-model',
    customModels: [{ id: 'p0-model', name: 'P0 Model', modelId: 'p0-image-model', kind: 'image', enabled: true }],
    providerProfiles: [{
      id: 'p0-provider',
      name: 'P0 Provider',
      kind: 'image',
      apiKey,
      apiUrl: 'https://example.com/v1',
      provider: 'openai',
      requestMode: 'sync',
      enabled: true,
    }],
    activeProviderProfileIds: { image: 'p0-provider' },
    modelProviderProfileIds: { 'p0-image-model': 'p0-provider' },
    storage: {
      autosaveIntervalMs: 60000,
      canvasTopBarCollapsed: false,
      alignmentGuidesEnabled: true,
      themeMode: 'dark',
      canvasPerformanceMode: 'quality',
      canvasGridEnabled: true,
      lowQualityPreviewEnabled: true,
      edgeStyle: 'animated',
    },
  }
}

async function writeWorkspaceFixture(project, config) {
  await mkdir(path.join(workspacePath, 'images', 'originals'), { recursive: true })
  await mkdir(path.join(workspacePath, '.config'), { recursive: true })
  await writeFile(path.join(workspacePath, assetRelativePath), assetBytes)
  await writeFile(path.join(workspacePath, `${project.id}.json`), JSON.stringify(project, null, 2), 'utf8')
  await writeFile(path.join(workspacePath, 'ai-canvas-workspace.json'), JSON.stringify({
    activeProjectId: project.id,
    lastOpenedProjectId: project.id,
    projects: [{
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      lastOpenedAt: project.lastOpenedAt,
      fileName: `${project.id}.json`,
    }],
  }, null, 2), 'utf8')
  await writeFile(path.join(workspacePath, '.config', 'config.json'), JSON.stringify(config, null, 2), 'utf8')
}

async function launchDesktop() {
  return electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: [...(packagedExecutable ? [] : [root]), `--user-data-dir=${userDataPath}`],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
  })
}

async function closeDesktop(desktopApp) {
  const desktopProcess = desktopApp.process()
  await desktopApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  await Promise.race([
    once(desktopProcess, 'exit'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Electron window did not close cleanly')), 10_000)),
  ])
}

async function captureScreenshot(page, fileName) {
  const screenshotPath = path.join(outputDirectory, fileName)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.screenshot({ path: screenshotPath, animations: 'disabled', timeout: 60_000 })
      return
    } catch (error) {
      if (attempt === 1) throw error
      await page.waitForTimeout(250)
    }
  }
}

async function clickProjectAction(page, projectId, actionTestId) {
  const clicked = await page.evaluate(async ({ id, targetTestId }) => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const existingTarget = document.querySelector(`[data-testid="${targetTestId}"]`)
      if (existingTarget instanceof HTMLElement) {
        existingTarget.click()
        return true
      }
      document.querySelector(`[data-testid="project-more-${id}"]`)?.click()
      await new Promise((resolveWait) => window.setTimeout(resolveWait, 25))
      const target = document.querySelector(`[data-testid="${targetTestId}"]`)
      if (target instanceof HTMLElement) {
        target.click()
        return true
      }
    }
    return false
  }, { id: projectId, targetTestId: actionTestId })
  assert.equal(clicked, true, `Project menu action should be available: ${actionTestId}`)
}

async function findExportedBundle() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const entries = await readdir(exportParentPath, { withFileTypes: true })
    const directory = entries.find((entry) => entry.isDirectory())
    if (directory) return path.join(exportParentPath, directory.name)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('未找到导出的工作区目录包')
}

async function findExportedProjectBundle() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const entries = await readdir(projectExportParentPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const directoryPath = path.join(projectExportParentPath, entry.name)
      const hasManifest = await access(path.join(directoryPath, 'project.json')).then(() => true).catch(() => false)
      if (hasManifest) return directoryPath
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('未找到导出的项目目录包')
}

const sourceAsset = {
  relativePath: assetRelativePath,
  fileName: 'p0-source.png',
  mimeType: 'image/png',
  originalWidth: 1,
  originalHeight: 1,
}
const sourceProject = createProject('p0-source-project', 'P0 Source Project', sourceAsset)
const replacementProject = createProject('p0-replacement-project', 'P0 Replacement Project')
let desktopApp

try {
  await mkdir(userDataPath, { recursive: true })
  await mkdir(exportParentPath, { recursive: true })
  await mkdir(projectExportParentPath, { recursive: true })
  await writeWorkspaceFixture(sourceProject, createConfig('sk-p0-secret'))
  await mkdir(outputDirectory, { recursive: true })

  desktopApp = await launchDesktop()
  let page = await desktopApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await desktopApp.evaluate(({ dialog }, input) => {
    globalThis.__aiCanvasUiSmoke = {
      workspacePath: input.workspacePath,
      exportPath: input.exportPath,
      importPath: null,
      projectExportPath: input.projectExportPath,
      projectImportPath: null,
      workspaceSelections: 0,
      exportSelections: 0,
      importSelections: 0,
    }
    dialog.showOpenDialog = async (options) => {
      const state = globalThis.__aiCanvasUiSmoke
      if (options.title?.includes('选择 AI Canvas 工作区')) {
        state.workspaceSelections += 1
        return { canceled: false, filePaths: [state.workspacePath] }
      }
      if (options.title?.includes('项目目录包导出')) {
        return { canceled: false, filePaths: [state.projectExportPath] }
      }
      if (options.title?.includes('项目目录包')) {
        return { canceled: false, filePaths: [state.projectImportPath] }
      }
      if (options.title?.includes('导出')) {
        state.exportSelections += 1
        return { canceled: false, filePaths: [state.exportPath] }
      }
      if (options.title?.includes('导入')) {
        state.importSelections += 1
        return { canceled: false, filePaths: [state.importPath] }
      }
      return { canceled: true, filePaths: [] }
    }
  }, { workspacePath, exportPath: exportParentPath, projectExportPath: projectExportParentPath })

  await page.getByText('先选择项目保存位置', { exact: true }).waitFor()
  await page.getByTestId('workspace-setup-picker').click()
  await page.getByText('P0 Source Project', { exact: true }).first().waitFor({ timeout: 15_000 })
  assert.equal(await desktopApp.evaluate(() => globalThis.__aiCanvasUiSmoke.workspaceSelections), 1)

  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByTestId('settings-category-tools').click()
  await page.getByTestId('open-workspace-search').click()
  await page.getByLabel('搜索工作区').fill('P0 source asset')
  const sourceAssetSearchResult = page.getByRole('option', { name: /P0 source asset/ }).first()
  await sourceAssetSearchResult.waitFor()
  await captureScreenshot(page, 'p3-workspace-search.png')
  await sourceAssetSearchResult.click()
  await page.locator('.react-flow__node[data-id="p0-image-node"]').waitFor()
  await page.waitForFunction(() => document.querySelector('.react-flow__node[data-id="p0-image-node"]')?.classList.contains('selected'))
  await page.getByRole('button', { name: '文本组件' }).click()
  await page.locator('.react-flow__node[data-id="p0-image-node"]').click()
  await page.locator('.react-flow__node-textNode').last().click({ modifiers: ['Control'] })
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node.selected').length >= 2)
  await page.getByTestId('save-selection-as-template').click()
  await page.getByLabel('输入模板名称').fill('P3 Prompt Starter')
  await page.getByRole('button', { name: '保存当前选区', exact: true }).click()
  await page.locator('#workflow-template-panel').getByText('P3 Prompt Starter', { exact: true }).waitFor()
  assert.equal((await page.evaluate(() => window.aiCanvasDesktop.loadWorkflowTemplates())).templates.length, 1)
  await page.getByRole('button', { name: '插入', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node-textNode').length === 2)
  await page.getByRole('button', { name: '工作流模板', exact: true }).click()
  await page.getByRole('button', { name: '重命名模板 P3 Prompt Starter' }).click()
  await page.getByLabel('模板名称', { exact: true }).fill('P3 Prompt Starter Renamed')
  await page.getByRole('button', { name: '确认重命名' }).click()
  await page.locator('#workflow-template-panel').getByText('P3 Prompt Starter Renamed', { exact: true }).waitFor()
  await captureScreenshot(page, 'p3-workflow-template-library.png')
  await page.getByRole('button', { name: '删除模板 P3 Prompt Starter Renamed' }).click()
  await page.getByTestId('feedback-confirm-submit').click()
  await page.waitForFunction(async () => (await window.aiCanvasDesktop.loadWorkflowTemplates()).templates.length === 0)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByTestId('settings-category-tools').click()
  await page.getByTestId('open-diagnostics-button').click()
  await page.getByRole('tab', { name: '本地审计' }).click()
  await page.getByLabel('审计操作分类').selectOption('template')
  await page.getByText('保存模板库', { exact: true }).first().waitFor()
  await page.getByText('templates.save', { exact: true }).first().waitFor()
  await captureScreenshot(page, 'p3-local-audit-query.png')
  await page.getByRole('button', { name: '关闭诊断' }).click()
  await page.getByRole('button', { name: '保存项目' }).click()
  await page.waitForFunction(async (projectId) => {
    const project = await window.aiCanvasDesktop.loadWorkspaceProject(projectId)
    return project?.savedSnapshot.canvas.nodes.some((node) => node.type === 'textNode')
  }, sourceProject.id)

  await page.getByTestId('project-manager-button').click()
  await page.getByTestId('create-project-button').click()
  await page.getByTestId('project-name-input').fill('P1 Archive Fallback')
  await page.getByTestId('project-name-submit').click()
  const fallbackProjectId = await page.evaluate(async () => {
    const index = await window.aiCanvasDesktop.listWorkspaceProjects()
    return index.projects.find((project) => project.name === 'P1 Archive Fallback')?.id ?? null
  })
  assert(fallbackProjectId)

  await page.getByTestId('project-manager-button').click()
  await page.getByTestId(`project-open-${sourceProject.id}`).click()
  await page.getByText('P0 Source Project', { exact: true }).first().waitFor()
  await page.getByTestId('project-manager-button').click()
  await clickProjectAction(page, sourceProject.id, `project-archive-${sourceProject.id}`)
  await page.getByTestId('feedback-confirm-submit').click()
  await page.getByText('P1 Archive Fallback', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '已归档', exact: true }).first().click()
  await page.getByTestId(`project-open-${sourceProject.id}`).waitFor()
  await captureScreenshot(page, 'p1-desktop-project-archived.png')
  await clickProjectAction(page, sourceProject.id, `project-restore-${sourceProject.id}`)
  await page.getByRole('button', { name: '全部', exact: true }).first().click()
  await page.getByTestId(`project-open-${sourceProject.id}`).click()

  await page.getByTestId('project-manager-button').click()
  await clickProjectAction(page, fallbackProjectId, `project-delete-${fallbackProjectId}`)
  await page.getByTestId('feedback-confirm-submit').click()
  await page.waitForFunction(async () => (await window.aiCanvasDesktop.listWorkspaceProjects()).projects.length === 1)
  await page.waitForTimeout(750)

  await clickProjectAction(page, sourceProject.id, `project-export-${sourceProject.id}`)
  const projectBundlePath = await findExportedProjectBundle()
  const projectManifest = JSON.parse(await readFile(path.join(projectBundlePath, 'project.json'), 'utf8'))
  assert.equal(projectManifest.project.id, sourceProject.id)
  assert.deepEqual(await readFile(path.join(projectBundlePath, assetRelativePath)), assetBytes)
  await desktopApp.evaluate((_electron, importPath) => {
    globalThis.__aiCanvasUiSmoke.projectImportPath = importPath
  }, projectBundlePath)

  await page.getByTestId('import-project-button').click()
  await page.getByTestId('project-import-conflict-dialog').waitFor()
  await captureScreenshot(page, 'p1-desktop-project-import-conflict.png')
  await page.getByTestId('project-import-copy').click()
  await page.getByText('项目已导入', { exact: true }).waitFor({ timeout: 15_000 })
  const copiedProjects = await page.evaluate(async () => {
    const index = await window.aiCanvasDesktop.listWorkspaceProjects()
    return index.projects
  })
  const copiedProjectId = copiedProjects.find((project) => project.id !== sourceProject.id)?.id ?? null
  assert(copiedProjectId, `导入副本未生成新 ID：${JSON.stringify(copiedProjects)}`)

  await page.getByTestId('import-project-button').click()
  await page.getByTestId('project-import-conflict-dialog').waitFor()
  await page.getByTestId('project-import-replace').click()
  await page.getByTestId('project-import-conflict-dialog').waitFor({ state: 'hidden' })
  assert.equal((await page.evaluate(async (id) => (await window.aiCanvasDesktop.loadWorkspaceProject(id)).id, sourceProject.id)), sourceProject.id)

  await clickProjectAction(page, copiedProjectId, `project-delete-${copiedProjectId}`)
  await page.getByTestId('feedback-confirm-submit').click()
  await page.waitForFunction(async () => (await window.aiCanvasDesktop.listWorkspaceProjects()).projects.length === 1)
  await page.getByRole('button', { name: '关闭项目管理' }).click()

  await page.getByRole('button', { name: '设置' }).click()
  await page.getByText('存储管理', { exact: true }).click()
  await page.getByTestId('workspace-bundle-export').waitFor()
  await captureScreenshot(page, 'p0-desktop-storage.png')

  await page.getByTestId('workspace-bundle-export').click()
  await page.getByText('工作区导出完成', { exact: true }).waitFor({ timeout: 15_000 })
  const bundlePath = await findExportedBundle()
  const manifest = JSON.parse(await readFile(path.join(bundlePath, 'workspace.json'), 'utf8'))
  const exportedConfig = JSON.parse(await readFile(path.join(bundlePath, '.config', 'config.json'), 'utf8'))
  assert.equal(manifest.projects[0].id, sourceProject.id)
  assert.equal(exportedConfig.providerProfiles[0].apiKey, '')
  assert.deepEqual(await readFile(path.join(bundlePath, assetRelativePath)), assetBytes)

  await page.getByTestId('workspace-bundle-import').click()
  const confirmDialog = page.getByTestId('feedback-confirm-dialog')
  await confirmDialog.waitFor()
  await captureScreenshot(page, 'p0-desktop-danger-confirm.png')
  assert.match(await confirmDialog.innerText(), /替换当前工作区目录中的项目、设置和图片资产/)
  await page.getByTestId('feedback-confirm-cancel').click()
  assert.equal(await desktopApp.evaluate(() => globalThis.__aiCanvasUiSmoke.importSelections), 0)

  await page.evaluate(async ({ replacementProject: project, replacementConfig }) => {
    const api = window.aiCanvasDesktop
    await api.saveWorkspaceData({ projects: [project], activeProjectId: project.id, lastOpenedProjectId: project.id })
    await api.saveWorkspaceConfig(replacementConfig)
    await api.writeWorkspaceAssetAtPath({
      relativePath: 'images/orphan.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([9, 9, 9]).buffer,
    })
  }, { replacementProject, replacementConfig: createConfig('sk-replacement-secret') })
  await desktopApp.evaluate((_electron, importPath) => {
    globalThis.__aiCanvasUiSmoke.importPath = importPath
  }, bundlePath)

  await page.getByTestId('workspace-bundle-import').click()
  await page.getByTestId('feedback-confirm-submit').click()
  await page.getByText('工作区导入完成', { exact: true }).waitFor({ timeout: 15_000 })
  assert.equal(await desktopApp.evaluate(() => globalThis.__aiCanvasUiSmoke.importSelections), 1)

  const restored = await page.evaluate(async ({ sourceProjectId, sourceAssetPath }) => {
    const api = window.aiCanvasDesktop
    const data = await api.loadWorkspaceData()
    const config = await api.loadWorkspaceConfig()
    const asset = await api.readWorkspaceAsset(sourceAssetPath)
    let orphanMissing = false
    try {
      await api.readWorkspaceAsset('images/orphan.png')
    } catch {
      orphanMissing = true
    }
    return {
      projectIds: data.projects.map((project) => project.id),
      activeProjectId: data.activeProjectId,
      apiKey: config.providerProfiles[0].apiKey,
      assetBytes: Array.from(new Uint8Array(asset.bytes)),
      orphanMissing,
      sourceProjectId,
    }
  }, { sourceProjectId: sourceProject.id, sourceAssetPath: assetRelativePath })
  assert.deepEqual(restored.projectIds, [sourceProject.id])
  assert.equal(restored.activeProjectId, sourceProject.id)
  assert.equal(restored.apiKey, '')
  assert.deepEqual(restored.assetBytes, [...assetBytes])
  assert.equal(restored.orphanMissing, true)
  await page.getByText('P0 Source Project', { exact: true }).first().waitFor()
  await captureScreenshot(page, 'p0-desktop-import-restored.png')

  await page.evaluate(async () => {
    await window.aiCanvasDesktop.writeWorkspaceAssetAtPath({
      relativePath: 'images/p1-orphan-preview.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([7, 8, 9]).buffer,
    })
  })
  const directInspection = await page.evaluate(async () => {
    const data = await window.aiCanvasDesktop.loadWorkspaceData()
    return window.aiCanvasDesktop.inspectWorkspaceAssets(data)
  })
  assert.equal(directInspection.orphanedFileCount, 1)
  assert.equal(directInspection.orphanedByteSize, 3)
  await page.getByTestId('workspace-asset-scan').click()
  const diskInspection = page.getByTestId('workspace-disk-inspection-result')
  try {
    await diskInspection.getByText('1 个可清理', { exact: true }).waitFor({ timeout: 15_000 })
  } catch (error) {
    const panelText = await page.getByTestId('workspace-disk-inspection').innerText()
    const bodyText = await page.locator('body').innerText()
    throw new Error(`磁盘扫描结果未进入 UI：${panelText}\n${bodyText}`, { cause: error })
  }
  await diskInspection.getByText('images/p1-orphan-preview.png', { exact: true }).waitFor()
  await captureScreenshot(page, 'p1-desktop-orphan-preview.png')

  await page.getByRole('button', { name: '清理未引用文件' }).click()
  const cleanupDialog = page.getByTestId('feedback-confirm-dialog')
  await cleanupDialog.waitFor()
  assert.match(await cleanupDialog.innerText(), /删除 1 个未引用文件，释放 3 B/)
  assert.match(await cleanupDialog.innerText(), /images\/p1-orphan-preview\.png/)
  await captureScreenshot(page, 'p1-desktop-cleanup-impact.png')
  await page.getByTestId('feedback-confirm-submit').click()
  await page.getByText('资产清理完成', { exact: true }).waitFor()
  await diskInspection.getByText('0 个可清理', { exact: true }).waitFor()
  const p1OrphanRemoved = await page.evaluate(async () => {
    try {
      await window.aiCanvasDesktop.readWorkspaceAsset('images/p1-orphan-preview.png')
      return false
    } catch {
      return true
    }
  })
  assert.equal(p1OrphanRemoved, true)

  await closeDesktop(desktopApp)
  desktopApp = undefined

  desktopApp = await launchDesktop()
  page = await desktopApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByText('P0 Source Project', { exact: true }).first().waitFor({ timeout: 15_000 })
  const image = page.getByRole('img', { name: 'P0 source asset' }).first()
  await image.waitFor({ timeout: 15_000 })
  await page.waitForFunction(() => {
    const candidate = document.querySelector('img[alt="P0 source asset"]')
    return candidate instanceof HTMLImageElement && candidate.complete && candidate.naturalWidth === 1
  })
  const restartState = await page.evaluate(async () => {
    const api = window.aiCanvasDesktop
    const status = await api.getWorkspaceStatus()
    const data = await api.loadWorkspaceData()
    return { directoryPath: status.directoryPath, activeProjectId: data.activeProjectId }
  })
  assert.equal(restartState.directoryPath, workspacePath)
  assert.equal(restartState.activeProjectId, sourceProject.id)
  await captureScreenshot(page, 'p0-desktop-restart-restored.png')
  assert.equal((await stat(path.join(workspacePath, assetRelativePath))).isFile(), true)

  console.log('Electron workspace UI round trip passed')
} finally {
  if (desktopApp) {
    await desktopApp.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await desktopApp.close().catch(() => undefined)
  }
  await rm(temporaryRoot, { recursive: true, force: true })
}
