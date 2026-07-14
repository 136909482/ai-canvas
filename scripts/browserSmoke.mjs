import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const REPORT_DIR = resolve(process.cwd(), 'output/performance')
const SERVER_READY_TIMEOUT_MS = 30_000

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch (error) {
    throw new Error([
      'Playwright is required for browser smoke tests.',
      'Run: npm install',
      error instanceof Error ? `Original error: ${error.message}` : '',
    ].filter(Boolean).join('\n'))
  }
}

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close(() => {
        if (!port) {
          reject(new Error('Failed to allocate a local port'))
          return
        }
        resolvePort(port)
      })
    })
    server.on('error', reject)
  })
}

function startDevServer(port) {
  const serverCommand = process.platform === 'win32'
    ? process.env.ComSpec || 'cmd.exe'
    : 'npm'
  const serverArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm run dev -- --host 127.0.0.1 --port ${port}`]
    : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)]
  const server = spawn(serverCommand, serverArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BROWSER: 'none',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''

  server.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  server.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })

  return {
    getOutput: () => output,
    stop: () => {
      if (server.killed) {
        return
      }

      if (process.platform === 'win32' && server.pid) {
        spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], {
          stdio: 'ignore',
          windowsHide: true,
        })
        return
      }

      server.kill()
    },
  }
}

async function waitForServer(url, getServerOutput) {
  const startedAt = Date.now()
  let lastError = null

  while (Date.now() - startedAt < SERVER_READY_TIMEOUT_MS) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch (error) {
      lastError = error
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }

  throw new Error([
    `Timed out waiting for Vite at ${url}`,
    lastError instanceof Error ? `Last error: ${lastError.message}` : '',
    getServerOutput(),
  ].filter(Boolean).join('\n'))
}

function writeReport(report) {
  mkdirSync(REPORT_DIR, { recursive: true })
  const fileName = `browser-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const filePath = resolve(REPORT_DIR, fileName)
  writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return filePath
}

