import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const groupNodeSource = readFileSync(fileURLToPath(new URL('../src/nodes/GroupNode/index.tsx', import.meta.url)), 'utf8')

if (groupNodeSource.includes('useViewport')) {
  throw new Error('GroupNode should not subscribe to the full viewport because pan changes re-render every group node')
}

if (!groupNodeSource.includes('useStore') || !groupNodeSource.includes('transform[2]')) {
  throw new Error('GroupNode should subscribe only to zoom for label scaling')
}
