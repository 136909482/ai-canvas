import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const testImageNodeSource = readFileSync(
  fileURLToPath(new URL('../src/nodes/TestImageNode/index.tsx', import.meta.url)),
  'utf8',
)

if (!testImageNodeSource.includes("import { importImageFile } from '@/features/imageImport/runtime'")) {
  throw new Error('TestImageNode should delegate image file imports to imageImport runtime.')
}

if (testImageNodeSource.includes('const MAX_SIZE = 500') || testImageNodeSource.includes('const MIN_SIZE = 100')) {
  throw new Error('TestImageNode should not duplicate imported image sizing constants.')
}

const forbiddenSnippets = [
  "import { loadImageDimensions } from '@/features/generateQueue/previewUtils'",
  "import { platformBridge } from '@/platform'",
  'const MANUAL_UPLOAD_ASSET_PATH',
  'function readFileAsDataUrl',
  'URL.createObjectURL(file)',
]

for (const snippet of forbiddenSnippets) {
  if (testImageNodeSource.includes(snippet)) {
    throw new Error(`TestImageNode should not duplicate image import runtime detail: ${snippet}`)
  }
}
