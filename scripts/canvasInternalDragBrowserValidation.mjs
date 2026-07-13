import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const LEGACY_PROJECT_STORAGE_KEY = 'ai-canvas-projects'
const LEGACY_SETTINGS_STORAGE_KEY = 'ai-canvas-settings'
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
      'Playwright is required for internal drag browser validation.',
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

function createSvgDataUrl(index, width = 1200, height = 900) {
  const hue = (index * 61) % 360
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="hsl(${hue} 70% 45%)"/>`,
    `<circle cx="${width * 0.72}" cy="${height * 0.34}" r="${Math.min(width, height) * 0.18}" fill="white" opacity="0.22"/>`,
    `<text x="${width * 0.08}" y="${height * 0.18}" font-family="Arial" font-size="${Math.round(width * 0.06)}" font-weight="700" fill="white">Drag ${index}</text>`,
    '</svg>',
  ].join('')

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function makeImageNode(id, position, index, selected = false) {
  return {
    id,
    type: 'imageNode',
    dragHandle: '.node-drag-handle',
    position,
    width: 260,
    height: 220,
    selected,
    data: {
      prompt: '',
      negativePrompt: '',
      imageUrl: createSvgDataUrl(index),
      imageAsset: null,
      name: id,
      imageNaturalWidth: 1200,
      imageNaturalHeight: 900,
      status: 'idle',
      errorMsg: '',
      ratio: '4:3',
      model: 'qwen-image-2.0-pro',
      referenceImageUrl: null,
    },
  }
}

function makeGroupNode(id, position, width, height, selected = false) {
  return {
    id,
    type: 'groupNode',
    position,
    width,
    height,
    selected,
    data: {
      label: 'Drag Validation Group',
      color: 'violet',
    },
  }
}

function makeWorkspace(nodes) {
  const now = Date.now()
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
        id: 'internal-drag-validation',
        name: 'Internal Drag Validation',
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        savedSnapshot: snapshot,
        workingSnapshot: snapshot,
      },
    ],
    activeProjectId: 'internal-drag-validation',
    lastOpenedProjectId: 'internal-drag-validation',
  }
}

function makeSettings({ performanceMode }) {
  return {
    state: {
      config: {
        storage: {
          autosaveIntervalMs: 60000,
          canvasPerformanceMode: performanceMode ? 'performance' : 'quality',
          alignmentGuidesEnabled: false,
          themeMode: 'dark',
          edgeStyle: 'solid',
          lowQualityPreviewEnabled: false,
        },
      },
    },
  }
}

async function openSeededPage(context, baseUrl, {
  nodes,
  performanceMode = true,
  enableInternalDrag = false,
}) {
  const page = await context.newPage()
  await page.addInitScript(({
    workspace,
    settings,
    enableInternalDrag: shouldEnableInternalDrag,
    projectStorageKey,
    settingsStorageKey,
  }) => {
    window.localStorage.clear()
    window.localStorage.setItem(projectStorageKey, JSON.stringify(workspace))
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings))
    if (shouldEnableInternalDrag) {
      window.localStorage.setItem('ai-canvas.enableInternalDrag', '1')
    }
  }, {
    workspace: makeWorkspace(nodes),
    settings: makeSettings({ performanceMode }),
    enableInternalDrag,
    projectStorageKey: LEGACY_PROJECT_STORAGE_KEY,
    settingsStorageKey: LEGACY_SETTINGS_STORAGE_KEY,
  })
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.locator('[data-testid^="node-"]').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(300)
  return page
}

async function startRenderCounter(page) {
  await page.evaluate(() => {
    window.__AI_CANVAS_RENDER_COUNTS__ = {}
  })
}

async function getRenderCounts(page) {
  return page.evaluate(() => ({ ...(window.__AI_CANVAS_RENDER_COUNTS__ ?? {}) }))
}

async function getNodeRect(page, nodeId) {
  return page.locator(`[data-testid="node-${nodeId}"]`).boundingBox()
}

async function getPersistenceStatusState(page) {
  return page.locator('[data-testid="project-persistence-status"]').evaluate((element) => ({
    kind: element.getAttribute('data-status-kind') ?? '',
    hasUnsavedChanges: element.getAttribute('data-has-unsaved-changes') === 'true',
    hasPersistedChanges: element.getAttribute('data-has-persisted-changes') === 'true',
  }))
}

async function getStoredNodePosition(page, nodeId) {
  return page.evaluate(({ storageKey, id }) => {
    const raw = window.localStorage.getItem(storageKey)
    const parsed = raw ? JSON.parse(raw) : null
    const state = parsed && typeof parsed === 'object' && 'state' in parsed ? parsed.state : parsed
    const activeProjectId = state?.activeProjectId ?? state?.lastOpenedProjectId
    const project = state?.projects?.find((item) => item.id === activeProjectId) ?? state?.projects?.[0]
    const node = project?.workingSnapshot?.canvas?.nodes?.find((item) => item.id === id)

    return node?.position ?? null
  }, {
    storageKey: LEGACY_PROJECT_STORAGE_KEY,
    id: nodeId,
  })
}

async function waitForPersistenceState(page, label) {
  await page.waitForFunction(
    ({ expectedLabel }) => {
      const element = document.querySelector('[data-testid="project-persistence-status"]')
      if (!element) {
        return false
      }

      const state = {
        kind: element.getAttribute('data-status-kind') ?? '',
        hasUnsavedChanges: element.getAttribute('data-has-unsaved-changes') === 'true',
        hasPersistedChanges: element.getAttribute('data-has-persisted-changes') === 'true',
      }

      return window.__aiCanvasValidationPredicate?.(state, expectedLabel) ?? false
    },
    { expectedLabel: label },
    { timeout: 5_000 },
  )
}

async function installPersistencePredicate(page, predicateSource) {
  await page.evaluate((source) => {
    window.__aiCanvasValidationPredicate = new Function('state', 'label', `return (${source})(state, label)`)
  }, predicateSource)
}

async function getSelectedNodeIds(page) {
  return page.evaluate(() => (
    Array.from(document.querySelectorAll('.react-flow__node.selected [data-testid^="node-"]'))
      .map((element) => element.getAttribute('data-testid')?.replace(/^node-/, '') ?? '')
      .filter(Boolean)
  ))
}

async function clickNode(page, nodeId, options = {}) {
  await page.locator(`[data-testid="node-${nodeId}"]`).click({
    position: { x: 20, y: 20 },
    ...options,
  })
  await page.waitForTimeout(80)
}

async function selectMultipleNodes(page, nodeIds) {
  assert(nodeIds.length > 1, 'selectMultipleNodes requires at least two nodes')

  for (const modifier of ['Shift', 'Control', 'Meta']) {
    await clickNode(page, nodeIds[0])
    for (const nodeId of nodeIds.slice(1)) {
      await clickNode(page, nodeId, { modifiers: [modifier] })
    }

    const selectedNodeIds = await getSelectedNodeIds(page)
    if (nodeIds.every((nodeId) => selectedNodeIds.includes(nodeId))) {
      return { modifier, selectedNodeIds }
    }
  }

  const selectedNodeIds = await getSelectedNodeIds(page)
  throw new Error(`Unable to select nodes ${nodeIds.join(', ')} together; selected=${selectedNodeIds.join(', ')}`)
}

async function dragNode(page, nodeId, { dx = 180, dy = 24, steps = 36 } = {}) {
  const handle = page.locator(`[data-testid="node-${nodeId}"] .node-drag-handle`).first()
  await handle.waitFor({ state: 'visible', timeout: 15_000 })
  const box = await handle.boundingBox()
  assert(box, `Unable to locate drag handle for ${nodeId}`)

  const startX = box.x + Math.min(box.width - 8, Math.max(8, box.width * 0.5))
  const startY = box.y + Math.min(box.height - 8, Math.max(8, box.height * 0.5))

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps
    await page.mouse.move(startX + dx * progress, startY + dy * progress)
    await page.waitForTimeout(4)
  }
  await page.mouse.up()
  await page.waitForTimeout(180)
}

async function dragGroupWhileHeld(page, groupId, memberId, { dx = 180, dy = 40, steps = 24 } = {}) {
  const group = page.locator(`[data-testid="node-${groupId}"]`)
  await group.waitFor({ state: 'visible', timeout: 15_000 })
  const groupBefore = await group.boundingBox()
  const memberBefore = await getNodeRect(page, memberId)
  assert(groupBefore && memberBefore, 'Expected group and member bounds before drag')

  const startX = groupBefore.x + groupBefore.width - 28
  const startY = groupBefore.y + groupBefore.height - 28
  await page.mouse.move(startX, startY)
  await page.mouse.down()

  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps
    await page.mouse.move(startX + dx * progress, startY + dy * progress)
    await page.waitForTimeout(6)
  }

  await page.evaluate(() => new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
  }))

  const groupWhileHeld = await getNodeRect(page, groupId)
  const memberWhileHeld = await getNodeRect(page, memberId)
  const toolbarWhileHeld = await page.getByRole('toolbar', { name: '所选节点操作' }).boundingBox()
  const groupHeldDelta = getMovedDelta(groupBefore, groupWhileHeld)
  const memberHeldDelta = getMovedDelta(memberBefore, memberWhileHeld)

  assert(groupWhileHeld && toolbarWhileHeld, 'Expected group toolbar bounds while pointer is held')
  assert(groupHeldDelta.x > 100, `Group should move before pointer release, got dx=${groupHeldDelta.x}`)
  assert(memberHeldDelta.x > 100, `Group member should move before pointer release, got dx=${memberHeldDelta.x}`)
  assert(Math.abs(groupHeldDelta.x - memberHeldDelta.x) <= 2, 'Group member should match group horizontal movement while held')
  assert(Math.abs(groupHeldDelta.y - memberHeldDelta.y) <= 2, 'Group member should match group vertical movement while held')
  assert(
    Math.abs(toolbarWhileHeld.x + toolbarWhileHeld.width / 2 - (groupWhileHeld.x + groupWhileHeld.width / 2)) <= 2,
    'Group toolbar should stay horizontally centered above the group while held',
  )
  assert(
    Math.abs(groupWhileHeld.y - (toolbarWhileHeld.y + toolbarWhileHeld.height) - 18) <= 2,
    'Group toolbar should stay attached above the group while held',
  )

  await page.mouse.up()
  await page.waitForTimeout(220)

  const groupAfter = await getNodeRect(page, groupId)
  const memberAfter = await getNodeRect(page, memberId)
  const groupAfterDelta = getMovedDelta(groupBefore, groupAfter)
  const memberAfterDelta = getMovedDelta(memberBefore, memberAfter)
  assert(Math.abs(groupAfterDelta.x - memberAfterDelta.x) <= 2, 'Group member should stay aligned after drag stop')
  assert(Math.abs(groupAfterDelta.y - memberAfterDelta.y) <= 2, 'Group member should stay aligned after drag stop')

  return { groupHeldDelta, memberHeldDelta, groupAfterDelta, memberAfterDelta }
}

function getMovedDelta(before, after) {
  assert(before && after, 'Expected node bounds before and after drag')
  return {
    x: after.x - before.x,
    y: after.y - before.y,
  }
}

function assertRectNear(actual, expected, message, tolerance = 2) {
  assert(actual && expected, `${message}: missing node bounds`)
  const dx = Math.abs(actual.x - expected.x)
  const dy = Math.abs(actual.y - expected.y)

  assert(dx <= tolerance && dy <= tolerance, `${message}: expected (${expected.x.toFixed(2)}, ${expected.y.toFixed(2)}), got (${actual.x.toFixed(2)}, ${actual.y.toFixed(2)})`)
}

async function runInternalDragScenario(context, baseUrl) {
  const page = await openSeededPage(context, baseUrl, {
    performanceMode: true,
    enableInternalDrag: true,
    nodes: [
      makeImageNode('img-1', { x: 120, y: 120 }, 1, true),
      makeImageNode('img-2', { x: 430, y: 120 }, 2),
      makeImageNode('img-3', { x: 120, y: 390 }, 3),
      makeImageNode('img-4', { x: 430, y: 390 }, 4),
    ],
  })
  const before = await getNodeRect(page, 'img-1')
  await startRenderCounter(page)
  await dragNode(page, 'img-1')
  const after = await getNodeRect(page, 'img-1')
  const counts = await getRenderCounts(page)
  const delta = getMovedDelta(before, after)
  await page.close()

  assert(delta.x > 120, `Internal drag target should move visually, got dx=${delta.x}`)
  assert((counts.Canvas ?? 0) <= 20, `Internal drag should keep Canvas renders low, got ${counts.Canvas ?? 0}`)
  assert((counts.CanvasFlowLayer ?? 0) <= 20, `Internal drag should keep CanvasFlowLayer renders low, got ${counts.CanvasFlowLayer ?? 0}`)
  assert((counts.ImageNode ?? 0) <= 30, `Internal drag should keep ImageNode renders low, got ${counts.ImageNode ?? 0}`)

  return { delta, counts }
}

async function runDefaultVisibleDragScenario(context, baseUrl) {
  const page = await openSeededPage(context, baseUrl, {
    performanceMode: true,
    nodes: [
      makeImageNode('img-1', { x: 120, y: 120 }, 1, true),
      makeImageNode('img-2', { x: 430, y: 120 }, 2),
      makeImageNode('img-3', { x: 120, y: 390 }, 3),
      makeImageNode('img-4', { x: 430, y: 390 }, 4),
    ],
  })
  await startRenderCounter(page)
  await dragNode(page, 'img-1')
  const counts = await getRenderCounts(page)
  await page.close()

  assert((counts.Canvas ?? 0) <= 20, `Default visible drag should keep outer Canvas stable, got Canvas renders ${counts.Canvas ?? 0}`)
  assert((counts.CanvasFlowLayer ?? 0) > 40, `Default visible drag should keep live local React Flow renders in CanvasFlowLayer, got ${counts.CanvasFlowLayer ?? 0}`)
  assert((counts.ImageNode ?? 0) <= 30, `Default visible drag should keep ImageNode internals stable while the wrapper moves, got ${counts.ImageNode ?? 0}`)

  return { counts }
}

async function runVisualGroupDragScenario(context, baseUrl) {
  const page = await openSeededPage(context, baseUrl, {
    performanceMode: true,
    nodes: [
      makeGroupNode('group-1', { x: 80, y: 80 }, 760, 520, true),
      makeImageNode('group-member', { x: 150, y: 150 }, 1),
      makeImageNode('outside-node', { x: 920, y: 150 }, 2),
    ],
  })

  const result = await dragGroupWhileHeld(page, 'group-1', 'group-member')
  await page.close()
  return result
}

async function runMultiSelectScenario(context, baseUrl) {
  const page = await openSeededPage(context, baseUrl, {
    performanceMode: true,
    enableInternalDrag: true,
    nodes: [
      makeImageNode('img-1', { x: 120, y: 120 }, 1),
      makeImageNode('img-2', { x: 430, y: 120 }, 2),
      makeImageNode('img-3', { x: 120, y: 390 }, 3),
      makeImageNode('img-4', { x: 430, y: 390 }, 4),
    ],
  })
  const selection = await selectMultipleNodes(page, ['img-1', 'img-2'])
  const beforePrimary = await getNodeRect(page, 'img-1')
  const beforeSecondary = await getNodeRect(page, 'img-2')
  await startRenderCounter(page)
  await dragNode(page, 'img-1')
  const afterPrimary = await getNodeRect(page, 'img-1')
  const afterSecondary = await getNodeRect(page, 'img-2')
  const counts = await getRenderCounts(page)
  const primaryDelta = getMovedDelta(beforePrimary, afterPrimary)
  const secondaryDelta = getMovedDelta(beforeSecondary, afterSecondary)
  await page.close()

  assert(primaryDelta.x > 120, `Primary selected node should move, got dx=${primaryDelta.x}`)
  assert(secondaryDelta.x > 120, `Secondary selected node should move with multi-select drag, got dx=${secondaryDelta.x}`)
  assert((counts.Canvas ?? 0) <= 20, `Multi-select internal drag should keep Canvas renders low, got ${counts.Canvas ?? 0}`)
  assert((counts.CanvasFlowLayer ?? 0) <= 20, `Multi-select internal drag should keep CanvasFlowLayer renders low, got ${counts.CanvasFlowLayer ?? 0}`)

  return { primaryDelta, secondaryDelta, counts, selection }
}

async function runQualityFallbackScenario(context, baseUrl) {
  const page = await openSeededPage(context, baseUrl, {
    performanceMode: false,
    nodes: [
      makeImageNode('img-1', { x: 120, y: 120 }, 1, true),
    ],
  })
  await startRenderCounter(page)
  await dragNode(page, 'img-1')
  const counts = await getRenderCounts(page)
  await page.close()

  assert((counts.Canvas ?? 0) <= 20, `Quality-mode small canvas should keep outer Canvas stable, got Canvas renders ${counts.Canvas ?? 0}`)
  assert((counts.CanvasFlowLayer ?? 0) > 40, `Quality-mode small canvas should keep visible local drag in CanvasFlowLayer, got ${counts.CanvasFlowLayer ?? 0}`)
  assert((counts.ImageNode ?? 0) <= 30, `Quality-mode small canvas should keep ImageNode internals stable while the wrapper moves, got ${counts.ImageNode ?? 0}`)

  return { counts }
}

async function runUndoRedoAndDirtyScenario(context, baseUrl) {
  const page = await openSeededPage(context, baseUrl, {
    performanceMode: true,
    nodes: [
      makeImageNode('img-1', { x: 120, y: 120 }, 1, true),
      makeImageNode('img-2', { x: 430, y: 120 }, 2),
    ],
  })

  await installPersistencePredicate(page, `
    (state, label) => {
      if (label === 'dirty-after-drag') {
        return state.hasUnsavedChanges === true && state.kind === 'storage-required'
      }
      return false
    }
  `)

  const storedBefore = await getStoredNodePosition(page, 'img-1')
  const before = await getNodeRect(page, 'img-1')
  await dragNode(page, 'img-1', { dx: 160, dy: 28, steps: 32 })
  const afterDrag = await getNodeRect(page, 'img-1')
  const storedAfterDrag = await getStoredNodePosition(page, 'img-1')
  await waitForPersistenceState(page, 'dirty-after-drag')
  const dirtyState = await getPersistenceStatusState(page)

  await page.locator('[data-testid="undo-button"]').waitFor({ state: 'visible', timeout: 5_000 })
  await page.locator('[data-testid="undo-button"]').click()
  await page.waitForTimeout(220)
  const afterUndo = await getNodeRect(page, 'img-1')

  await page.locator('[data-testid="redo-button"]').waitFor({ state: 'visible', timeout: 5_000 })
  await page.locator('[data-testid="redo-button"]').click()
  await page.waitForTimeout(220)
  const afterRedo = await getNodeRect(page, 'img-1')
  await page.close()

  const delta = getMovedDelta(before, afterDrag)
  assert(delta.x > 100, `Dirty scenario drag should move target, got dx=${delta.x}`)
  assertRectNear(afterUndo, before, 'Undo should restore the node DOM position')
  assertRectNear(afterRedo, afterDrag, 'Redo should restore the dragged node DOM position')
  assert(storedBefore && storedAfterDrag, 'Expected seeded localStorage positions to be readable')
  assert(
    storedAfterDrag.x === storedBefore.x && storedAfterDrag.y === storedBefore.y,
    'Drag should mark the live project dirty without mutating the seeded localStorage snapshot before autosave',
  )
  assert(dirtyState.hasUnsavedChanges, 'Drag stop should mark the active project as unsaved')
  assert(dirtyState.kind === 'storage-required', `Unconfigured workspace should remain storage-required while dirty, got ${dirtyState.kind}`)

  return {
    delta,
    dirtyState,
    storedPositionUnchanged: true,
  }
}

function writeReport(report) {
  mkdirSync(REPORT_DIR, { recursive: true })
  const fileName = `canvas-internal-drag-validation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const filePath = resolve(REPORT_DIR, fileName)
  writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return filePath
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

    const results = {
      internalDragDiagnostic: await runInternalDragScenario(context, baseUrl),
      defaultVisibleDrag: await runDefaultVisibleDragScenario(context, baseUrl),
      visualGroupDrag: await runVisualGroupDragScenario(context, baseUrl),
      multiSelect: await runMultiSelectScenario(context, baseUrl),
      qualityFallback: await runQualityFallbackScenario(context, baseUrl),
      undoRedoAndDirty: await runUndoRedoAndDirtyScenario(context, baseUrl),
    }
    const reportPath = writeReport({
      createdAt: new Date().toISOString(),
      results,
    })

    console.log('Canvas internal drag browser validation passed')
    console.log(`  report: ${reportPath}`)
    console.log(`  internal drag diagnostic renders: ${JSON.stringify(results.internalDragDiagnostic.counts)}`)
    console.log(`  default visible drag renders: ${JSON.stringify(results.defaultVisibleDrag.counts)}`)
    console.log(`  visual group drag deltas: ${JSON.stringify(results.visualGroupDrag)}`)
    console.log(`  multi-select deltas: ${JSON.stringify({
      primary: results.multiSelect.primaryDelta,
      secondary: results.multiSelect.secondaryDelta,
      selection: results.multiSelect.selection,
    })}`)
    console.log(`  quality fallback renders: ${JSON.stringify(results.qualityFallback.counts)}`)
    console.log(`  undo/redo dirty state: ${JSON.stringify(results.undoRedoAndDirty)}`)
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
