import type { LLMOutputFormat, LLMOutputNodeStatus } from '@/types'

export function canEditLLMOutput(status: LLMOutputNodeStatus) {
  return status === 'done'
}

export function getLLMOutputModeLabel(outputFormat: LLMOutputFormat) {
  switch (outputFormat) {
    case 'json':
      return 'JSON 输出'
    case 'markdown':
      return 'Markdown 输出'
    default:
      return '文本输出'
  }
}
