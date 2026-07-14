import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { extname, resolve, sep } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const LEGACY_PROJECT_STORAGE_KEY = 'ai-canvas-projects'
const WORKSPACE_MANIFEST_FILE_NAME = 'ai-canvas-workspace.json'
const ASSET_ROUTE_PREFIX = '/__perf_assets/'
const DEFAULT_IMAGE_COUNT = 4
const DEFAULT_IMAGE_WIDTH = 2400
const DEFAULT_IMAGE_HEIGHT = 1800
const DEFAULT_DRAG_DISTANCE = 420
const DEFAULT_DRAG_STEPS = 90
const DEFAULT_ZOOM_FROM = 0.8
const DEFAULT_ZOOM_TO = 0.24
const DEFAULT_ZOOM_STEPS = 42
const SERVER_READY_TIMEOUT_MS = 30_000
const THUMBNAIL_READY_TIMEOUT_MS = 8_000
const REPORT_DIR = resolve(process.cwd(), 'output/performance')
const TRACE_CATEGORIES = [
  'devtools.timeline',
  'toplevel',
  'disabled-by-default-devtools.timeline',
].join(',')
const TRACE_SCRIPT_EVENT_NAMES = new Set([
  'EvaluateScript',
  'EventDispatch',
  'FunctionCall',
  'RunMicrotasks',
  'TimerFire',
])
const TRACE_RENDER_EVENT_NAMES = new Set([
  'Layout',
  'RecalculateStyles',
  'UpdateLayoutTree',
])
const TRACE_PAINT_EVENT_NAMES = new Set([
  'CompositeLayers',
  'Paint',
  'PrePaint',
  'RasterTask',
])