async function installFakeWorkspace(context) {
  await context.addInitScript(() => {
    const FS_STORAGE_KEY = '__ai_canvas_browser_smoke_fs__'
    const WORKSPACE_DIRECTORY_KEY = 'workspace-directory'
    const DB_NAME = 'ai-canvas-platform'
    const STORE_NAME = 'handles'

    const loadTree = () => {
      try {
        return JSON.parse(window.localStorage.getItem(FS_STORAGE_KEY) || '{"files":{},"directories":{}}')
      } catch {
        return { files: {}, directories: {} }
      }
    }

    const saveTree = (tree) => {
      window.localStorage.setItem(FS_STORAGE_KEY, JSON.stringify(tree))
    }

    const initialTree = loadTree()
    initialTree.directories['.config'] = true
    initialTree.files['.config/config.json'] = JSON.stringify({
      version: 1,
      model: 'browser-smoke-image-model',
      customModels: [{
        id: 'browser-smoke-image-model-entry',
        name: 'Browser Smoke Image Model',
        modelId: 'browser-smoke-image-model',
        kind: 'image',
        enabled: true,
      }],
      providerProfiles: [{
        id: 'browser-smoke-provider',
        name: 'Browser Smoke Provider',
        kind: 'image',
        apiKey: 'browser-smoke-key',
        apiUrl: 'https://example.invalid/v1',
        provider: 'openai',
        requestMode: 'sync',
        asyncConfig: null,
        enabled: true,
      }],
      activeProviderProfileIds: { image: 'browser-smoke-provider' },
      modelProviderProfileIds: { 'browser-smoke-image-model': 'browser-smoke-provider' },
      storage: {
        autosaveIntervalMs: 60_000,
        canvasTopBarCollapsed: false,
        alignmentGuidesEnabled: true,
        themeMode: 'dark',
        canvasPerformanceMode: 'quality',
        canvasGridEnabled: true,
        edgeStyle: 'animated',
        lowQualityPreviewEnabled: true,
      },
    })
    saveTree(initialTree)

    const createNotFoundError = () => new DOMException('Entry not found', 'NotFoundError')
    const normalizeSegment = (segment) => String(segment || '').replace(/[\\/]+/g, '-')

    function createFileHandle(root, path, name) {
      return {
        kind: 'file',
        name,
        async getFile() {
          const tree = loadTree()
          const value = tree.files[path]
          if (value === undefined) {
            throw createNotFoundError()
          }
          return new File([value], name, { type: 'application/json' })
        },
        async createWritable() {
          let nextContent = ''
          return {
            async write(value) {
              if (value instanceof Blob) {
                nextContent = await value.text()
                return
              }
              nextContent = String(value ?? '')
            },
            async close() {
              const tree = loadTree()
              tree.files[path] = nextContent
              saveTree(tree)
            },
          }
        },
      }
    }

    function createDirectoryHandle(path = '', name = 'AI Canvas Smoke Workspace') {
      const directoryPath = path
      const prefix = directoryPath ? `${directoryPath}/` : ''

      return {
        kind: 'directory',
        name,
        __path: directoryPath,
        async isSameEntry(other) {
          return other?.kind === 'directory' && other.__path === directoryPath
        },
        async queryPermission() {
          return 'granted'
        },
        async requestPermission() {
          return 'granted'
        },
        async getFileHandle(fileName, options = {}) {
          const normalizedName = normalizeSegment(fileName)
          const filePath = `${prefix}${normalizedName}`
          const tree = loadTree()
          if (!options.create && tree.files[filePath] === undefined) {
            throw createNotFoundError()
          }
          if (options.create && tree.files[filePath] === undefined) {
            tree.files[filePath] = ''
            saveTree(tree)
          }
          return createFileHandle(directoryPath, filePath, normalizedName)
        },
        async getDirectoryHandle(directoryName, options = {}) {
          const normalizedName = normalizeSegment(directoryName)
          const childPath = `${prefix}${normalizedName}`
          const tree = loadTree()
          if (!options.create && !tree.directories[childPath]) {
            throw createNotFoundError()
          }
          if (options.create && !tree.directories[childPath]) {
            tree.directories[childPath] = true
            saveTree(tree)
          }
          return createDirectoryHandle(childPath, normalizedName)
        },
        async removeEntry(entryName) {
          const normalizedName = normalizeSegment(entryName)
          const entryPath = `${prefix}${normalizedName}`
          const tree = loadTree()
          delete tree.files[entryPath]
          delete tree.directories[entryPath]
          saveTree(tree)
        },
        async *values() {
          const tree = loadTree()
          const childDirectoryNames = new Set()
          for (const directory of Object.keys(tree.directories)) {
            if (!directory.startsWith(prefix) || directory === directoryPath) {
              continue
            }
            const rest = directory.slice(prefix.length)
            const [first] = rest.split('/')
            if (first) {
              childDirectoryNames.add(first)
            }
          }
          for (const childName of childDirectoryNames) {
            yield createDirectoryHandle(`${prefix}${childName}`, childName)
          }
          for (const filePath of Object.keys(tree.files)) {
            if (!filePath.startsWith(prefix)) {
              continue
            }
            const rest = filePath.slice(prefix.length)
            if (!rest || rest.includes('/')) {
              continue
            }
            yield createFileHandle(directoryPath, filePath, rest)
          }
        },
      }
    }

    const workspaceHandle = createDirectoryHandle()
    const bundleParentHandle = createDirectoryHandle('bundle-parent', 'AI Canvas Smoke Exports')
    const directoryPickerQueue = []
    const handleStore = new Map([[WORKSPACE_DIRECTORY_KEY, workspaceHandle]])

    window.__queueSmokeDirectoryPicker = (handleName) => {
      directoryPickerQueue.push(handleName)
    }

    const createRequest = (executor) => {
      const request = { result: undefined, error: null, onsuccess: null, onerror: null }
      window.setTimeout(() => {
        try {
          request.result = executor()
          request.onsuccess?.({ target: request })
        } catch (error) {
          request.error = error
          request.onerror?.({ target: request })
        }
      }, 0)
      return request
    }

    const database = {
      objectStoreNames: {
        contains: (storeName) => storeName === STORE_NAME,
      },
      createObjectStore: () => undefined,
      transaction: () => {
        const transaction = {
          oncomplete: null,
          onerror: null,
          error: null,
          objectStore: () => ({
            get: (key) => createRequest(() => handleStore.get(key)),
            put: (value, key) => createRequest(() => {
              handleStore.set(key, value)
              return key
            }),
            delete: (key) => createRequest(() => {
              handleStore.delete(key)
              return undefined
            }),
          }),
        }
        window.setTimeout(() => transaction.oncomplete?.(), 0)
        return transaction
      },
      close: () => undefined,
    }

    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: {
        open: (name) => {
          const request = { result: database, error: null, onsuccess: null, onerror: null, onupgradeneeded: null }
          window.setTimeout(() => {
            if (name === DB_NAME) {
              request.onupgradeneeded?.({ target: request })
            }
            request.onsuccess?.({ target: request })
          }, 0)
          return request
        },
      },
    })

    window.showDirectoryPicker = async () => {
      const next = directoryPickerQueue.shift() ?? 'workspace'
      if (next === 'bundle-parent') {
        return bundleParentHandle
      }
      if (next === 'bundle-source') {
        const tree = loadTree()
        const bundlePath = Object.keys(tree.directories)
          .filter((path) => path.startsWith('bundle-parent/') && !path.slice('bundle-parent/'.length).includes('/'))
          .sort()
          .at(-1)
        if (!bundlePath) {
          throw createNotFoundError()
        }
        return createDirectoryHandle(bundlePath, bundlePath.split('/').at(-1))
      }
      if (next === 'project-source') {
        const tree = loadTree()
        const bundlePath = Object.keys(tree.directories)
          .filter((path) => path.startsWith('bundle-parent/') && tree.files[`${path}/project.json`])
          .sort()
          .at(-1)
        if (!bundlePath) {
          throw createNotFoundError()
        }
        return createDirectoryHandle(bundlePath, bundlePath.split('/').at(-1))
      }
      return workspaceHandle
    }
  })
}

