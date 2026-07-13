import { spawn } from 'node:child_process'
import electronPath from 'electron'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const viteEntry = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
let isStopping = false

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortAvailable(port)) return port
  }
  throw new Error(`No available desktop development port found between ${startPort} and ${startPort + 49}.`)
}

const port = await findAvailablePort(5173)
const developmentUrl = `http://127.0.0.1:${port}`

const vite = spawn(process.execPath, [
  viteEntry,
  '--host', '127.0.0.1',
  '--port', String(port),
  '--strictPort',
], {
  cwd: root,
  env: {
    ...process.env,
    NODE_OPTIONS: '--max-old-space-size=8192',
    UV_THREADPOOL_SIZE: '8',
  },
  stdio: 'inherit',
  windowsHide: true,
})

async function waitForVite() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) {
      throw new Error(`Vite exited before Electron started (code ${vite.exitCode}).`)
    }

    try {
      const response = await fetch(developmentUrl)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for Vite at ${developmentUrl}.`)
}

function stop(exitCode = 0) {
  if (isStopping) return
  isStopping = true
  if (vite.exitCode === null) vite.kill()
  process.exitCode = exitCode
}

process.on('SIGINT', () => stop(130))
process.on('SIGTERM', () => stop(143))

try {
  await waitForVite()
  const electron = spawn(electronPath, ['.'], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DEV_URL: developmentUrl,
    },
    stdio: 'inherit',
    windowsHide: false,
  })

  electron.on('exit', (code) => stop(code ?? 0))
  electron.on('error', (error) => {
    console.error(error)
    stop(1)
  })
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  stop(1)
}
