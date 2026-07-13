import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(
  fileURLToPath(new URL('./canvasDragPerf.mjs', import.meta.url)),
  'utf8',
)
const packageJson = JSON.parse(readFileSync(
  fileURLToPath(new URL('../package.json', import.meta.url)),
  'utf8',
))

if (!source.includes("import('playwright')")) {
  throw new Error('Canvas drag perf sampler should load Playwright from the repo dependency')
}

if (
  !source.includes('function startDevServer') ||
  !source.includes('spawn(serverCommand, serverArgs') ||
  !source.includes('npm run dev -- --host 127.0.0.1 --port') ||
  !source.includes('npm run preview -- --host 127.0.0.1 --port') ||
  !source.includes('--server-mode')
) {
  throw new Error('Canvas drag perf sampler should start Vite dev or preview servers')
}

if (!source.includes('ai-canvas-projects')) {
  throw new Error('Canvas drag perf sampler should seed a local project snapshot')
}

if (
  !source.includes('--workspace-dir') ||
  !source.includes('ai-canvas-workspace.json') ||
  !source.includes('/__perf_assets/')
) {
  throw new Error('Canvas drag perf sampler should support real workspace projects and routed image assets')
}

if (!source.includes('PerformanceObserver') || !source.includes('requestAnimationFrame')) {
  throw new Error('Canvas drag perf sampler should collect browser frame and long-task metrics')
}

if (
  !source.includes('Tracing.start') ||
  !source.includes('TRACE_CATEGORIES') ||
  !source.includes('mainThreadTaskTotalMs') ||
  !source.includes('topMainThreadTasks')
) {
  throw new Error('Canvas drag perf sampler should collect Chrome trace main-thread metrics')
}

if (!source.includes('data-low-quality-preview="true"')) {
  throw new Error('Canvas drag perf sampler should verify thumbnail rendering during sampling')
}

if (
  !source.includes("['drag', 'pan', 'select-pan', 'zoom']") ||
  !source.includes('async function runSelectPanGesture') ||
  !source.includes('startupMaxFrameMs') ||
  !source.includes('async function runZoomGesture') ||
  !source.includes('viewportZoomSamples')
) {
  throw new Error('Canvas drag perf sampler should support zoom sampling with viewport zoom diagnostics')
}

if (
  !source.includes('--canvas-performance-mode') ||
  !source.includes("['quality', 'performance']") ||
  !source.includes('ai-canvas-settings')
) {
  throw new Error('Canvas drag perf sampler should support simulating the user-selected performance mode')
}

if (!source.includes('output/performance')) {
  throw new Error('Canvas drag perf sampler should write reports under output/performance')
}

if (packageJson.scripts['perf:canvas'] !== 'node scripts/canvasDragPerf.mjs') {
  throw new Error('package.json should expose npm run perf:canvas')
}

if (packageJson.scripts['perf:canvas:enforce'] !== 'node scripts/canvasDragPerf.mjs --enforce') {
  throw new Error('package.json should expose npm run perf:canvas:enforce')
}