async function getCanvasState(page) {
  const workspaceState = await getWorkspaceState(page)
  return {
    manifest: workspaceState.manifest,
    projectFileName: workspaceState.activeProjectFileName,
    project: workspaceState.activeProject,
    nodes: workspaceState.activeProject?.workingSnapshot?.canvas?.nodes ?? [],
    edges: workspaceState.activeProject?.workingSnapshot?.canvas?.edges ?? [],
    tasks: workspaceState.activeProject?.workingSnapshot?.taskQueue?.tasks ?? [],
  }
}

async function getWorkspaceState(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('__ai_canvas_browser_smoke_fs__')
    const tree = raw ? JSON.parse(raw) : { files: {} }
    const manifest = JSON.parse(tree.files['ai-canvas-workspace.json'] || 'null')
    const projects = (manifest?.projects ?? []).map((summary) => {
      const project = summary.fileName ? JSON.parse(tree.files[summary.fileName] || 'null') : null
      return {
        ...summary,
        project,
        nodes: project?.workingSnapshot?.canvas?.nodes ?? [],
        edges: project?.workingSnapshot?.canvas?.edges ?? [],
        tasks: project?.workingSnapshot?.taskQueue?.tasks ?? [],
      }
    })
    const activeProjectEntry = projects.find((project) => project.id === manifest?.activeProjectId)
      ?? projects.find((project) => project.id === manifest?.lastOpenedProjectId)
      ?? projects[0]
      ?? null

    return {
      files: tree.files,
      manifest,
      projects,
      activeProjectFileName: activeProjectEntry?.fileName ?? null,
      activeProject: activeProjectEntry?.project ?? null,
    }
  })
}

async function seedWorkspaceBundleFixture(page, projectId) {
  await page.evaluate((targetProjectId) => {
    const storageKey = '__ai_canvas_browser_smoke_fs__'
    const tree = JSON.parse(window.localStorage.getItem(storageKey) || '{"files":{},"directories":{}}')
    const manifest = JSON.parse(tree.files['ai-canvas-workspace.json'] || 'null')
    const summary = manifest?.projects?.find((project) => project.id === targetProjectId)
    if (!summary?.fileName) {
      throw new Error('Missing project fixture for bundle smoke test')
    }

    const project = JSON.parse(tree.files[summary.fileName] || 'null')
    const node = project?.workingSnapshot?.canvas?.nodes?.[0]
    if (!node) {
      throw new Error('Missing project node for bundle asset fixture')
    }

    node.data = {
      ...node.data,
      imageAsset: {
        relativePath: 'images/originals/bundle-smoke.png',
        fileName: 'bundle-smoke.png',
        mimeType: 'image/png',
      },
    }
    tree.files[summary.fileName] = JSON.stringify(project, null, 2)
    tree.directories.images = true
    tree.directories['images/originals'] = true
    tree.files['images/originals/bundle-smoke.png'] = 'bundle-smoke-asset'
    tree.directories['.config'] = true
    tree.files['.config/config.json'] = JSON.stringify({
      version: 1,
      model: 'gpt-image-1',
      customModels: [],
      providerProfiles: [{
        id: 'bundle-provider',
        name: 'Bundle Provider',
        kind: 'image',
        apiKey: 'sk-browser-smoke-secret',
        apiUrl: 'https://api.openai.com/v1',
        provider: 'openai',
        requestMode: 'sync',
        enabled: true,
      }],
      storage: {
        autosaveIntervalMs: 30000,
        canvasTopBarCollapsed: false,
        alignmentGuidesEnabled: true,
        themeMode: 'dark',
        canvasPerformanceMode: 'quality',
        canvasGridEnabled: true,
        lowQualityPreviewEnabled: true,
        edgeStyle: 'animated',
      },
    }, null, 2)
    window.localStorage.setItem(storageKey, JSON.stringify(tree))
  }, projectId)
}

async function getBundleState(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('__ai_canvas_browser_smoke_fs__')
    const tree = raw ? JSON.parse(raw) : { files: {}, directories: {} }
    const manifestPath = Object.keys(tree.files)
      .filter((path) => path.startsWith('bundle-parent/') && path.endsWith('/workspace.json'))
      .sort()
      .at(-1)
    const root = manifestPath?.slice(0, -'/workspace.json'.length) ?? null
    const manifest = manifestPath ? JSON.parse(tree.files[manifestPath]) : null
    const configPath = root ? `${root}/.config/config.json` : null

    return {
      root,
      manifest,
      config: configPath && tree.files[configPath] ? JSON.parse(tree.files[configPath]) : null,
      projectFiles: manifest?.projects?.map((project) => `${root}/projects/${project.fileName}`) ?? [],
      assetContent: root ? tree.files[`${root}/images/originals/bundle-smoke.png`] : undefined,
    }
  })
}

