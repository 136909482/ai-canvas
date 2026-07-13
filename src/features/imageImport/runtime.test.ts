import { getImportedImageNodeSize } from './imageImportSizing.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function runImageImportRuntimeTests() {
  assert(
    JSON.stringify(getImportedImageNodeSize(1600, 900)) === JSON.stringify({ width: 512, height: 293 }),
    'wide images should fit within the 500px content box plus node padding',
  )

  assert(
    JSON.stringify(getImportedImageNodeSize(900, 1600)) === JSON.stringify({ width: 293, height: 512 }),
    'tall images should fit within the 500px content box plus node padding',
  )

  assert(
    JSON.stringify(getImportedImageNodeSize(32, 128)) === JSON.stringify({ width: 137, height: 512 }),
    'narrow images should preserve the 500px content height plus node padding when above the minimum width',
  )
}

runImageImportRuntimeTests()
