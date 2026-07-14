import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CANVAS_IMAGE_LOD_ENTER_ZOOM,
  CANVAS_IMAGE_LOD_EXIT_ZOOM,
  EMBEDDED_IMAGE_PERFORMANCE_BYTE_LIMIT,
  getCanvasImagePerformanceStats,
  getCanvasImagePreviewQuality,
  shouldUseCanvasPerformanceRendering,
} from '../src/features/canvasPerformance/rendering.ts'

test('uses performance rendering when manual performance mode is enabled', () => {
  assert.equal(shouldUseCanvasPerformanceRendering({
    canvasPerformanceMode: 'performance',
  }), true)
})

test('keeps quality rendering when the canvas has many nodes unless the user enables performance mode', () => {
  assert.equal(shouldUseCanvasPerformanceRendering({
    canvasPerformanceMode: 'quality',
  }), false)
})

test('keeps quality rendering when the canvas has several image nodes unless the user enables performance mode', () => {
  assert.equal(shouldUseCanvasPerformanceRendering({
    canvasPerformanceMode: 'quality',
  }), false)
})

test('detects large image stats without automatically enabling performance rendering', () => {
  const stats = getCanvasImagePerformanceStats([
    {
      type: 'imageNode',
      data: {
        imageUrl: 'blob:http://localhost/large-image',
        imageNaturalWidth: 2400,
        imageNaturalHeight: 1800,
      },
    },
  ])

  assert.equal(stats.imageNodeCount, 1)
  assert.equal(stats.largeImageNodeCount, 1)
  assert.equal(shouldUseCanvasPerformanceRendering({
    canvasPerformanceMode: 'quality',
  }), false)
})

test('counts workspace asset backed image nodes even when the browser url is not resolved yet', () => {
  const stats = getCanvasImagePerformanceStats([
    {
      type: 'generatedPreviewNode',
      data: {
        imageUrl: '',
        imageAsset: {
          relativePath: 'images/output.png',
          mimeType: 'image/png',
          fileName: 'output.png',
          thumbnailRelativePath: 'images/.thumbs/output.png',
        },
      },
    },
  ])

  assert.equal(stats.imageNodeCount, 1)
  assert.equal(stats.largeImageNodeCount, 0)
  assert.equal(stats.embeddedImageByteCount, 0)
})

test('detects large embedded image payloads without automatically enabling performance rendering', () => {
  const imageUrl = `data:image/png;base64,${'a'.repeat(Math.ceil(EMBEDDED_IMAGE_PERFORMANCE_BYTE_LIMIT / 0.75))}`
  const stats = getCanvasImagePerformanceStats([
    {
      type: 'testImageNode',
      data: { imageUrl },
    },
  ])

  assert.equal(stats.imageNodeCount, 1)
  assert.equal(stats.embeddedImageByteCount >= EMBEDDED_IMAGE_PERFORMANCE_BYTE_LIMIT, true)
  assert.equal(shouldUseCanvasPerformanceRendering({
    canvasPerformanceMode: 'quality',
  }), false)
})

test('keeps quality rendering when two or more groups are present in quality mode', () => {
  assert.equal(shouldUseCanvasPerformanceRendering({
    canvasPerformanceMode: 'quality',
  }), false)
})

test('keeps quality rendering for a small canvas with one group while idle', () => {
  assert.equal(shouldUseCanvasPerformanceRendering({
    canvasPerformanceMode: 'quality',
  }), false)
})

test('uses a hysteresis band for image-dense low-zoom previews', () => {
  assert.equal(getCanvasImagePreviewQuality({
    currentQuality: 'full',
    zoom: CANVAS_IMAGE_LOD_ENTER_ZOOM,
    imageCount: 8,
  }), 'thumbnail')

  assert.equal(getCanvasImagePreviewQuality({
    currentQuality: 'thumbnail',
    zoom: 0.27,
    imageCount: 8,
  }), 'thumbnail')

  assert.equal(getCanvasImagePreviewQuality({
    currentQuality: 'thumbnail',
    zoom: CANVAS_IMAGE_LOD_EXIT_ZOOM,
    imageCount: 8,
  }), 'full')
})

test('does not enable automatic LOD for a sparse image canvas', () => {
  assert.equal(getCanvasImagePreviewQuality({
    currentQuality: 'thumbnail',
    zoom: 0.1,
    imageCount: 7,
  }), 'full')
})
