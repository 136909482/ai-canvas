import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const canvasSource = readFileSync(fileURLToPath(new URL('../src/components/Canvas.tsx', import.meta.url)), 'utf8')
const canvasFlowLayerSource = readFileSync(fileURLToPath(new URL('../src/components/canvas/CanvasFlowLayer.tsx', import.meta.url)), 'utf8')
const previewRuntimeSource = readFileSync(fileURLToPath(new URL('../src/components/canvasImagePreviewRuntime.ts', import.meta.url)), 'utf8')
const previewSource = readFileSync(fileURLToPath(new URL('../src/components/CanvasImagePreview.tsx', import.meta.url)), 'utf8')
const browserPlatformSource = readFileSync(fileURLToPath(new URL('../src/platform/web/browserPlatform.ts', import.meta.url)), 'utf8')
const projectStoreSource = readFileSync(fileURLToPath(new URL('../src/store/useProjectStore.ts', import.meta.url)), 'utf8')
const editorSource = readFileSync(fileURLToPath(new URL('../src/components/ImageFullscreenEditor.tsx', import.meta.url)), 'utf8')
const appSource = readFileSync(fileURLToPath(new URL('../src/App.tsx', import.meta.url)), 'utf8')

if (!previewRuntimeSource.includes('revokeOnEvict')) {
  throw new Error('Canvas image preview cache should track object URL ownership before revoking cached URLs')
}

if (!previewRuntimeSource.includes('clearCanvasImagePreviewCache')) {
  throw new Error('Canvas image preview runtime should expose a cache cleanup hook')
}

if (!previewRuntimeSource.includes('thumbnailJobQueue.shift()?.reject(abortError)')) {
  throw new Error('Canvas image preview runtime should reject queued thumbnail jobs when interaction aborts thumbnail work')
}

if (!canvasFlowLayerSource.includes('clearCanvasImagePreviewCache()')) {
  throw new Error('Canvas should clear runtime thumbnail object URLs when it unmounts')
}

if (!canvasFlowLayerSource.includes('setInteractiveNodes([])')) {
  throw new Error('Canvas should release the local interactive node array after drag interactions')
}

if (!previewSource.includes("from '@/components/canvasImagePreviewRuntime'")) {
  throw new Error('CanvasImagePreview should keep cache/runtime helpers outside the component module')
}

if (!browserPlatformSource.includes('function clearWorkspaceAssetUrlCache')) {
  throw new Error('Browser platform should be able to revoke all cached workspace asset object URLs')
}

if (!browserPlatformSource.includes('clearWorkspaceAssetUrlCache,')) {
  throw new Error('Browser platform bridge should expose workspace asset URL cache cleanup')
}

if (!projectStoreSource.includes('platformBridge.clearWorkspaceAssetUrlCache()')) {
  throw new Error('Project restore should clear stale workspace asset object URLs before resolving the next project assets')
}

if (!editorSource.includes('releaseEditorBuffers')) {
  throw new Error('Image fullscreen editor should release canvas buffers and undo snapshots on unmount')
}

if (!editorSource.includes('writeWorkspaceImageAsset')) {
  throw new Error('Image fullscreen editor should persist edited outputs as workspace image assets when storage is configured')
}

if (!appSource.includes('imageEditorSession ?') || !appSource.includes('<ImageFullscreenEditor key=')) {
  throw new Error('App should unmount the fullscreen image editor when there is no active editor session')
}