function parseArgs(argv) {
  const options = {
    imageCount: DEFAULT_IMAGE_COUNT,
    imageWidth: DEFAULT_IMAGE_WIDTH,
    imageHeight: DEFAULT_IMAGE_HEIGHT,
    dragDistance: DEFAULT_DRAG_DISTANCE,
    dragSteps: DEFAULT_DRAG_STEPS,
    zoomFrom: DEFAULT_ZOOM_FROM,
    zoomTo: DEFAULT_ZOOM_TO,
    zoomSteps: DEFAULT_ZOOM_STEPS,
    workspaceDir: '',
    projectId: '',
    projectName: '',
    nodeId: '',
    runs: 1,
    gesture: 'drag',
    forceCulling: 'auto',
    canvasPerformanceMode: '',
    serverMode: 'dev',
    enableInternalDrag: false,
    headed: false,
    enforce: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = argv[index + 1]

    switch (arg) {
      case '--image-count':
        options.imageCount = Math.max(1, Number(nextValue))
        index += 1
        break
      case '--image-width':
        options.imageWidth = Math.max(1, Number(nextValue))
        index += 1
        break
      case '--image-height':
        options.imageHeight = Math.max(1, Number(nextValue))
        index += 1
        break
      case '--drag-distance':
        options.dragDistance = Math.max(1, Number(nextValue))
        index += 1
        break
      case '--drag-steps':
        options.dragSteps = Math.max(1, Number(nextValue))
        index += 1
        break
      case '--zoom-from':
        options.zoomFrom = Math.max(0.05, Number(nextValue))
        index += 1
        break
      case '--zoom-to':
        options.zoomTo = Math.max(0.05, Number(nextValue))
        index += 1
        break
      case '--zoom-steps':
        options.zoomSteps = Math.max(1, Number(nextValue))
        index += 1
        break
      case '--workspace-dir':
        options.workspaceDir = String(nextValue || '').trim()
        index += 1
        break
      case '--project-id':
        options.projectId = String(nextValue || '').trim()
        index += 1
        break
      case '--project-name':
        options.projectName = String(nextValue || '').trim()
        index += 1
        break
      case '--node-id':
        options.nodeId = String(nextValue || '').trim()
        index += 1
        break
      case '--runs':
        options.runs = Math.max(1, Number(nextValue))
        index += 1
        break
      case '--gesture':
        options.gesture = String(nextValue || '').trim()
        if (!['drag', 'connect', 'pan', 'select-pan', 'zoom'].includes(options.gesture)) {
          throw new Error(`Unsupported gesture: ${options.gesture}`)
        }
        index += 1
        break
      case '--force-culling':
        options.forceCulling = String(nextValue || '').trim()
        if (!['auto', 'on', 'off'].includes(options.forceCulling)) {
          throw new Error(`Unsupported culling mode: ${options.forceCulling}`)
        }
        index += 1
        break
      case '--canvas-performance-mode':
        options.canvasPerformanceMode = String(nextValue || '').trim()
        if (!['quality', 'performance'].includes(options.canvasPerformanceMode)) {
          throw new Error(`Unsupported canvas performance mode: ${options.canvasPerformanceMode}`)
        }
        index += 1
        break
      case '--server-mode':
        options.serverMode = String(nextValue || '').trim()
        if (!['dev', 'preview'].includes(options.serverMode)) {
          throw new Error(`Unsupported server mode: ${options.serverMode}`)
        }
        index += 1
        break
      case '--enable-internal-drag':
        options.enableInternalDrag = true
        break
      case '--headed':
        options.headed = true
        break
      case '--enforce':
        options.enforce = true
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function printHelp() {
  console.log(`Usage: npm run perf:canvas -- [options]

Options:
  --image-count <count>      Number of large image nodes to seed. Default: ${DEFAULT_IMAGE_COUNT}
  --image-width <pixels>     Natural image width. Default: ${DEFAULT_IMAGE_WIDTH}
  --image-height <pixels>    Natural image height. Default: ${DEFAULT_IMAGE_HEIGHT}
  --drag-distance <pixels>   Pointer drag distance. Default: ${DEFAULT_DRAG_DISTANCE}
  --drag-steps <count>       Pointer move step count. Default: ${DEFAULT_DRAG_STEPS}
  --zoom-from <scale>         Precondition zoom level before zoom sampling. Default: ${DEFAULT_ZOOM_FROM}
  --zoom-to <scale>           Target zoom level for zoom sampling. Default: ${DEFAULT_ZOOM_TO}
  --zoom-steps <count>        Wheel event count for zoom sampling. Default: ${DEFAULT_ZOOM_STEPS}
  --workspace-dir <path>      Load a real AI Canvas workspace directory instead of synthetic nodes.
  --project-id <id>           Project id to load from the workspace manifest.
  --project-name <name>       Project name to load from the workspace manifest.
  --node-id <id>              Node id to drag. Defaults to the largest image node in real projects.
  --runs <count>              Number of independent drag samples. Default: 1
  --gesture <drag|connect|pan|select-pan|zoom>
                              Sample node drag, connection drag, canvas pan, immediate pan after selection, or zoom. Default: drag
  --force-culling <mode>      Override React Flow visible-element culling: auto, on, or off. Default: auto
  --canvas-performance-mode <quality|performance>
                              Simulate the user-selected canvas performance setting.
  --server-mode <dev|preview> Start Vite dev server or production preview. Default: dev
  --enable-internal-drag      Enable the experimental internal drag path for diagnostics.
  --headed                   Show Chromium while sampling.
  --enforce                  Exit non-zero when the measured budget is exceeded.
`)
}

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch (error) {
    throw new Error([
      'Playwright is required for canvas performance sampling.',
      'Run: npm install',
      'If Chromium is missing after install, run: npx playwright install chromium',
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

function createSvgDataUrl(index, width, height) {
  const hue = (index * 47) % 360
  const secondaryHue = (hue + 120) % 360
  const grid = Array.from({ length: 24 }, (_, cellIndex) => {
    const x = (cellIndex % 6) * (width / 6)
    const y = Math.floor(cellIndex / 6) * (height / 4)
    const opacity = 0.12 + (cellIndex % 5) * 0.035
    return `<rect x="${x}" y="${y}" width="${width / 6}" height="${height / 4}" fill="hsl(${(hue + cellIndex * 9) % 360} 72% 58%)" opacity="${opacity.toFixed(3)}"/>`
  }).join('')
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<defs>',
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="hsl(${hue} 78% 48%)"/><stop offset="100%" stop-color="hsl(${secondaryHue} 74% 42%)"/></linearGradient>`,
    '</defs>',
    '<rect width="100%" height="100%" fill="url(#g)"/>',
    grid,
    `<circle cx="${width * 0.72}" cy="${height * 0.32}" r="${Math.min(width, height) * 0.18}" fill="white" opacity="0.18"/>`,
    `<text x="${width * 0.08}" y="${height * 0.18}" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.055)}" font-weight="700" fill="white" opacity="0.84">AI Canvas Perf ${index + 1}</text>`,
    `<text x="${width * 0.08}" y="${height * 0.27}" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.025)}" fill="white" opacity="0.72">${width} x ${height}</text>`,
    '</svg>',
  ].join('')

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function createPerformanceWorkspace(options) {
  const now = Date.now()
  const nodes = Array.from({ length: options.imageCount }, (_, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const id = `perf-img-${index + 1}`

    return {
      id,
      type: 'imageNode',
      dragHandle: '.node-drag-handle',
      position: {
        x: column * 620,
        y: row * 460,
      },
      width: 540,
      height: 410,
      selected: index === 0,
      data: {
        prompt: '',
        negativePrompt: '',
        imageUrl: createSvgDataUrl(index, options.imageWidth, options.imageHeight),
        imageAsset: null,
        name: `Perf Large Image ${index + 1}`,
        imageNaturalWidth: options.imageWidth,
        imageNaturalHeight: options.imageHeight,
        status: 'idle',
        errorMsg: '',
        ratio: `${options.imageWidth}:${options.imageHeight}`,
        model: 'qwen-image-2.0-pro',
        referenceImageUrl: null,
      },
    }
  })
  const snapshot = {
    schemaVersion: 1,
    canvas: {
      nodes,
      edges: [],
    },
    taskQueue: {
      tasks: [],
    },
  }

  return {
    projects: [
      {
        id: 'perf-project',
        name: 'Canvas Drag Performance',
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        savedSnapshot: snapshot,
        workingSnapshot: snapshot,
      },
    ],
    activeProjectId: 'perf-project',
    lastOpenedProjectId: 'perf-project',
  }
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function isProjectSnapshot(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && value.canvas
    && typeof value.canvas === 'object'
    && Array.isArray(value.canvas.nodes)
    && Array.isArray(value.canvas.edges)
    && value.taskQueue
    && typeof value.taskQueue === 'object'
    && Array.isArray(value.taskQueue.tasks),
  )
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeWorkspaceRelativePath(relativePath) {
  return String(relativePath || '').replace(/\\+/g, '/').replace(/^\/+/, '')
}

function getAssetUrl(relativePath) {
  return `${ASSET_ROUTE_PREFIX}${encodeURIComponent(normalizeWorkspaceRelativePath(relativePath))}`
}

function getWorkspaceAssetFilePath(workspaceDir, relativePath) {
  const normalizedPath = normalizeWorkspaceRelativePath(relativePath)
  const workspaceRoot = resolve(workspaceDir)
  const assetPath = resolve(workspaceRoot, ...normalizedPath.split('/'))
  const rootPrefix = workspaceRoot.endsWith(sep) ? workspaceRoot : `${workspaceRoot}${sep}`

  if (assetPath !== workspaceRoot && !assetPath.startsWith(rootPrefix)) {
    throw new Error(`Workspace asset path escapes workspace root: ${relativePath}`)
  }

  return assetPath
}

function getAssetSizeBytes(workspaceDir, relativePath) {
  try {
    return statSync(getWorkspaceAssetFilePath(workspaceDir, relativePath)).size
  } catch {
    return 0
  }
}

function rewriteSnapshotAssetUrls(snapshot, workspaceDir) {
  const assetStats = []
  const nextSnapshot = cloneJson(snapshot)

  nextSnapshot.canvas.nodes = nextSnapshot.canvas.nodes.map((node) => {
    const asset = node.type === 'videoNode'
      ? node.data?.videoAsset
      : node.data?.imageAsset
    const relativePath = typeof asset?.relativePath === 'string'
      ? normalizeWorkspaceRelativePath(asset.relativePath)
      : ''

    if (!relativePath || node.type === 'videoNode') {
      return node
    }

    const thumbnailRelativePath = typeof asset?.thumbnailRelativePath === 'string'
      ? normalizeWorkspaceRelativePath(asset.thumbnailRelativePath)
      : ''
    const sizeBytes = getAssetSizeBytes(workspaceDir, relativePath)
    const thumbnailSizeBytes = thumbnailRelativePath
      ? getAssetSizeBytes(workspaceDir, thumbnailRelativePath)
      : 0
    assetStats.push({
      nodeId: node.id,
      nodeType: node.type,
      relativePath,
      thumbnailRelativePath,
      sizeBytes,
      thumbnailSizeBytes,
      hasThumbnail: Boolean(thumbnailRelativePath && thumbnailSizeBytes > 0),
      displayWidth: node.width ?? 0,
      displayHeight: node.height ?? 0,
      imageWidth: node.data?.imageWidth ?? node.data?.imageNaturalWidth ?? 0,
      imageHeight: node.data?.imageHeight ?? node.data?.imageNaturalHeight ?? 0,
    })

    return {
      ...node,
      data: {
        ...node.data,
        imageAsset: asset
          ? {
              ...asset,
              thumbnailRelativePath: thumbnailRelativePath ? getAssetUrl(thumbnailRelativePath) : asset.thumbnailRelativePath,
            }
          : asset,
        imageUrl: getAssetUrl(relativePath),
      },
    }
  })

  return { snapshot: nextSnapshot, assetStats }
}

function normalizeProjectRecord(record, workspaceDir) {
  if (!record || typeof record !== 'object' || !isProjectSnapshot(record.workingSnapshot)) {
    throw new Error('Workspace project file is not a valid AI Canvas project record')
  }

  const working = rewriteSnapshotAssetUrls(record.workingSnapshot, workspaceDir)
  const savedSnapshot = isProjectSnapshot(record.savedSnapshot)
    ? rewriteSnapshotAssetUrls(record.savedSnapshot, workspaceDir).snapshot
    : cloneJson(working.snapshot)

  return {
    project: {
      ...record,
      savedSnapshot,
      workingSnapshot: working.snapshot,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
      updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now(),
      lastOpenedAt: typeof record.lastOpenedAt === 'number' ? record.lastOpenedAt : Date.now(),
    },
    assetStats: working.assetStats,
  }
}

function findWorkspaceManifestProject(manifest, options) {
  const projects = Array.isArray(manifest.projects) ? manifest.projects : []

  if (options.projectId) {
    return projects.find((project) => project.id === options.projectId)
      ?? (() => { throw new Error(`Project id not found in workspace manifest: ${options.projectId}`) })()
  }

  if (options.projectName) {
    return projects.find((project) => project.name === options.projectName)
      ?? (() => { throw new Error(`Project name not found in workspace manifest: ${options.projectName}`) })()
  }

  return projects.find((project) => project.id === manifest.activeProjectId)
    ?? projects.find((project) => project.id === manifest.lastOpenedProjectId)
    ?? projects[0]
    ?? null
}

function selectDefaultDragNode(project, assetStats) {
  const nodes = project.workingSnapshot.canvas.nodes
  const sizeByNodeId = new Map(assetStats.map((asset) => [asset.nodeId, asset.sizeBytes]))
  const imageNodes = nodes
    .filter((node) => node.type === 'imageNode' && typeof node.data?.imageUrl === 'string' && node.data.imageUrl)
    .sort((left, right) => (sizeByNodeId.get(right.id) ?? 0) - (sizeByNodeId.get(left.id) ?? 0))

  return imageNodes[0]?.id
    ?? nodes.find((node) => typeof node.data?.imageUrl === 'string' && node.data.imageUrl)?.id
    ?? nodes[0]?.id
    ?? ''
}

function centerSnapshotOnNode(snapshot, nodeId) {
  const targetNode = snapshot.canvas.nodes.find((node) => node.id === nodeId)

  if (!targetNode?.position) {
    return snapshot
  }

  const targetCenterX = targetNode.position.x + (targetNode.width ?? targetNode.measured?.width ?? 320) / 2
  const targetCenterY = targetNode.position.y + (targetNode.height ?? targetNode.measured?.height ?? 260) / 2
  const deltaX = 520 - targetCenterX
  const deltaY = 420 - targetCenterY

  snapshot.canvas.nodes = snapshot.canvas.nodes.map((node) => ({
    ...node,
    position: node.position
      ? {
          x: node.position.x + deltaX,
          y: node.position.y + deltaY,
        }
      : node.position,
  }))

  return snapshot
}

function centerProjectOnNode(project, nodeId) {
  if (!nodeId) {
    return project
  }

  return {
    ...project,
    savedSnapshot: centerSnapshotOnNode(project.savedSnapshot, nodeId),
    workingSnapshot: centerSnapshotOnNode(project.workingSnapshot, nodeId),
  }
}

function loadWorkspaceScenario(options) {
  if (!options.workspaceDir) {
    return null
  }

  const workspaceDir = resolve(options.workspaceDir)
  const manifestPath = resolve(workspaceDir, WORKSPACE_MANIFEST_FILE_NAME)

  if (!existsSync(manifestPath)) {
    throw new Error(`Workspace manifest not found: ${manifestPath}`)
  }

  const manifest = readJsonFile(manifestPath)
  const manifestProject = findWorkspaceManifestProject(manifest, options)

  if (!manifestProject) {
    throw new Error(`Workspace has no projects: ${workspaceDir}`)
  }

  const projectFileName = manifestProject.fileName || `${manifestProject.id}.json`
  const projectPath = resolve(workspaceDir, projectFileName)
  const record = readJsonFile(projectPath)
  const { project, assetStats } = normalizeProjectRecord(record, workspaceDir)
  const defaultDragNodeId = options.nodeId || selectDefaultDragNode(project, assetStats)
  const centeredProject = centerProjectOnNode(project, defaultDragNodeId)

  return {
    workspaceDir,
    projectPath,
    project: centeredProject,
    assetStats,
    defaultDragNodeId,
    workspace: {
      projects: [centeredProject],
      activeProjectId: centeredProject.id,
      lastOpenedProjectId: centeredProject.id,
    },
  }
}

function startDevServer(port, serverMode = 'dev') {
  const serverCommand = process.platform === 'win32'
    ? process.env.ComSpec || 'cmd.exe'
    : 'npm'
  const npmCommand = serverMode === 'preview'
    ? `npm run preview -- --host 127.0.0.1 --port ${port}`
    : `npm run dev -- --host 127.0.0.1 --port ${port}`
  const serverArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', npmCommand]
    : ['run', serverMode, '--', '--host', '127.0.0.1', '--port', String(port)]
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
    process: server,
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

      if (!server.killed) {
        server.kill()
      }
    },
  }
}

function getBrowserLaunchError(error) {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('Executable doesn\'t exist') || message.includes('Please run the following command')) {
    return [
      'Playwright Chromium is not installed.',
      'Run: npx playwright install chromium',
      message,
    ].join('\n')
  }

  return message
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

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1)
  return sorted[index]
}

function summarizeCountSamples(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value) && value >= 0)
  if (finiteValues.length === 0) {
    return {
      min: 0,
      median: 0,
      max: 0,
      changes: 0,
    }
  }

  return {
    min: Math.min(...finiteValues),
    median: median(finiteValues),
    max: Math.max(...finiteValues),
    changes: finiteValues.reduce((count, value, index) => (
      index > 0 && value !== finiteValues[index - 1] ? count + 1 : count
    ), 0),
  }
}

