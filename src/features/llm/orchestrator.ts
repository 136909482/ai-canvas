import { executeChatPromptStream } from '@/api/chatAdapter'
import { MAX_GENERATE_REFERENCE_IMAGES } from '@/constants/generateNode'
import { compileImageMentionPrompt } from '@/features/richPrompt/promptCompiler'
import { formatJsonForDisplay } from '@/features/llm/outputViewer'
import { resolveRuntimeModelConfig, type ProviderConfigDiagnostic } from '@/features/settings/providerConfig'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { reportDiagnostic } from '@/store/useDiagnosticsStore'
import { isImageSourceNodeType, type LLMFileNodeData, type LLMNodeData, type TextNodeData } from '@/types'
import type { RichPromptReferenceItem } from '@/features/richPrompt/types'

const UI_TEXT = {
  noModel: '暂无可用 Chat 模型，请先在模型设置中启用。',
  noPrompt: '请输入自定义提示词后再执行。',
  jsonParseFailed: '返回内容不是合法 JSON，已按原文保留。',
  outputLabel: 'LLM结果',
} as const

type SupportedLLMNodeType = 'llmNode' | 'llmFileNode'
type LLMSourceNodeData = LLMNodeData | LLMFileNodeData

function getLLMNode(nodeId: string, nodeType: SupportedLLMNodeType) {
  return useCanvasStore.getState().nodes.find((node) => (
    node.id === nodeId
    && (node.type === nodeType || node.type === 'llmNode' || node.type === 'llmFileNode')
  ))
}

function getSelectedModel(nodeData: Pick<LLMNodeData, 'model'>) {
  const settings = useSettingsStore.getState()
  const chatModels = settings.getEnabledCustomModels('chat')
  const fallbackModelId = chatModels[0]?.modelId ?? ''
  const effectiveModel = chatModels.some((model) => model.modelId === nodeData.model) ? nodeData.model : fallbackModelId
  const resolution = effectiveModel
    ? resolveRuntimeModelConfig(settings.config, {
      modelId: effectiveModel,
      kind: 'chat',
      requireCredentials: true,
      allowProfileFallback: true,
    })
    : null
  const selectedModel = resolution?.ok ? resolution.runtimeConfig : undefined
  const diagnostic: ProviderConfigDiagnostic | null = resolution && !resolution.ok ? resolution.diagnostic : null

  return {
    effectiveModel,
    selectedModel,
    diagnostic,
  }
}

function getLLMInputImageSources(nodeId: string, inputImageSourceOrder: string[]) {
  const { nodes, edges } = useCanvasStore.getState()
  const imageBySourceId = new Map<string, string>()

  edges
    .filter((edge) => edge.target === nodeId && typeof edge.source === 'string')
    .forEach((edge) => {
      if (imageBySourceId.has(edge.source)) {
        return
      }

      const sourceNode = nodes.find((node) => (
        node.id === edge.source
        && isImageSourceNodeType(node.type)
      ))
      const imageUrl = typeof sourceNode?.data?.imageUrl === 'string' ? sourceNode.data.imageUrl : null

      if (!imageUrl) {
        return
      }

      imageBySourceId.set(edge.source, imageUrl)
    })

  const orderedSourceIds = [
    ...inputImageSourceOrder.filter((sourceId) => imageBySourceId.has(sourceId)),
    ...Array.from(imageBySourceId.keys()).filter((sourceId) => !inputImageSourceOrder.includes(sourceId)),
  ]

  return orderedSourceIds
    .map((sourceId) => {
      const imageUrl = imageBySourceId.get(sourceId)
      return imageUrl ? { sourceId, imageUrl } : null
    })
    .filter((item): item is { sourceId: string; imageUrl: string } => Boolean(item))
    .slice(0, MAX_GENERATE_REFERENCE_IMAGES)
}

