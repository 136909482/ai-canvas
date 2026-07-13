import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createNativeWorkspaceService } from './nativeWorkspace.mjs'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(currentDirectory, '..')
const developmentUrl = process.env.ELECTRON_DEV_URL
const distDirectory = path.join(appRoot, 'dist')
let productionServer

const workspaceIpcMethods = new Map([
  ['get-status', 'getWorkspaceStatus'],
  ['pick-directory', 'pickWorkspaceDirectory'],
  ['load-data', 'loadWorkspaceData'],
  ['save-data', 'saveWorkspaceData'],
  ['list-projects', 'listWorkspaceProjects'],
  ['load-project', 'loadWorkspaceProject'],
  ['save-project', 'saveWorkspaceProject'],
  ['delete-project', 'deleteWorkspaceProject'],
  ['load-config', 'loadWorkspaceConfig'],
  ['save-config', 'saveWorkspaceConfig'],
  ['load-workflow-templates', 'loadWorkflowTemplates'],
  ['save-workflow-templates', 'saveWorkflowTemplates'],
  ['query-audit', 'queryWorkspaceAudit'],
  ['search-workspace', 'searchWorkspace'],
  ['write-asset', 'writeWorkspaceAsset'],
  ['write-asset-at-path', 'writeWorkspaceAssetAtPath'],
  ['read-asset', 'readWorkspaceAsset'],
  ['inspect-assets', 'inspectWorkspaceAssets'],
  ['cleanup-assets', 'cleanupUnusedWorkspaceAssets'],
  ['export-bundle', 'exportWorkspaceBundle'],
  ['import-bundle', 'importWorkspaceBundle'],
  ['export-project-bundle', 'exportProjectBundle'],
  ['prepare-project-import', 'prepareProjectBundleImport'],
  ['commit-project-import', 'commitProjectBundleImport'],
  ['export-workflow', 'exportWorkflowJson'],
  ['import-workflow', 'importWorkflowJson'],
])

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.otf', 'font/otf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

function getProxyTarget(requestUrl) {
  if (requestUrl.pathname === '/api-proxy/openai') {
    const target = requestUrl.searchParams.get('target')
    if (!target) throw new Error('Missing OpenAI proxy target')
    const targetUrl = new URL(target)
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      throw new Error('Invalid OpenAI proxy target protocol')
    }
    return targetUrl
  }

  const aliyunTargets = [
    ['/api-proxy/aliyun-intl', 'https://dashscope-intl.aliyuncs.com'],
    ['/api-proxy/aliyun-us', 'https://dashscope-us.aliyuncs.com'],
    ['/api-proxy/aliyun', 'https://dashscope.aliyuncs.com'],
  ]
  const match = aliyunTargets.find(([prefix]) => requestUrl.pathname.startsWith(prefix))
  if (!match) return null

  const [prefix, origin] = match
  return new URL(`${requestUrl.pathname.slice(prefix.length)}${requestUrl.search}`, origin)
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

async function proxyRequest(request, response, targetUrl) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (!value || ['host', 'connection', 'content-length'].includes(key)) continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }

  const method = request.method ?? 'GET'
  const body = ['GET', 'HEAD'].includes(method) ? undefined : await readRequestBody(request)
  const targetResponse = await fetch(targetUrl, { method, headers, body })
  response.statusCode = targetResponse.status
  targetResponse.headers.forEach((value, key) => {
    if (!['transfer-encoding', 'content-encoding'].includes(key)) {
      response.setHeader(key, value)
    }
  })
  response.end(Buffer.from(await targetResponse.arrayBuffer()))
}

async function serveStaticFile(requestUrl, response) {
  const relativePath = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname)
    .replace(/^[/\\]+/, '')
  const filePath = path.resolve(distDirectory, relativePath)
  if (!filePath.startsWith(`${distDirectory}${path.sep}`)) {
    response.writeHead(403).end('Forbidden')
    return
  }

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) throw new Error('Not a file')
    response.setHeader('content-type', contentTypes.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream')
    response.setHeader('content-length', fileStat.size)
    createReadStream(filePath).pipe(response)
  } catch {
    response.writeHead(404).end('Not found')
  }
}

function startProductionServer() {
  return new Promise((resolve, reject) => {
    productionServer = createServer(async (request, response) => {
      try {
        const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
        const proxyTarget = getProxyTarget(requestUrl)
        if (proxyTarget) {
          await proxyRequest(request, response, proxyTarget)
          return
        }

        if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) {
          response.writeHead(405).end('Method not allowed')
          return
        }
        await serveStaticFile(requestUrl, response)
      } catch (error) {
        response.statusCode = 502
        response.setHeader('content-type', 'application/json; charset=utf-8')
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
      }
    })

    productionServer.once('error', reject)
    productionServer.listen(0, '127.0.0.1', () => {
      const address = productionServer.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Electron desktop server did not expose a TCP port.'))
        return
      }
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

function isAllowedExternalUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function createMainWindow(pageUrl) {
  const window = new BrowserWindow({
    title: 'AI Canvas',
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    icon: path.join(appRoot, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const currentUrl = window.webContents.getURL()
    if (url === currentUrl) {
      return
    }

    event.preventDefault()
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url)
    }
  })

  void window.loadURL(pageUrl)
}

function createWorkspaceService() {
  return createNativeWorkspaceService({
    stateFilePath: path.join(app.getPath('userData'), 'desktop-workspace.json'),
    async selectDirectory({ purpose }) {
      const title = {
        workspace: '选择 AI Canvas 工作区',
        export: '选择工作区目录包导出位置',
        import: '选择要导入的工作区目录包',
        'export-project': '选择项目目录包导出位置',
        'import-project': '选择要导入的项目目录包',
      }[purpose] ?? '选择目录'
      const result = await dialog.showOpenDialog({
        title,
        properties: ['openDirectory', 'createDirectory'],
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    },
    async selectSaveFile({ suggestedName }) {
      const result = await dialog.showSaveDialog({
        title: '保存工作流',
        defaultPath: suggestedName,
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      })
      return result.canceled ? null : result.filePath ?? null
    },
    async selectOpenFile() {
      const result = await dialog.showOpenDialog({
        title: '导入工作流',
        properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    },
  })
}

function registerWorkspaceIpcHandlers(service) {
  for (const [channelSuffix, methodName] of workspaceIpcMethods) {
    ipcMain.handle(`ai-canvas:workspace:${channelSuffix}`, (_event, payload) => service[methodName](payload))
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  app.whenReady().then(async () => {
    registerWorkspaceIpcHandlers(createWorkspaceService())
    const pageUrl = developmentUrl || await startProductionServer()
    createMainWindow(pageUrl)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow(pageUrl)
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => productionServer?.close())
}