function summarizeNumericSamples(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value))
  if (finiteValues.length === 0) {
    return {
      min: 0,
      median: 0,
      max: 0,
      changes: 0,
    }
  }

  return {
    min: Math.min(...finiteValues),
    median: median(finiteValues),
    max: Math.max(...finiteValues),
    changes: finiteValues.reduce((count, value, index) => (
      index > 0 && Math.abs(value - finiteValues[index - 1]) > 0.001 ? count + 1 : count
    ), 0),
  }
}

function summarize(samples) {
  const allFrames = samples.frames.filter((value) => Number.isFinite(value) && value >= 0)
  const dragFrames = Array.isArray(samples.dragFrames)
    ? samples.dragFrames.filter((value) => Number.isFinite(value) && value >= 0)
    : []
  const frames = dragFrames.length > 0 ? dragFrames : allFrames
  const startupFrames = []
  let startupDurationMs = 0
  for (const frame of frames) {
    if (startupDurationMs >= 300) {
      break
    }
    startupFrames.push(frame)
    startupDurationMs += frame
  }
  const totalFrameMs = frames.reduce((sum, value) => sum + value, 0)
  const longTaskTotalMs = samples.longTasks.reduce((sum, task) => sum + task.duration, 0)
  const maxLowQualityPlaceholderCount = samples.lowQualityPlaceholderSamples.length
    ? Math.max(...samples.lowQualityPlaceholderSamples)
    : 0
  const maxWorkspaceThumbnailPreviewCount = samples.workspaceThumbnailPreviewSamples.length
    ? Math.max(...samples.workspaceThumbnailPreviewSamples)
    : 0

  return {
    frameCount: frames.length,
    allFrameCount: allFrames.length,
    dragFrameCount: dragFrames.length,
    averageFrameMs: frames.length ? totalFrameMs / frames.length : 0,
    p95FrameMs: percentile(frames, 95),
    maxFrameMs: frames.length ? Math.max(...frames) : 0,
    framesOver16ms: frames.filter((value) => value > 16.7).length,
    framesOver32ms: frames.filter((value) => value > 32).length,
    startupMaxFrameMs: startupFrames.length ? Math.max(...startupFrames) : 0,
    startupFramesOver32ms: startupFrames.filter((value) => value > 32).length,
    longTaskCount: samples.longTasks.length,
    longTaskTotalMs,
    lowQualityPreviewSeen: samples.lowQualityPreviewSamples.some((count) => count > 0),
    maxLowQualityPreviewCount: samples.lowQualityPreviewSamples.length
      ? Math.max(...samples.lowQualityPreviewSamples)
      : 0,
    lowQualityPlaceholdersSeen: maxLowQualityPlaceholderCount > 0,
    maxLowQualityPlaceholderCount,
    workspaceThumbnailPreviewSeen: samples.workspaceThumbnailPreviewSamples.some((count) => count > 0),
    maxWorkspaceThumbnailPreviewCount,
    renderedNodesDuringGesture: summarizeCountSamples(samples.renderedNodeSamples ?? []),
    renderedEdgesDuringGesture: summarizeCountSamples(samples.renderedEdgeSamples ?? []),
    renderedImagesDuringGesture: summarizeCountSamples(samples.renderedImageSamples ?? []),
    viewportZoomDuringGesture: summarizeNumericSamples(samples.viewportZoomSamples ?? []),
  }
}

function evaluateBudget(summary, options = {}) {
  const failures = []
  const averageFrameBudget = options.workspaceMode ? 17.25 : 16.7
  const p95FrameBudget = options.workspaceMode ? 24 : 32

  if (summary.averageFrameMs > averageFrameBudget) {
    failures.push(`average frame ${summary.averageFrameMs.toFixed(2)}ms > ${averageFrameBudget}ms`)
  }
  if (summary.p95FrameMs > p95FrameBudget) {
    failures.push(`p95 frame ${summary.p95FrameMs.toFixed(2)}ms > ${p95FrameBudget}ms`)
  }
  if (summary.longTaskTotalMs > 120) {
    failures.push(`long task total ${summary.longTaskTotalMs.toFixed(2)}ms > 120ms`)
  }
  if (summary.maxLowQualityPlaceholderCount > 0) {
    failures.push(`low-quality placeholders ${summary.maxLowQualityPlaceholderCount} > 0`)
  }

  return {
    passed: failures.length === 0,
    failures,
  }
}

