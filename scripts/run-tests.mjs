import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const TEST_ROOTS = ['scripts', 'src']
const TEST_FILE_SUFFIXES = ['.test.ts', '.test.mjs']

function collectTestFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath))
      continue
    }

    if (TEST_FILE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
      files.push(fullPath)
    }
  }

  return files
}

const testFiles = TEST_ROOTS.flatMap(collectTestFiles).sort()

if (testFiles.length === 0) {
  console.error('No test files found.')
  process.exit(1)
}

console.log(`Running ${testFiles.length} test files with Node test runner.`)

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