async function clearActiveWorkspaceFixture(page) {
  await page.evaluate(() => {
    const storageKey = '__ai_canvas_browser_smoke_fs__'
    const tree = JSON.parse(window.localStorage.getItem(storageKey) || '{"files":{},"directories":{}}')
    tree.files = Object.fromEntries(
      Object.entries(tree.files).filter(([path]) => path.startsWith('bundle-parent/')),
    )
    tree.directories = Object.fromEntries(
      Object.entries(tree.directories).filter(([path]) => path.startsWith('bundle-parent/')),
    )
    window.localStorage.setItem(storageKey, JSON.stringify(tree))
  })
}

async function getNodeIds(page) {
  return page.evaluate(() => (
    Array.from(document.querySelectorAll('[data-testid^="node-"]'))
      .map((element) => element.getAttribute('data-testid')?.replace(/^node-/, '') ?? '')
      .filter(Boolean)
  ))
}

async function clickAndWait(page, testId) {
  await page.locator(`[data-testid="${testId}"]`).click()
  await page.waitForTimeout(200)
}

async function openProjectManager(page) {
  if (await page.locator('[data-testid="create-project-button"]').isVisible().catch(() => false)) {
    return
  }

  await clickAndWait(page, 'project-manager-button')
  await page.locator('[data-testid="create-project-button"]').waitFor({ state: 'visible', timeout: 5_000 })
}

async function createProject(page, name = 'Smoke Project') {
  await openProjectManager(page)
  await clickAndWait(page, 'create-project-button')
  await page.locator('[data-testid="project-name-input"]').fill(name)
  await clickAndWait(page, 'project-name-submit')
  await page.locator('.react-flow__pane').waitFor({ state: 'visible', timeout: 15_000 })
}

async function clickProjectMenuAction(page, projectId, actionTestId) {
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
  assert(clicked, `Project menu action should be available: ${actionTestId}`)
  await page.waitForTimeout(200)
}

async function renameProject(page, projectId, nextName) {
  await openProjectManager(page)
  await clickProjectMenuAction(page, projectId, `project-rename-${projectId}`)
  await page.locator('[data-testid="project-name-input"]').fill(nextName)
  await clickAndWait(page, 'project-name-submit')
  await page.waitForFunction(
    ({ id, name }) => {
      const raw = window.localStorage.getItem('__ai_canvas_browser_smoke_fs__')
      const tree = raw ? JSON.parse(raw) : { files: {} }
      const manifest = JSON.parse(tree.files['ai-canvas-workspace.json'] || 'null')
      return manifest?.projects?.some((project) => project.id === id && project.name === name)
    },
    { id: projectId, name: nextName },
    { timeout: 5_000 },
  )
}

async function archiveProject(page, projectId, expectedFallbackProjectId) {
  await openProjectManager(page)
  await clickProjectMenuAction(page, projectId, `project-archive-${projectId}`)
  await page.locator('[data-testid="feedback-confirm-dialog"]').waitFor({ state: 'visible', timeout: 5_000 })
  await clickAndWait(page, 'feedback-confirm-submit')
  await page.waitForFunction(
    ({ id, fallbackId }) => {
      const raw = window.localStorage.getItem('__ai_canvas_browser_smoke_fs__')
      const tree = raw ? JSON.parse(raw) : { files: {} }
      const manifest = JSON.parse(tree.files['ai-canvas-workspace.json'] || 'null')
      const project = manifest?.projects?.find((item) => item.id === id)
      return typeof project?.archivedAt === 'number' && manifest?.activeProjectId === fallbackId
    },
    { id: projectId, fallbackId: expectedFallbackProjectId },
    { timeout: 10_000 },
  )
}

async function restoreProject(page, projectId) {
  await page.getByRole('button', { name: '已归档', exact: true }).first().click()
  await page.locator(`[data-testid="project-open-${projectId}"]`).waitFor({ state: 'visible', timeout: 5_000 })
  await clickProjectMenuAction(page, projectId, `project-restore-${projectId}`)
  await page.waitForFunction(
    (id) => {
      const raw = window.localStorage.getItem('__ai_canvas_browser_smoke_fs__')
      const tree = raw ? JSON.parse(raw) : { files: {} }
      const manifest = JSON.parse(tree.files['ai-canvas-workspace.json'] || 'null')
      return manifest?.projects?.find((project) => project.id === id)?.archivedAt === null
    },
    projectId,
    { timeout: 10_000 },
  )
  await page.getByRole('button', { name: '全部', exact: true }).first().click()
  await page.locator(`[data-testid="project-more-${projectId}"]`).waitFor({ state: 'attached', timeout: 5_000 })
  await page.waitForTimeout(500)
}