function buildRichPromptReferences(inputImages: Array<{ sourceId: string; imageUrl: string }>): RichPromptReferenceItem[] {
  return inputImages.map((item, index) => ({
    sourceId: item.sourceId,
    imageUrl: item.imageUrl,
    label: `参考图${index + 1}`,
    order: index + 1,
  }))
}

function getConnectedTextInput(nodeId: string) {
  const { nodes, edges } = useCanvasStore.getState()
  const incomingTextEdge = edges.find((edge) => {
    if (edge.target !== nodeId || typeof edge.source !== 'string') {
      return false
    }

    const sourceNode = nodes.find((node) => node.id === edge.source)
    return sourceNode?.type === 'textNode' || sourceNode?.type === 'llmOutputTextNode' || sourceNode?.type === 'inlineTextSplitterNode'
  })
  const sourceNode = incomingTextEdge?.source
    ? nodes.find((node) => node.id === incomingTextEdge.source)
    : null

  if (!sourceNode) {
    return null
  }

  if (sourceNode.type === 'inlineTextSplitterNode') {
    const match = /^part-(\d+)$/.exec(typeof incomingTextEdge?.sourceHandle === 'string' ? incomingTextEdge.sourceHandle : '')
    const partIndex = match ? Number(match[1]) : -1
    const parts = Array.isArray(sourceNode.data?.parts)
      ? sourceNode.data.parts.filter((part): part is string => typeof part === 'string')
      : []

    return {
      text: partIndex >= 0 ? parts[partIndex] ?? '' : '',
      richPrompt: null,
    }
  }

  return {
    text: typeof sourceNode.data?.text === 'string' ? sourceNode.data.text : '',
    richPrompt: sourceNode.type === 'textNode'
      ? (sourceNode.data as TextNodeData).richPrompt ?? null
      : null,
  }
}

function getLLMInputFiles(nodeData: LLMSourceNodeData) {
  if (!('inputFiles' in nodeData) || !Array.isArray(nodeData.inputFiles)) {
    return []
  }

  return nodeData.inputFiles
    .filter((file): file is LLMFileNodeData['inputFiles'][number] => (
      Boolean(file)
      && typeof file === 'object'
      && typeof file.name === 'string'
      && typeof file.content === 'string'
    ))
    .map((file) => ({
      name: file.name,
      content: file.content,
    }))
}

