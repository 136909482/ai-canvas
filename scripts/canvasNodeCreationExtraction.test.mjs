import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const storeSource = readFileSync(fileURLToPath(new URL('../src/store/useCanvasStore.ts', import.meta.url)), 'utf8')
const creationSource = readFileSync(fileURLToPath(new URL('../src/store/canvasNodeCreation.ts', import.meta.url)), 'utf8')
const idsSource = readFileSync(fileURLToPath(new URL('../src/store/canvasNodeIds.ts', import.meta.url)), 'utf8')
const protocolSource = readFileSync(fileURLToPath(new URL('../src/features/nodeRegistry/protocol.ts', import.meta.url)), 'utf8')

const requiredExports = [
  'buildManualTextNode',
  'buildManualInlineTextSplitterNode',
  'buildTextSplitterOutputTextNode',
  'buildManualImageNode',
  'buildManualVideoNode',
  'buildManualVideoGenerateNode',
  'buildManualImageCropNode',
  'buildManualGenerateNode',
  'buildManualImageEditNode',
  'buildManualLLMFileNode',
  'buildLLMOutputTextNode',
  'buildGeneratedPreviewNode',
  'buildGeneratedVideoNode',
  'buildCropPreviewNode',
  'buildGroupNode',
  'buildManualTestImageNode',
  'buildManualCompareNode',
  'buildManualGeneratedPreviewNode',
]

if (!idsSource.includes('getCanvasNodeRegistration(type)') || !idsSource.includes('registration.idPrefix')) {
  throw new Error('canvasNodeIds should allocate ids from the node registration protocol')
}

if (!storeSource.includes('getManualNodeRegistration(type)') || !storeSource.includes('addNodeByType:')) {
  throw new Error('manual node actions should use the registered manual node factory')
}

if (!protocolSource.includes('satisfies Record<AppNodeType, CanvasNodeRegistration>')) {
  throw new Error('node registrations should cover the complete AppNodeType contract')
}

if (!storeSource.includes("from './canvasNodeCreation'")) {
  throw new Error('useCanvasStore should import manual node creation helpers from src/store/canvasNodeCreation.ts')
}

if (!storeSource.includes('type GeneratedPreviewNodeDraft')) {
  throw new Error('useCanvasStore should import GeneratedPreviewNodeDraft from canvasNodeCreation.ts')
}

if (storeSource.includes("Omit<GeneratedPreviewNodeData, 'sourceGenerateNodeId' | 'createdAt'>")) {
  throw new Error('createGeneratedPreviewNode should accept GeneratedPreviewNodeDraft instead of a broad Omit type')
}

for (const exportName of requiredExports) {
  if (!creationSource.includes(`export function ${exportName}`)) {
    throw new Error(`canvasNodeCreation.ts should export ${exportName}`)
  }

  if (storeSource.includes(`function ${exportName}`)) {
    throw new Error(`useCanvasStore should not define ${exportName} inline`)
  }
}

for (const inlineCreationSnippet of [
  'createdNodes.push({',
  'const llmOutputNode: Node<LLMOutputTextNodeData> = {',
  'const generatedPreview: Node<GeneratedPreviewNodeData> = {',
  'const generatedVideo: Node<VideoNodeData> = {',
  'previewNodeById.set(previewId, {',
  'const groupNode: Node<GroupNodeData> = {',
]) {
  if (storeSource.includes(inlineCreationSnippet)) {
    throw new Error(`runtime output node creation should use canvasNodeCreation helpers: ${inlineCreationSnippet}`)
  }
}

for (const inlineIdSnippet of [
  '`text-${nodeIdCounter++}`',
  '`inlinesplit-${nodeIdCounter++}`',
  '`img-${nodeIdCounter++}`',
  '`video-${nodeIdCounter++}`',
  '`gen-${nodeIdCounter++}`',
  '`llm-${nodeIdCounter++}`',
  '`llmfile-${nodeIdCounter++}`',
  '`llmtext-${nodeIdCounter++}`',
  '`group-${nodeIdCounter++}`',
  '`testimg-${nodeIdCounter++}`',
]) {
  if (storeSource.includes(inlineIdSnippet)) {
    throw new Error(`manual node actions should not allocate ids inline: ${inlineIdSnippet}`)
  }
}

for (const previewCastSnippet of [
  'label: preview.label as string',
  'imageUrl: preview.imageUrl as string',
  "status: preview.status as GeneratedPreviewNodeData['status']",
  'imageWidth: preview.imageWidth as number',
  'imageHeight: preview.imageHeight as number',
]) {
  if (storeSource.includes(previewCastSnippet)) {
    throw new Error(`createGeneratedPreviewNode should pass typed preview draft directly: ${previewCastSnippet}`)
  }
}

if (
  !creationSource.includes('createImageNodeData')
  || !creationSource.includes('DEFAULT_IMAGE_MODEL_ID')
  || !creationSource.includes('DEFAULT_TEXT_NODE_LABEL')
) {
  throw new Error('manual node creation helpers should own default data construction')
}
