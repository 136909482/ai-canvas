import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const files = [
  '../src/nodes/GenerateNode/index.tsx',
  '../src/nodes/VideoGenerateNode/index.tsx',
  '../src/nodes/LLMFileNode/index.tsx',
]

for (const file of files) {
  const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')

  if (!source.includes("from '@/components/CanvasImagePreview'")) {
    throw new Error(`${file} should import CanvasImagePreview for inline image thumbnails`)
  }

  if (source.includes('<img src={')) {
    throw new Error(`${file} should not render canvas inline thumbnails with raw img tags`)
  }
}