async function runLLMExecution(nodeId: string, input: {
  instructionPrompt: string
  presetSystemPrompt?: string
}, nodeType: SupportedLLMNodeType) {
  const canvasStore = useCanvasStore.getState()
  const sourceNode = getLLMNode(nodeId, nodeType)

  if (!sourceNode) {
    throw new Error('LLM 节点不存在')
  }

  const nodeData = sourceNode.data as LLMSourceNodeData
  const nextInstruction = input.instructionPrompt.trim()
  if (!nextInstruction) {
    canvasStore.updateNodeData(nodeId, {
      status: 'error',
      errorMsg: UI_TEXT.noPrompt,
    })
    return null
  }

  const { effectiveModel, selectedModel, diagnostic } = getSelectedModel(nodeData)
  if (!selectedModel) {
    canvasStore.updateNodeData(nodeId, {
      status: 'error',
      errorMsg: diagnostic?.message ?? UI_TEXT.noModel,
    })
    return null
  }

  const inputImageSourceOrder = Array.isArray(nodeData.inputImageSourceOrder)
    ? nodeData.inputImageSourceOrder.filter((sourceId): sourceId is string => typeof sourceId === 'string')
    : []
  const inputImages = getLLMInputImageSources(nodeId, inputImageSourceOrder)
  const inputImageUrls = inputImages.map((item) => item.imageUrl)
  const richPromptReferences = buildRichPromptReferences(inputImages)
  const compiledInstructionPrompt = compileImageMentionPrompt({
    richPrompt: nodeData.richPrompt,
    fallbackPrompt: nextInstruction,
    references: richPromptReferences,
  })
  const connectedTextInput = getConnectedTextInput(nodeId)
  const compiledInputText = compileImageMentionPrompt({
    richPrompt: connectedTextInput?.richPrompt ?? nodeData.inputRichPrompt,
    fallbackPrompt: connectedTextInput?.text ?? (typeof nodeData.inputText === 'string' ? nodeData.inputText : ''),
    references: richPromptReferences,
  })
  const inputFiles = getLLMInputFiles(nodeData)

  const outputNodeId = canvasStore.createLLMOutputTextNode(nodeId, {
    text: '',
    label: UI_TEXT.outputLabel,
    status: 'generating',
    errorMsg: '',
    outputFormat: nodeData.outputFormat,
    layoutMode: 'auto',
  })

  canvasStore.updateNodeData(nodeId, {
    instructionPrompt: nextInstruction,
    model: effectiveModel,
    outputNodeId,
    status: 'running',
    errorMsg: '',
    outputText: '',
    outputJson: '',
  })

  try {
    let streamedText = ''
    let lastStreamUpdateAt = 0
    const updateStreamedOutput = (nextText: string, force = false) => {
      streamedText = nextText
      const now = Date.now()
      if (!force && now - lastStreamUpdateAt < 80) {
        return
      }

      lastStreamUpdateAt = now
      canvasStore.updateNodeData(outputNodeId, {
        text: streamedText,
        status: 'generating',
        errorMsg: '',
      })
    }

    const result = await executeChatPromptStream({
      model: selectedModel,
      systemPrompt: input.presetSystemPrompt,
      instructionPrompt: compiledInstructionPrompt,
      inputText: compiledInputText,
      inputImageUrls,
      inputFiles,
      outputFormat: nodeData.outputFormat,
    }, {
      onDelta: (_delta, fullText) => updateStreamedOutput(fullText),
    })

    updateStreamedOutput(result, true)

    if (nodeData.outputFormat === 'json') {
      const formattedJson = formatJsonForDisplay(result)
      if (formattedJson.valid) {
        canvasStore.updateNodeData(outputNodeId, {
          text: formattedJson.text,
          status: 'done',
          errorMsg: '',
        })
        canvasStore.updateNodeData(nodeId, {
          model: effectiveModel,
          outputNodeId,
          status: 'success',
          errorMsg: '',
          outputText: result,
          outputJson: formattedJson.text,
        })
      } else {
        canvasStore.updateNodeData(outputNodeId, {
          text: result,
          status: 'done',
          errorMsg: UI_TEXT.jsonParseFailed,
        })
        canvasStore.updateNodeData(nodeId, {
          model: effectiveModel,
          outputNodeId,
          status: 'success',
          errorMsg: UI_TEXT.jsonParseFailed,
          outputText: result,
          outputJson: result,
        })
      }
    } else {
      canvasStore.updateNodeData(outputNodeId, {
        text: result,
        status: 'done',
        errorMsg: '',
      })
      canvasStore.updateNodeData(nodeId, {
        model: effectiveModel,
        outputNodeId,
        status: 'success',
        errorMsg: '',
        outputText: result,
        outputJson: '',
      })
    }

    return outputNodeId
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    reportDiagnostic({
      area: 'model',
      title: 'LLM 调用失败',
      error,
      code: 'LLM_EXECUTION_FAILED',
      context: { nodeId, model: effectiveModel },
    })
    canvasStore.updateNodeData(outputNodeId, {
      text: '',
      status: 'error',
      errorMsg: message,
    })
    canvasStore.updateNodeData(nodeId, {
      model: effectiveModel,
      outputNodeId,
      status: 'error',
      errorMsg: message,
    })
    throw error
  }
}

export async function runLLMNode(nodeId: string, input: {
  instructionPrompt: string
  presetSystemPrompt?: string
}) {
  return runLLMExecution(nodeId, input, 'llmNode')
}

export async function runLLMFileNode(nodeId: string, input: {
  instructionPrompt: string
  presetSystemPrompt?: string
}) {
  return runLLMExecution(nodeId, input, 'llmFileNode')
}