async function duplicateProject(page, projectId) {
  const beforeState = await getWorkspaceState(page)
  await openProjectManager(page)
  await clickProjectMenuAction(page, projectId, `project-duplicate-${projectId}`)
  await page.waitForFunction(
    (previousCount) => {
      const raw = window.localStorage.getItem('__ai_canvas_browser_smoke_fs__')
      const tree = raw ? JSON.parse(raw) : { files: {} }
      const manifest = JSON.parse(tree.files['ai-canvas-workspace.json'] || 'null')
      return (manifest?.projects?.length ?? 0) === previousCount + 1
    },
    beforeState.projects.length,
    { timeout: 5_000 },
  )
  const afterState = await getWorkspaceState(page)
  const duplicated = afterState.projects.find((project) => !beforeState.projects.some((item) => item.id === project.id))
  assert(duplicated, 'Duplicating a project should create a new project summary')
  return duplicated
}

async function deleteProject(page, projectId) {
  await openProjectManager(page)
  await clickProjectMenuAction(page, projectId, `project-delete-${projectId}`)
  await page.locator('[data-testid="feedback-confirm-dialog"]').waitFor({ state: 'visible', timeout: 5_000 })
  await clickAndWait(page, 'feedback-confirm-submit')
  await page.waitForFunction(
    (id) => {
      const raw = window.localStorage.getItem('__ai_canvas_browser_smoke_fs__')
      const tree = raw ? JSON.parse(raw) : { files: {} }
      const manifest = JSON.parse(tree.files['ai-canvas-workspace.json'] || 'null')
      return !manifest?.projects?.some((project) => project.id === id)
    },
    projectId,
    { timeout: 5_000 },
  )
}

async function batchDeleteProjects(page, projectIds) {
  await openProjectManager(page)
  await clickAndWait(page, 'project-batch-toggle')

  for (const projectId of projectIds) {
    await clickAndWait(page, `project-open-${projectId}`)
  }

  await clickAndWait(page, 'project-batch-delete')
  await page.locator('[data-testid="feedback-confirm-dialog"]').waitFor({ state: 'visible', timeout: 5_000 })
  await clickAndWait(page, 'feedback-confirm-submit')
  await page.waitForFunction(
    (ids) => {
      const raw = window.localStorage.getItem('__ai_canvas_browser_smoke_fs__')
      const tree = raw ? JSON.parse(raw) : { files: {} }
      const manifest = JSON.parse(tree.files['ai-canvas-workspace.json'] || 'null')
      return ids.every((id) => !manifest?.projects?.some((project) => project.id === id))
    },
    projectIds,
    { timeout: 5_000 },
  )
}

async function openProject(page, projectId) {
  await openProjectManager(page)
  await clickAndWait(page, `project-open-${projectId}`)
  await page.locator('[data-testid="create-project-button"]').waitFor({ state: 'hidden', timeout: 5_000 })
  await page.locator('.react-flow__pane').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForFunction(
    (id) => {
      const raw = window.localStorage.getItem('__ai_canvas_browser_smoke_fs__')
      const tree = raw ? JSON.parse(raw) : { files: {} }
      const manifest = JSON.parse(tree.files['ai-canvas-workspace.json'] || 'null')
      return manifest?.activeProjectId === id && manifest?.lastOpenedProjectId === id
    },
    projectId,
    { timeout: 5_000 },
  )
}

async function createNode(page, toolTestId) {
  const before = new Set(await getNodeIds(page))
  await clickAndWait(page, toolTestId)

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const after = await getNodeIds(page)
    const created = after.find((id) => !before.has(id))
    if (created) {
      return created
    }
    await page.waitForTimeout(100)
  }

  throw new Error(`Timed out waiting for node creation from ${toolTestId}`)
}

async function fillTextNode(page, nodeId, text) {
  const editor = page.locator(`[data-testid="node-${nodeId}"] .ProseMirror`).first()
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.insertText(text)
  await page.locator('.react-flow__pane').click({ position: { x: 900, y: 120 } })
  await page.waitForTimeout(250)
}

async function connectTextToGenerate(page, textNodeId, generateNodeId) {
  const source = page.locator(`[data-testid="node-${textNodeId}"] .react-flow__handle.source`).first()
  const target = page.locator(`[data-testid="node-${generateNodeId}"] .react-flow__handle.target`).first()
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()

  assert(sourceBox, `Missing source handle for ${textNodeId}`)
  assert(targetBox, `Missing target handle for ${generateNodeId}`)

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 24 })
  await page.mouse.up()
  await page.waitForTimeout(500)

  await page.waitForFunction(
    ({ sourceId, targetId }) => (
      document.querySelectorAll('.react-flow__edge').length > 0
      && Array.from(document.querySelectorAll('.react-flow__edge')).some(() => sourceId && targetId)
    ),
    { sourceId: textNodeId, targetId: generateNodeId },
    { timeout: 5_000 },
  )
}

async function enqueueGenerateTask(page, generateNodeId) {
  const button = page.locator(`[data-testid="enqueue-generate-${generateNodeId}"]`)
  await button.waitFor({ state: 'visible', timeout: 5_000 })
  await page.waitForFunction(
    (testId) => document.querySelector(`[data-testid="${testId}"]`)?.disabled === false,
    `enqueue-generate-${generateNodeId}`,
    { timeout: 5_000 },
  )
  await button.click()
  await page.waitForTimeout(500)
  await page.locator('[data-testid^="node-preview-"]').first().waitFor({ state: 'visible', timeout: 5_000 })
}

