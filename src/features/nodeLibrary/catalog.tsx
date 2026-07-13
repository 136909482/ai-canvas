import type { ReactNode } from 'react'
import { ArrowLeftRight, Bot, Crop, Globe, Image, MonitorPlay, ScissorsLineDashed, Sparkles, Type, Video } from 'lucide-react'
import {
  nodeLibraryRegistrations,
  type ManualCanvasNodeType,
  type NodeLibraryCategoryId,
  type NodeLibraryIcon,
} from '@/features/nodeRegistry/protocol'

type NodePosition = { x: number, y: number }
type CreateCanvasNode = (preferredPosition?: NodePosition) => string

export interface CanvasNodeCatalogActions {
  addTextNode: CreateCanvasNode
  addImageNode: CreateCanvasNode
  addGenerateNode: CreateCanvasNode
  addLLMNode: CreateCanvasNode
  addVideoGenerateNode: CreateCanvasNode
  addTextSplitterNode: CreateCanvasNode
  addImageCropNode: CreateCanvasNode
  addCompareNode: CreateCanvasNode
  addGeneratedPreviewNode: CreateCanvasNode
  addVideoNode: CreateCanvasNode
  addPanoramaNode: CreateCanvasNode
}

export interface CanvasNodeTool {
  id: string
  icon: ReactNode
  label: string
  description: string
  keywords: string[]
  createNode: CreateCanvasNode
}

export interface CanvasNodeCategory {
  id: string
  label: string
  tools: CanvasNodeTool[]
}

const CATEGORY_LABELS: Record<NodeLibraryCategoryId, string> = {
  common: '常用',
  'text-tools': '文本处理',
  'image-tools': '图片处理',
  'ai-tools': 'AI 工作流',
}

const CATEGORY_ORDER: NodeLibraryCategoryId[] = ['common', 'text-tools', 'image-tools', 'ai-tools']

function createIcon(icon: NodeLibraryIcon) {
  const className = 'h-3.5 w-3.5'
  const icons: Record<NodeLibraryIcon, ReactNode> = {
    text: <Type className={className} />,
    image: <Image className={className} />,
    sparkles: <Sparkles className={className} />,
    bot: <Bot className={className} />,
    video: <Video className={className} />,
    split: <ScissorsLineDashed className={className} />,
    crop: <Crop className={className} />,
    compare: <ArrowLeftRight className={className} />,
    panorama: <Globe className={className} />,
    preview: <MonitorPlay className={className} />,
  }
  return icons[icon]
}

export function createCanvasNodeCatalog(actions: CanvasNodeCatalogActions): CanvasNodeCategory[] {
  const createByType: Partial<Record<ManualCanvasNodeType, CreateCanvasNode>> = {
    textNode: actions.addTextNode,
    imageNode: actions.addImageNode,
    generateNode: actions.addGenerateNode,
    llmFileNode: actions.addLLMNode,
    videoGenerateNode: actions.addVideoGenerateNode,
    inlineTextSplitterNode: actions.addTextSplitterNode,
    imageCropNode: actions.addImageCropNode,
    compareNode: actions.addCompareNode,
    generatedPreviewNode: actions.addGeneratedPreviewNode,
    videoNode: actions.addVideoNode,
    panoramaNode: actions.addPanoramaNode,
  }

  return CATEGORY_ORDER.map((categoryId) => ({
    id: categoryId,
    label: CATEGORY_LABELS[categoryId],
    tools: nodeLibraryRegistrations
      .filter((registration) => registration.library.category === categoryId)
      .map((registration) => ({
        id: registration.library.id,
        icon: createIcon(registration.library.icon),
        label: registration.library.label,
        description: registration.library.description,
        keywords: registration.library.keywords,
        createNode: createByType[registration.type as ManualCanvasNodeType] as CreateCanvasNode,
      })),
  }))
}
