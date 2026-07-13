import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useCanvasStore.ts', import.meta.url)), 'utf8')
const derivedDataSource = readFileSync(fileURLToPath(new URL('../src/store/canvasConnectionDerivedData.ts', import.meta.url)), 'utf8')

const requiredExports = [
  'syncConnectionDerivedNodeData',
  'buildSyncedGraphState',
]

if (!storeSource.includes("from './canvasConnectionDerivedData'")) {
  throw new Error('useCanvasStore should import connection-derived data sync helpers from src/store/canvasConnectionDerivedData.ts')
}

for (const exportName of requiredExports) {
  if (!derivedDataSource.includes(`export function ${exportName}`)) {
    throw new Error(`canvasConnectionDerivedData.ts should export ${exportName}`)
  }

  if (storeSource.includes(`function ${exportName}`)) {
    throw new Error(`useCanvasStore should not define ${exportName} inline`)
  }
}

if (
  !derivedDataSource.includes("from './canvasConnectionSources'")
  || !derivedDataSource.includes('createRichPromptDocumentFromText')
  || !derivedDataSource.includes('sanitizeRichPrompt')
) {
  throw new Error('canvasConnectionDerivedData.ts should own dependencies needed for connection-derived patches')
}