async function saveProject(page) {
  await clickAndWait(page, 'save-project-button')
  await page.waitForTimeout(600)
}

async function runSmoke(page) {
  await createProject(page, 'Smoke Project A')

  const textNodeId = await createNode(page, 'toolbar-node-text')
  await fillTextNode(page, textNodeId, 'smoke test prompt')
  const generateNodeId = await createNode(page, 'toolbar-node-ai')
  await connectTextToGenerate(page, textNodeId, generateNodeId)
  await enqueueGenerateTask(page, generateNodeId)
  await saveProject(page)

  const savedState = await getCanvasState(page)
  assert(savedState.project, 'Saved workspace project should exist')
  assert(savedState.nodes.some((node) => node.id === textNodeId && node.type === 'textNode'), 'Saved snapshot should include the text node')
  assert(savedState.nodes.some((node) => node.id === generateNodeId && node.type === 'generateNode'), 'Saved snapshot should include the generate node')
  assert(savedState.edges.some((edge) => edge.source === textNodeId && edge.target === generateNodeId), 'Saved snapshot should include the text-to-generate edge')
  assert(savedState.tasks.length >= 1, 'Saved snapshot should include the queued generate task')
  const firstProjectId = savedState.manifest?.activeProjectId
  assert(firstProjectId, 'The first saved project should be active in the workspace manifest')

  await createProject(page, 'Smoke Project B')
  const secondTextNodeId = await createNode(page, 'toolbar-node-text')
  await fillTextNode(page, secondTextNodeId, 'second smoke project')
  await saveProject(page)

  const secondState = await getCanvasState(page)
  const secondProjectId = secondState.manifest?.activeProjectId
  assert(secondProjectId && secondProjectId !== firstProjectId, 'Creating a second project should activate a distinct project')
  assert(secondState.nodes.some((node) => node.id === secondTextNodeId), 'The second project should save its own text node')

  await openProject(page, firstProjectId)
  await page.locator(`[data-testid="node-${textNodeId}"]`).waitFor({ state: 'visible', timeout: 15_000 })
  const switchedState = await getCanvasState(page)
  assert(switchedState.manifest?.activeProjectId === firstProjectId, 'Project switch should activate the first project')
  assert(switchedState.nodes.some((node) => node.id === textNodeId), 'Project switch should load the first project nodes on demand')
  assert(switchedState.nodes.some((node) => node.id === generateNodeId), 'Project switch should restore the first project generate node')
  assert(switchedState.edges.some((edge) => edge.source === textNodeId && edge.target === generateNodeId), 'Project switch should restore the first project edge')
  assert(switchedState.tasks.length >= 1, 'Project switch should restore the first project task queue')

  const renamedProjectName = 'Smoke Project A Renamed'
  await renameProject(page, firstProjectId, renamedProjectName)
  const renamedState = await getWorkspaceState(page)
  assert(
    renamedState.projects.some((project) => project.id === firstProjectId && project.name === renamedProjectName),
    'Project rename should update the manifest summary',
  )

  await archiveProject(page, firstProjectId, secondProjectId)
  await restoreProject(page, firstProjectId)
  await clickAndWait(page, `project-open-${firstProjectId}`)
  await page.locator('[data-testid="create-project-button"]').waitFor({ state: 'hidden', timeout: 5_000 })
  await page.locator(`[data-testid="node-${textNodeId}"]`).waitFor({ state: 'visible', timeout: 15_000 })

  const singleDeleteDuplicate = await duplicateProject(page, firstProjectId)
  assert(singleDeleteDuplicate.name.includes('副本'), 'Project duplicate should use the duplicate suffix')
  assert(singleDeleteDuplicate.nodes.some((node) => node.id === textNodeId), 'Duplicated project should copy the source snapshot')
  await deleteProject(page, singleDeleteDuplicate.id)
  const afterSingleDelete = await getWorkspaceState(page)
  assert(!afterSingleDelete.files[singleDeleteDuplicate.fileName], 'Single project delete should remove the duplicated project file')

  const batchDuplicateA = await duplicateProject(page, firstProjectId)
  const batchDuplicateB = await duplicateProject(page, firstProjectId)
  await batchDeleteProjects(page, [batchDuplicateA.id, batchDuplicateB.id])
  const afterBatchDelete = await getWorkspaceState(page)
  assert(!afterBatchDelete.projects.some((project) => project.id === batchDuplicateA.id), 'Batch delete should remove the first selected project summary')
  assert(!afterBatchDelete.projects.some((project) => project.id === batchDuplicateB.id), 'Batch delete should remove the second selected project summary')

  await openProjectManager(page)
  await page.evaluate(() => window.__queueSmokeDirectoryPicker('bundle-parent'))
  await clickProjectMenuAction(page, firstProjectId, `project-export-${firstProjectId}`)
  await page.waitForFunction(
    () => {
      const tree = JSON.parse(window.localStorage.getItem('__ai_canvas_browser_smoke_fs__') || '{"files":{}}')
      return Object.keys(tree.files).some((path) => path.startsWith('bundle-parent/') && path.endsWith('/project.json'))
    },
    undefined,
    { timeout: 10_000 },
  )
  await deleteProject(page, firstProjectId)

  await openProjectManager(page)
  await page.evaluate(() => window.__queueSmokeDirectoryPicker('project-source'))
  await clickAndWait(page, 'import-project-button')
  await page.locator('[data-testid="feedback-confirm-dialog"]').waitFor({ state: 'visible', timeout: 5_000 })
  await clickAndWait(page, 'feedback-confirm-submit')
  await page.waitForFunction(
    (id) => {
      const tree = JSON.parse(window.localStorage.getItem('__ai_canvas_browser_smoke_fs__') || '{"files":{}}')
      const manifest = JSON.parse(tree.files['ai-canvas-workspace.json'] || 'null')
      return manifest?.projects?.some((project) => project.id === id)
    },
    firstProjectId,
    { timeout: 10_000 },
  )

  await page.evaluate(() => window.__queueSmokeDirectoryPicker('project-source'))
  await clickAndWait(page, 'import-project-button')
  await page.locator('[data-testid="project-import-conflict-dialog"]').waitFor({ state: 'visible', timeout: 5_000 })
  await clickAndWait(page, 'project-import-copy')
  await page.waitForFunction(
    () => {
      const tree = JSON.parse(window.localStorage.getItem('__ai_canvas_browser_smoke_fs__') || '{"files":{}}')
      const manifest = JSON.parse(tree.files['ai-canvas-workspace.json'] || 'null')
      return manifest?.projects?.length === 3
    },
    undefined,
    { timeout: 10_000 },
  )
  const afterCopyImport = await getWorkspaceState(page)
  const importedCopy = afterCopyImport.projects.find((project) => ![firstProjectId, secondProjectId].includes(project.id))
  assert(importedCopy?.project?.name.includes('（导入）'), 'Conflict copy should create a project with a new ID and import suffix')

  await page.evaluate(() => window.__queueSmokeDirectoryPicker('project-source'))
  await clickAndWait(page, 'import-project-button')
  await page.locator('[data-testid="project-import-conflict-dialog"]').waitFor({ state: 'visible', timeout: 5_000 })
  await clickAndWait(page, 'project-import-replace')
  await page.locator('[data-testid="project-import-conflict-dialog"]').waitFor({ state: 'hidden', timeout: 10_000 })
  const afterReplaceImport = await getWorkspaceState(page)
  assert(afterReplaceImport.projects.filter((project) => project.id === firstProjectId).length === 1, 'Conflict replace should keep a single project with the source ID')
  await deleteProject(page, importedCopy.id)
  await openProject(page, firstProjectId)

  await page.reload({ waitUntil: 'networkidle' })
  await page.locator(`[data-testid="node-${textNodeId}"]`).waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator(`[data-testid="node-${generateNodeId}"]`).waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('[data-testid^="node-preview-"]').first().waitFor({ state: 'visible', timeout: 15_000 })

  const restoredState = await getCanvasState(page)
  assert(restoredState.manifest?.activeProjectId === firstProjectId, 'Reload should keep the renamed first project active')
  assert(restoredState.manifest?.projects?.some((project) => project.id === firstProjectId && project.name === renamedProjectName), 'Reload should keep the renamed project summary')
  assert(restoredState.manifest?.projects?.some((project) => project.id === secondProjectId), 'Reload should keep the second project summary')
  assert(restoredState.nodes.some((node) => node.id === textNodeId), 'Reload should restore the text node')
  assert(restoredState.nodes.some((node) => node.id === generateNodeId), 'Reload should restore the generate node')
  assert(restoredState.edges.some((edge) => edge.source === textNodeId && edge.target === generateNodeId), 'Reload should restore the connection edge')
  assert(restoredState.tasks.length >= 1, 'Reload should restore the task queue snapshot')

  await seedWorkspaceBundleFixture(page, secondProjectId)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '存储管理', exact: true }).click()
  await page.locator('[data-testid="workspace-bundle-export"]').waitFor({ state: 'visible', timeout: 5_000 })
  await page.evaluate(() => window.__queueSmokeDirectoryPicker('bundle-parent'))
  await clickAndWait(page, 'workspace-bundle-export')
  await page.waitForFunction(
    () => {
      const tree = JSON.parse(window.localStorage.getItem('__ai_canvas_browser_smoke_fs__') || '{"files":{}}')
      return Object.keys(tree.files).some((path) => path.startsWith('bundle-parent/') && path.endsWith('/workspace.json'))
    },
    undefined,
    { timeout: 10_000 },
  )

  const bundleState = await getBundleState(page)
  assert(bundleState.manifest?.type === 'ai-canvas-workspace-bundle', 'Bundle export should write a portable manifest')
  assert(bundleState.manifest?.projects?.length === 2, 'Bundle export should include both projects')
  assert(bundleState.projectFiles.length === 2, 'Bundle manifest should list one file per project')
  assert(bundleState.config?.providerProfiles?.[0]?.apiKey === '', 'Bundle export should redact provider API keys')
  assert(bundleState.assetContent === 'bundle-smoke-asset', 'Bundle export should copy referenced media assets')

  await clearActiveWorkspaceFixture(page)
  await page.evaluate(() => window.__queueSmokeDirectoryPicker('bundle-source'))
  await clickAndWait(page, 'workspace-bundle-import')
  await page.locator('[data-testid="feedback-confirm-dialog"]').waitFor({ state: 'visible', timeout: 5_000 })
  await clickAndWait(page, 'feedback-confirm-submit')
  await page.waitForFunction(
    () => {
      const tree = JSON.parse(window.localStorage.getItem('__ai_canvas_browser_smoke_fs__') || '{"files":{}}')
      const manifest = JSON.parse(tree.files['ai-canvas-workspace.json'] || 'null')
      return manifest?.projects?.length === 2 && tree.files['images/originals/bundle-smoke.png'] === 'bundle-smoke-asset'
    },
    undefined,
    { timeout: 10_000 },
  )

  await page.evaluate(() => {
    const storageKey = '__ai_canvas_browser_smoke_fs__'
    const tree = JSON.parse(window.localStorage.getItem(storageKey) || '{"files":{},"directories":{}}')
    tree.directories.images = true
    tree.files['images/browser-orphan.bin'] = 'abc'
    window.localStorage.setItem(storageKey, JSON.stringify(tree))
  })
  await clickAndWait(page, 'workspace-asset-scan')
  await page.locator('[data-testid="workspace-disk-inspection-result"]').getByText('1 个可清理', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="workspace-disk-inspection-result"]').getByText('images/browser-orphan.bin', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByRole('button', { name: '清理未引用文件', exact: true }).click()
  await page.locator('[data-testid="feedback-confirm-dialog"]').waitFor({ state: 'visible', timeout: 5_000 })
  await clickAndWait(page, 'feedback-confirm-submit')
  await page.waitForFunction(
    () => {
      const tree = JSON.parse(window.localStorage.getItem('__ai_canvas_browser_smoke_fs__') || '{"files":{}}')
      return tree.files['images/browser-orphan.bin'] === undefined
    },
    undefined,
    { timeout: 10_000 },
  )

  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.locator(`[data-testid="node-${textNodeId}"]`).waitFor({ state: 'visible', timeout: 15_000 })
  const importedState = await getCanvasState(page)
  assert(importedState.manifest?.activeProjectId === firstProjectId, 'Bundle import should restore the active project')
  assert(importedState.manifest?.projects?.some((project) => project.id === secondProjectId), 'Bundle import should restore the second project')
  assert(importedState.edges.some((edge) => edge.source === textNodeId && edge.target === generateNodeId), 'Bundle import should restore edges')
  assert(importedState.tasks.length >= 1, 'Bundle import should restore queued tasks')

  await page.reload({ waitUntil: 'networkidle' })
  await page.locator(`[data-testid="node-${textNodeId}"]`).waitFor({ state: 'visible', timeout: 15_000 })
  const bundleReloadState = await getCanvasState(page)
  assert(bundleReloadState.manifest?.projects?.length === 2, 'Imported bundle should remain readable after reload')
  assert(bundleReloadState.nodes.some((node) => node.id === generateNodeId), 'Imported nodes should survive reload')

  return {
    firstProjectId,
    secondProjectId,
    textNodeId,
    generateNodeId,
    nodeCount: bundleReloadState.nodes.length,
    edgeCount: bundleReloadState.edges.length,
    taskCount: bundleReloadState.tasks.length,
    projectCount: bundleReloadState.manifest?.projects?.length ?? 0,
    projectFileName: bundleReloadState.projectFileName,
    bundleAssetCount: bundleState.assetContent ? 1 : 0,
  }
}

async function main() {
  const { chromium } = await loadPlaywright()
  const port = await getFreePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const server = startDevServer(port)
  let browser = null

  try {
    await waitForServer(baseUrl, server.getOutput)
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 1,
    })
    await installFakeWorkspace(context)
    const page = await context.newPage()
    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    await page.locator('.react-flow__pane').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined)

    const result = await runSmoke(page)
    const reportPath = writeReport({
      createdAt: new Date().toISOString(),
      url: baseUrl,
      result,
    })

    await page.close()
    await context.close()

    console.log('Browser smoke validation passed')
    console.log(`  report: ${reportPath}`)
    console.log(`  nodes/edges/tasks: ${result.nodeCount} / ${result.edgeCount} / ${result.taskCount}`)
    console.log(`  projects: ${result.projectCount}`)
    console.log(`  project file: ${result.projectFileName}`)
  } finally {
    if (browser) {
      await browser.close()
    }
    server.stop()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
