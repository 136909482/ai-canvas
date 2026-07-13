import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function run(command, args = []) {
  const executable = process.platform === 'win32' && (command === 'npm' || command === 'npx')
    ? process.env.ComSpec || 'cmd.exe'
    : command
  const executableArgs = process.platform === 'win32' && (command === 'npm' || command === 'npx')
    ? ['/d', '/s', '/c', [command, ...args].join(' ')]
    : args
  const result = spawnSync(executable, executableArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  })

  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() || result.error?.message || '',
  }
}

function firstLine(value) {
  return value.split(/\r?\n/).find(Boolean) ?? ''
}

function printCheck(label, result, hint) {
  if (result.ok) {
    console.log(`[ok] ${label}: ${firstLine(result.stdout) || 'available'}`)
    return true
  }

  console.log(`[missing] ${label}`)
  if (hint) console.log(`  ${hint}`)
  if (result.stderr) console.log(`  ${firstLine(result.stderr)}`)
  return false
}

function collectFiles(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name)
    return entry.isDirectory() ? collectFiles(fullPath) : [fullPath]
  })
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const checks = [
  printCheck('Node.js', run('node', ['--version']), 'Install Node.js 22 or newer.'),
  printCheck(
    'Node SQLite',
    run('node', ['-e', 'console.log(require("node:sqlite").DatabaseSync?"available":"missing")']),
    'Install a current Node.js 22 or newer build with node:sqlite support.',
  ),
  printCheck('npm', run('npm', ['--version']), 'Install npm with Node.js.'),
  printCheck('Electron', run('npx', ['electron', '--version']), 'Run npm install to download Electron.'),
  printCheck('electron-builder', run('npx', ['electron-builder', '--version']), 'Run npm install to install electron-builder.'),
]

const outputDirectory = join(process.cwd(), 'release')
const outputs = collectFiles(outputDirectory)
  .filter((filePath) => /\.(exe|msi|msix|appx|dmg|app|deb|rpm|appimage)$/i.test(filePath))

console.log('\nDesktop output:')
if (outputs.length === 0) {
  console.log('  No Electron build found yet. Run npm run desktop:build.')
} else {
  for (const output of outputs) {
    console.log(`  ${output} (${formatBytes(statSync(output).size)})`)
  }
}

if (checks.some((result) => !result)) {
  console.log('\nDesktop preflight failed. Fix the missing npm dependency, then run npm run desktop:check again.')
  process.exitCode = 1
} else {
  console.log('\nDesktop preflight passed. Rust, Cargo, MSVC and the Windows SDK are not required.')
}