async function startBrowserSampler(page) {
  await page.evaluate(() => {
    window.__AI_CANVAS_RENDER_COUNTS__ = {}
    const state = {
      running: true,
      frames: [],
      longTasks: [],
      lowQualityPreviewSamples: [],
      lowQualityPlaceholderSamples: [],
      workspaceThumbnailPreviewSamples: [],
      renderedNodeSamples: [],
      renderedEdgeSamples: [],
      renderedImageSamples: [],
      viewportZoomSamples: [],
      lastFrameAt: null,
      dragActive: false,
      lastDragFrameAt: null,
      dragFrames: [],
      observer: null,
    }

    try {
      state.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
          })
        }
      })
      state.observer.observe({ entryTypes: ['longtask'] })
    } catch {
      state.observer = null
    }

    const readViewportZoom = () => {
      const viewport = document.querySelector('.react-flow__viewport')
      if (!viewport) {
        return 0
      }

      const transform = window.getComputedStyle(viewport).transform
      if (!transform || transform === 'none') {
        return 1
      }

      try {
        return new DOMMatrixReadOnly(transform).a
      } catch {
        const match = transform.match(/matrix\(([^)]+)\)/)
        if (!match) {
          return 0
        }
        const [scale] = match[1].split(',').map((part) => Number(part.trim()))
        return Number.isFinite(scale) ? scale : 0
      }
    }

    const sampleLowQualityImages = () => {
      state.renderedNodeSamples.push(
        document.querySelectorAll('.react-flow__node').length,
      )
      state.renderedEdgeSamples.push(
        document.querySelectorAll('.react-flow__edge').length,
      )
      state.renderedImageSamples.push(
        document.querySelectorAll('.react-flow__node img').length,
      )
      state.lowQualityPreviewSamples.push(
        document.querySelectorAll('img[data-low-quality-preview="true"]').length,
      )
      state.lowQualityPlaceholderSamples.push(
        document.querySelectorAll('img[data-low-quality-placeholder="true"]').length,
      )
      state.workspaceThumbnailPreviewSamples.push(
        document.querySelectorAll('img[data-workspace-thumbnail-preview="true"]').length,
      )
      if (state.dragActive) {
        state.viewportZoomSamples.push(readViewportZoom())
      }
    }

    const tick = (timestamp) => {
      if (!state.running) {
        return
      }

      if (state.lastFrameAt !== null) {
        state.frames.push(timestamp - state.lastFrameAt)
      }
      state.lastFrameAt = timestamp
      if (state.dragActive) {
        if (state.lastDragFrameAt !== null) {
          state.dragFrames.push(timestamp - state.lastDragFrameAt)
        }
        state.lastDragFrameAt = timestamp
      } else {
        state.lastDragFrameAt = null
      }
      sampleLowQualityImages()
      window.requestAnimationFrame(tick)
    }

    window.__canvasDragPerfMarkDragStart = () => {
      state.dragActive = true
      state.lastDragFrameAt = null
    }

    window.__canvasDragPerfMarkDragStop = () => {
      state.dragActive = false
      state.lastDragFrameAt = null
    }

    window.__canvasDragPerfStop = () => {
      state.running = false
      state.observer?.disconnect()
      sampleLowQualityImages()
      return {
        frames: state.frames,
        dragFrames: state.dragFrames,
        longTasks: state.longTasks,
        lowQualityPreviewSamples: state.lowQualityPreviewSamples,
        lowQualityPlaceholderSamples: state.lowQualityPlaceholderSamples,
        workspaceThumbnailPreviewSamples: state.workspaceThumbnailPreviewSamples,
        renderedNodeSamples: state.renderedNodeSamples,
        renderedEdgeSamples: state.renderedEdgeSamples,
        renderedImageSamples: state.renderedImageSamples,
        viewportZoomSamples: state.viewportZoomSamples,
        renderCounts: { ...(window.__AI_CANVAS_RENDER_COUNTS__ ?? {}) },
      }
    }

    window.requestAnimationFrame(tick)
  })
}

async function stopBrowserSampler(page) {
  return page.evaluate(() => {
    if (typeof window.__canvasDragPerfStop !== 'function') {
      throw new Error('Canvas performance sampler was not started')
    }

    return window.__canvasDragPerfStop()
  })
}

async function collectCanvasDomStats(page, targetNodeId) {
  return page.evaluate((nodeId) => {
    const targetNode = document.querySelector(`[data-testid="node-${nodeId}"]`)
    const renderedNodeTypes = {}
    document.querySelectorAll('.react-flow__node').forEach((node) => {
      const typeClass = Array.from(node.classList).find((className) => className.startsWith('react-flow__node-'))
      const type = typeClass ? typeClass.replace('react-flow__node-', '') : 'unknown'
      renderedNodeTypes[type] = (renderedNodeTypes[type] ?? 0) + 1
    })
    const imageDetails = Array.from(document.querySelectorAll('.react-flow__node img'))
      .slice(0, 24)
      .map((image) => ({
        src: image.getAttribute('src')?.slice(0, 180) ?? '',
        currentSrc: image.currentSrc.slice(0, 180),
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        renderedWidth: image.clientWidth,
        renderedHeight: image.clientHeight,
        lowQualityPreview: image.getAttribute('data-low-quality-preview') === 'true',
        workspaceThumbnailPreview: image.getAttribute('data-workspace-thumbnail-preview') === 'true',
      }))

    return {
      renderedReactFlowNodes: document.querySelectorAll('.react-flow__node').length,
      renderedNodeTypes,
      renderedEdges: document.querySelectorAll('.react-flow__edge').length,
      renderedImages: document.querySelectorAll('.react-flow__node img').length,
      lowQualityImages: document.querySelectorAll('.react-flow__node img[data-low-quality-preview="true"]').length,
      workspaceThumbnailImages: document.querySelectorAll('.react-flow__node img[data-workspace-thumbnail-preview="true"]').length,
      lowQualityPlaceholders: document.querySelectorAll('.react-flow__node img[data-low-quality-placeholder="true"]').length,
      targetRendered: Boolean(targetNode),
      targetImages: targetNode?.querySelectorAll('img').length ?? 0,
      targetLowQualityImages: targetNode?.querySelectorAll('img[data-low-quality-preview="true"]').length ?? 0,
      targetWorkspaceThumbnailImages: targetNode?.querySelectorAll('img[data-workspace-thumbnail-preview="true"]').length ?? 0,
      targetLowQualityPlaceholders: targetNode?.querySelectorAll('img[data-low-quality-placeholder="true"]').length ?? 0,
      imageDetails,
    }
  }, targetNodeId)
}

async function runDragGesture(page, options, targetNodeId) {
  const handle = page.locator(`[data-testid="node-${targetNodeId}"] .node-drag-handle`).first()
  await handle.waitFor({ state: 'visible', timeout: 15_000 })
  const box = await handle.boundingBox()
  if (!box) {
    throw new Error('Unable to locate image node drag handle bounds')
  }

  const startX = box.x + Math.min(box.width - 10, Math.max(10, box.width * 0.5))
  const startY = box.y + Math.min(box.height - 10, Math.max(10, box.height * 0.5))

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.evaluate(() => window.__canvasDragPerfMarkDragStart?.())

  for (let step = 1; step <= options.dragSteps; step += 1) {
    const progress = step / options.dragSteps
    await page.mouse.move(
      startX + options.dragDistance * progress,
      startY + Math.sin(progress * Math.PI) * 32,
    )
    await page.waitForTimeout(8)
  }

  await page.mouse.up()
  await page.evaluate(() => window.__canvasDragPerfMarkDragStop?.())
}

async function runConnectGesture(page, options, targetNodeId) {
  const targetSourceHandle = page.locator(
    `[data-testid="node-${targetNodeId}"] .react-flow__handle.source`,
  ).first()
  const sourceHandles = page.locator('.react-flow__node .react-flow__handle.source')
  const targetIsHitTestable = await targetSourceHandle.evaluate((element, dragDistance) => {
    const rect = element.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const hit = document.elementFromPoint(centerX, centerY)
    const hasHorizontalRoom = centerX + dragDistance < window.innerWidth - 20
      || centerX - dragDistance > 20
    return Boolean(hit && (hit === element || element.contains(hit)) && hasHorizontalRoom)
  }, options.dragDistance).catch(() => false)
  const hitTestableSourceIndex = targetIsHitTestable
    ? -1
    : await sourceHandles.evaluateAll((handles, dragDistance) => handles.findIndex((element) => {
        const rect = element.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const hit = document.elementFromPoint(centerX, centerY)
        const hasHorizontalRoom = centerX + dragDistance < window.innerWidth - 20
          || centerX - dragDistance > 20
        return Boolean(hit && (hit === element || element.contains(hit)) && hasHorizontalRoom)
      }), options.dragDistance)
  const sourceHandle = targetIsHitTestable
    ? targetSourceHandle
    : sourceHandles.nth(hitTestableSourceIndex)
  if (hitTestableSourceIndex < 0 && !targetIsHitTestable) {
    throw new Error('Unable to locate a hit-testable source connection handle in the viewport')
  }
  await sourceHandle.waitFor({ state: 'visible', timeout: 15_000 })
  const box = await sourceHandle.boundingBox()
  if (!box) {
    throw new Error('Unable to locate source connection handle bounds')
  }

  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  const viewportWidth = page.viewportSize()?.width ?? 1440
  const dragDirection = startX + options.dragDistance < viewportWidth - 20 ? 1 : -1

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  for (let step = 1; step <= 4; step += 1) {
    await page.mouse.move(startX + dragDirection * step * 3, startY)
    await page.waitForTimeout(8)
  }
  const sourceHandleClassName = await sourceHandle.getAttribute('class')
  if (!sourceHandleClassName?.split(/\s+/).includes('connectingfrom')) {
    throw new Error(`Source handle did not enter connectingfrom state: ${sourceHandleClassName ?? '(no class)'}`)
  }
  await page.evaluate(() => window.__canvasDragPerfMarkDragStart?.())

  for (let step = 1; step <= options.dragSteps; step += 1) {
    const progress = step / options.dragSteps
    await page.mouse.move(
      startX + dragDirection * options.dragDistance * progress,
      startY + Math.sin(progress * Math.PI) * 48,
    )
    await page.waitForTimeout(8)
  }

  await page.mouse.up()
  await page.evaluate(() => window.__canvasDragPerfMarkDragStop?.())
  await page.keyboard.press('Escape')
}

