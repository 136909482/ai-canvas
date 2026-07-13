import assert from 'node:assert/strict'
import { once } from 'node:events'
import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const packagedExecutable = process.env.AI_CANVAS_ELECTRON_EXECUTABLE
if (packagedExecutable) {
  try {
    await access(path.join(path.dirname(packagedExecutable), 'resources', 'app.asar'))
  } catch {
    throw new Error('AI_CANVAS_ELECTRON_EXECUTABLE 必须指向 win-unpacked 中的应用，不能指向 portable 启动器。')
  }
}
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'ai-canvas-electron-smoke-'))
const userDataPath = path.join(temporaryRoot, 'user-data')
const workspacePath = path.join(temporaryRoot, 'workspace')

const snapshot = {
  canvas: { nodes: [], edges: [] },
  taskQueue: { tasks: [] },
}
const project = {
  id: 'desktop-smoke-project',
  name: 'Desktop Smoke Project',
  savedSnapshot: snapshot,
  workingSnapshot: snapshot,
  createdAt: 1,
  updatedAt: 2,
  lastOpenedAt: 3,
}

let desktopApp
try {
  await mkdir(userDataPath, { recursive: true })
  await mkdir(workspacePath, { recursive: true })
  await writeFile(path.join(userDataPath, 'desktop-workspace.json'), JSON.stringify({ version: 1, workspacePath }), 'utf8')
  await writeFile(path.join(workspacePath, 'desktop-smoke-project.json'), JSON.stringify(project), 'utf8')
  await writeFile(path.join(workspacePath, 'ai-canvas-workspace.json'), JSON.stringify({
    activeProjectId: project.id,
    lastOpenedProjectId: project.id,
    projects: [{
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      lastOpenedAt: project.lastOpenedAt,
      fileName: 'desktop-smoke-project.json',
    }],
  }), 'utf8')

  desktopApp = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: [...(packagedExecutable ? [] : [root]), `--user-data-dir=${userDataPath}`],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
  })
  const page = await desktopApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  const result = await page.evaluate(async () => {
    const api = window.aiCanvasDesktop
    if (!api) throw new Error('Desktop preload API is missing')
    const status = await api.getWorkspaceStatus()
    const index = await api.listWorkspaceProjects()
    await api.writeWorkspaceAssetAtPath({
      relativePath: 'images/ipc-smoke.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([4, 5, 6]).buffer,
    })
    const asset = await api.readWorkspaceAsset('images/ipc-smoke.png')
    return {
      runtime: api.runtime,
      status,
      projectIds: index?.projects.map((item) => item.id),
      assetBytes: Array.from(new Uint8Array(asset.bytes)),
    }
  })

  assert.equal(result.runtime, 'electron')
  assert.equal(result.status.directoryPath, workspacePath)
  assert.deepEqual(result.projectIds, [project.id])
  assert.deepEqual(result.assetBytes, [4, 5, 6])
  console.log('Electron desktop workspace IPC smoke passed')

  const desktopProcess = desktopApp.process()
  await desktopApp.evaluate(({ app }) => {
    setTimeout(() => app.exit(0), 0)
  })
  await once(desktopProcess, 'exit')
  desktopApp = undefined
} finally {
  await desktopApp?.close()
  await rm(temporaryRoot, { recursive: true, force: true })
}
