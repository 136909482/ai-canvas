import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useCanvasStore.ts', import.meta.url)), 'utf8')
const factorySource = readFileSync(fileURLToPath(new URL('../src/store/canvasNodeData.ts', import.meta.url)), 'utf8')

const requiredExports = [
  'createImageNodeData',
  'createTestImageNodeData',
  'createVideoNodeData',
  'createVideoGenerateNodeData',
  'createImageEditNodeData',
  'createImageCropNodeData',
  'getOrderedStringIds',
  'sanitizeGptImageQuality',
  'sanitizeRichPrompt',
]

if (!storeSource.includes("from './canvasNodeData'")) {
  throw new Error('useCanvasStore should import node data factories from src/store/canvasNodeData.ts')
}

for (const exportName of requiredExports) {
  if (!factorySource.includes(`export function ${exportName}`)) {
    throw new Error(`canvasNodeData.ts should export ${exportName}`)
  }

  if (storeSource.includes(`function ${exportName}`)) {
    throw new Error(`useCanvasStore should not define ${exportName} inline`)
  }
}

if (!factorySource.includes('DEFAULT_IMAGE_MODEL_ID')) {
  throw new Error('canvasNodeData.ts should own default image model normalization')
}

if (!factorySource.includes('clampCropSegmentCount') || !factorySource.includes('normalizeCropCuts')) {
  throw new Error('canvasNodeData.ts should own image crop node data normalization')
}