async function runPanGesture(page, options) {
  const pane = page.locator('.react-flow__pane').first()
  await pane.waitFor({ state: 'visible', timeout: 15_000 })
  const box = await pane.boundingBox()
  if (!box) {
    throw new Error('Unable to locate canvas pane bounds')
  }

  const startX = box.x + Math.max(40, box.width * 0.72)
  const startY = box.y + Math.max(40, box.height * 0.72)

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.evaluate(() => window.__canvasDragPerfMarkDragStart?.())

  for (let step = 1; step <= options.dragSteps; step += 1) {
    const progress = step / options.dragSteps
    await page.mouse.move(
      startX - options.dragDistance * progress,
      startY + Math.sin(progress * Math.PI) * 24,
    )
    await page.waitForTimeout(8)
  }

  await page.mouse.up()
  await page.evaluate(() => window.__canvasDragPerfMarkDragStop?.())
}

async function prepareSelectPanGesture(page, targetNodeId) {
  const pane = page.locator('.react-flow__pane').first()
  await pane.waitFor({ state: 'visible', timeout: 15_000 })
  const box = await pane.boundingBox()
  if (!box) {
    throw new Error('Unable to locate canvas pane bounds')
  }

  await pane.click({
    position: {
      x: Math.min(box.width - 40, Math.max(40, box.width * 0.72)),
      y: Math.min(box.height - 40, Math.max(40, box.height * 0.72)),
    },
    force: true,
  })
  await page.waitForFunction((nodeId) => (
    !document.querySelector(`[data-testid="node-${nodeId}"]`)?.closest('.react-flow__node')?.classList.contains('selected')
  ), targetNodeId, { timeout: 2_000 }).catch(() => undefined)
  await page.waitForTimeout(180)
}

async function runSelectPanGesture(page, options, targetNodeId) {
  const targetNode = page.locator(`[data-testid="node-${targetNodeId}"]`).first()
  const pane = page.locator('.react-flow__pane').first()
  await targetNode.waitFor({ state: 'visible', timeout: 15_000 })
  await pane.waitFor({ state: 'visible', timeout: 15_000 })
  const targetBox = await targetNode.boundingBox()
  const paneBox = await pane.boundingBox()
  if (!targetBox || !paneBox) {
    throw new Error('Unable to locate target node or canvas pane bounds')
  }

  const nodeX = targetBox.x + targetBox.width / 2
  const nodeY = targetBox.y + targetBox.height / 2
  const startX = paneBox.x + Math.max(40, paneBox.width * 0.72)
  const startY = paneBox.y + Math.max(40, paneBox.height * 0.72)

  await page.mouse.move(nodeX, nodeY)
  await page.evaluate(() => window.__canvasDragPerfMarkDragStart?.())
  await page.mouse.down()
  await page.mouse.up()
  await page.mouse.move(startX, startY)
  await page.mouse.down()

  for (let step = 1; step <= options.dragSteps; step += 1) {
    const progress = step / options.dragSteps
    await page.mouse.move(
      startX - options.dragDistance * progress,
      startY + Math.sin(progress * Math.PI) * 24,
    )
    await page.waitForTimeout(8)
  }

  await page.mouse.up()
  await page.evaluate(() => window.__canvasDragPerfMarkDragStop?.())
}

async function getViewportZoom(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('.react-flow__viewport')
    if (!viewport) {
      return 1
    }

    const transform = window.getComputedStyle(viewport).transform
    if (!transform || transform === 'none') {
      return 1
    }

    try {
      return new DOMMatrixReadOnly(transform).a
    } catch {
      const match = transform.match(/matrix\(([^)]+)\)/)
      if (!match) {
        return 1
      }
      const [scale] = match[1].split(',').map((part) => Number(part.trim()))
      return Number.isFinite(scale) ? scale : 1
    }
  })
}

async function moveMouseToPaneCenter(page) {
  const pane = page.locator('.react-flow__pane').first()
  await pane.waitFor({ state: 'visible', timeout: 15_000 })
  const box = await pane.boundingBox()
  if (!box) {
    throw new Error('Unable to locate canvas pane bounds')
  }

  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  await page.mouse.move(centerX, centerY)

  return { centerX, centerY }
}

async function wheelTowardZoom(page, targetZoom, {
  tolerance = 0.018,
  maxIterations = 80,
  delta = 180,
  settleMs = 24,
} = {}) {
  let currentZoom = await getViewportZoom(page)
  for (let iteration = 0; iteration < maxIterations && Math.abs(currentZoom - targetZoom) > tolerance; iteration += 1) {
    await page.mouse.wheel(0, currentZoom > targetZoom ? delta : -delta)
    await page.waitForTimeout(settleMs)
    currentZoom = await getViewportZoom(page)
  }

  return currentZoom
}

async function prepareZoomGesture(page, options) {
  await moveMouseToPaneCenter(page)
  await wheelTowardZoom(page, options.zoomFrom, { tolerance: 0.02, maxIterations: 90, delta: 150 })
  await page.waitForTimeout(160)
}

async function runZoomGesture(page, options) {
  await moveMouseToPaneCenter(page)
  const startZoom = await getViewportZoom(page)
  const zoomDistance = Math.max(0.01, Math.abs(startZoom - options.zoomTo))
  const wheelDirection = startZoom > options.zoomTo ? 1 : -1
  const targetRatio = Math.max(0.01, options.zoomTo) / Math.max(0.01, startZoom)
  const wheelDelta = Math.max(
    12,
    Math.min(48, Math.round(Math.abs(Math.log2(targetRatio)) / Math.max(1, options.zoomSteps) / 0.002)),
  )

  await page.evaluate(() => window.__canvasDragPerfMarkDragStart?.())

  for (let step = 1; step <= options.zoomSteps; step += 1) {
    await page.mouse.wheel(0, wheelDirection * wheelDelta)
    await page.waitForTimeout(16)
    const currentZoom = await getViewportZoom(page)
    if (
      (wheelDirection > 0 && currentZoom <= options.zoomTo)
      || (wheelDirection < 0 && currentZoom >= options.zoomTo)
    ) {
      break
    }
  }

  await page.evaluate(() => window.__canvasDragPerfMarkDragStop?.())
}

