import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const sourceRoots = ['src/components', 'src/nodes']
const wholeStoreSubscriptionPattern = /\buse[A-Z][A-Za-z0-9]+Store\s*\(\s*\)/g

function collectSourceFiles(directory) {
  const entries = readdirSync(directory)
  const files = []

  for (const entry of entries) {
    const fullPath = join(directory, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(fullPath))
      continue
    }

    if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath)
    }
  }

  return files
}

const violations = []

for (const sourceRoot of sourceRoots) {
  for (const file of collectSourceFiles(join(root, sourceRoot))) {
    const source = readFileSync(file, 'utf8')
    const matches = source.match(wholeStoreSubscriptionPattern)
    if (matches) {
      violations.push(`${file}: ${matches.join(', ')}`)
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Components and nodes should use explicit Zustand selectors instead of whole-store subscriptions:\n${violations.join('\n')}`)
}
