import type { NodeTypes } from '@xyflow/react'
import { ImageNode } from './ImageNode'
import { VideoNode } from './VideoNode'
import { VideoGenerateNode } from './VideoGenerateNode'
import { ImageCropNode } from './ImageCropNode'
import { TextNode } from './TextNode'
import { InlineTextSplitterNode } from './InlineTextSplitterNode'
import { TextSplitterNode } from './TextSplitterNode'
import { GenerateNode } from './GenerateNode'
import { ImageEditNode } from './ImageEditNode'
import { GeneratedPreviewNode } from './GeneratedPreviewNode'
import { CompareNode } from './CompareNode'
import { GroupNode } from './GroupNode'
import { LLMFileNode } from './LLMFileNode'
import { LLMOutputTextNode } from './LLMOutputTextNode'
import { TestImageNode } from './TestImageNode'
import { PanoramaNode } from './PanoramaNode'
import { canvasNodeRegistrations } from '@/features/nodeRegistry/protocol'

const nodeComponents = {
  imageNode: ImageNode,
  videoNode: VideoNode,
  videoGenerateNode: VideoGenerateNode,
  imageCropNode: ImageCropNode,
  textNode: TextNode,
  inlineTextSplitterNode: InlineTextSplitterNode,
  textSplitterNode: TextSplitterNode,
  generateNode: GenerateNode,
  imageEditNode: ImageEditNode,
  generatedPreviewNode: GeneratedPreviewNode,
  compareNode: CompareNode,
  groupNode: GroupNode,
  llmNode: LLMFileNode,
  llmFileNode: LLMFileNode,
  llmOutputTextNode: LLMOutputTextNode,
  testImageNode: TestImageNode,
  panoramaNode: PanoramaNode,
} satisfies NodeTypes

export const nodeTypes = Object.fromEntries(
  Object.values(canvasNodeRegistrations).map((registration) => {
    const rendererType = registration.rendererType ?? registration.type
    const component = nodeComponents[rendererType as keyof typeof nodeComponents]
    if (!component) throw new Error(`节点 ${registration.type} 缺少渲染组件 ${rendererType}`)
    return [registration.type, component]
  }),
) satisfies NodeTypes