function getAssetContentType(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

async function routeWorkspaceAssets(context, workspaceDir) {
  await context.route(`**${ASSET_ROUTE_PREFIX}**`, async (route) => {
    try {
      const requestUrl = new URL(route.request().url())
      const relativePath = decodeURIComponent(requestUrl.pathname.slice(ASSET_ROUTE_PREFIX.length))
      const filePath = getWorkspaceAssetFilePath(workspaceDir, relativePath)

      if (!existsSync(filePath)) {
        await route.fulfill({ status: 404, body: `Missing asset: ${relativePath}` })
        return
      }

      await route.fulfill({
        path: filePath,
        contentType: getAssetContentType(filePath),
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      })
    } catch (error) {
      await route.fulfill({
        status: 500,
        body: error instanceof Error ? error.message : String(error),
      })
    }
  })
}

function writeReport(report) {
  mkdirSync(REPORT_DIR, { recursive: true })
  const fileName = `canvas-drag-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const filePath = resolve(REPORT_DIR, fileName)
  writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return filePath
}

function median(values) {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function aggregateRenderCounts(runs) {
  const names = new Set()
  for (const run of runs) {
    for (const name of Object.keys(run.samples?.renderCounts ?? {})) {
      names.add(name)
    }
  }

  return Object.fromEntries(
    [...names]
      .sort()
      .map((name) => [
        name,
        median(runs.map((run) => run.samples?.renderCounts?.[name] ?? 0)),
      ]),
  )
}

function aggregateCountSummary(runs, key) {
  const summaries = runs.map((run) => run.summary?.[key] ?? {})

  return {
    min: median(summaries.map((summary) => summary.min ?? 0)),
    median: median(summaries.map((summary) => summary.median ?? 0)),
    max: median(summaries.map((summary) => summary.max ?? 0)),
    changes: median(summaries.map((summary) => summary.changes ?? 0)),
  }
}

function aggregateRuns(runs) {
  const summaries = runs.map((run) => run.summary)
  const performanceDeltas = runs.map((run) => run.performanceDelta ?? {})
  const traceSummaries = runs.map((run) => run.traceSummary ?? {})
  const bestRun = [...runs].sort((left, right) => left.summary.averageFrameMs - right.summary.averageFrameMs)[0] ?? null
  const worstRun = [...runs].sort((left, right) => right.summary.averageFrameMs - left.summary.averageFrameMs)[0] ?? null

  return {
    runCount: runs.length,
    median: {
      averageFrameMs: median(summaries.map((summary) => summary.averageFrameMs)),
      p95FrameMs: median(summaries.map((summary) => summary.p95FrameMs)),
      maxFrameMs: median(summaries.map((summary) => summary.maxFrameMs)),
      framesOver16ms: median(summaries.map((summary) => summary.framesOver16ms)),
      framesOver32ms: median(summaries.map((summary) => summary.framesOver32ms)),
      startupMaxFrameMs: median(summaries.map((summary) => summary.startupMaxFrameMs)),
      startupFramesOver32ms: median(summaries.map((summary) => summary.startupFramesOver32ms)),
      longTaskTotalMs: median(summaries.map((summary) => summary.longTaskTotalMs)),
      maxLowQualityPlaceholderCount: Math.max(...summaries.map((summary) => summary.maxLowQualityPlaceholderCount)),
      maxWorkspaceThumbnailPreviewCount: Math.max(...summaries.map((summary) => summary.maxWorkspaceThumbnailPreviewCount)),
      renderedNodesDuringGesture: aggregateCountSummary(runs, 'renderedNodesDuringGesture'),
      renderedEdgesDuringGesture: aggregateCountSummary(runs, 'renderedEdgesDuringGesture'),
      renderedImagesDuringGesture: aggregateCountSummary(runs, 'renderedImagesDuringGesture'),
      viewportZoomDuringGesture: aggregateCountSummary(runs, 'viewportZoomDuringGesture'),
    },
    performanceDelta: {
      scriptDurationMs: median(performanceDeltas.map((delta) => delta.scriptDurationMs ?? 0)),
      layoutDurationMs: median(performanceDeltas.map((delta) => delta.layoutDurationMs ?? 0)),
      recalcStyleDurationMs: median(performanceDeltas.map((delta) => delta.recalcStyleDurationMs ?? 0)),
      taskDurationMs: median(performanceDeltas.map((delta) => delta.taskDurationMs ?? 0)),
      jsHeapUsedDeltaMB: median(performanceDeltas.map((delta) => delta.jsHeapUsedDeltaMB ?? 0)),
    },
    traceSummary: {
      mainThreadTaskTotalMs: median(traceSummaries.map((summary) => summary.mainThreadTaskTotalMs ?? 0)),
      maxMainThreadTaskMs: median(traceSummaries.map((summary) => summary.maxMainThreadTaskMs ?? 0)),
      tasksOver16Ms: median(traceSummaries.map((summary) => summary.tasksOver16Ms ?? 0)),
      tasksOver50Ms: median(traceSummaries.map((summary) => summary.tasksOver50Ms ?? 0)),
      scriptingMs: median(traceSummaries.map((summary) => summary.scriptingMs ?? 0)),
      renderingMs: median(traceSummaries.map((summary) => summary.renderingMs ?? 0)),
      paintingMs: median(traceSummaries.map((summary) => summary.paintingMs ?? 0)),
      eventCount: median(traceSummaries.map((summary) => summary.eventCount ?? 0)),
      mainThreadEventCount: median(traceSummaries.map((summary) => summary.mainThreadEventCount ?? 0)),
      mainThreadThreadCount: median(traceSummaries.map((summary) => summary.mainThreadThreadCount ?? 0)),
    },
    renderCounts: aggregateRenderCounts(runs),
    best: bestRun ? { runIndex: bestRun.runIndex, summary: bestRun.summary } : null,
    worst: worstRun ? { runIndex: worstRun.runIndex, summary: worstRun.summary } : null,
  }
}

function normalizePerformanceMetrics(metrics) {
  const metricByName = new Map(metrics.map((metric) => [metric.name, metric.value]))
  return {
    scriptDurationMs: (metricByName.get('ScriptDuration') ?? 0) * 1000,
    layoutDurationMs: (metricByName.get('LayoutDuration') ?? 0) * 1000,
    recalcStyleDurationMs: (metricByName.get('RecalcStyleDuration') ?? 0) * 1000,
    taskDurationMs: (metricByName.get('TaskDuration') ?? 0) * 1000,
    jsHeapUsedMB: (metricByName.get('JSHeapUsedSize') ?? 0) / 1024 / 1024,
  }
}

async function collectPerformanceMetrics(cdpSession) {
  const response = await cdpSession.send('Performance.getMetrics')
  return normalizePerformanceMetrics(response.metrics ?? [])
}

function diffPerformanceMetrics(before, after) {
  return {
    scriptDurationMs: Number((after.scriptDurationMs - before.scriptDurationMs).toFixed(2)),
    layoutDurationMs: Number((after.layoutDurationMs - before.layoutDurationMs).toFixed(2)),
    recalcStyleDurationMs: Number((after.recalcStyleDurationMs - before.recalcStyleDurationMs).toFixed(2)),
    taskDurationMs: Number((after.taskDurationMs - before.taskDurationMs).toFixed(2)),
    jsHeapUsedDeltaMB: Number((after.jsHeapUsedMB - before.jsHeapUsedMB).toFixed(2)),
  }
}

async function readProtocolStream(cdpSession, handle) {
  let content = ''
  let eof = false

  while (!eof) {
    const chunk = await cdpSession.send('IO.read', { handle })
    content += chunk.data ?? ''
    eof = Boolean(chunk.eof)
  }

  await cdpSession.send('IO.close', { handle }).catch(() => undefined)
  return content
}

async function startTrace(cdpSession) {
  await cdpSession.send('Tracing.start', {
    categories: TRACE_CATEGORIES,
    transferMode: 'ReturnAsStream',
  })
}

async function stopTrace(cdpSession) {
  const tracingComplete = new Promise((resolveComplete) => {
    cdpSession.once('Tracing.tracingComplete', resolveComplete)
  })

  await cdpSession.send('Tracing.end')
  const event = await tracingComplete
  const stream = event?.stream

  if (!stream) {
    return {
      available: false,
      error: 'Chrome trace did not return a stream',
    }
  }

  const traceContent = await readProtocolStream(cdpSession, stream)
  const trace = JSON.parse(traceContent)
  return summarizeTraceEvents(Array.isArray(trace) ? trace : trace.traceEvents ?? [])
}

function createEmptyTraceSummary(extra = {}) {
  return {
    available: false,
    eventCount: 0,
    mainThreadEventCount: 0,
    mainThreadThreadCount: 0,
    mainThreadTaskTotalMs: 0,
    maxMainThreadTaskMs: 0,
    tasksOver16Ms: 0,
    tasksOver50Ms: 0,
    scriptingMs: 0,
    renderingMs: 0,
    paintingMs: 0,
    topMainThreadTasks: [],
    ...extra,
  }
}

function traceDurationMs(event) {
  return typeof event.dur === 'number' ? event.dur / 1000 : 0
}

function getTraceThreadKey(event) {
  return `${event.pid ?? ''}:${event.tid ?? ''}`
}

function getRendererMainThreadKeys(events) {
  const mainThreadKeys = new Set()

  for (const event of events) {
    if (event?.ph !== 'M' || event.name !== 'thread_name') {
      continue
    }

    const threadName = String(event.args?.name ?? '')
    if (threadName === 'CrRendererMain' || threadName === 'RendererMain') {
      mainThreadKeys.add(getTraceThreadKey(event))
    }
  }

  return mainThreadKeys
}

function summarizeTraceEvents(events) {
  const mainThreadKeys = getRendererMainThreadKeys(events)
  const summary = createEmptyTraceSummary({
    available: true,
    eventCount: events.length,
    mainThreadThreadCount: mainThreadKeys.size,
  })
  const topTasks = []

  for (const event of events) {
    if (!event || event.ph !== 'X') {
      continue
    }
    if (mainThreadKeys.size > 0 && !mainThreadKeys.has(getTraceThreadKey(event))) {
      continue
    }

    const durationMs = traceDurationMs(event)
    if (durationMs <= 0) {
      continue
    }

    summary.mainThreadEventCount += 1

    if (event.name === 'RunTask') {
      summary.mainThreadTaskTotalMs += durationMs
      summary.maxMainThreadTaskMs = Math.max(summary.maxMainThreadTaskMs, durationMs)
      if (durationMs > 16.7) {
        summary.tasksOver16Ms += 1
      }
      if (durationMs > 50) {
        summary.tasksOver50Ms += 1
      }
      topTasks.push({
        startTimeMs: Number(((event.ts ?? 0) / 1000).toFixed(2)),
        durationMs: Number(durationMs.toFixed(2)),
      })
    }

    if (TRACE_SCRIPT_EVENT_NAMES.has(event.name)) {
      summary.scriptingMs += durationMs
    } else if (TRACE_RENDER_EVENT_NAMES.has(event.name)) {
      summary.renderingMs += durationMs
    } else if (TRACE_PAINT_EVENT_NAMES.has(event.name)) {
      summary.paintingMs += durationMs
    }
  }

  summary.mainThreadTaskTotalMs = Number(summary.mainThreadTaskTotalMs.toFixed(2))
  summary.maxMainThreadTaskMs = Number(summary.maxMainThreadTaskMs.toFixed(2))
  summary.scriptingMs = Number(summary.scriptingMs.toFixed(2))
  summary.renderingMs = Number(summary.renderingMs.toFixed(2))
  summary.paintingMs = Number(summary.paintingMs.toFixed(2))
  summary.topMainThreadTasks = topTasks
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 8)

  return summary
}

async function runSingleSample(context, baseUrl, options, workspaceScenario, targetNodeId, runIndex) {
  const page = await context.newPage()
  const browserDiagnostics = []
  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type())) {
      return
    }

    browserDiagnostics.push(`${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    browserDiagnostics.push(`pageerror: ${error.message}`)
  })
  const cdpSession = await context.newCDPSession(page)
  await cdpSession.send('Performance.enable')
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  try {
    await page.locator('.react-flow__pane').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.react-flow__node').first().waitFor({ state: 'visible', timeout: 15_000 })
    if (options.gesture === 'drag' || options.gesture === 'select-pan') {
      await page.locator(`[data-testid="node-${targetNodeId}"]`).waitFor({ state: 'visible', timeout: 15_000 })
    } else if (options.gesture === 'connect') {
      await page.locator('.react-flow__node .react-flow__handle.source').first().waitFor({ state: 'visible', timeout: 15_000 })
    } else {
      await page.locator(`[data-testid="node-${targetNodeId}"]`).waitFor({ state: 'visible', timeout: 2_000 }).catch(() => undefined)
    }
  } catch (error) {
    const pageText = await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '')
    throw new Error([
      error instanceof Error ? error.message : String(error),
      pageText ? `Page text: ${pageText.slice(0, 800)}` : '',
      browserDiagnostics.length ? `Browser diagnostics:\n${browserDiagnostics.slice(-12).join('\n')}` : '',
    ].filter(Boolean).join('\n\n'))
  }
  await page.waitForTimeout(500)

  const thumbnailReady = await page.waitForFunction(
    () => (
      document.querySelectorAll('img[data-low-quality-preview="true"]').length > 0
      || document.querySelectorAll('img[data-workspace-thumbnail-preview="true"]').length > 0
    ),
    null,
    { timeout: THUMBNAIL_READY_TIMEOUT_MS },
  ).then(() => true).catch(() => false)
  const domBeforeDrag = await collectCanvasDomStats(page, targetNodeId)

  if (options.gesture === 'zoom') {
    await prepareZoomGesture(page, options)
  } else if (options.gesture === 'select-pan') {
    await prepareSelectPanGesture(page, targetNodeId)
  }

  const performanceBeforeDrag = await collectPerformanceMetrics(cdpSession)
  let traceSummary = createEmptyTraceSummary()
  let traceStarted = false
  try {
    await startTrace(cdpSession)
    traceStarted = true
  } catch (error) {
    traceSummary = createEmptyTraceSummary({
      error: error instanceof Error ? error.message : String(error),
    })
  }
  await startBrowserSampler(page)
  if (options.gesture === 'pan') {
    await runPanGesture(page, options)
  } else if (options.gesture === 'connect') {
    await runConnectGesture(page, options, targetNodeId)
  } else if (options.gesture === 'select-pan') {
    await runSelectPanGesture(page, options, targetNodeId)
  } else if (options.gesture === 'zoom') {
    await runZoomGesture(page, options)
  } else {
    await runDragGesture(page, options, targetNodeId)
  }
  await page.waitForTimeout(240)
  const samples = await stopBrowserSampler(page)
  if (traceStarted) {
    try {
      traceSummary = await stopTrace(cdpSession)
    } catch (error) {
      traceSummary = createEmptyTraceSummary({
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const performanceAfterDrag = await collectPerformanceMetrics(cdpSession)
  const domAfterDrag = await collectCanvasDomStats(page, targetNodeId)
  const summary = summarize(samples)
  const budget = evaluateBudget(summary, { workspaceMode: Boolean(workspaceScenario) })
  const performanceDelta = diffPerformanceMetrics(performanceBeforeDrag, performanceAfterDrag)

  await cdpSession.detach()
  await page.close()

  return {
    runIndex,
    environment: {
      thumbnailReadyBeforeDrag: thumbnailReady,
      browserDiagnostics,
    },
    dom: {
      beforeDrag: domBeforeDrag,
      afterDrag: domAfterDrag,
    },
    summary,
    performanceDelta,
    traceSummary,
    budget,
    samples,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const { chromium } = await loadPlaywright()
  const port = await getFreePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const workspaceScenario = loadWorkspaceScenario(options)
  const server = startDevServer(port, options.serverMode)
  let browser = null

  try {
    await waitForServer(baseUrl, server.getOutput)

    try {
      browser = await chromium.launch({ headless: !options.headed })
    } catch (error) {
      throw new Error(getBrowserLaunchError(error))
    }
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 1,
    })
    if (workspaceScenario) {
      await routeWorkspaceAssets(context, workspaceScenario.workspaceDir)
    }
    const workspace = workspaceScenario?.workspace ?? createPerformanceWorkspace(options)
    const targetNodeId = options.nodeId || workspaceScenario?.defaultDragNodeId || 'perf-img-1'

    await context.addInitScript(({ storageKey, workspaceData, enableInternalDrag, forceCulling, canvasPerformanceMode }) => {
      window.localStorage.clear()
      window.localStorage.setItem(storageKey, JSON.stringify(workspaceData))
      if (canvasPerformanceMode === 'quality' || canvasPerformanceMode === 'performance') {
        window.localStorage.setItem('ai-canvas-settings', JSON.stringify({
          state: {
            config: {
              storage: {
                canvasPerformanceMode,
              },
            },
          },
        }))
      }
      if (enableInternalDrag) {
        window.localStorage.setItem('ai-canvas.enableInternalDrag', '1')
      }
      if (forceCulling === 'on' || forceCulling === 'off') {
        window.localStorage.setItem('ai-canvas.visibleElementCulling', forceCulling)
      }
    }, {
      storageKey: LEGACY_PROJECT_STORAGE_KEY,
      workspaceData: workspace,
      enableInternalDrag: options.enableInternalDrag,
      forceCulling: options.forceCulling,
      canvasPerformanceMode: options.canvasPerformanceMode,
    })

    const runs = []
    for (let runIndex = 1; runIndex <= options.runs; runIndex += 1) {
      runs.push(await runSingleSample(context, baseUrl, options, workspaceScenario, targetNodeId, runIndex))
    }
    const aggregate = aggregateRuns(runs)
    const summary = aggregate.median
    const budget = evaluateBudget(summary, { workspaceMode: Boolean(workspaceScenario) })
    const domBeforeDrag = runs[0]?.dom.beforeDrag ?? null
    const report = {
      scenario: {
        mode: workspaceScenario ? 'workspace' : 'synthetic',
        workspaceDir: workspaceScenario?.workspaceDir ?? null,
        projectPath: workspaceScenario?.projectPath ?? null,
        projectId: workspaceScenario?.project.id ?? null,
        projectName: workspaceScenario?.project.name ?? null,
        targetNodeId,
        imageCount: options.imageCount,
        imageWidth: options.imageWidth,
        imageHeight: options.imageHeight,
        dragDistance: options.dragDistance,
        dragSteps: options.dragSteps,
        zoomFrom: options.zoomFrom,
        zoomTo: options.zoomTo,
        zoomSteps: options.zoomSteps,
        runs: options.runs,
        gesture: options.gesture,
        forceCulling: options.forceCulling,
        canvasPerformanceMode: options.canvasPerformanceMode || null,
        serverMode: options.serverMode,
        internalDrag: options.enableInternalDrag,
        enableInternalDrag: options.enableInternalDrag,
        headed: options.headed,
        enforce: options.enforce,
      },
      environment: {
        nodeVersion: process.version,
        url: baseUrl,
        serverMode: options.serverMode,
      },
      dom: runs[0]?.dom ?? null,
      workspace: workspaceScenario
        ? {
            nodeCount: workspaceScenario.project.workingSnapshot.canvas.nodes.length,
            edgeCount: workspaceScenario.project.workingSnapshot.canvas.edges.length,
            assetRefCount: workspaceScenario.assetStats.length,
            assetThumbnailRefCount: workspaceScenario.assetStats.filter((asset) => asset.hasThumbnail).length,
            totalAssetMB: Number((workspaceScenario.assetStats.reduce((sum, asset) => sum + asset.sizeBytes, 0) / 1024 / 1024).toFixed(2)),
            totalThumbnailMB: Number((workspaceScenario.assetStats.reduce((sum, asset) => sum + asset.thumbnailSizeBytes, 0) / 1024 / 1024).toFixed(2)),
            topAssets: [...workspaceScenario.assetStats]
              .sort((left, right) => right.sizeBytes - left.sizeBytes)
              .slice(0, 12)
              .map((asset) => ({
                ...asset,
                sizeMB: Number((asset.sizeBytes / 1024 / 1024).toFixed(2)),
                thumbnailSizeMB: Number((asset.thumbnailSizeBytes / 1024 / 1024).toFixed(2)),
              })),
          }
        : null,
      summary,
      aggregate,
      budget,
      runs,
    }
    const reportPath = writeReport(report)

    console.log('Canvas drag performance summary')
    console.log(`  report: ${reportPath}`)
    console.log(`  mode: ${workspaceScenario ? 'workspace' : 'synthetic'}`)
    console.log(`  target node: ${targetNodeId}`)
    console.log(`  gesture: ${options.gesture}`)
    console.log(`  server mode: ${options.serverMode}`)
    console.log(`  canvas performance mode: ${options.canvasPerformanceMode || 'default'}`)
    console.log(`  visible-element culling: ${options.forceCulling}`)
    console.log(`  internal drag: ${options.enableInternalDrag ? 'on' : 'off'}`)
    if (workspaceScenario) {
      console.log(`  project: ${workspaceScenario.project.name} (${workspaceScenario.project.id})`)
      console.log(`  nodes/assets: ${workspaceScenario.project.workingSnapshot.canvas.nodes.length} nodes, ${workspaceScenario.assetStats.length} image asset refs, ${workspaceScenario.assetStats.filter((asset) => asset.hasThumbnail).length} thumbnail refs`)
      if (domBeforeDrag) {
        console.log(`  rendered DOM: ${domBeforeDrag.renderedReactFlowNodes} nodes, ${domBeforeDrag.renderedImages} images, ${domBeforeDrag.workspaceThumbnailImages} workspace thumbnail hits`)
        console.log(`  viewport node types: ${JSON.stringify(domBeforeDrag.renderedNodeTypes)}`)
      }
    }
    console.log(`  runs: ${options.runs}`)
    console.log(`  median average frame: ${summary.averageFrameMs.toFixed(2)}ms`)
    console.log(`  median p95 frame: ${summary.p95FrameMs.toFixed(2)}ms`)
    console.log(`  median max frame: ${summary.maxFrameMs.toFixed(2)}ms`)
    console.log(`  median frames >16.7ms: ${summary.framesOver16ms}`)
    console.log(`  median frames >32ms: ${summary.framesOver32ms}`)
    console.log(`  first 300ms max frame / frames >32ms: ${summary.startupMaxFrameMs.toFixed(2)}ms / ${summary.startupFramesOver32ms}`)
    console.log(`  median long task total: ${summary.longTaskTotalMs.toFixed(2)}ms`)
    console.log(`  median Chrome task/script/layout/style: ${aggregate.performanceDelta.taskDurationMs.toFixed(2)}ms / ${aggregate.performanceDelta.scriptDurationMs.toFixed(2)}ms / ${aggregate.performanceDelta.layoutDurationMs.toFixed(2)}ms / ${aggregate.performanceDelta.recalcStyleDurationMs.toFixed(2)}ms`)
    console.log(`  median trace renderer main threads/events: ${aggregate.traceSummary.mainThreadThreadCount} / ${aggregate.traceSummary.mainThreadEventCount}`)
    console.log(`  median trace main-thread total/max/>16/>50: ${aggregate.traceSummary.mainThreadTaskTotalMs.toFixed(2)}ms / ${aggregate.traceSummary.maxMainThreadTaskMs.toFixed(2)}ms / ${aggregate.traceSummary.tasksOver16Ms} / ${aggregate.traceSummary.tasksOver50Ms}`)
    console.log(`  median trace script/render/paint: ${aggregate.traceSummary.scriptingMs.toFixed(2)}ms / ${aggregate.traceSummary.renderingMs.toFixed(2)}ms / ${aggregate.traceSummary.paintingMs.toFixed(2)}ms`)
    console.log(`  rendered nodes during gesture: min ${summary.renderedNodesDuringGesture.min}, median ${summary.renderedNodesDuringGesture.median}, max ${summary.renderedNodesDuringGesture.max}, changes ${summary.renderedNodesDuringGesture.changes}`)
    console.log(`  rendered images during gesture: min ${summary.renderedImagesDuringGesture.min}, median ${summary.renderedImagesDuringGesture.median}, max ${summary.renderedImagesDuringGesture.max}, changes ${summary.renderedImagesDuringGesture.changes}`)
    if (options.gesture === 'zoom') {
      console.log(`  viewport zoom during gesture: min ${summary.viewportZoomDuringGesture.min.toFixed(3)}, median ${summary.viewportZoomDuringGesture.median.toFixed(3)}, max ${summary.viewportZoomDuringGesture.max.toFixed(3)}, changes ${summary.viewportZoomDuringGesture.changes}`)
    }
    if (Object.keys(aggregate.renderCounts).length > 0) {
      console.log(`  median render counts: ${JSON.stringify(aggregate.renderCounts)}`)
    }
    console.log(`  max low-quality placeholders: ${summary.maxLowQualityPlaceholderCount}`)
    console.log(`  max workspace thumbnail hits: ${summary.maxWorkspaceThumbnailPreviewCount}`)
    if (aggregate.best && aggregate.worst) {
      console.log(`  best run: #${aggregate.best.runIndex} avg ${aggregate.best.summary.averageFrameMs.toFixed(2)}ms, p95 ${aggregate.best.summary.p95FrameMs.toFixed(2)}ms`)
      console.log(`  worst run: #${aggregate.worst.runIndex} avg ${aggregate.worst.summary.averageFrameMs.toFixed(2)}ms, p95 ${aggregate.worst.summary.p95FrameMs.toFixed(2)}ms`)
    }

    if (!budget.passed) {
      console.log(`  budget: ${options.enforce ? 'failed' : 'missed (measurement-only)'}`)
      for (const failure of budget.failures) {
        console.log(`   - ${failure}`)
      }

      if (options.enforce) {
        process.exitCode = 1
      }
    } else {
      console.log('  budget: passed')
    }
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
